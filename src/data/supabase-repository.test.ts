import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "./supabase-repository";

/** Cliente Supabase falso: cada tabla devuelve una fila marcada con su nombre. */
function fakeClient(): SupabaseClient {
  const tables: Record<string, Record<string, unknown>[]> = {
    accounts: [{ id: "a1", name: "Cuenta", initial_balance: "100.50", user_id: "u" }],
    categories: [{ id: "c1", name: "Cat" }],
    recurring: [{ id: "r1", name: "Netflix", amount: "12.99" }],
    transactions: [{ id: "t1", concept: "Café", amount: "2.50", time: "09:15:00", created_at: "2026-11-17" }],
    budgets: [{ id: "b1", amount: "300" }],
    goals: [{ id: "g1", target_amount: "1000", saved_amount: "10" }],
    saved_views: [{ id: "v1", name: "Vista", filters: {} }],
  };
  const profile = { id: "u", display_name: "Yo", currency: "EUR", monthly_budget: null, seeded: true };
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }),
          order: () => ({ range: async () => ({ data: tables[table] ?? [], error: null }) }),
          // comprobación de columnas de variantes (migración 0003)
          limit: async () => ({ data: [], error: null }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

describe("SupabaseRepository.loadAll", () => {
  it("asigna cada tabla a su entidad y convierte columnas", async () => {
    const d = await new SupabaseRepository(fakeClient(), "u").loadAll();
    expect(d.transactions.map((t) => t.id)).toEqual(["t1"]);
    expect(d.recurring.map((r) => r.id)).toEqual(["r1"]);
    expect(d.accounts.map((a) => a.id)).toEqual(["a1"]);
    expect(d.categories.map((c) => c.id)).toEqual(["c1"]);
    expect(d.budgets.map((b) => b.id)).toEqual(["b1"]);
    expect(d.goals.map((g) => g.id)).toEqual(["g1"]);
    expect(d.savedViews.map((v) => v.id)).toEqual(["v1"]);
    // conversión de tipos y nombres
    expect(d.transactions[0]).toMatchObject({ amount: 2.5, time: "09:15", createdAt: "2026-11-17" });
    expect(d.accounts[0]).toMatchObject({ initialBalance: 100.5 });
    expect(d.accounts[0]).not.toHaveProperty("userId");
    expect(d.profile).toMatchObject({ displayName: "Yo", seeded: true });
  });
});
