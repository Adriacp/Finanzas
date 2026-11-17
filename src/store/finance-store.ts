import { create } from "zustand";
import { budgetStatuses, crossedThresholds, type BudgetStatus } from "@/core/budgets";
import { monthKey, todayISO } from "@/core/dates";
import { buildDefaultAccounts, buildDefaultCategories } from "@/core/defaults";
import type { FinanceData, Profile, Transaction } from "@/core/types";
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
  saveTransaction(tx: Transaction): Promise<BudgetStatus[]>;
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
    if (data.categories.length === 0) {
      const cats = buildDefaultCategories(newId);
      await r.insertMany("categories", cats.filter((c) => !c.parentId));
      await r.insertMany("categories", cats.filter((c) => c.parentId));
    }
    if (data.accounts.length === 0) await r.insertMany("accounts", buildDefaultAccounts(newId, data.profile.currency));
    await r.updateProfile({ seeded: true });
    return r.loadAll();
  }

  return {
    repo: null,
    status: "idle",
    error: null,
    data: null,

    async init(r) {
      set({ repo: r, status: "loading", error: null });
      try {
        const data = await seedIfNeeded(r, await r.loadAll());
        set({ data, status: "ready" });
      } catch (e) {
        set({ status: "error", error: errMsg(e) });
      }
    },

    async reload() {
      try {
        const data = await repo().loadAll();
        set({ data, status: "ready", error: null });
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
      if (entity === "accounts" || entity === "categories" || entity === "recurring") await get().reload();
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

    async saveTransaction(tx) {
      const d = get().data!;
      const month = monthKey(tx.date);
      const before = budgetStatuses(d.budgets, d.categories, d.transactions, month);
      await get().save("transactions", tx);
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
