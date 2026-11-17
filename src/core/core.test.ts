import { describe, expect, it } from "vitest";
import { budgetStatuses, budgetsForMonth, crossedThresholds } from "./budgets";
import { detectMapping, mapRows, parseBankDate, toCSV } from "./csv";
import { periodRange, previousRange } from "./dates";
import { buildDefaultCategories } from "./defaults";
import { filterTransactions } from "./filters";
import { accountBalances, expenseByCategory, netWorthSeries, summarize, wealth } from "./finance";
import { goalProgress } from "./goals";
import { findDuplicates, suggestCategory, unusualExpenses } from "./insights";
import { parseAmount } from "./money";
import { advanceDate, annualCost, monthlyCost, occurrencesInRange } from "./recurring";
import type { Account, Recurring, Transaction } from "./types";
import { transactionSchema } from "./validation";

let n = 0;
const newId = () => `id${++n}`;

const acc = (id: string, initial = 0, type: Account["type"] = "checking"): Account => ({
  id, name: id, type, institution: null, initialBalance: initial, currency: "EUR", color: "#000000", icon: "wallet", archived: false, sortOrder: 0,
});

const tx = (p: Partial<Transaction>): Transaction => ({
  id: newId(), type: "expense", amount: 10, concept: "x", categoryId: null, subcategoryId: null, date: "2026-11-10", time: null,
  accountId: "a", toAccountId: null, paymentMethod: null, merchant: null, description: null, tags: [], isFixed: false,
  isRecurring: false, recurringId: null, status: "paid", attachmentPath: null, notes: null, ...p,
});

describe("money", () => {
  it("parses spanish and english formats", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("-12,5")).toBe(-12.5);
    expect(parseAmount("12 €")).toBe(12);
    expect(parseAmount("(30,00)")).toBe(-30);
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("dates", () => {
  const ref = new Date(2026, 10, 17); // 17 nov 2026
  it("computes periods", () => {
    expect(periodRange("month", ref)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodRange("prev_month", ref)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("last_3m", ref)).toEqual({ from: "2026-09-01", to: "2026-11-30" });
    expect(periodRange("week", ref)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(periodRange("prev_year", ref)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });
  it("computes previous comparable range", () => {
    expect(previousRange({ from: "2026-11-01", to: "2026-11-30" })).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(previousRange({ from: "2026-09-01", to: "2026-11-30" })).toEqual({ from: "2026-06-01", to: "2026-08-31" });
    expect(previousRange({ from: "2026-11-16", to: "2026-11-22" })).toEqual({ from: "2026-11-09", to: "2026-11-15" });
  });
});

describe("finance", () => {
  const accounts = [acc("a", 1000), acc("b", 500, "savings")];
  const txs = [
    tx({ type: "income", amount: 2000 }),
    tx({ type: "expense", amount: 300 }),
    tx({ type: "refund", amount: 50 }),
    tx({ type: "transfer", amount: 400, toAccountId: "b" }),
    tx({ type: "expense", amount: 99, status: "pending" }),
  ];
  it("transfers are not income nor expense", () => {
    const s = summarize(txs, { from: "2026-11-01", to: "2026-11-30" });
    expect(s.income).toBe(2000);
    expect(s.expense).toBe(250); // 300 - 50 reembolso
    expect(s.balance).toBe(1750);
    expect(s.pendingExpense).toBe(99);
    expect(Math.round(s.savingsRate)).toBe(88);
  });
  it("computes balances and wealth", () => {
    const b = accountBalances(accounts, txs);
    expect(b.get("a")).toBe(1000 + 2000 - 300 + 50 - 400);
    expect(b.get("b")).toBe(900);
    const w = wealth(accounts, txs);
    expect(w.netWorth).toBe(3250);
    expect(w.available).toBe(2350); // la de ahorro no es "disponible"
  });
  it("net worth series is unaffected by internal transfers", () => {
    const s = netWorthSeries(accounts, txs, ["2026-10", "2026-11"]);
    expect(s).toEqual([{ month: "2026-10", value: 1500 }, { month: "2026-11", value: 3250 }]);
  });
  it("groups expenses by category", () => {
    const cats = buildDefaultCategories(newId);
    const food = cats.find((c) => c.name === "Alimentación")!;
    const list = expenseByCategory([tx({ categoryId: food.id, amount: 40 }), tx({ amount: 10 })], { from: "2026-11-01", to: "2026-11-30" }, cats);
    expect(list[0]).toMatchObject({ name: "Alimentación", amount: 40, share: 80 });
  });
});

describe("budgets", () => {
  const txs = [tx({ categoryId: "food", amount: 80 })];
  it("prefers month specific budgets", () => {
    const list = budgetsForMonth([
      { id: "1", categoryId: "food", amount: 100, month: null },
      { id: "2", categoryId: "food", amount: 200, month: "2026-11-01" },
    ], "2026-11");
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(200);
  });
  it("computes thresholds and crossings", () => {
    const cats = [{ id: "food", parentId: null, kind: "expense" as const, name: "Comida", icon: "x", color: "#000", description: null, essential: true, sortOrder: 0 }];
    const budgets = [{ id: "1", categoryId: "food", amount: 100, month: null }, { id: "g", categoryId: null, amount: 1000, month: null }];
    const before = budgetStatuses(budgets, cats, txs, "2026-11");
    expect(before.find((b) => b.categoryId === "food")!.threshold).toBe(75);
    const after = budgetStatuses(budgets, cats, [...txs, tx({ categoryId: "food", amount: 15 })], "2026-11");
    expect(crossedThresholds(before, after).map((x) => x.threshold)).toEqual([90]);
  });
});

describe("recurring", () => {
  const r: Recurring = { id: "r", name: "Netflix", amount: 12, type: "expense", frequency: "monthly", nextDate: "2026-01-31", startDate: "2026-01-31", endDate: null,
    categoryId: null, subcategoryId: null, accountId: null, isSubscription: true, isFixed: true, status: "active", usage: null, merchant: null, notes: null };
  it("costs", () => {
    expect(monthlyCost({ amount: 120, frequency: "annual" })).toBe(10);
    expect(annualCost({ amount: 12, frequency: "monthly" })).toBe(144);
  });
  it("advances dates clamping month ends", () => {
    expect(advanceDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceDate("2026-11-17", "weekly")).toBe("2026-11-24");
  });
  it("lists occurrences", () => {
    expect(occurrencesInRange(r, { from: "2026-01-01", to: "2026-03-31" })).toEqual(["2026-01-31", "2026-02-28", "2026-03-28"]);
  });
});

describe("goals", () => {
  it("computes monthly amount needed", () => {
    const p = goalProgress({ id: "g", name: "Coche", targetAmount: 5000, savedAmount: 1000, deadline: "2027-04-30", accountId: null, color: "", icon: "", notes: null, archived: false }, "2026-11-17");
    expect(p.remaining).toBe(4000);
    expect(p.monthsLeft).toBe(6);
    expect(p.monthlyNeeded).toBe(666.67);
    expect(p.pct).toBe(20);
  });
});

describe("insights", () => {
  it("detects duplicates", () => {
    const existing = [tx({ concept: "Mercadona Gran Vía", amount: 45.3, date: "2026-11-10" })];
    expect(findDuplicates({ concept: "MERCADONA", amount: 45.3, type: "expense", date: "2026-11-11", merchant: null }, existing)).toHaveLength(1);
    expect(findDuplicates({ concept: "Mercadona", amount: 45.3, type: "expense", date: "2026-11-20", merchant: null }, existing)).toHaveLength(0);
  });
  it("suggests categories by keyword and by history", () => {
    const cats = buildDefaultCategories(newId);
    const s = suggestCategory("Compra Mercadona", [], cats);
    expect(cats.find((c) => c.id === s?.subcategoryId)?.name).toBe("Supermercado");
    const hist = [tx({ concept: "Bar Pepe", categoryId: "X", subcategoryId: "Y" })];
    expect(suggestCategory("bar pepe", hist, cats)).toMatchObject({ categoryId: "X", subcategoryId: "Y", source: "history" });
  });
  it("flags unusual expenses", () => {
    const hist = [20, 22, 18, 25, 21, 19].map((a, i) => tx({ categoryId: "c", amount: a, date: `2026-10-0${i + 1}` }));
    const big = tx({ categoryId: "c", amount: 120, date: "2026-11-05" });
    expect(unusualExpenses([...hist, big, tx({ categoryId: "c", amount: 23, date: "2026-11-06" })], "2026-11-01")).toEqual([big]);
  });
});

describe("filters", () => {
  const list = [tx({ concept: "Cena", amount: 60, tags: ["amigos"] }), tx({ concept: "Café", amount: 2 }), tx({ type: "income", concept: "Nómina", amount: 2000 })];
  it("supports amount operators, tags and accents-insensitive search", () => {
    expect(filterTransactions(list, { q: ">50" }, [], [])).toHaveLength(2);
    expect(filterTransactions(list, { q: "#amigos" }, [], [])).toHaveLength(1);
    expect(filterTransactions(list, { q: "cafe" }, [], [])).toHaveLength(1);
    expect(filterTransactions(list, { types: ["income"] }, [], [])).toHaveLength(1);
  });
});

describe("csv", () => {
  it("parses dates", () => {
    expect(parseBankDate("05/11/2026")).toBe("2026-11-05");
    expect(parseBankDate("2026-11-05")).toBe("2026-11-05");
    expect(parseBankDate("31/02/2026")).toBeNull();
  });
  it("detects bank columns and maps rows", () => {
    const rows = [["Extracto cuenta"], ["Fecha", "Concepto", "Importe", "Saldo"], ["05/11/2026", "MERCADONA", "-45,30", "1000"], ["06/11/2026", "NOMINA", "2.100,00", "3100"], ["xx", "bad", "1", ""]];
    const { headerRow, mapping } = detectMapping(rows);
    expect(headerRow).toBe(1);
    const res = mapRows(rows, headerRow, mapping);
    expect(res.rows.map((r) => r.amount)).toEqual([-45.3, 2100]);
    expect(res.errors).toHaveLength(1);
  });
  it("exports csv", () => {
    expect(toCSV(["a", "b"], [["x;y", 1.5]])).toBe('﻿a;b\r\n"x;y";1,5');
  });
});

describe("validation", () => {
  it("rejects transfers to the same account", () => {
    const r = transactionSchema.safeParse({ ...tx({ type: "transfer", accountId: "a", toAccountId: "a" }) });
    expect(r.success).toBe(false);
  });
});
