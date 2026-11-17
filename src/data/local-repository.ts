import type { FinanceData, Profile } from "@/core/types";
import { newId, type EntityKey, type EntityMap, type FinanceRepository } from "./repository";

/**
 * MODO DEMO — guarda los datos solo en este navegador (localStorage).
 * Sirve para probar la app sin configurar Supabase. NO sincroniza entre
 * dispositivos y se pierde si borras los datos del navegador.
 * En producción se usa SupabaseRepository.
 */
const KEY = "finanzas-demo-v1";
const FILES_KEY = "finanzas-demo-files-v1";

const empty = (): FinanceData => ({
  profile: { id: "demo", displayName: "Demo", currency: "EUR", monthlyBudget: null, seeded: false },
  accounts: [], categories: [], transactions: [], budgets: [], recurring: [], goals: [], savedViews: [],
});

export class LocalRepository implements FinanceRepository {
  readonly kind = "local" as const;
  private data: FinanceData;

  constructor() {
    this.data = this.read();
  }

  private read(): FinanceData {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
    } catch {
      return empty();
    }
  }

  private write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      throw new Error("No se pudo guardar en el navegador (almacenamiento lleno o bloqueado).");
    }
  }

  async loadAll(): Promise<FinanceData> {
    this.data = this.read();
    return structuredClone(this.data);
  }

  async upsert<K extends EntityKey>(entity: K, row: EntityMap[K]): Promise<EntityMap[K]> {
    const list = this.data[entity] as EntityMap[K][];
    const withMeta = { ...row, createdAt: (row as { createdAt?: string }).createdAt ?? new Date().toISOString() };
    const i = list.findIndex((x) => x.id === row.id);
    if (i >= 0) list[i] = withMeta; else list.push(withMeta);
    this.write();
    return structuredClone(withMeta);
  }

  async insertMany<K extends EntityKey>(entity: K, rows: EntityMap[K][]): Promise<void> {
    const list = this.data[entity] as EntityMap[K][];
    const now = new Date().toISOString();
    const ids = new Set(rows.map((r) => r.id));
    (this.data[entity] as EntityMap[K][]) = [...list.filter((x) => !ids.has(x.id)), ...rows.map((r) => ({ createdAt: now, ...r }))];
    this.write();
  }

  async remove<K extends EntityKey>(entity: K, id: string): Promise<void> {
    return this.removeMany(entity, [id]);
  }

  /** Replica en local el comportamiento de las claves foráneas de PostgreSQL. */
  async removeMany<K extends EntityKey>(entity: K, ids: string[]): Promise<void> {
    const del = new Set(ids);
    const d = this.data;
    if (entity === "categories") {
      d.categories.filter((c) => c.parentId && del.has(c.parentId)).forEach((c) => del.add(c.id)); // cascade
      d.budgets = d.budgets.filter((b) => !b.categoryId || !del.has(b.categoryId));
      const nul = <T extends object>(o: T, k: keyof T) => (del.has(o[k] as string) ? { ...o, [k]: null } : o);
      d.transactions = d.transactions.map((t) => nul(nul(t, "categoryId"), "subcategoryId"));
      d.recurring = d.recurring.map((r) => nul(nul(r, "categoryId"), "subcategoryId"));
    }
    if (entity === "accounts") {
      d.transactions = d.transactions.map((t) => ({ ...t, accountId: del.has(t.accountId ?? "") ? null : t.accountId, toAccountId: del.has(t.toAccountId ?? "") ? null : t.toAccountId }));
      d.recurring = d.recurring.map((r) => (del.has(r.accountId ?? "") ? { ...r, accountId: null } : r));
      d.goals = d.goals.map((g) => (del.has(g.accountId ?? "") ? { ...g, accountId: null } : g));
    }
    if (entity === "recurring") d.transactions = d.transactions.map((t) => (del.has(t.recurringId ?? "") ? { ...t, recurringId: null } : t));
    (d[entity] as EntityMap[K][]) = (d[entity] as EntityMap[K][]).filter((x) => !del.has(x.id));
    this.write();
  }

  async updateProfile(patch: Partial<Omit<Profile, "id">>): Promise<Profile> {
    this.data.profile = { ...this.data.profile, ...patch };
    this.write();
    return { ...this.data.profile };
  }

  private files(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(FILES_KEY) ?? "{}"); } catch { return {}; }
  }

  async uploadAttachment(file: File): Promise<string> {
    if (file.size > 1.5 * 1024 * 1024) throw new Error("En modo demo los adjuntos están limitados a 1,5 MB. Con Supabase el límite es 10 MB.");
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(new Error("No se pudo leer el archivo"));
      r.readAsDataURL(file);
    });
    const path = `demo/${newId()}-${file.name}`;
    const files = this.files();
    files[path] = dataUrl;
    try { localStorage.setItem(FILES_KEY, JSON.stringify(files)); } catch { throw new Error("No hay espacio en el navegador para el adjunto."); }
    return path;
  }

  async attachmentUrl(path: string): Promise<string> {
    const url = this.files()[path];
    if (!url) throw new Error("Adjunto no encontrado");
    return url;
  }

  async removeAttachment(path: string): Promise<void> {
    const files = this.files();
    delete files[path];
    localStorage.setItem(FILES_KEY, JSON.stringify(files));
  }

  async replaceAll(data: Omit<FinanceData, "profile"> & { profile?: Partial<Profile> }): Promise<void> {
    this.data = {
      ...empty(),
      ...data,
      profile: { ...this.data.profile, ...(data.profile ?? {}), id: "demo", seeded: true },
    };
    this.write();
  }
}
