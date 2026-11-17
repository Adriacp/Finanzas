"use client";
import { toCSV } from "@/core/csv";
import { formatDate, type DateRange } from "@/core/dates";
import { expenseByCategory, summarize } from "@/core/finance";
import { formatMoney } from "@/core/money";
import type { FinanceData, Transaction } from "@/core/types";
import { downloadBlob } from "./utils";

const TYPE = { expense: "Gasto", income: "Ingreso", transfer: "Transferencia", refund: "Reembolso" } as const;
const STATUS = { paid: "Pagado", pending: "Pendiente", scheduled: "Programado" } as const;

export interface ReportInput {
  data: FinanceData;
  txs: Transaction[];
  range: DateRange;
  title: string;
}

function rows({ data, txs }: ReportInput) {
  const cat = new Map(data.categories.map((c) => [c.id, c.name]));
  const acc = new Map(data.accounts.map((a) => [a.id, a.name]));
  return txs.map((t) => ({
    Fecha: t.date,
    Hora: t.time ?? "",
    Tipo: TYPE[t.type],
    Concepto: t.concept,
    Importe: t.type === "expense" ? -t.amount : t.amount,
    Categoría: cat.get(t.categoryId ?? "") ?? "",
    Subcategoría: cat.get(t.subcategoryId ?? "") ?? "",
    Cuenta: acc.get(t.accountId ?? "") ?? "",
    "Cuenta destino": acc.get(t.toAccountId ?? "") ?? "",
    Comercio: t.merchant ?? "",
    "Método de pago": t.paymentMethod ?? "",
    Estado: STATUS[t.status],
    Etiquetas: t.tags.join(", "),
    Fijo: t.isFixed ? "Sí" : "No",
    Descripción: t.description ?? "",
    Notas: t.notes ?? "",
  }));
}

const HEADERS = ["Fecha","Hora","Tipo","Concepto","Importe","Categoría","Subcategoría","Cuenta","Cuenta destino","Comercio","Método de pago","Estado","Etiquetas","Fijo","Descripción","Notas"];

const fileBase = (r: DateRange) => `finanzas_${r.from}_${r.to}`;

export function exportCSV(input: ReportInput) {
  const data = rows(input);
  const csv = toCSV(HEADERS, data.map((r) => Object.values(r)));
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${fileBase(input.range)}.csv`);
}

export async function exportExcel(input: ReportInput) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Finanzas";
  const currencyFmt = '#,##0.00 "€";[Red]-#,##0.00 "€"';

  // Hoja resumen
  const s = summarize(input.txs, input.range);
  const ws0 = wb.addWorksheet("Resumen");
  ws0.columns = [{ width: 32 }, { width: 18 }];
  ws0.addRow([input.title]).font = { bold: true, size: 14 };
  ws0.addRow([`Del ${formatDate(input.range.from)} al ${formatDate(input.range.to)}`]);
  ws0.addRow([]);
  for (const [k, v] of [["Ingresos", s.income], ["Gastos", s.expense], ["Balance", s.balance]] as const) {
    const r = ws0.addRow([k, v]);
    r.getCell(2).numFmt = currencyFmt;
  }
  ws0.addRow(["Tasa de ahorro", s.savingsRate / 100]).getCell(2).numFmt = "0.0%";
  ws0.addRow([]);
  ws0.addRow(["Gasto por categoría", ""]).font = { bold: true };
  for (const c of expenseByCategory(input.txs, input.range, input.data.categories)) {
    ws0.addRow([c.name, c.amount]).getCell(2).numFmt = currencyFmt;
  }

  // Hoja movimientos
  const data = rows(input);
  const ws = wb.addWorksheet("Movimientos");
  const headers = HEADERS;
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(10, h.length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF0FF" } };
  data.forEach((r) => ws.addRow(r));
  ws.getColumn("Importe").numFmt = currencyFmt;
  ws.getColumn("Concepto").width = 32;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: { row: 1, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase(input.range)}.xlsx`);
}

export async function exportPDF(input: ReportInput) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const cur = input.data.profile.currency;
  const m = (n: number) => formatMoney(n, cur).replace(/ /g, " ");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const s = summarize(input.txs, input.range);

  doc.setFillColor(99, 102, 241);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 70, "F");
  doc.setTextColor(255);
  doc.setFontSize(18);
  doc.text(input.title, 40, 40);
  doc.setFontSize(10);
  doc.text(`Del ${formatDate(input.range.from)} al ${formatDate(input.range.to)}`, 40, 58);

  doc.setTextColor(30);
  doc.setFontSize(11);
  const kpis: [string, string][] = [["Ingresos", m(s.income)], ["Gastos", m(s.expense)], ["Balance", m(s.balance)], ["Ahorro", `${Math.round(s.savingsRate)} %`]];
  kpis.forEach(([k, v], i) => {
    const x = 40 + i * 130;
    doc.setFontSize(9); doc.setTextColor(110); doc.text(k, x, 100);
    doc.setFontSize(13); doc.setTextColor(20); doc.text(v, x, 118);
  });

  const cats = expenseByCategory(input.txs, input.range, input.data.categories);
  autoTable(doc, {
    startY: 140,
    head: [["Categoría", "Importe", "%"]],
    body: cats.map((c) => [c.name, m(c.amount), `${c.share.toFixed(1)} %`]),
    headStyles: { fillColor: [99, 102, 241] },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });

  const r = rows(input);
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20,
    head: [["Fecha", "Concepto", "Categoría", "Cuenta", "Importe"]],
    body: r.map((x) => [formatDate(x.Fecha, "dd/MM/yy"), x.Concepto, x.Subcategoría || x.Categoría, x.Cuenta, m(x.Importe)]),
    headStyles: { fillColor: [40, 40, 50] },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 1: { cellWidth: 170 }, 4: { halign: "right" } },
    didDrawPage: () => {
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Generado el ${formatDate(new Date().toISOString().slice(0, 10))} · Finanzas`, 40, doc.internal.pageSize.getHeight() - 20);
    },
  });

  downloadBlob(doc.output("blob"), `${fileBase(input.range)}.pdf`);
}

// ---------------------------------------------------------------------------
// Copias de seguridad
// ---------------------------------------------------------------------------
export const BACKUP_VERSION = 1;

export function exportBackup(data: FinanceData) {
  const payload = { app: "finanzas", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `finanzas_backup_${new Date().toISOString().slice(0, 10)}.json`);
}

export function parseBackup(text: string): FinanceData {
  const json = JSON.parse(text);
  if (json?.app !== "finanzas" || !json.data) throw new Error("El archivo no es una copia de seguridad válida de Finanzas.");
  if (json.version > BACKUP_VERSION) throw new Error("La copia es de una versión más reciente de la app.");
  const d = json.data as FinanceData;
  for (const k of ["accounts", "categories", "transactions", "budgets", "recurring", "goals", "savedViews"] as const) {
    if (!Array.isArray(d[k])) throw new Error(`Copia incompleta: falta “${k}”.`);
  }
  return d;
}
