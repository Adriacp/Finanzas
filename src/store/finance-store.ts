import { create } from "zustand";
import { budgetStatuses, crossedThresholds, type BudgetStatus } from "@/core/budgets";
import { monthKey, todayISO } from "@/core/dates";
import { planDedupe } from "@/core/dedupe";
import { buildDefaultAccounts, buildDefaultCategories, buildDefaultProducts } from "@/core/defaults";
import { normalize } from "@/core/insights";
import type { FinanceData, Profile, Transaction, TransactionItem } from "@/core/types";
import { newId, type EntityKey, type EntityMap, type FinanceRepository } from "@/data/repository";

/**
 * Store global (Zustand). No depende de Next.js ni del DOM, así que se puede
 * reutilizar en React Native. Todas las mutaciones son optimistas: se aplican
 * en memoria al instante y se revierten si el servidor devuelve un error.
 */
interface FinanceState {
  repo: FinanceRepository | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  data: FinanceData | null;
  init(repo: FinanceRepository): Promise<void>;
  reload(): Promise<void>;
  save<K extends EntityKey>(entity: K, row: EntityMap[K]): Promise<EntityMap[K]>;
  saveMany<K extends EntityKey>(entity: K, rows: EntityMap[K][]): Promise<void>;
  remove<K extends EntityKey>(entity: K, id: string): Promise<void>;
  removeMany<K extends EntityKey>(entity: K, ids: string[]): Promise<void>;
  updateProfile(patch: Partial<Omit<Profile, "id">>): Promise<void>;
  replaceAll(data: Omit<FinanceData, "profile"> & { profile?: Partial<Profile> }): Promise<void>;
  /** Guarda un movimiento y devuelve los umbrales de presupuesto que ha cruzado. */
  /**
   * Guarda un movimiento y, si se pasa, su desglose por productos (sustituye al anterior).
   * Devuelve los umbrales de presupuesto que ha cruzado.
   */
  saveTransaction(tx: Transaction, items?: TransactionItem[]): Promise<BudgetStatus[]>;
  /** La BD aún no tiene las tablas de la migración 0002 (productos/desglose). */
  schemaOutdated: boolean;
  /** La BD admite variantes y formatos de producto (migración 0003). */
  variantsSupported: boolean;
  /** La BD guarda el formato del envase de cada compra (migración 0004). */
  itemFormatsSupported: boolean;
  /** La BD tiene la tabla de la lista de la compra (migración 0005). */
  shoppingSupported: boolean;
  reset(): void;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

export const useFinance = create<FinanceState>((set, get) => {
  const repo = () => {
    const r = get().repo;
    if (!r) throw new Error("Repositorio no inicializado");
    return r;
  };

  /** Aplica un cambio optimista y lo revierte si la operación remota falla. */
  async function optimistic<T>(apply: (d: FinanceData) => FinanceData, op: () => Promise<T>): Promise<T> {
    const prev = get().data;
    if (!prev) throw new Error("Datos no cargados");
    set({ data: apply(prev) });
    try {
      return await op();
    } catch (e) {
      set({ data: prev });
      throw new Error(errMsg(e));
    }
  }

  async function seedIfNeeded(r: FinanceRepository, data: FinanceData): Promise<FinanceData> {
    if (data.profile.seeded) return data;
    // Solo quien "reclama" la siembra crea los datos iniciales (otra pestaña/dispositivo no).
    if (!(await r.claimSeed())) return r.loadAll();
    try {
      if (data.categories.length === 0) {
        const cats = buildDefaultCategories(newId);
        await r.insertMany("categories", cats.filter((c) => !c.parentId));
        await r.insertMany("categories", cats.filter((c) => c.parentId));
      }
      if (data.accounts.length === 0) await r.insertMany("accounts", buildDefaultAccounts(newId, data.profile.currency));
    } catch (e) {
      await r.updateProfile({ seeded: false }).catch(() => {});
      throw e;
    }
    return r.loadAll();
  }

  /** Crea el catálogo de productos por defecto una sola vez (también para usuarios que ya existían). */
  async function seedProductsIfNeeded(r: FinanceRepository, data: FinanceData): Promise<FinanceData> {
    if (data.profile.productsSeeded || r.schemaOutdated) return data;
    if (!(await r.claimProductsSeed())) return r.schemaOutdated ? data : r.loadAll();
    try {
      const existing = new Set(data.products.map((p) => normalize(p.name)));
      const defaults = buildDefaultProducts(newId, data.categories).filter((p) => !existing.has(normalize(p.name)));
      if (defaults.length) await r.insertMany("products", defaults);
    } catch (e) {
      await r.updateProfile({ productsSeeded: false }).catch(() => {});
      throw e;
    }
    return r.loadAll();
  }

  /** Fusiona categorías/cuentas duplicadas (p. ej. por una siembra doble) sin perder movimientos. */
  async function repairDuplicates(r: FinanceRepository, data: FinanceData): Promise<FinanceData> {
    const plan = planDedupe(data);
    if (!plan.hasChanges) return data;
    if (plan.categoryUpdates.length) await r.insertMany("categories", plan.categoryUpdates);
    if (plan.transactionUpdates.length) await r.insertMany("transactions", plan.transactionUpdates);
    if (plan.recurringUpdates.length) await r.insertMany("recurring", plan.recurringUpdates);
    if (plan.goalUpdates.length) await r.insertMany("goals", plan.goalUpdates);
    if (plan.budgetDeletes.length) await r.removeMany("budgets", plan.budgetDeletes);
    if (plan.budgetUpdates.length) await r.insertMany("budgets", plan.budgetUpdates);
    if (plan.transactionDeletes.length) await r.removeMany("transactions", plan.transactionDeletes);
    if (plan.subcategoryDeletes.length) await r.removeMany("categories", plan.subcategoryDeletes);
    if (plan.categoryDeletes.length) await r.removeMany("categories", plan.categoryDeletes);
    if (plan.accountDeletes.length) await r.removeMany("accounts", plan.accountDeletes);
    return r.loadAll();
  }

  return {
    repo: null,
    status: "idle",
    error: null,
    data: null,
    schemaOutdated: false,
    variantsSupported: true,
    itemFormatsSupported: true,
    shoppingSupported: true,

    async init(r) {
      set({ repo: r, status: "loading", error: null });
      try {
        let data = await seedIfNeeded(r, await r.loadAll());
        try {
          data = await repairDuplicates(r, data);
        } catch {
          // Si la reparación falla, se sigue con los datos tal cual (se reintentará en el próximo arranque).
          data = await r.loadAll();
        }
        try {
          data = await seedProductsIfNeeded(r, data);
        } catch {
          // Si la reparación falla, se sigue con los datos tal cual (se reintentará en el próximo arranque).
          data = await r.loadAll();
        }
        set({ data, status: "ready", shoppingSupported: r.shoppingSupported !== false, schemaOutdated: !!r.schemaOutdated, variantsSupported: r.variantsSupported !== false, itemFormatsSupported: r.itemFormatsSupported !== false });
      } catch (e) {
        set({ status: "error", error: errMsg(e) });
      }
    },

    async reload() {
      try {
        const data = await repo().loadAll();
        set({ data, status: "ready", error: null, shoppingSupported: repo().shoppingSupported !== false, schemaOutdated: !!repo().schemaOutdated, variantsSupported: repo().variantsSupported !== false, itemFormatsSupported: repo().itemFormatsSupported !== false });
      } catch (e) {
        set({ error: errMsg(e) });
      }
    },

    save(entity, row) {
      return optimistic(
        (d) => {
          const list = d[entity] as EntityMap[typeof entity][];
          const exists = list.some((x) => x.id === row.id);
          const withMeta = exists ? row : { ...row, createdAt: new Date().toISOString() };
          return { ...d, [entity]: exists ? list.map((x) => (x.id === row.id ? withMeta : x)) : [...list, withMeta] };
        },
        () => repo().upsert(entity, row),
      );
    },

    saveMany(entity, rows) {
      const ids = new Set(rows.map((r) => r.id));
      return optimistic(
        (d) => ({ ...d, [entity]: [...(d[entity] as EntityMap[typeof entity][]).filter((x) => !ids.has(x.id)), ...rows] }),
        () => repo().insertMany(entity, rows),
      );
    },

    async remove(entity, id) {
      return get().removeMany(entity, [id]);
    },

    async removeMany(entity, ids) {
      const del = new Set(ids);
      await optimistic(
        (d) => ({ ...d, [entity]: (d[entity] as EntityMap[typeof entity][]).filter((x) => !del.has(x.id)) }),
        () => repo().removeMany(entity, ids),
      );
      // Borrar cuentas/categorías/recurrentes afecta a otras tablas (cascadas): recargar.
      // Sus líneas de desglose se borran en cascada en la BD: reflejarlo también aquí
      if (entity === "transactions") {
        const d = get().data;
        if (d) set({ data: { ...d, transactionItems: d.transactionItems.filter((i) => !del.has(i.transactionId)) } });
      }
      if (entity === "accounts" || entity === "categories" || entity === "recurring" || entity === "products") await get().reload();
    },

    async updateProfile(patch) {
      await optimistic((d) => ({ ...d, profile: { ...d.profile, ...patch } }), () => repo().updateProfile(patch));
    },

    async replaceAll(data) {
      set({ status: "loading" });
      try {
        await repo().replaceAll(data);
        const fresh = await repo().loadAll();
        set({ data: fresh, status: "ready" });
      } catch (e) {
        await get().reload();
        throw new Error(errMsg(e));
      }
    },

    async saveTransaction(tx, items) {
      const d = get().data!;
      const r = repo();
      if (items?.length && r.schemaOutdated)
        throw new Error("Para guardar el desglose por productos falta actualizar la base de datos (migración 0002).");
      const month = monthKey(tx.date);
      const before = budgetStatuses(d.budgets, d.categories, d.transactions, month);
      await get().save("transactions", tx);
      if (items !== undefined && !r.schemaOutdated) {
        const rows = items.map((it, i) => ({ ...it, transactionId: tx.id, sortOrder: i }));
        const keep = new Set(rows.map((it) => it.id));
        const removed = d.transactionItems.filter((it) => it.transactionId === tx.id && !keep.has(it.id)).map((it) => it.id);
        if (removed.length) await r.removeMany("transactionItems", removed);
        if (rows.length) await r.insertMany("transactionItems", rows);
        const cur = get().data!;
        set({ data: { ...cur, transactionItems: [...cur.transactionItems.filter((it) => it.transactionId !== tx.id), ...rows] } });
      }
      const d2 = get().data!;
      const after = budgetStatuses(d2.budgets, d2.categories, d2.transactions, month);
      return month === monthKey(todayISO()) ? crossedThresholds(before, after) : [];
    },

    reset() {
      set({ repo: null, status: "idle", error: null, data: null });
    },
  };
});

/** Acceso tipado a los datos ya cargados (solo usar dentro del AppShell). */
export function useData(): FinanceData {
  const data = useFinance((s) => s.data);
  if (!data) throw new Error("useData() usado antes de cargar los datos");
  return data;
}
