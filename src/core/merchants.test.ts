import { describe, expect, it } from "vitest";
import { compareMerchants, merchantGroups } from "./merchants";
import { lineTotal } from "./products";
import type { Category, Product, Transaction, TransactionItem } from "./types";

let n = 0;
const id = () => `id${++n}`;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: id(), type: "expense", amount: 10, concept: "Compra", categoryId: "alim", subcategoryId: "super", date: "2026-11-10", time: null,
  accountId: null, toAccountId: null, paymentMethod: null, merchant: null, description: null, tags: [], isFixed: false,
  isRecurring: false, recurringId: null, status: "paid", attachmentPath: null, notes: null, ...p,
});
const item = (t: Transaction, productId: string, quantity: number, unitPrice: number): TransactionItem => ({
  id: id(), transactionId: t.id, productId, name: productId, quantity, unitPrice, amount: lineTotal(quantity, unitPrice), sortOrder: 0,
});
const cats: Category[] = [
  { id: "alim", parentId: null, kind: "expense", name: "Alimentación", icon: "x", color: "#000000", description: null, essential: true, sortOrder: 0 },
  { id: "super", parentId: "alim", kind: "expense", name: "Supermercado", icon: "x", color: "#000000", description: null, essential: true, sortOrder: 0 },
  { id: "gas", parentId: "alim", kind: "expense", name: "Gasolina", icon: "x", color: "#000000", description: null, essential: true, sortOrder: 1 },
];
const huevos: Product = { id: "huevos", name: "Huevos", unit: "docena", categoryId: null };
const leche: Product = { id: "leche", name: "Leche", unit: "l", categoryId: null };
const pan: Product = { id: "pan", name: "Pan", unit: "ud", categoryId: null };

describe("comparación de comercios", () => {
  // Lidl más barato, Carrefour más caro; en Mercadona compras mucho más (no debe sesgar el índice)
  const lidl = tx({ merchant: "Lidl", amount: 6 });
  const merca1 = tx({ merchant: "Mercadona", amount: 80 });
  const merca2 = tx({ merchant: "mercadona ", amount: 90 });
  const carre = tx({ merchant: "Carrefour", amount: 12 });
  const gasolinera = tx({ merchant: "Repsol", subcategoryId: "gas", amount: 50 });
  const otraGas = tx({ merchant: "Cepsa", subcategoryId: "gas", amount: 45 });
  const items = [
    item(lidl, "huevos", 1, 2.0), item(lidl, "leche", 2, 0.8),
    item(merca1, "huevos", 10, 2.4), item(merca1, "leche", 20, 0.95), item(merca2, "pan", 3, 1.1),
    item(carre, "huevos", 1, 2.6), item(carre, "leche", 6, 1.05),
  ];
  const txs = [lidl, merca1, merca2, carre, gasolinera, otraGas];

  it("lista los tipos de comercio con varios comercios", () => {
    const groups = merchantGroups(txs, cats);
    expect(groups.map((g) => [g.name, g.merchants])).toEqual([["Supermercado", 3], ["Gasolina", 2]]);
  });

  it("ordena del más barato al más caro con un índice de precios", () => {
    const { merchants, products } = compareMerchants("super", txs, items, [huevos, leche, pan]);
    expect(merchants.map((m) => m.name)).toEqual(["Lidl", "Mercadona", "Carrefour"]);
    const [l, m, c] = merchants;
    expect(l.priceIndex!).toBeLessThan(100);
    expect(c.priceIndex!).toBeGreaterThan(100);
    expect(m.visits).toBe(2); // «Mercadona» y «mercadona » son el mismo comercio
    expect(m.avgTicket).toBe(85);
    expect(l.comparedProducts).toBe(2);
    // Producto con más diferencia de precio primero: leche (0,80 → 1,05 = +31,3 %), huevos (2,00 → 2,60 = +30 %)
    expect(products.map((p) => [p.product.name, p.spreadPct])).toEqual([["Leche", 31.3], ["Huevos", 30]]);
    expect(products[0].cheapest.merchant).toBe("Lidl");
    expect(products[0].priciest.merchant).toBe("Carrefour");
    // Pan solo se compra en un sitio: no se compara
    expect(products.some((p) => p.product.id === "pan")).toBe(false);
  });

  it("sin desglose solo se puede comparar el ticket medio", () => {
    const { merchants } = compareMerchants("gas", txs, items, [huevos]);
    expect(merchants.every((m) => m.priceIndex === null)).toBe(true);
    expect(merchants.map((m) => m.avgTicket)).toEqual([50, 45]);
  });
});
