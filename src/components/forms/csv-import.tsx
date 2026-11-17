"use client";
import Papa from "papaparse";
import { FileSpreadsheet, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { type CsvMapping, detectMapping, mapRows } from "@/core/csv";
import { formatDate } from "@/core/dates";
import { findDuplicates, suggestCategory } from "@/core/insights";
import type { Transaction } from "@/core/types";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Money } from "@/components/ui/money";
import { AccountSelect } from "./pickers";

const FIELD_LABELS: Record<keyof CsvMapping, string> = {
  date: "Fecha", concept: "Concepto", amount: "Importe (con signo)", debit: "Cargo (gasto)", credit: "Abono (ingreso)", merchant: "Comercio",
};

/** Importación de extractos bancarios en CSV con detección de columnas, categorías y duplicados. */
export function CsvImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const d = useData();
  const saveMany = useFinance((s) => s.saveMany);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [accountId, setAccountId] = useState<string | null>(d.accounts.find((a) => !a.archived)?.id ?? null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false);

  function reset() { setRows(null); setMapping(null); setFileName(""); }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("El archivo supera 5 MB");
    setFileName(file.name);
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (res) => {
        const data = res.data.filter((r) => Array.isArray(r));
        if (!data.length) return toast.error("El archivo está vacío o no es un CSV válido");
        const det = detectMapping(data);
        setRows(data);
        setHeaderRow(det.headerRow);
        setMapping(det.mapping);
      },
      error: (err) => toast.error("No se pudo leer el CSV", { description: err.message }),
    });
  }

  const preview = useMemo(() => {
    if (!rows || !mapping) return null;
    const res = mapRows(rows, headerRow, mapping);
    const items = res.rows.map((r) => {
      const type: Transaction["type"] = r.amount < 0 ? "expense" : "income";
      const sug = suggestCategory(`${r.concept} ${r.merchant ?? ""}`, d.transactions, d.categories, type === "income" ? "income" : "expense");
      const dup = findDuplicates({ amount: Math.abs(r.amount), type, date: r.date, concept: r.concept, merchant: r.merchant }, d.transactions).length > 0;
      return { r, type, sug, dup };
    });
    return { items, errors: res.errors };
  }, [rows, mapping, headerRow, d.transactions, d.categories]);

  const header = rows?.[headerRow] ?? [];
  const toImport = preview?.items.filter((i) => !(skipDuplicates && i.dup)) ?? [];

  async function doImport() {
    if (!toImport.length) return;
    setBusy(true);
    const txs: Transaction[] = toImport.map(({ r, type, sug }) => ({
      id: newId(), type, amount: Math.abs(r.amount), concept: r.concept, categoryId: sug?.categoryId ?? null, subcategoryId: sug?.subcategoryId ?? null,
      date: r.date, time: null, accountId, toAccountId: null, paymentMethod: null, merchant: r.merchant, description: null, tags: ["importado"],
      isFixed: false, isRecurring: false, recurringId: null, status: "paid", attachmentPath: null, notes: `Importado de ${fileName}`,
    }));
    try {
      await saveMany("transactions", txs);
      toast.success(`${txs.length} movimientos importados`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error("Error al importar", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }} title="Importar movimientos desde CSV" size="lg"
      description="Exporta el extracto desde la web de tu banco en CSV y súbelo aquí."
      footer={rows ? <><Button variant="secondary" onClick={reset}>Elegir otro archivo</Button><Button onClick={doImport} disabled={busy || !toImport.length}>{busy ? "Importando…" : `Importar ${toImport.length}`}</Button></> : undefined}>
      {!rows ? (
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center hover:bg-muted/50">
          <FileSpreadsheet className="size-10 text-muted-foreground" />
          <span className="font-medium">Selecciona un archivo .csv</span>
          <span className="text-xs text-muted-foreground">Se detectan automáticamente las columnas de fecha, concepto e importe. Separadores ; o , y formatos de fecha españoles.</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Fila de cabecera">
              <Select value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))}>
                {rows.slice(0, 15).map((r, i) => <option key={i} value={i}>{i + 1}: {r.slice(0, 3).join(" | ").slice(0, 40)}</option>)}
              </Select>
            </Field>
            <Field label="Cuenta de destino"><AccountSelect accounts={d.accounts} value={accountId} onChange={setAccountId} /></Field>
            <Field label="Duplicados">
              <Select value={skipDuplicates ? "skip" : "keep"} onChange={(e) => setSkipDuplicates(e.target.value === "skip")}>
                <option value="skip">Omitir posibles duplicados</option><option value="keep">Importar todo</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(Object.keys(FIELD_LABELS) as (keyof CsvMapping)[]).map((k) => (
              <Field key={k} label={FIELD_LABELS[k]}>
                <Select value={mapping![k]} onChange={(e) => setMapping({ ...mapping!, [k]: Number(e.target.value) })}>
                  <option value={-1}>—</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
                </Select>
              </Field>
            ))}
          </div>
          {preview && (
            <>
              <p className="text-sm text-muted-foreground">
                {preview.items.length} filas válidas · {preview.items.filter((i) => i.dup).length} posibles duplicados · {preview.errors.length} con errores
              </p>
              {preview.errors.length > 0 && (
                <p className="flex items-center gap-2 text-xs text-warning"><TriangleAlert className="size-3.5" /> Líneas ignoradas: {preview.errors.slice(0, 8).map((e) => `${e.line} (${e.reason})`).join(", ")}{preview.errors.length > 8 ? "…" : ""}</p>
              )}
              <div className="max-h-72 overflow-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Categoría sugerida</th><th className="px-3 py-2 text-right">Importe</th></tr>
                  </thead>
                  <tbody>
                    {preview.items.slice(0, 200).map(({ r, sug, dup }) => (
                      <tr key={r.line} className={dup && skipDuplicates ? "opacity-40" : ""}>
                        <td className="whitespace-nowrap px-3 py-1.5">{formatDate(r.date, "dd/MM/yy")}</td>
                        <td className="max-w-56 truncate px-3 py-1.5">{r.concept} {dup && <span className="ml-1 rounded bg-warning/20 px-1 text-[10px]">duplicado</span>}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{sug ? d.categories.find((c) => c.id === (sug.subcategoryId ?? sug.categoryId))?.name : "—"}</td>
                        <td className="px-3 py-1.5 text-right"><Money value={r.amount} colored sign /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
