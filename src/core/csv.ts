import { parseAmount } from "./money";
import { normalize } from "./insights";
import type { ISODate } from "./types";

/** Interpreta fechas habituales en extractos bancarios españoles. */
export function parseBankDate(input: string): ISODate | null {
  const s = input.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return iso(y, +m[2], +m[1]);
  }
  return null;
}

function iso(y: number, mo: number, d: number): ISODate | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  if (date.getMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface CsvMapping {
  date: number;
  concept: number;
  /** Columna de importe con signo (negativo = gasto) */
  amount: number;
  /** Alternativa: columnas separadas de cargo y abono */
  debit: number;
  credit: number;
  merchant: number;
}

const HINTS: Record<keyof CsvMapping, RegExp> = {
  date: /^(fecha( operacion| valor)?|date|f\.? ?valor|f\.? ?operacion)$/,
  concept: /(concepto|descripcion|description|detalle|movimiento|referencia|texto)/,
  amount: /^(importe|cantidad|amount|importe eur|importe \(eur\)|valor)$/,
  debit: /(cargo|debe|gasto|debit|salida)/,
  credit: /(abono|haber|ingreso|credit|entrada)/,
  merchant: /(comercio|establecimiento|beneficiario|merchant|payee)/,
};

/** Busca la fila de cabecera (primeras 15) y adivina el mapeo de columnas. */
export function detectMapping(rows: string[][]): { headerRow: number; mapping: CsvMapping } {
  let best = { headerRow: 0, score: -1, mapping: emptyMapping() };
  rows.slice(0, 15).forEach((row, idx) => {
    const mapping = emptyMapping();
    let score = 0;
    row.forEach((cell, col) => {
      const n = normalize(cell ?? "");
      (Object.keys(HINTS) as (keyof CsvMapping)[]).forEach((k) => {
        if (mapping[k] === -1 && HINTS[k].test(n)) {
          mapping[k] = col;
          score++;
        }
      });
    });
    if (score > best.score) best = { headerRow: idx, score, mapping };
  });
  return { headerRow: best.headerRow, mapping: best.mapping };
}

const emptyMapping = (): CsvMapping => ({ date: -1, concept: -1, amount: -1, debit: -1, credit: -1, merchant: -1 });

export interface ImportedRow {
  line: number;
  date: ISODate;
  concept: string;
  /** con signo: negativo = gasto */
  amount: number;
  merchant: string | null;
}

export interface ImportResult {
  rows: ImportedRow[];
  errors: { line: number; reason: string }[];
}

export function mapRows(rows: string[][], headerRow: number, m: CsvMapping): ImportResult {
  const out: ImportedRow[] = [];
  const errors: ImportResult["errors"] = [];
  rows.slice(headerRow + 1).forEach((row, i) => {
    const line = headerRow + i + 2;
    if (!row.some((c) => (c ?? "").trim())) return;
    const date = m.date >= 0 ? parseBankDate(row[m.date] ?? "") : null;
    if (!date) return errors.push({ line, reason: "Fecha no válida" });
    let amount: number | null = null;
    if (m.amount >= 0) amount = parseAmount(row[m.amount] ?? "");
    else if (m.debit >= 0 || m.credit >= 0) {
      const d = m.debit >= 0 ? parseAmount(row[m.debit] ?? "") : null;
      const c = m.credit >= 0 ? parseAmount(row[m.credit] ?? "") : null;
      if (d) amount = -Math.abs(d);
      else if (c) amount = Math.abs(c);
    }
    if (amount === null || amount === 0) return errors.push({ line, reason: "Importe no válido" });
    const concept = (m.concept >= 0 ? row[m.concept] : "")?.trim() || "Movimiento importado";
    out.push({ line, date, concept: concept.slice(0, 120), amount, merchant: m.merchant >= 0 ? row[m.merchant]?.trim() || null : null });
  });
  return { rows: out, errors };
}

/** Serializa a CSV (separador `;` y BOM para que Excel en español lo abra bien). */
export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v == null) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}
