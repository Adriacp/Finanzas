import { type DateRange, inRange } from "./dates";
import { isEffective } from "./finance";
import { normalize } from "./insights";
import { round2 } from "./money";
import type { ID, ISODate, Product, Transaction, TransactionItem } from "./types";

/** Total de una línea: cantidad × precio unitario, redondeado a céntimos. */
export const lineTotal = (quantity: number, unitPrice: number) => round2(quantity * unitPrice);

/** Suma de las líneas de un desglose. */
export const itemsTotal = (items: Pick<TransactionItem, "amount">[]) => round2(items.reduce((s, i) => s + i.amount, 0));

export function itemsByTransaction(items: TransactionItem[]): Map<ID, TransactionItem[]> {
  const map = new Map<ID, TransactionItem[]>();
  for (const it of items) (map.get(it.transactionId) ?? map.set(it.transactionId, []).get(it.transactionId)!).push(it);
  for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  return map;
}

export interface ProductPurchase {
  itemId: ID;
  transactionId: ID;
  date: ISODate;
  merchant: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface MerchantStat {
  merchant: string;
  count: number;
  total: number;
  avgUnitPrice: number;
  lastDate: ISODate;
}

export interface ProductStat {
  product: Product;
  total: number;
  count: number;
  quantity: number;
  /** Precio medio ponderado por cantidad */
  avgUnitPrice: number | null;
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
  lastUnitPrice: number | null;
  lastDate: ISODate | null;
  /** Comercios ordenados por número de compras (dónde lo sueles comprar) */
  merchants: MerchantStat[];
  /** Comercio con el precio medio más bajo (si hay al menos 2 comercios) */
  cheapestMerchant: MerchantStat | null;
  purchases: ProductPurchase[];
}

/**
 * Compras de cada producto (solo movimientos de gasto ya pagados).
 * Las líneas sin producto enlazado no cuentan.
 */
export function productStats(products: Product[], items: TransactionItem[], txs: Transaction[], range?: DateRange): ProductStat[] {
  const txById = new Map(txs.map((t) => [t.id, t]));
  const byProduct = new Map<ID, ProductPurchase[]>();
  for (const it of items) {
    if (!it.productId) continue;
    const t = txById.get(it.transactionId);
    if (!t || t.type !== "expense" || !isEffective(t)) continue;
    if (range && !inRange(t.date, range)) continue;
    const p: ProductPurchase = { itemId: it.id, transactionId: t.id, date: t.date, merchant: t.merchant, quantity: it.quantity, unitPrice: it.unitPrice, amount: it.amount };
    (byProduct.get(it.productId) ?? byProduct.set(it.productId, []).get(it.productId)!).push(p);
  }

  return products.map((product) => {
    const purchases = (byProduct.get(product.id) ?? []).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const total = round2(purchases.reduce((s, p) => s + p.amount, 0));
    const quantity = round2(purchases.reduce((s, p) => s + p.quantity, 0));
    const prices = purchases.map((p) => p.unitPrice).filter((x) => x > 0);

    const merchMap = new Map<string, { name: string; count: number; total: number; qty: number; lastDate: ISODate }>();
    for (const p of purchases) {
      const name = p.merchant?.trim() || "Sin comercio";
      const key = normalize(name);
      const cur = merchMap.get(key) ?? { name, count: 0, total: 0, qty: 0, lastDate: p.date };
      cur.count++;
      cur.total += p.amount;
      cur.qty += p.quantity;
      if (p.date > cur.lastDate) cur.lastDate = p.date;
      merchMap.set(key, cur);
    }
    const merchants: MerchantStat[] = [...merchMap.values()]
      .map((m) => ({ merchant: m.name, count: m.count, total: round2(m.total), avgUnitPrice: m.qty > 0 ? round2(m.total / m.qty) : 0, lastDate: m.lastDate }))
      .sort((a, b) => b.count - a.count || b.total - a.total);
    const known = merchants.filter((m) => m.merchant !== "Sin comercio" && m.avgUnitPrice > 0);
    const cheapestMerchant = known.length >= 2 ? [...known].sort((a, b) => a.avgUnitPrice - b.avgUnitPrice)[0] : null;

    return {
      product,
      total,
      count: purchases.length,
      quantity,
      avgUnitPrice: quantity > 0 ? round2(total / quantity) : null,
      minUnitPrice: prices.length ? Math.min(...prices) : null,
      maxUnitPrice: prices.length ? Math.max(...prices) : null,
      lastUnitPrice: purchases[0]?.unitPrice ?? null,
      lastDate: purchases[0]?.date ?? null,
      merchants,
      cheapestMerchant,
      purchases,
    };
  });
}

/** Último precio pagado por un producto (para rellenar al añadirlo a un desglose). */
export function lastUnitPrice(productId: ID, items: TransactionItem[], txs: Transaction[]): number | null {
  const dateOf = new Map(txs.map((t) => [t.id, t.date]));
  let best: { date: string; price: number } | null = null;
  for (const it of items) {
    if (it.productId !== productId || it.unitPrice <= 0) continue;
    const d = dateOf.get(it.transactionId);
    if (d && (!best || d > best.date)) best = { date: d, price: it.unitPrice };
  }
  return best?.price ?? null;
}

/** Productos ordenados por uso (los más comprados primero) para el selector. */
export function productsByUsage(products: Product[], items: TransactionItem[]): Product[] {
  const uses = new Map<ID, number>();
  for (const it of items) if (it.productId) uses.set(it.productId, (uses.get(it.productId) ?? 0) + 1);
  return [...products].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.name.localeCompare(b.name, "es"));
}

export const findProductByName = (products: Product[], name: string) => products.find((p) => normalize(p.name) === normalize(name));
