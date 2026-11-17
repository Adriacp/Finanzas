import { normalize } from "./insights";
import type { Account, Category, Transaction, TxFilters } from "./types";

/**
 * Filtra movimientos. La búsqueda de texto `q` mira concepto, comercio,
 * descripción, notas, etiquetas, categoría, subcategoría, cuenta e importe.
 * Soporta prefijos: `>50`, `<20`, `=12.5`, `#etiqueta`.
 */
export function filterTransactions(txs: Transaction[], f: TxFilters, categories: Category[], accounts: Account[]): Transaction[] {
  const catName = new Map(categories.map((c) => [c.id, normalize(c.name)]));
  const accName = new Map(accounts.map((a) => [a.id, normalize(a.name)]));
  const terms = (f.q ?? "").trim().split(/\s+/).filter(Boolean);

  return txs.filter((t) => {
    if (f.types?.length && !f.types.includes(t.type)) return false;
    if (f.statuses?.length && !f.statuses.includes(t.status)) return false;
    if (f.categoryIds?.length && !f.categoryIds.includes(t.categoryId ?? "")) return false;
    if (f.subcategoryIds?.length && !f.subcategoryIds.includes(t.subcategoryId ?? "")) return false;
    if (f.accountIds?.length && !f.accountIds.includes(t.accountId ?? "") && !f.accountIds.includes(t.toAccountId ?? "")) return false;
    if (f.tags?.length && !f.tags.every((tag) => t.tags.includes(tag))) return false;
    if (f.merchant && !normalize(t.merchant ?? "").includes(normalize(f.merchant))) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.minAmount != null && t.amount < f.minAmount) return false;
    if (f.maxAmount != null && t.amount > f.maxAmount) return false;
    if (f.fixed === "fixed" && !t.isFixed) return false;
    if (f.fixed === "variable" && t.isFixed) return false;

    for (const term of terms) {
      const m = /^([<>=])(\d+(?:[.,]\d+)?)$/.exec(term);
      if (m) {
        const v = Number(m[2].replace(",", "."));
        if (m[1] === ">" && !(t.amount > v)) return false;
        if (m[1] === "<" && !(t.amount < v)) return false;
        if (m[1] === "=" && Math.abs(t.amount - v) > 0.005) return false;
        continue;
      }
      if (term.startsWith("#")) {
        const tag = normalize(term.slice(1));
        if (!t.tags.some((x) => normalize(x).includes(tag))) return false;
        continue;
      }
      const n = normalize(term);
      const hay = [
        t.concept, t.merchant, t.description, t.notes, t.paymentMethod, t.date,
        t.amount.toFixed(2), t.amount.toFixed(2).replace(".", ","), ...t.tags,
        catName.get(t.categoryId ?? ""), catName.get(t.subcategoryId ?? ""), accName.get(t.accountId ?? ""),
      ]
        .filter(Boolean)
        .map((x) => normalize(String(x)))
        .join(" | ");
      if (!hay.includes(n)) return false;
    }
    return true;
  });
}

export const countActiveFilters = (f: TxFilters) =>
  (f.types?.length ? 1 : 0) + (f.statuses?.length ? 1 : 0) + (f.categoryIds?.length ? 1 : 0) + (f.subcategoryIds?.length ? 1 : 0) +
  (f.accountIds?.length ? 1 : 0) + (f.tags?.length ? 1 : 0) + (f.merchant ? 1 : 0) + (f.from || f.to ? 1 : 0) +
  (f.minAmount != null || f.maxAmount != null ? 1 : 0) + (f.fixed ? 1 : 0);

export const sortTransactions = (txs: Transaction[]) =>
  [...txs].sort((a, b) => (a.date === b.date ? (b.time ?? "").localeCompare(a.time ?? "") || (b.createdAt ?? "").localeCompare(a.createdAt ?? "") : a.date < b.date ? 1 : -1));
