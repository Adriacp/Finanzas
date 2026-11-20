import { lastUnitPrice, lineTotal, productStats, usedPackageSizes } from "./products";
import { round2 } from "./money";
import type { ID, Product, ShoppingItem, Transaction, TransactionItem } from "./types";

/**
 * Lista de la compra: para cada artículo con producto enlazado se calcula el último precio,
 * el comercio más barato y un importe estimado. La cantidad de la lista cuenta envases si el producto
 * tiene formato (p. ej. 6 × 1 l) y unidades base si no (p. ej. 1,5 kg).
 */
export interface ShoppingInsight {
  item: ShoppingItem;
  product: Product | null;
  /** Precio por unidad base (€/l, €/kg, €/ud…) de la última compra */
  lastUnitPrice: number | null;
  /** Formato del envase de la última compra (en unidad base), si lo hay */
  packageSize: number | null;
  /** Importe estimado de este artículo con el último precio */
  estimated: number | null;
  cheapestMerchant: { merchant: string; avgUnitPrice: number } | null;
}

const qtyOf = (i: ShoppingItem) => i.quantity ?? 1;

export function shoppingInsights(items: ShoppingItem[], products: Product[], txItems: TransactionItem[], txs: Transaction[]): ShoppingInsight[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const stats = new Map(productStats(products, txItems, txs).map((s) => [s.product.id, s]));
  return items.map((item) => {
    const product = item.productId ? byId.get(item.productId) ?? null : null;
    if (!product) return { item, product: null, lastUnitPrice: null, packageSize: null, estimated: null, cheapestMerchant: null };
    const price = lastUnitPrice(product.id, txItems, txs);
    const packageSize = usedPackageSizes(product.id, txItems, txs)[0] ?? product.packageSize ?? null;
    const base = qtyOf(item) * (packageSize ?? 1);
    return {
      item, product, lastUnitPrice: price, packageSize,
      estimated: price !== null ? lineTotal(base, price) : null,
      cheapestMerchant: stats.get(product.id)?.cheapestMerchant ?? null,
    };
  });
}

export function estimatedTotal(insights: ShoppingInsight[]): number {
  return round2(insights.reduce((s, i) => s + (i.estimated ?? 0), 0));
}

/**
 * Comercio donde sale más barata la lista (precio medio por unidad en cada comercio; si un artículo
 * no se ha comprado allí se usa su precio medio general). Necesita al menos 2 comercios con datos.
 */
export function bestMerchantForList(
  items: ShoppingItem[], products: Product[], txItems: TransactionItem[], txs: Transaction[],
): { merchant: string; total: number; covered: number } | null {
  const stats = new Map(productStats(products, txItems, txs).map((s) => [s.product.id, s]));
  const lines = items.flatMap((item) => {
    const s = item.productId ? stats.get(item.productId) : undefined;
    if (!s || s.avgUnitPrice === null) return [];
    const base = qtyOf(item) * (usedPackageSizes(s.product.id, txItems, txs)[0] ?? s.product.packageSize ?? 1);
    return [{ s, base }];
  });
  const merchants = new Set<string>();
  for (const { s } of lines) for (const m of s.merchants) if (m.merchant !== "Sin comercio" && m.avgUnitPrice > 0) merchants.add(m.merchant);
  if (merchants.size < 2) return null;
  const ranked = [...merchants].map((merchant) => {
    let total = 0;
    let covered = 0;
    for (const { s, base } of lines) {
      const here = s.merchants.find((m) => m.merchant === merchant && m.avgUnitPrice > 0);
      if (here) covered++;
      total += base * (here?.avgUnitPrice ?? s.avgUnitPrice!);
    }
    return { merchant, total: round2(total), covered };
  });
  return ranked.sort((a, b) => a.total - b.total || b.covered - a.covered)[0];
}

/** Líneas de desglose para «Terminar compra»: artículos marcados con producto, al último precio. */
export function checkedToItems(
  insights: ShoppingInsight[], newId: () => ID, transactionId: ID = "",
): TransactionItem[] {
  return insights
    .filter((i) => i.item.checked && i.product)
    .map((i, sortOrder) => {
      const quantity = qtyOf(i.item) * (i.packageSize ?? 1);
      const unitPrice = i.lastUnitPrice ?? 0;
      return {
        id: newId(), transactionId, productId: i.product!.id, name: i.product!.name, quantity, unitPrice,
        amount: lineTotal(quantity, unitPrice), sortOrder, ...(i.packageSize ? { packageSize: i.packageSize } : {}),
      };
    });
}
