import { describe, expect, it } from "vitest";
import { buildDefaultCategories, buildDefaultProducts } from "./defaults";
import { filterTransactions } from "./filters";
import { itemsByTransaction, itemsTotal, lastUnitPrice, lineTotal, productStats } from "./products";
import type { Product, Transaction, TransactionItem } from "./types";

let n = 0;
const id = () => `id${++n}`;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: id(), type: "expense", amount: 10, concept: "Compra", categoryId: null, subcategoryId: null, date: "2026-11-10", time: null,
  accountId: null, toAccountId: null, paymentMethod: null, merchant: null, description: null, tags: [], isFixed: false,
  isRecurring: false, recurringId: null, status: "paid", attachmentPath: null, notes: null, ...p,
});
const item = (transactionId: string, productId: string | null, name: string, quantity: number, unitPrice: number): TransactionItem => ({
  id: id(), transactionId, productId, name, quantity, unitPrice, amount: lineTotal(quantity, unitPrice), sortOrder: 0,
});

const huevos: Product = { id: "p-huevos", name: "Huevos", unit: "docena", categoryId: null };
const leche: Product = { id: "p-leche", name: "Leche", unit: "l", categoryId: null };

describe("productos", () => {
  it("calcula totales de línea y de desglose", () => {
    expect(lineTotal(1.234, 1.99)).toBe(2.46);
    expect(itemsTotal([{ amount: 2.46 }, { amount: 3 }, { amount: -0.5 }])).toBe(4.96);
  });

  it("crea el catálogo por defecto enlazado a subcategorías", () => {
    const cats = buildDefaultCategories(id);
    const products = buildDefaultProducts(id, cats);
    const h = products.find((p) => p.name === "Huevos")!;
    expect(cats.find((c) => c.id === h.categoryId)?.name).toBe("Supermercado");
    expect(cats.find((c) => c.id === products.find((p) => p.name === "Gasolina 95")!.categoryId)?.name).toBe("Gasolina");
    expect(new Set(products.map((p) => p.name)).size).toBe(products.length);
  });

  it("calcula cuánto gastas, a qué precio y dónde sueles comprar", () => {
    const t1 = tx({ date: "2026-10-01", merchant: "Mercadona" });
    const t2 = tx({ date: "2026-10-15", merchant: "Mercadona" });
    const t3 = tx({ date: "2026-11-02", merchant: "Lidl" });
    const pending = tx({ date: "2026-11-20", merchant: "Lidl", status: "scheduled" });
    const items = [
      item(t1.id, huevos.id, "Huevos", 1, 2.4), item(t1.id, leche.id, "Leche", 6, 0.9),
      item(t2.id, huevos.id, "Huevos", 2, 2.5),
      item(t3.id, huevos.id, "Huevos", 1, 2.1),
      item(pending.id, huevos.id, "Huevos", 5, 2), // programado: no cuenta todavía
    ];
    const [h] = productStats([huevos, leche], items, [t1, t2, t3, pending]);
    expect(h.count).toBe(3);
    expect(h.quantity).toBe(4);
    expect(h.total).toBe(9.5); // 2,40 + 5,00 + 2,10
    expect(h.avgUnitPrice).toBe(2.38);
    expect(h.minUnitPrice).toBe(2.1);
    expect(h.lastUnitPrice).toBe(2.1);
    expect(h.lastDate).toBe("2026-11-02");
    expect(h.merchants[0]).toMatchObject({ merchant: "Mercadona", count: 2 }); // donde más lo compras
    expect(h.cheapestMerchant?.merchant).toBe("Lidl"); // donde sale más barato
    // Filtrado por periodo
    const [hNov] = productStats([huevos], items, [t1, t2, t3, pending], { from: "2026-11-01", to: "2026-11-30" });
    expect(hNov.count).toBe(1);
    expect(lastUnitPrice(huevos.id, items, [t1, t2, t3, pending])).toBe(2);
  });

  it("filtra y busca movimientos por producto", () => {
    const a = tx({ concept: "Compra semanal" });
    const b = tx({ concept: "Otra compra" });
    const items = [item(a.id, huevos.id, "Huevos", 1, 2.4), item(b.id, leche.id, "Leche", 1, 0.9)];
    const map = itemsByTransaction(items);
    expect(filterTransactions([a, b], { productIds: [huevos.id] }, [], [], map).map((t) => t.id)).toEqual([a.id]);
    expect(filterTransactions([a, b], { q: "huevos" }, [], [], map).map((t) => t.id)).toEqual([a.id]);
  });
});

describe("comercios", () => {
  it("agrupa variantes del nombre y aprende la categoría habitual", async () => {
    const { merchantDirectory, suggestFromMerchant } = await import("./insights");
    const txs = [
      tx({ merchant: "Spar", categoryId: "alim", subcategoryId: "super", date: "2026-11-01" }),
      tx({ merchant: "Spar ", categoryId: "alim", subcategoryId: "super", date: "2026-11-05" }),
      tx({ merchant: "spar", categoryId: "alim", subcategoryId: "super", date: "2026-11-07" }),
      tx({ merchant: "SPAR", categoryId: "ocio", subcategoryId: "bares", date: "2026-11-09" }),
      tx({ merchant: "Mercadona", categoryId: "alim", subcategoryId: "super", date: "2026-11-10" }),
    ];
    const dir = merchantDirectory(txs);
    expect(dir).toHaveLength(2);
    expect(dir[0]).toMatchObject({ name: "Spar", count: 4, categoryId: "alim", subcategoryId: "super", lastDate: "2026-11-09" });
    expect(suggestFromMerchant(" spar", txs)).toMatchObject({ categoryId: "alim", subcategoryId: "super" });
    expect(suggestFromMerchant("Desconocido", txs)).toBeNull();
  });
});

describe("variantes y formatos", () => {
  it("convierte formatos a la unidad del producto y los muestra legibles", async () => {
    const { toBaseUnit, formatPackage, packageUnitsFor } = await import("./products");
    expect(toBaseUnit(500, "ml", "l")).toBe(0.5);
    expect(toBaseUnit(33, "cl", "l")).toBe(0.33);
    expect(toBaseUnit(250, "g", "kg")).toBe(0.25);
    expect(toBaseUnit(6, "ud", "docena")).toBe(0.5);
    expect(formatPackage(0.5, "l")).toBe("500 ml");
    expect(formatPackage(1.5, "l")).toBe("1,5 l");
    expect(formatPackage(0.5, "docena")).toBe("6 ud");
    expect(packageUnitsFor("ud").map((u) => u.unit)).toEqual(["ud"]);
  });

  it("sugiere la unidad por el nombre", async () => {
    const { guessUnit } = await import("./products");
    expect(guessUnit("Leche entera")).toBe("l");
    expect(guessUnit("Bebida energética")).toBe("l");
    expect(guessUnit("Plátanos de Canarias")).toBe("kg");
    expect(guessUnit("Huevos camperos")).toBe("docena");
    expect(guessUnit("Cuaderno")).toBe("ud");
  });

  it("compara la energética en general y cada marca por separado (en €/l)", async () => {
    const { productStats, withVariants } = await import("./products");
    const energetica: Product = { id: "ene", name: "Bebida energética", unit: "l", categoryId: null };
    const powerking: Product = { id: "pk", name: "Powerking", unit: "l", categoryId: null, parentId: "ene", packageSize: 1 };
    const v: Product = { id: "v", name: "V", unit: "l", categoryId: null, parentId: "ene", packageSize: 0.5 };
    const spar = tx({ merchant: "Spar", date: "2026-11-18" });
    const supermacher = tx({ merchant: "Supermacher", date: "2026-11-19" });
    const spar2 = tx({ merchant: "Spar", date: "2026-11-20" });
    // Powerking 1 l a 1,20 € → 1,20 €/l ; V 500 ml a 1,50 € → 3,00 €/l ; V en Spar a 1,40 € → 2,80 €/l
    const items = [item(spar.id, "pk", "Powerking", 1, 1.2), item(supermacher.id, "v", "V", 0.5, 3), item(spar2.id, "v", "V", 0.5, 2.8)];
    const stats = productStats([energetica, powerking, v], items, [spar, supermacher, spar2]);
    const gen = stats.find((s) => s.product.id === "ene")!;
    expect(gen.count).toBe(3); // incluye las compras de todas las marcas
    expect(gen.quantity).toBe(2); // 1 l + 0,5 l + 0,5 l
    expect(gen.avgUnitPrice).toBe(2.05); // (1,20 + 1,50 + 1,40) / 2 l
    expect(gen.variants.map((x) => [x.product.name, x.avgUnitPrice])).toEqual([["Powerking", 1.2], ["V", 2.9]]);
    expect(gen.variants[1].cheapestMerchant).toEqual({ merchant: "Spar", avgUnitPrice: 2.8 });
    const vStat = stats.find((s) => s.product.id === "v")!;
    expect(vStat.count).toBe(2); // la marca solo con sus propias compras
    expect(vStat.cheapestMerchant?.merchant).toBe("Spar");
    expect(vStat.variants).toEqual([]);
    expect(withVariants(["ene"], [energetica, powerking, v]).sort()).toEqual(["ene", "pk", "v"]);
  });
});

describe("formatos por compra", () => {
  it("propone primero los formatos ya usados y luego los típicos", async () => {
    const { formatOptions, supportsPackages, usedPackageSizes } = await import("./products");
    expect(supportsPackages("l")).toBe(true);
    expect(supportsPackages("ud")).toBe(false);
    // Powerking comprada en 500 ml y 750 ml (+ habitual 500 ml repetido)
    const opts = formatOptions("l", [0.5, 0.75, 0.5, null]);
    expect(opts.filter((o) => o.used).map((o) => o.size)).toEqual([0.5, 0.75]);
    expect(opts.filter((o) => !o.used).map((o) => o.size)).toEqual([0.25, 0.33, 1, 1.5, 2]);
    const a = tx({ date: "2026-11-01" }), b = tx({ date: "2026-11-05" });
    const items = [
      { ...item(a.id, "pk", "Powerking", 0.5, 2), packageSize: 0.5 },
      { ...item(b.id, "pk", "Powerking", 0.75, 2), packageSize: 0.75 },
      { ...item(b.id, "v", "V", 0.5, 3), packageSize: 0.5 },
    ];
    expect(usedPackageSizes("pk", items, [a, b])).toEqual([0.75, 0.5]); // el más reciente primero
  });
});
