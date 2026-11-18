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
  /** Producto exacto de la línea (la variante, si la hay) */
  productId: ID;
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
  /**
   * Solo en productos genéricos con variantes: comparación por marca/variante (incluye «sin especificar»
   * para las compras apuntadas al genérico), ordenada de más barata a más cara por unidad.
   */
  variants: VariantStat[];
}

export interface VariantStat {
  product: Product;
  /** true para las compras apuntadas directamente al genérico, sin marca */
  unspecified: boolean;
  count: number;
  total: number;
  quantity: number;
  avgUnitPrice: number | null;
  /** Comercio donde esta variante sale más barata (precio medio por unidad) */
  cheapestMerchant: { merchant: string; avgUnitPrice: number } | null;
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
    const p: ProductPurchase = { itemId: it.id, transactionId: t.id, productId: it.productId, date: t.date, merchant: t.merchant, quantity: it.quantity, unitPrice: it.unitPrice, amount: it.amount };
    (byProduct.get(it.productId) ?? byProduct.set(it.productId, []).get(it.productId)!).push(p);
  }

  const children = childrenMap(products);

  return products.map((product) => {
    // Un producto genérico suma sus compras directas y las de todas sus variantes
    const kids = product.parentId ? [] : children.get(product.id) ?? [];
    const purchases = [product, ...kids].flatMap((p) => byProduct.get(p.id) ?? []).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
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
      variants: kids.length ? variantStats(product, kids, byProduct) : [],
    };
  });
}

function variantStats(generic: Product, kids: Product[], byProduct: Map<ID, ProductPurchase[]>): VariantStat[] {
  const entries: VariantStat[] = [];
  const all: Array<[Product, boolean]> = [...kids.map((k): [Product, boolean] => [k, false]), [generic, true]];
  for (const [p, unspecified] of all) {
    const list = byProduct.get(p.id) ?? [];
    if (unspecified && list.length === 0) continue;
    const quantity = list.reduce((s, x) => s + x.quantity, 0);
    const total = list.reduce((s, x) => s + x.amount, 0);
    const perMerchant = new Map<string, { name: string; qty: number; total: number }>();
    for (const x of list) {
      const name = x.merchant?.trim() || "Sin comercio";
      const key = normalize(name);
      const cur = perMerchant.get(key) ?? { name, qty: 0, total: 0 };
      cur.qty += x.quantity;
      cur.total += x.amount;
      perMerchant.set(key, cur);
    }
    const cheapest = [...perMerchant.values()].filter((m) => m.qty > 0)
      .map((m) => ({ merchant: m.name, avgUnitPrice: round2(m.total / m.qty) }))
      .sort((a, b) => a.avgUnitPrice - b.avgUnitPrice)[0] ?? null;
    entries.push({
      product: p, unspecified, count: list.length, total: round2(total), quantity: round2(quantity),
      avgUnitPrice: quantity > 0 ? round2(total / quantity) : null, cheapestMerchant: cheapest,
    });
  }
  // De más barata a más cara por unidad; las que aún no tienen compras, al final
  return entries.sort((a, b) => (a.avgUnitPrice ?? Infinity) - (b.avgUnitPrice ?? Infinity));
}

// ---------------------------------------------------------------------------
// Variantes, formatos y unidades
// ---------------------------------------------------------------------------
export function childrenMap(products: Product[]): Map<ID, Product[]> {
  const m = new Map<ID, Product[]>();
  for (const p of products) if (p.parentId) (m.get(p.parentId) ?? m.set(p.parentId, []).get(p.parentId)!).push(p);
  for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return m;
}

/** Ids de los productos más sus variantes (para filtrar movimientos por un producto genérico). */
export function withVariants(ids: ID[], products: Product[]): ID[] {
  const set = new Set(ids);
  for (const p of products) if (p.parentId && set.has(p.parentId)) set.add(p.id);
  return [...set];
}

/** Unidades en las que se puede indicar el tamaño de un envase según la unidad del producto. */
export function packageUnitsFor(baseUnit: string): { unit: string; factor: number }[] {
  switch (baseUnit) {
    case "l": return [{ unit: "ml", factor: 0.001 }, { unit: "cl", factor: 0.01 }, { unit: "l", factor: 1 }];
    case "kg": return [{ unit: "g", factor: 0.001 }, { unit: "kg", factor: 1 }];
    case "docena": return [{ unit: "ud", factor: 1 / 12 }, { unit: "docena", factor: 1 }];
    default: return [{ unit: baseUnit, factor: 1 }];
  }
}

/** Convierte un tamaño (p. ej. 500 ml) a la unidad del producto (0,5 l). */
export function toBaseUnit(value: number, fromUnit: string, baseUnit: string): number {
  const f = packageUnitsFor(baseUnit).find((u) => u.unit === fromUnit)?.factor ?? 1;
  return Math.round(value * f * 1e6) / 1e6;
}

/** Tamaño de envase legible: 0,5 l → «500 ml», 0,33 l → «330 ml», 0,5 docena → «6 ud». */
export function formatPackage(size: number, baseUnit: string): string {
  const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
  if (baseUnit === "l" && size < 1) return `${fmt(size * 1000)} ml`;
  if (baseUnit === "kg" && size < 1) return `${fmt(size * 1000)} g`;
  if (baseUnit === "docena" && size < 1) return `${fmt(size * 12)} ud`;
  return `${fmt(size)} ${baseUnit}`;
}

/** Unidad sugerida por el nombre del producto (el usuario siempre puede cambiarla). */
export function guessUnit(name: string): string {
  const n = normalize(name);
  if (/\b(leche|agua|aceite|zumo|vino|cerveza|refresco|bebida|energetica|gasolina|diesel|gasoil|vinagre|batido|caldo|suavizante)/.test(n)) return "l";
  if (/\b(fruta|verdura|platano|manzana|naranja|pera|tomate|patata|cebolla|zanahoria|pimiento|carne|pollo|ternera|cerdo|pescado|merluza|salmon|arroz|azucar|harina|pienso|uva|fresa|aguacate|limon)/.test(n)) return "kg";
  if (/\bhuevo/.test(n)) return "docena";
  if (/\b(papel|panal|toallita|yogur|pack)/.test(n)) return "paquete";
  return "ud";
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
