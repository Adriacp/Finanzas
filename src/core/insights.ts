import { differenceInCalendarDays, endOfMonth, getDate, getDaysInMonth, subMonths, startOfMonth } from "date-fns";
import { fromISO, toISO } from "./dates";
import { expenseByCategory, expenseContribution, isEffective, pctChange, summarize } from "./finance";
import { round2 } from "./money";
import { annualCost, remainingRecurringThisMonth } from "./recurring";
import type { Category, ID, ISODate, Recurring, Transaction } from "./types";

export const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------
function similar(a: string, b: string) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" ")), tb = new Set(nb.split(" "));
  const inter = [...ta].filter((t) => tb.has(t) && t.length > 2).length;
  return inter / Math.max(ta.size, tb.size) >= 0.5;
}

/** Posibles duplicados de un movimiento (mismo importe y tipo, ±2 días, concepto parecido). */
export function findDuplicates(candidate: Pick<Transaction, "amount" | "type" | "date" | "concept" | "merchant"> & { id?: ID }, txs: Transaction[]) {
  return txs.filter(
    (t) =>
      t.id !== candidate.id &&
      t.type === candidate.type &&
      Math.abs(t.amount - candidate.amount) < 0.005 &&
      Math.abs(differenceInCalendarDays(fromISO(t.date), fromISO(candidate.date))) <= 2 &&
      (similar(t.concept, candidate.concept) || (!!t.merchant && !!candidate.merchant && similar(t.merchant, candidate.merchant))),
  );
}

/** Todos los grupos de posibles duplicados existentes. */
export function duplicateGroups(txs: Transaction[]): Transaction[][] {
  const seen = new Set<ID>();
  const groups: Transaction[][] = [];
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const t of sorted) {
    if (seen.has(t.id) || t.type === "transfer") continue;
    const dups = findDuplicates(t, sorted).filter((d) => !seen.has(d.id));
    if (dups.length) {
      [t, ...dups].forEach((x) => seen.add(x.id));
      groups.push([t, ...dups]);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Sugerencia de categoría y autocompletado
// ---------------------------------------------------------------------------
/** Palabras clave → nombre de subcategoría por defecto. */
const KEYWORDS: Array<[RegExp, string]> = [
  [/mercadona|carrefour|lidl|aldi|dia\b|eroski|alcampo|hipercor|consum|supermerc|bonpreu|ahorramas/, "Supermercado"],
  [/restaurante|asador|sushi|pizzeria|tasca|meson|bistro/, "Restaurantes"],
  [/cafe|starbucks|cafeteria|panaderia/, "Cafeterías"],
  [/glovo|just ?eat|uber ?eats|deliveroo/, "Comida a domicilio"],
  [/mcdonald|burger|kfc|telepizza|domino|five guys|taco bell/, "Comida rápida"],
  [/repsol|cepsa|galp|bp\b|shell|gasolin|carburante|petronor|ballenoil|plenoil/, "Gasolina"],
  [/renfe|metro|emt|tmb|bus\b|alsa|cercanias|abono transporte/, "Transporte público"],
  [/uber(?! ?eats)|cabify|bolt|freenow/, "Uber / Cabify"],
  [/taxi/, "Taxi"],
  [/parking|aparcamiento|empark|saba|telpark/, "Parking"],
  [/peaje|autopista|via ?t/, "Peajes"],
  [/\bitv\b/, "ITV"],
  [/netflix/, "Netflix"],
  [/spotify/, "Spotify"],
  [/amazon prime|prime video/, "Amazon Prime"],
  [/icloud|apple\.com\/bill/, "iCloud"],
  [/hbo|max\b|disney|filmin|dazn|movistar\+?/, "Streaming"],
  [/adobe|microsoft|office 365|github|notion|chatgpt|openai|dropbox|google one/, "Software"],
  [/app store|google play/, "Aplicaciones"],
  [/endesa|iberdrola|naturgy|holaluz|electricidad|luz\b|repsol luz|totalenergies/, "Electricidad"],
  [/canal de isabel|aigues|agua/, "Agua"],
  [/\bgas\b|butano/, "Gas"],
  [/fibra|internet|digi|movistar|vodafone|orange|o2|pepephone|simyo|yoigo|masmovil|lowi/, "Internet"],
  [/alquiler|arrendamiento|renta piso/, "Alquiler"],
  [/hipoteca/, "Hipoteca"],
  [/comunidad de propietarios|comunidad/, "Comunidad"],
  [/ikea|leroy|bricomart|maisons du monde/, "Muebles"],
  [/zara|h&m|hm\b|pull ?and ?bear|bershka|mango|primark|uniqlo|stradivarius|massimo/, "Ropa"],
  [/zapat|foot ?locker|calzado/, "Calzado"],
  [/apple store|mediamarkt|pc ?componentes|fnac|worten/, "Tecnología"],
  [/sephora|druni|primor|douglas|perfumeria/, "Cosmética"],
  [/farmacia|parafarmacia/, "Farmacia"],
  [/dentista|dental|clinica dental/, "Dentista"],
  [/gimnasio|gym|basic ?fit|mcfit|holmes place|crossfit|altafit/, "Gimnasio"],
  [/sanitas|adeslas|asisa|dkv|mapfre salud/, "Seguro médico"],
  [/medico|consulta|hospital|clinica/, "Médico"],
  [/psicolog/, "Psicología"],
  [/udemy|coursera|domestika|platzi|curso/, "Cursos"],
  [/libreria|casa del libro|kindle|libro/, "Libros"],
  [/comision|mantenimiento cuenta/, "Comisiones bancarias"],
  [/hacienda|aeat|impuesto|ibi|irpf|tasa/, "Impuestos"],
  [/prestamo|financiacion|cuota prestamo/, "Préstamos"],
  [/seguro/, "Seguros"],
  [/cine|cinesa|yelmo|kinepolis/, "Cine"],
  [/concierto|ticketmaster|entradas|live nation/, "Conciertos"],
  [/booking|airbnb|hotel|nh hotel|melia/, "Hoteles"],
  [/ryanair|vueling|iberia|easyjet|vuelo|aeropuerto|edreams/, "Viajes"],
  [/steam|playstation|xbox|nintendo|epic games/, "Videojuegos"],
  [/\bbar\b|cerveceria|taberna/, "Bares"],
  [/veterinari/, "Veterinario"],
  [/tiendanimal|kiwoko|zooplus|pienso/, "Alimentación"],
  [/nomina|salario|sueldo/, "Nómina"],
  [/paga extra/, "Pagas extras"],
  [/factura cliente|freelance|honorarios/, "Freelance"],
  [/dividendo|rendimiento/, "Inversiones"],
  [/interes/, "Intereses"],
  [/devolucion|reembolso|abono/, "Devoluciones"],
  [/donacion|ong|unicef|cruz roja/, "Donaciones"],
  [/multa|sancion|dgt/, "Multas"],
];

export interface CategorySuggestion {
  categoryId: ID;
  subcategoryId: ID | null;
  source: "history" | "keyword";
}

/**
 * Sugiere categoría a partir del concepto/comercio:
 *  1) aprende del historial del usuario (lo que más ha usado para ese texto)
 *  2) si no hay historial, usa reglas de palabras clave
 */
export function suggestCategory(
  text: string,
  txs: Transaction[],
  categories: Category[],
  kind: "expense" | "income" = "expense",
): CategorySuggestion | null {
  const n = normalize(text);
  if (n.length < 3) return null;
  const counts = new Map<string, { c: number; cat: ID; sub: ID | null }>();
  for (const t of txs) {
    if (!t.categoryId) continue;
    const hay = normalize(`${t.concept} ${t.merchant ?? ""}`);
    if (hay.includes(n) || (n.length >= 5 && n.includes(normalize(t.merchant ?? t.concept)))) {
      const key = `${t.categoryId}|${t.subcategoryId ?? ""}`;
      const cur = counts.get(key) ?? { c: 0, cat: t.categoryId, sub: t.subcategoryId };
      cur.c++;
      counts.set(key, cur);
    }
  }
  const best = [...counts.values()].sort((a, b) => b.c - a.c)[0];
  if (best) return { categoryId: best.cat, subcategoryId: best.sub, source: "history" };

  for (const [re, subName] of KEYWORDS) {
    if (!re.test(n)) continue;
    const sub = categories.find((c) => c.parentId && c.kind === kind && normalize(c.name) === normalize(subName));
    if (sub) return { categoryId: sub.parentId!, subcategoryId: sub.id, source: "keyword" };
  }
  return null;
}

/** Comercio conocido, obtenido del historial (no hace falta guardarlo aparte). */
export interface MerchantEntry {
  /** Forma más usada del nombre (p. ej. «Spar» aunque a veces se escribiera «spar »). */
  name: string;
  key: string;
  count: number;
  lastDate: string;
  /** Categoría y subcategoría que más usas con este comercio (para gastos), si hay */
  categoryId: ID | null;
  subcategoryId: ID | null;
}

/**
 * Directorio de comercios a partir de los movimientos: agrupa variantes del mismo nombre
 * (mayúsculas, tildes, espacios) y calcula su categoría habitual. Ordenado por uso.
 */
export function merchantDirectory(txs: Transaction[]): MerchantEntry[] {
  const groups = new Map<string, { spellings: Map<string, number>; count: number; lastDate: string; cats: Map<string, { c: number; cat: ID; sub: ID | null }> }>();
  for (const t of txs) {
    const raw = t.merchant?.trim();
    if (!raw) continue;
    const key = normalize(raw);
    if (!key) continue;
    const g = groups.get(key) ?? { spellings: new Map(), count: 0, lastDate: t.date, cats: new Map() };
    g.spellings.set(raw, (g.spellings.get(raw) ?? 0) + 1);
    g.count++;
    if (t.date > g.lastDate) g.lastDate = t.date;
    if (t.categoryId && (t.type === "expense" || t.type === "refund")) {
      const ck = `${t.categoryId}|${t.subcategoryId ?? ""}`;
      const cur = g.cats.get(ck) ?? { c: 0, cat: t.categoryId, sub: t.subcategoryId };
      cur.c++;
      g.cats.set(ck, cur);
    }
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const name = [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const best = [...g.cats.values()].sort((a, b) => b.c - a.c)[0];
      return { name, key, count: g.count, lastDate: g.lastDate, categoryId: best?.cat ?? null, subcategoryId: best?.sub ?? null };
    })
    .sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : -1));
}

/** Categoría habitual de un comercio (si lo has usado antes en un gasto). */
export function suggestFromMerchant(merchant: string | null | undefined, txs: Transaction[]): CategorySuggestion | null {
  const key = normalize(merchant ?? "");
  if (!key) return null;
  const m = merchantDirectory(txs).find((x) => x.key === key);
  return m?.categoryId ? { categoryId: m.categoryId, subcategoryId: m.subcategoryId, source: "history" } : null;
}

/** Comercios usados ordenados por frecuencia (para autocompletar). */
export function merchantSuggestions(txs: Transaction[], limit = 200): string[] {
  return merchantDirectory(txs).slice(0, limit).map((m) => m.name);
}

export function allTags(txs: Transaction[]): string[] {
  const s = new Set<string>();
  txs.forEach((t) => t.tags.forEach((x) => s.add(x)));
  return [...s].sort((a, b) => a.localeCompare(b, "es"));
}

// ---------------------------------------------------------------------------
// Gastos inusuales
// ---------------------------------------------------------------------------
/**
 * Un gasto es inusual si supera claramente lo habitual en su categoría:
 * importe > media + 2·desviación y > 1,5·media (con al menos 5 muestras previas).
 */
export function unusualExpenses(txs: Transaction[], since: ISODate): Transaction[] {
  const byCat = new Map<string, number[]>();
  for (const t of txs) {
    if (t.type !== "expense" || !isEffective(t) || t.date >= since) continue;
    const k = t.subcategoryId ?? t.categoryId ?? "none";
    (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(t.amount);
  }
  return txs
    .filter((t) => t.type === "expense" && isEffective(t) && t.date >= since)
    .filter((t) => {
      const sample = byCat.get(t.subcategoryId ?? t.categoryId ?? "none");
      if (!sample || sample.length < 5) return false;
      const mean = sample.reduce((s, x) => s + x, 0) / sample.length;
      const sd = Math.sqrt(sample.reduce((s, x) => s + (x - mean) ** 2, 0) / sample.length);
      return t.amount > mean + 2 * sd && t.amount > mean * 1.5;
    })
    .sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// Resumen mensual, comparación y previsiones
// ---------------------------------------------------------------------------
export interface Insight {
  id: string;
  tone: "positive" | "negative" | "neutral" | "warning";
  title: string;
  body: string;
}

export function monthlyInsights(txs: Transaction[], categories: Category[], recurring: Recurring[], today: ISODate, currencyFmt: (n: number) => string): Insight[] {
  const ref = fromISO(today);
  const cur = { from: toISO(startOfMonth(ref)), to: toISO(endOfMonth(ref)) };
  const prev = { from: toISO(startOfMonth(subMonths(ref, 1))), to: toISO(endOfMonth(subMonths(ref, 1))) };
  // Comparación justa: mismo número de días transcurridos del mes anterior
  const day = getDate(ref);
  const prevSameDay = { from: prev.from, to: toISO(new Date(subMonths(ref, 1).getFullYear(), subMonths(ref, 1).getMonth(), Math.min(day, getDaysInMonth(subMonths(ref, 1))))) };
  const sCur = summarize(txs, { from: cur.from, to: today });
  const sPrevSame = summarize(txs, prevSameDay);
  const out: Insight[] = [];

  const ch = pctChange(sCur.expense, sPrevSame.expense);
  if (ch !== null && sPrevSame.expense > 0) {
    out.push({
      id: "mom",
      tone: ch > 5 ? "negative" : ch < -5 ? "positive" : "neutral",
      title: ch > 0 ? `Gastas un ${Math.round(ch)} % más que el mes pasado` : `Gastas un ${Math.abs(Math.round(ch))} % menos que el mes pasado`,
      body: `${currencyFmt(sCur.expense)} hasta hoy frente a ${currencyFmt(sPrevSame.expense)} a estas alturas del mes anterior.`,
    });
  }

  const catsCur = expenseByCategory(txs, { from: cur.from, to: today }, categories);
  const catsPrev = new Map(expenseByCategory(txs, prevSameDay, categories).map((c) => [c.id, c.amount]));
  const riser = catsCur
    .map((c) => ({ c, diff: c.amount - (catsPrev.get(c.id) ?? 0) }))
    .filter((x) => x.diff > 30)
    .sort((a, b) => b.diff - a.diff)[0];
  if (riser) {
    out.push({ id: "riser", tone: "warning", title: `${riser.c.name}: +${currencyFmt(riser.diff)}`, body: `Es la categoría que más ha crecido respecto al mes anterior. Revisa si hay margen de ahorro.` });
  }

  const fc = forecastMonth(txs, recurring, today);
  out.push({
    id: "forecast",
    tone: fc.projectedBalance >= 0 ? "positive" : "negative",
    title: `Previsión de cierre: ${currencyFmt(fc.projectedExpense)} en gastos`,
    body: fc.projectedBalance >= 0
      ? `Si sigues a este ritmo ahorrarás unos ${currencyFmt(fc.projectedBalance)} este mes.`
      : `A este ritmo cerrarás el mes con ${currencyFmt(Math.abs(fc.projectedBalance))} de déficit.`,
  });

  const underused = recurring.filter((r) => r.status === "active" && r.usage === "low");
  if (underused.length) {
    const total = underused.reduce((s, r) => s + annualCost(r), 0);
    out.push({ id: "underused", tone: "warning", title: `${underused.length} suscripción(es) que apenas usas`, body: `${underused.map((r) => r.name).join(", ")}: ${currencyFmt(total)} al año que podrías ahorrarte.` });
  }

  const unusual = unusualExpenses(txs, cur.from);
  if (unusual.length) {
    out.push({ id: "unusual", tone: "warning", title: `Gasto inusual: ${unusual[0].concept}`, body: `${currencyFmt(unusual[0].amount)} es bastante más de lo habitual en esta categoría.` });
  }
  return out;
}

/** Previsión de cierre de mes: ritmo variable + recurrentes pendientes + pendientes registrados. */
export function forecastMonth(txs: Transaction[], recurring: Recurring[], today: ISODate) {
  const ref = fromISO(today);
  const from = toISO(startOfMonth(ref));
  const to = toISO(endOfMonth(ref));
  const elapsed = getDate(ref);
  const total = getDaysInMonth(ref);
  let variable = 0, fixed = 0, income = 0, pendingExp = 0, pendingInc = 0;
  for (const t of txs) {
    if (t.date < from || t.date > to) continue;
    if (!isEffective(t)) {
      if (t.type === "expense" && !t.recurringId) pendingExp += t.amount;
      if (t.type === "income") pendingInc += t.amount;
      continue;
    }
    if (t.date > today) continue;
    if (t.type === "income") income += t.amount;
    const v = expenseContribution(t);
    if (t.isFixed || t.isRecurring) fixed += v; else variable += v;
  }
  const projectedVariable = elapsed > 0 ? (variable / elapsed) * total : variable;
  const upcomingRecurring = remainingRecurringThisMonth(recurring, toISO(new Date(ref.getFullYear(), ref.getMonth(), elapsed + 1)));
  const projectedExpense = round2(fixed + projectedVariable + upcomingRecurring + pendingExp);
  const recurringIncome = recurring
    .filter((r) => r.type === "income" && r.status === "active" && r.nextDate > today && r.nextDate <= to)
    .reduce((s, r) => s + r.amount, 0);
  const projectedIncome = round2(income + pendingInc + recurringIncome);
  return { projectedExpense, projectedIncome, projectedBalance: round2(projectedIncome - projectedExpense), upcomingRecurring };
}

/** Previsión de ahorro a N meses según la media de los últimos meses completos. */
export function savingsForecast(txs: Transaction[], today: ISODate, monthsBack = 3, monthsAhead = 12) {
  const ref = fromISO(today);
  const from = toISO(startOfMonth(subMonths(ref, monthsBack)));
  const to = toISO(endOfMonth(subMonths(ref, 1)));
  const s = summarize(txs, { from, to });
  const monthly = round2(s.balance / monthsBack);
  return { monthlyAverage: monthly, projection: Array.from({ length: monthsAhead }, (_, i) => round2(monthly * (i + 1))) };
}
