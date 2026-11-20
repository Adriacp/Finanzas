import type { FinanceData, Profile } from "@/core/types";
import { newId, type EntityKey, type EntityMap, type FinanceRepository } from "./repository";

/**
 * MODO DEMO — guarda los datos solo en este navegador (localStorage).
 * Sirve para probar la app sin configurar Supabase. NO sincroniza entre
 * dispositivos y se pierde si borras los datos del navegador.
 * En producción se usa SupabaseRepository.
 */
const KEY = "finanzas-demo-v1";

const empty = (): FinanceData => ({
  profile: { id: "demo", displayName: "Demo", currency: "EUR", monthlyBudget: null, seeded: false, productsSeeded: false, balancesConfirmed: false },
  accounts: [], categories: [], transactions: [], budgets: [], recurring: [], goals: [], savedViews: [], products: [], transactionItems: [], shoppingItems: [],
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
    if (entity === "transactions") d.transactionItems = d.transactionItems.filter((i) => !del.has(i.transactionId)); // cascade
    if (entity === "products") {
      d.transactionItems = d.transactionItems.map((i) => (del.has(i.productId ?? "") ? { ...i, productId: null } : i));
      d.products = d.products.map((p) => (del.has(p.parentId ?? "") ? { ...p, parentId: null } : p)); // variantes → genéricos
    }
    if (entity === "products") d.shoppingItems = d.shoppingItems.map((i) => (del.has(i.productId ?? "") ? { ...i, productId: null } : i));
    if (entity === "categories") d.products = d.products.map((p) => (del.has(p.categoryId ?? "") ? { ...p, categoryId: null } : p));
    (d[entity] as EntityMap[K][]) = (d[entity] as EntityMap[K][]).filter((x) => !del.has(x.id));
    this.write();
  }

  async updateProfile(patch: Partial<Omit<Profile, "id">>): Promise<Profile> {
    this.data.profile = { ...this.data.profile, ...patch };
    this.write();
    return { ...this.data.profile };
  }

  async claimProductsSeed(): Promise<boolean> {
    this.data = this.read();
    if (this.data.profile.productsSeeded) return false;
    this.data.profile.productsSeeded = true;
    this.write();
    return true;
  }

  async claimSeed(): Promise<boolean> {
    this.data = this.read();
    if (this.data.profile.seeded) return false;
    this.data.profile.seeded = true;
    this.write();
    return true;
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
