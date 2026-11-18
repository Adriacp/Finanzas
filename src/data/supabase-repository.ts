import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceData, Profile } from "@/core/types";
import { ENTITY_ORDER, newId, OPTIONAL_ENTITIES, type EntityKey, type EntityMap, type FinanceRepository } from "./repository";

const TABLE: Record<EntityKey, string> = {
  accounts: "accounts",
  categories: "categories",
  transactions: "transactions",
  budgets: "budgets",
  recurring: "recurring",
  goals: "goals",
  savedViews: "saved_views",
  products: "products",
  transactionItems: "transaction_items",
};

const NUMERIC = new Set(["amount", "initialBalance", "targetAmount", "savedAmount", "monthlyBudget", "quantity", "unitPrice"]);
const LOCAL_ONLY = new Set(["createdAt"]);

const snake = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function toRow(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!LOCAL_ONLY.has(k) && v !== undefined) out[snake(k)] = v;
  return out;
}

function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "user_id" || k === "updated_at") continue;
    const ck = camel(k);
    if (NUMERIC.has(ck) && v !== null) out[ck] = Number(v);
    else if (ck === "time" && typeof v === "string") out[ck] = v.slice(0, 5);
    else out[ck] = v;
  }
  return out as T;
}

class RepoError extends Error {}
function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new RepoError(translate(res.error.message));
  return res.data;
}

/** La tabla o columna aún no existe: falta ejecutar una migración (p. ej. 0002). */
const isMissingSchema = (msg: string) => /schema cache|does not exist|PGRST20[45]/i.test(msg);

function translate(msg: string): string {
  if (isMissingSchema(msg)) return "Falta actualizar la base de datos: ejecuta en Supabase la migración supabase/migrations/0002_products_balances.sql.";
  if (/JWT|not authenticated|401/i.test(msg)) return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
  if (/violates row-level security/i.test(msg)) return "No tienes permiso para realizar esta acción.";
  if (/duplicate key/i.test(msg)) return "Ya existe un registro igual.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Sin conexión con el servidor. Revisa tu conexión a internet.";
  return msg;
}

const PAGE = 1000;

export class SupabaseRepository implements FinanceRepository {
  readonly kind = "supabase" as const;
  schemaOutdated = false;
  constructor(private sb: SupabaseClient, private userId: string) {}

  private async selectAll<K extends EntityKey>(entity: K): Promise<EntityMap[K][]> {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      const res = await this.sb.from(TABLE[entity]).select("*").order("created_at").range(from, from + PAGE - 1);
      // Tablas nuevas que aún no existen en la BD: seguir sin ellas y avisar
      if (res.error && OPTIONAL_ENTITIES.has(entity) && isMissingSchema(res.error.message)) {
        this.schemaOutdated = true;
        return [];
      }
      const data = check(res);
      rows.push(...(data as Record<string, unknown>[]));
      if (!data || data.length < PAGE) break;
    }
    return rows.map((r) => fromRow<EntityMap[K]>(r));
  }

  async loadAll(): Promise<FinanceData> {
    let profileRow = check(await this.sb.from("profiles").select("*").eq("id", this.userId).maybeSingle());
    if (!profileRow) {
      profileRow = check(await this.sb.from("profiles").insert({ id: this.userId }).select().single());
    }
    // Cada resultado se asigna por nombre de entidad (no por posición) para evitar mezclar tablas.
    const entries = await Promise.all(ENTITY_ORDER.map(async (e) => [e, await this.selectAll(e)] as const));
    const byKey = Object.fromEntries(entries) as { [K in EntityKey]: EntityMap[K][] };
    return { profile: fromRow<Profile>(profileRow as Record<string, unknown>), ...byKey };
  }

  async upsert<K extends EntityKey>(entity: K, row: EntityMap[K]): Promise<EntityMap[K]> {
    const data = check(await this.sb.from(TABLE[entity]).upsert({ ...toRow(row), user_id: this.userId }).select().single());
    return fromRow<EntityMap[K]>(data as Record<string, unknown>);
  }

  async insertMany<K extends EntityKey>(entity: K, rows: EntityMap[K][]): Promise<void> {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({ ...toRow(r), user_id: this.userId }));
      check(await this.sb.from(TABLE[entity]).upsert(chunk));
    }
  }

  async remove<K extends EntityKey>(entity: K, id: string): Promise<void> {
    check(await this.sb.from(TABLE[entity]).delete().eq("id", id));
  }

  async removeMany<K extends EntityKey>(entity: K, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += 200) check(await this.sb.from(TABLE[entity]).delete().in("id", ids.slice(i, i + 200)));
  }

  async updateProfile(patch: Partial<Omit<Profile, "id">>): Promise<Profile> {
    const data = check(await this.sb.from("profiles").update(toRow(patch)).eq("id", this.userId).select().single());
    return fromRow<Profile>(data as Record<string, unknown>);
  }

  async claimSeed(): Promise<boolean> {
    // UPDATE ... WHERE seeded = false es atómico en PostgreSQL: solo una petición lo consigue.
    const data = check(await this.sb.from("profiles").update({ seeded: true }).eq("id", this.userId).eq("seeded", false).select("id"));
    return Array.isArray(data) && data.length > 0;
  }

  async claimProductsSeed(): Promise<boolean> {
    if (this.schemaOutdated) return false;
    const res = await this.sb.from("profiles").update({ products_seeded: true }).eq("id", this.userId).eq("products_seeded", false).select("id");
    if (res.error && isMissingSchema(res.error.message)) { this.schemaOutdated = true; return false; }
    const data = check(res);
    return Array.isArray(data) && data.length > 0;
  }

  async uploadAttachment(file: File): Promise<string> {
    if (file.size > 10 * 1024 * 1024) throw new RepoError("El archivo supera el máximo de 10 MB.");
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${this.userId}/${newId()}.${ext}`;
    check(await this.sb.storage.from("receipts").upload(path, file, { contentType: file.type, upsert: false }));
    return path;
  }

  async attachmentUrl(path: string): Promise<string> {
    const data = check(await this.sb.storage.from("receipts").createSignedUrl(path, 60 * 10));
    if (!data?.signedUrl) throw new RepoError("No se pudo obtener el adjunto");
    return data.signedUrl;
  }

  async removeAttachment(path: string): Promise<void> {
    check(await this.sb.storage.from("receipts").remove([path]));
  }

  async replaceAll(data: Omit<FinanceData, "profile"> & { profile?: Partial<Profile> }): Promise<void> {
    // Borrado en orden inverso a las dependencias, luego inserción en orden.
    const entities = ENTITY_ORDER.filter((e) => !(this.schemaOutdated && OPTIONAL_ENTITIES.has(e)));
    for (const e of [...entities].reverse()) check(await this.sb.from(TABLE[e]).delete().eq("user_id", this.userId));
    for (const e of entities) {
      const rows = (data[e] ?? []) as EntityMap[typeof e][];
      if (e === "categories") {
        // primero categorías padre, luego subcategorías
        const cats = rows as EntityMap["categories"][];
        await this.insertMany("categories", cats.filter((c) => !c.parentId));
        await this.insertMany("categories", cats.filter((c) => c.parentId));
      } else if (rows.length) await this.insertMany(e as EntityKey, rows as never[]);
    }
    if (data.profile) {
      const { id: _ignored, productsSeeded, balancesConfirmed, ...rest } = data.profile as Profile;
      // Las marcas nuevas solo se envían si la BD ya tiene esas columnas (migración 0002)
      await this.updateProfile(this.schemaOutdated ? { ...rest, seeded: true } : { ...rest, productsSeeded, balancesConfirmed, seeded: true });
    }
  }
}
