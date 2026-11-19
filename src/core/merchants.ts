import { type DateRange, inRange } from "./dates";
import { isEffective } from "./finance";
import { normalize } from "./insights";
import { round2 } from "./money";
import type { Category, ID, ISODate, Product, Transaction, TransactionItem } from "./types";

/**
 * Comparación de comercios del mismo tipo (p. ej. todos los supermercados).
 *
 * «Más caro en general» se mide con un índice de precios: para cada producto que has comprado
 * en al menos dos comercios del grupo se calcula su precio medio por unidad en cada uno y se
 * compara con la media entre comercios. El índice de un comercio es la media de esas
 * comparaciones (100 = en la media, 110 = un 10 % más caro). Así no influye cuánto compras en cada sitio.
 */

/** Tipo de comercio: una subcategoría (Supermercado) o una categoría (Vivienda). */
export interface MerchantGroup {
  categoryId: ID;
  name: string;
  merchants: number;
  visits: number;
}

export interface MerchantComparison {
  key: string;
  name: string;
  visits: number;
  total: number;
  avgTicket: number;
  lastDate: ISODate;
  /** 100 = precio medio del grupo; null si no hay productos comparables */
  priceIndex: number | null;
  /** Productos usados para calcular el índice */
  comparedProducts: number;
}

export interface ProductPriceComparison {
  product: Product;
  /** Precio medio por unidad en cada comercio (de más barato a más caro) */
  prices: { merchantKey: string; merchant: string; avgUnitPrice: number; purchases: number }[];
  cheapest: { merchant: string; avgUnitPrice: number };
  priciest: { merchant: string; avgUnitPrice: number };
  /** Cuánto más caro es el comercio más caro respecto al más barato (%) */
  spreadPct: number;
}

const groupIdOf = (t: Transaction) => t.subcategoryId ?? t.categoryId;
const counts = (t: Transaction, range?: DateRange) =>
  t.type === "expense" && isEffective(t) && !!t.merchant?.trim() && (!range || inRange(t.date, range));

/** Tipos de comercio con al menos `minMerchants` comercios distintos (para elegir qué comparar). */
export function merchantGroups(txs: Transaction[], categories: Category[], range?: DateRange, minMerchants = 2): MerchantGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const map = new Map<ID, { keys: Set<string>; visits: number }>();
  for (const t of txs) {
    const g = groupIdOf(t);
    if (!g || !counts(t, range)) continue;
    const cur = map.get(g) ?? { keys: new Set(), visits: 0 };
    cur.keys.add(normalize(t.merchant!));
    cur.visits++;
    map.set(g, cur);
  }
  return [...map.entries()]
    .filter(([id, v]) => v.keys.size >= minMerchants && byId.has(id))
    .map(([id, v]) => ({ categoryId: id, name: byId.get(id)!.name, merchants: v.keys.size, visits: v.visits }))
    .sort((a, b) => b.merchants - a.merchants || b.visits - a.visits);
}

export function compareMerchants(
  groupId: ID,
  txs: Transaction[],
  items: TransactionItem[],
  products: Product[],
  range?: DateRange,
): { merchants: MerchantComparison[]; products: ProductPriceComparison[] } {
  const inGroup = txs.filter((t) => counts(t, range) && (t.subcategoryId === groupId || (!t.subcategoryId && t.categoryId === groupId)));
  const txMerchant = new Map<ID, string>();

  // Comercios: visitas, gasto y ticket medio
  const mm = new Map<string, { spellings: Map<string, number>; visits: number; total: number; lastDate: ISODate }>();
  for (const t of inGroup) {
    const raw = t.merchant!.trim();
    const key = normalize(raw);
    txMerchant.set(t.id, key);
    const cur = mm.get(key) ?? { spellings: new Map(), visits: 0, total: 0, lastDate: t.date };
    cur.spellings.set(raw, (cur.spellings.get(raw) ?? 0) + 1);
    cur.visits++;
    cur.total += t.amount;
    if (t.date > cur.lastDate) cur.lastDate = t.date;
    mm.set(key, cur);
  }
  const nameOf = (key: string) => [...mm.get(key)!.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Precio medio por unidad de cada producto en cada comercio
  const pm = new Map<ID, Map<string, { qty: number; amount: number; n: number }>>();
  for (const it of items) {
    const key = txMerchant.get(it.transactionId);
    if (!key || !it.productId || it.quantity <= 0 || it.amount <= 0) continue;
    const byMerchant = pm.get(it.productId) ?? new Map();
    const cur = byMerchant.get(key) ?? { qty: 0, amount: 0, n: 0 };
    cur.qty += it.quantity;
    cur.amount += it.amount;
    cur.n++;
    byMerchant.set(key, cur);
    pm.set(it.productId, byMerchant);
  }

  const productById = new Map(products.map((p) => [p.id, p]));
  const productComparisons: ProductPriceComparison[] = [];
  const ratios = new Map<string, number[]>();
  for (const [productId, byMerchant] of pm) {
    const product = productById.get(productId);
    if (!product || byMerchant.size < 2) continue;
    const prices = [...byMerchant.entries()]
      .map(([merchantKey, v]) => ({ merchantKey, merchant: nameOf(merchantKey), avgUnitPrice: v.amount / v.qty, purchases: v.n }))
      .sort((a, b) => a.avgUnitPrice - b.avgUnitPrice);
    const ref = prices.reduce((s, p) => s + p.avgUnitPrice, 0) / prices.length;
    if (ref <= 0) continue;
    for (const p of prices) (ratios.get(p.merchantKey) ?? ratios.set(p.merchantKey, []).get(p.merchantKey)!).push(p.avgUnitPrice / ref);
    const cheapest = prices[0], priciest = prices[prices.length - 1];
    productComparisons.push({
      product,
      prices,
      cheapest: { merchant: cheapest.merchant, avgUnitPrice: cheapest.avgUnitPrice },
      priciest: { merchant: priciest.merchant, avgUnitPrice: priciest.avgUnitPrice },
      spreadPct: cheapest.avgUnitPrice > 0 ? Math.round(((priciest.avgUnitPrice - cheapest.avgUnitPrice) / cheapest.avgUnitPrice) * 1000) / 10 : 0,
    });
  }

  const merchants: MerchantComparison[] = [...mm.entries()].map(([key, v]) => {
    const r = ratios.get(key) ?? [];
    return {
      key,
      name: nameOf(key),
      visits: v.visits,
      total: round2(v.total),
      avgTicket: round2(v.total / v.visits),
      lastDate: v.lastDate,
      priceIndex: r.length ? Math.round((r.reduce((s, x) => s + x, 0) / r.length) * 1000) / 10 : null,
      comparedProducts: r.length,
    };
  });
  // Más barato primero; los que no se pueden comparar, al final por gasto
  merchants.sort((a, b) => (a.priceIndex ?? Infinity) - (b.priceIndex ?? Infinity) || b.total - a.total);
  productComparisons.sort((a, b) => b.spreadPct - a.spreadPct);
  return { merchants, products: productComparisons };
}
