const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: number, currency = "EUR", opts: { compact?: boolean; sign?: boolean; decimals?: boolean } = {}): string {
  const key = `${currency}|${opts.compact}|${opts.sign}|${opts.decimals}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("es-ES", {
      // "always": en es-ES los números de 4 cifras no se agrupan por defecto (2350 → 2.350)
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact || opts.decimals === false ? 0 : 2,
      minimumFractionDigits: opts.compact || opts.decimals === false ? 0 : 2,
      signDisplay: opts.sign ? "exceptZero" : "auto",
      useGrouping: "always",
    });
    formatters.set(key, f);
  }
  return f.format(value);
}

export const formatPercent = (value: number, decimals = 0) =>
  `${Number.isFinite(value) ? value.toFixed(decimals).replace(".", ",") : "0"} %`;

/** Redondeo a céntimos evitando errores de coma flotante. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Interpreta importes escritos a la española o inglesa: "1.234,56", "1,234.56", "-12,5", "12 €". */
export function parseAmount(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = input.trim().replace(/[€$£\s]/g, "").replace(/EUR|USD|GBP/gi, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { negative = true; s = s.slice(0, -1); }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 && s.indexOf(",") === lastComma && !s.startsWith("0,") ? s.replace(",", "") : s.replace(/,/g, ".");
    if ((s.match(/\./g) ?? []).length > 1) return null;
  } else if (lastDot > -1) {
    const parts = s.split(".");
    if (parts.length > 2) s = parts.join("");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return round2(negative ? -Math.abs(n) : n);
}
