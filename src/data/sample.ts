import { addDays, endOfMonth, startOfMonth, subMonths } from "date-fns";
import { buildDefaultCategories, buildDefaultProducts } from "@/core/defaults";
import { lineTotal } from "@/core/products";
import { toISO } from "@/core/dates";
import { round2 } from "@/core/money";
import type { Account, Budget, Category, FinanceData, Goal, Product, Recurring, Transaction, TransactionItem } from "@/core/types";
import { newId } from "./repository";

/** Datos de ejemplo realistas (6 meses) para explorar la app en modo demo. */
export function buildSampleData(today = new Date()): Omit<FinanceData, "profile"> {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const between = (a: number, b: number) => round2(a + rnd() * (b - a));

  const categories: Category[] = buildDefaultCategories(newId);
  const sub = (name: string, parent?: string) => {
    const p = parent ? categories.find((c) => !c.parentId && c.name === parent) : undefined;
    const s = categories.find((c) => c.parentId && c.name === name && (!p || c.parentId === p.id))!;
    return { categoryId: s.parentId!, subcategoryId: s.id };
  };

  const acc = (name: string, type: Account["type"], initial: number, color: string, icon: string, institution: string | null, i: number): Account => ({
    id: newId(), name, type, institution, initialBalance: initial, currency: "EUR", color, icon, archived: false, sortOrder: i,
  });
  const main = acc("Cuenta principal", "checking", 1850, "#6366f1", "landmark", "BBVA", 0);
  const savings = acc("Ahorro", "savings", 6500, "#10b981", "piggy-bank", "ING", 1);
  const cash = acc("Efectivo", "cash", 80, "#22c55e", "banknote", null, 2);
  const credit = acc("Tarjeta de crédito", "credit_card", 0, "#f97316", "credit-card", "BBVA", 3);
  const accounts = [main, savings, cash, credit];

  const transactions: Transaction[] = [];
  const add = (p: Partial<Transaction> & Pick<Transaction, "concept" | "amount" | "date">) =>
    transactions.push({
      id: newId(), type: "expense", categoryId: null, subcategoryId: null, time: null, accountId: main.id, toAccountId: null,
      paymentMethod: "Tarjeta", merchant: null, description: null, tags: [], isFixed: false, isRecurring: false, recurringId: null,
      status: "paid", attachmentPath: null, notes: null, ...p,
    });

  const recurring: Recurring[] = [];
  const rec = (name: string, amount: number, day: number, s: { categoryId: string; subcategoryId: string }, isSubscription: boolean, usage: Recurring["usage"] = null, frequency: Recurring["frequency"] = "monthly") => {
    const startDate = toISO(new Date(today.getFullYear(), today.getMonth() - 6, day));
    let next = new Date(today.getFullYear(), today.getMonth(), day);
    if (toISO(next) <= toISO(today)) next = new Date(today.getFullYear(), today.getMonth() + 1, day);
    const r: Recurring = { id: newId(), name, amount, type: "expense", frequency, nextDate: toISO(next), startDate, endDate: null, ...s, accountId: main.id,
      isSubscription, isFixed: true, status: "active", usage, merchant: name, notes: null };
    recurring.push(r);
    return r;
  };
  const rRent = rec("Alquiler piso", 850, 1, sub("Alquiler"), false);
  const rNetflix = rec("Netflix", 13.99, 12, sub("Netflix"), true, "medium");
  const rSpotify = rec("Spotify", 11.99, 5, sub("Spotify"), true, "high");
  const rGym = rec("Gimnasio", 39.9, 3, sub("Gimnasio"), true, "low");
  const rICloud = rec("iCloud 200 GB", 2.99, 20, sub("iCloud"), true, "high");
  const rInternet = rec("Fibra + móvil", 45, 8, sub("Internet"), false);
  recurring.push({ id: newId(), name: "Disney+", amount: 9.99, type: "expense", frequency: "monthly", nextDate: toISO(subMonths(today, 1)), startDate: toISO(subMonths(today, 8)),
    endDate: toISO(subMonths(today, 2)), ...sub("Streaming"), accountId: main.id, isSubscription: true, isFixed: true, status: "cancelled", usage: "low", merchant: "Disney+", notes: null });

  const supermarkets = ["Mercadona", "Carrefour", "Lidl", "Día"];
  // Catálogo y compras con desglose por productos (precio distinto según el súper)
  const products = buildDefaultProducts(newId, categories);
  const prod = (name: string) => products.find((p) => p.name === name)!;
  // Producto genérico con marcas (variantes) de distinto formato, para comparar por litro
  const energetica: Product = { id: newId(), name: "Bebida energética", unit: "l", categoryId: sub("Supermercado").subcategoryId, parentId: null, packageSize: null };
  const brand = (name: string, packageSize: number): Product => ({ id: newId(), name, unit: "l", categoryId: energetica.categoryId, parentId: energetica.id, packageSize });
  const ENERGY: Array<[Product, number]> = [[brand("Powerking", 1), 1.15], [brand("Monster", 0.5), 1.55], [brand("Red Bull", 0.25), 1.45], [brand("V", 0.5), 1.35]];
  products.push(energetica, ...ENERGY.map(([p]) => p));
  const transactionItems: TransactionItem[] = [];
  const PRICE_FACTOR: Record<string, number> = { Mercadona: 1, Carrefour: 1.06, Lidl: 0.9, "Día": 0.96 };
  const BASKET: Array<[string, number, [number, number]]> = [
    ["Huevos", 2.35, [1, 1]], ["Leche", 0.95, [3, 6]], ["Pan", 1.1, [1, 2]], ["Plátanos", 1.89, [0.8, 1.6]], ["Tomates", 2.2, [0.5, 1.5]],
    ["Pollo", 6.5, [0.6, 1.2]], ["Yogures", 1.75, [1, 2]], ["Café", 4.2, [1, 1]], ["Aceite de oliva", 8.9, [1, 1]], ["Pasta", 1.3, [1, 2]],
    ["Agua", 0.35, [6, 12]], ["Queso", 3.6, [1, 1]], ["Papel higiénico", 4.5, [1, 1]],
  ];
  const buySuper = (iso: string) => {
    const shop = supermarkets[Math.floor(rnd() * 4)];
    const txId = newId();
    const picked = BASKET.filter((_, i) => i < 3 || rnd() > 0.55); // huevos, leche y pan casi siempre
    const items = picked.map(([name, base, [qMin, qMax]], i): TransactionItem => {
      const quantity = qMin === qMax ? qMin : Number.isInteger(qMin) ? Math.round(between(qMin, qMax)) : round2(between(qMin, qMax));
      const unitPrice = round2(base * PRICE_FACTOR[shop] * between(0.96, 1.04));
      return { id: newId(), transactionId: txId, productId: prod(name).id, name, quantity, unitPrice, amount: lineTotal(quantity, unitPrice), sortOrder: i };
    });
    // A veces, una bebida energética de alguna marca (se guarda en litros: 1 lata de 500 ml = 0,5 l)
    if (rnd() > 0.6) {
      const [brand, canPrice] = ENERGY[Math.floor(rnd() * ENERGY.length)];
      const cans = rnd() > 0.7 ? 2 : 1;
      const size = brand.packageSize!;
      const unitPrice = Math.round(((canPrice * PRICE_FACTOR[shop] * between(0.97, 1.03)) / size) * 1e4) / 1e4;
      const quantity = round2(cans * size);
      items.push({ id: newId(), transactionId: txId, productId: brand.id, name: brand.name, quantity, unitPrice, amount: round2(quantity * unitPrice), sortOrder: items.length });
    }
    // 3 de cada 4 compras llevan desglose; el resto solo el total (el desglose es opcional)
    const withItems = rnd() > 0.25;
    if (withItems) transactionItems.push(...items);
    const total = withItems ? round2(items.reduce((s, it) => s + it.amount, 0)) : between(25, 95);
    add({ id: txId, concept: `Compra ${shop}`, merchant: shop, amount: total, date: iso, ...sub("Supermercado"), time: "11:30" });
  };
  const restaurants = ["La Tagliatella", "Sushi Bar Koi", "Taberna El Pez", "Burger Joint"];
  const todayISO = toISO(today);

  for (let m = 5; m >= 0; m--) {
    const start = startOfMonth(subMonths(today, m));
    const end = m === 0 ? today : endOfMonth(start);
    const d = (day: number) => toISO(new Date(start.getFullYear(), start.getMonth(), day));
    const monthDone = (day: number) => d(day) <= todayISO;

    if (monthDone(1)) add({ type: "income", concept: "Nómina", amount: 2350, date: d(1), ...sub("Nómina"), merchant: "Empresa S.L.", paymentMethod: "Transferencia", isFixed: true, isRecurring: true, time: "08:00" });
    if (start.getMonth() === 5 || start.getMonth() === 11) if (monthDone(15)) add({ type: "income", concept: "Paga extra", amount: 2350, date: d(15), ...sub("Pagas extras"), paymentMethod: "Transferencia" });
    if (m % 2 === 0 && monthDone(18)) add({ type: "income", concept: "Proyecto web freelance", amount: between(300, 700), date: d(18), ...sub("Freelance"), paymentMethod: "Transferencia", tags: ["freelance"] });

    for (const [r, day] of [[rRent, 1], [rNetflix, 12], [rSpotify, 5], [rGym, 3], [rICloud, 20], [rInternet, 8]] as const) {
      if (monthDone(day)) add({ concept: r.name, amount: r.amount, date: d(day), categoryId: r.categoryId, subcategoryId: r.subcategoryId, merchant: r.name, paymentMethod: "Domiciliación", isFixed: true, isRecurring: true, recurringId: r.id, tags: r.isSubscription ? ["suscripción"] : [] });
    }
    if (monthDone(10)) add({ concept: "Factura luz", amount: between(38, 72), date: d(10), ...sub("Electricidad"), merchant: "Iberdrola", paymentMethod: "Domiciliación", isFixed: true });
    if (monthDone(14)) add({ concept: "Factura agua", amount: between(18, 26), date: d(14), ...sub("Agua"), merchant: "Canal de Isabel II", paymentMethod: "Domiciliación", isFixed: true });
    if (monthDone(2)) add({ type: "transfer", concept: "Ahorro mensual", amount: 300, date: d(2), accountId: main.id, toAccountId: savings.id, paymentMethod: "Transferencia", tags: ["ahorro"] });

    for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
      const iso = toISO(day);
      const wd = day.getDay();
      if (wd === 6 || (wd === 3 && rnd() > 0.4)) buySuper(iso);
      if (rnd() > 0.72) add({ concept: "Café", merchant: "Starbucks", amount: between(2.2, 4.8), date: iso, ...sub("Cafeterías"), accountId: rnd() > 0.5 ? cash.id : main.id, paymentMethod: "Apple Pay", time: "09:10" });
      if ((wd === 5 || wd === 6) && rnd() > 0.45) { const r = restaurants[Math.floor(rnd() * 4)]; add({ concept: `Cena ${r}`, merchant: r, amount: between(22, 68), date: iso, ...sub("Restaurantes"), accountId: credit.id, time: "21:30", tags: rnd() > 0.5 ? ["amigos"] : [] }); }
      if (wd === 1 && rnd() > 0.3) add({ concept: "Gasolina", merchant: "Repsol", amount: between(45, 70), date: iso, ...sub("Gasolina"), time: "18:00" });
      if (rnd() > 0.88) add({ concept: "Metro / bus", merchant: "Metro", amount: between(1.5, 12), date: iso, ...sub("Transporte público"), accountId: cash.id, paymentMethod: "Efectivo" });
      if (rnd() > 0.93) add({ concept: "Pedido a domicilio", merchant: "Glovo", amount: between(14, 32), date: iso, ...sub("Comida a domicilio"), accountId: credit.id });
      if (rnd() > 0.95) add({ concept: "Farmacia", merchant: "Farmacia Central", amount: between(6, 28), date: iso, ...sub("Farmacia") });
      if (rnd() > 0.95) add({ concept: "Ropa", merchant: rnd() > 0.5 ? "Zara" : "Uniqlo", amount: between(25, 90), date: iso, ...sub("Ropa"), accountId: credit.id });
      if (rnd() > 0.97) add({ concept: "Cine", merchant: "Yelmo", amount: between(9, 22), date: iso, ...sub("Cine") });
    }
    if (monthDone(25)) add({ type: "transfer", concept: "Pago tarjeta de crédito", amount: 250, date: d(25), accountId: main.id, toAccountId: credit.id, paymentMethod: "Transferencia" });
  }
  // Un gasto inusual y un reembolso para que las funciones inteligentes tengan algo que mostrar
  add({ concept: "Compra Mercadona grande", merchant: "Mercadona", amount: 245.6, date: toISO(addDays(today, -2)), ...sub("Supermercado"), notes: "Compra para la fiesta" });
  add({ type: "refund", concept: "Devolución Zara", merchant: "Zara", amount: 29.95, date: toISO(addDays(today, -3)), ...sub("Ropa"), accountId: credit.id });
  // Pendientes y programados
  add({ concept: "Seguro del coche", amount: 312.4, date: toISO(addDays(today, 6)), ...sub("Seguro del vehículo"), status: "pending", isFixed: true, paymentMethod: "Domiciliación" });
  add({ concept: "Revisión dentista", amount: 60, date: toISO(addDays(today, 9)), ...sub("Dentista"), status: "scheduled" });

  const catId = (name: string) => categories.find((c) => !c.parentId && c.name === name)!.id;
  const budgets: Budget[] = [
    { id: newId(), categoryId: null, amount: 1900, month: null },
    { id: newId(), categoryId: catId("Alimentación"), amount: 520, month: null },
    { id: newId(), categoryId: catId("Ocio y entretenimiento"), amount: 150, month: null },
    { id: newId(), categoryId: catId("Transporte"), amount: 260, month: null },
    { id: newId(), categoryId: catId("Compras"), amount: 120, month: null },
    { id: newId(), categoryId: sub("Restaurantes").subcategoryId, amount: 160, month: null },
  ];

  const goals: Goal[] = [
    { id: newId(), name: "Fondo de emergencia", targetAmount: 10000, savedAmount: 6500, deadline: toISO(new Date(today.getFullYear() + 1, 5, 30)), accountId: savings.id, color: "#10b981", icon: "umbrella", notes: "6 meses de gastos", archived: false },
    { id: newId(), name: "Vacaciones en Japón", targetAmount: 3500, savedAmount: 900, deadline: toISO(new Date(today.getFullYear() + 1, 7, 1)), accountId: null, color: "#ec4899", icon: "plane", notes: null, archived: false },
    { id: newId(), name: "Entrada vivienda", targetAmount: 40000, savedAmount: 4200, deadline: toISO(new Date(today.getFullYear() + 4, 0, 1)), accountId: null, color: "#6366f1", icon: "house", notes: null, archived: false },
  ];

  return { accounts, categories, transactions, budgets, recurring, goals, products, transactionItems, savedViews: [{ id: newId(), name: "Cenas con amigos", filters: { q: "#amigos" } }] };
}
