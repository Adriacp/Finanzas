"use client";
import { DatabaseBackup, FileDown, FileSpreadsheet, FileText, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { type DateRange, PERIOD_LABELS, type PeriodKey, periodRange } from "@/core/dates";
import { filterTransactions, sortTransactions } from "@/core/filters";
import { summarize } from "@/core/finance";
import type { TxType } from "@/core/types";
import { useData, useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { AccountSelect, CategorySelect } from "@/components/forms/pickers";
import { exportBackup, exportCSV, exportExcel, exportPDF, parseBackup } from "@/lib/exporters";

export default function ReportsPage() {
  const d = useData();
  const replaceAll = useFinance((s) => s.replaceAll);
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [custom, setCustom] = useState<DateRange>(periodRange("month"));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [type, setType] = useState<TxType | "">("");
  const [busy, setBusy] = useState<string | null>(null);

  const range = useMemo(() => periodRange(period, new Date(), custom), [period, custom]);
  const txs = useMemo(() => {
    const cat = categoryId ? d.categories.find((c) => c.id === categoryId) : undefined;
    return sortTransactions(filterTransactions(d.transactions, {
      from: range.from, to: range.to,
      categoryIds: cat && !cat.parentId ? [cat.id] : undefined,
      subcategoryIds: cat?.parentId ? [cat.id] : undefined,
      accountIds: accountId ? [accountId] : undefined,
      types: type ? [type] : undefined,
    }, d.categories, d.accounts));
  }, [d, range, categoryId, accountId, type]);
  const s = summarize(txs, range);
  const title = `Informe financiero · ${period === "custom" ? "Personalizado" : PERIOD_LABELS[period]}`;

  async function run(kind: "csv" | "xlsx" | "pdf") {
    if (!txs.length) return toast.error("No hay movimientos con estos filtros");
    setBusy(kind);
    try {
      const input = { data: d, txs, range, title };
      if (kind === "csv") exportCSV(input);
      if (kind === "xlsx") await exportExcel(input);
      if (kind === "pdf") await exportPDF(input);
      toast.success("Informe generado");
    } catch (e) {
      toast.error("No se pudo generar el informe", { description: (e as Error).message });
    } finally { setBusy(null); }
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      const data = parseBackup(await file.text());
      if (!confirm(`Se sustituirán TODOS tus datos actuales por los de la copia (${data.transactions.length} movimientos, ${data.accounts.length} cuentas). ¿Continuar?`)) return;
      setBusy("restore");
      await replaceAll(data);
      toast.success("Copia restaurada correctamente");
    } catch (e) {
      toast.error("No se pudo restaurar", { description: (e as Error).message });
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Informes y exportación" subtitle="Genera informes y copias de seguridad de tus datos" />

      <Card>
        <CardHeader title="Generar informe" subtitle="Elige periodo y filtros" />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Periodo">
              <Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
                {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => <option key={k} value={k}>{PERIOD_LABELS[k]}</option>)}
              </Select>
            </Field>
            <Field label="Categoría"><CategorySelect categories={d.categories} value={categoryId} onChange={setCategoryId} includeAll placeholder="Todas" /></Field>
            <Field label="Cuenta"><AccountSelect accounts={d.accounts} value={accountId} onChange={setAccountId} placeholder="Todas" /></Field>
            <Field label="Tipo">
              <Select value={type} onChange={(e) => setType(e.target.value as TxType | "")}>
                <option value="">Todos</option><option value="expense">Gastos</option><option value="income">Ingresos</option><option value="transfer">Transferencias</option><option value="refund">Reembolsos</option>
              </Select>
            </Field>
            {period === "custom" && (
              <>
                <Field label="Desde"><Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
                <Field label="Hasta"><Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/60 p-4 md:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">Movimientos</p><p className="text-lg font-semibold">{txs.length}</p></div>
            <div><p className="text-xs text-muted-foreground">Ingresos</p><p className="text-lg font-semibold text-income"><Money value={s.income} /></p></div>
            <div><p className="text-xs text-muted-foreground">Gastos</p><p className="text-lg font-semibold text-expense"><Money value={s.expense} /></p></div>
            <div><p className="text-xs text-muted-foreground">Balance</p><p className="text-lg font-semibold"><Money value={s.balance} colored /></p></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ExportButton icon={<FileDown />} label="CSV" desc="Compatible con cualquier hoja de cálculo" onClick={() => run("csv")} busy={busy === "csv"} />
            <ExportButton icon={<FileSpreadsheet />} label="Excel" desc="Resumen + movimientos con formato" onClick={() => run("xlsx")} busy={busy === "xlsx"} />
            <ExportButton icon={<FileText />} label="PDF" desc="Informe listo para imprimir" onClick={() => run("pdf")} busy={busy === "pdf"} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Copia de seguridad" subtitle="Descarga todos tus datos (cuentas, categorías, movimientos, presupuestos, recurrentes, objetivos y vistas) en un archivo JSON" />
        <CardBody className="flex flex-wrap gap-3">
          <Button onClick={() => { exportBackup(d); toast.success("Copia descargada"); }}><DatabaseBackup /> Descargar copia</Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-secondary px-4 text-sm font-medium hover:bg-muted">
            <Upload className="size-4" /> {busy === "restore" ? "Restaurando…" : "Restaurar copia"}
            <input type="file" accept="application/json,.json" className="sr-only" disabled={!!busy} onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <p className="w-full text-xs text-muted-foreground">Los archivos adjuntos (tickets) no se incluyen en la copia: permanecen en el almacenamiento seguro de Supabase.</p>
        </CardBody>
      </Card>
    </div>
  );
}

function ExportButton({ icon, label, desc, onClick, busy }: { icon: React.ReactNode; label: string; desc: string; onClick: () => void; busy: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted disabled:opacity-60 cursor-pointer">
      <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground [&_svg]:size-5">{icon}</span>
      <span>
        <span className="block font-medium">{busy ? "Generando…" : `Exportar ${label}`}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}
