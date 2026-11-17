"use client";
import { addMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Pencil, PiggyBank, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BUDGET_THRESHOLDS, budgetStatuses, type BudgetStatus } from "@/core/budgets";
import { formatMonth, fromISO, monthKey, todayISO } from "@/core/dates";
import { parseAmount } from "@/core/money";
import type { Budget } from "@/core/types";
import { budgetSchema, fieldErrors } from "@/core/validation";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Progress, Segmented } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Money, useMoney } from "@/components/ui/money";
import { MonthlyBars } from "@/components/charts/charts";
import { CategorySelect } from "@/components/forms/pickers";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const shiftMonth = (m: string, n: number) => format(addMonths(fromISO(`${m}-01`), n), "yyyy-MM");

export default function BudgetsPage() {
  const d = useData();
  const fmt = useMoney();
  const current = monthKey(todayISO());
  const [month, setMonth] = useState(current);
  const [editing, setEditing] = useState<{ status: BudgetStatus | null } | null>(null);

  const statuses = useMemo(() => budgetStatuses(d.budgets, d.categories, d.transactions, month), [d, month]);
  const global = statuses.find((s) => s.categoryId === null);
  const others = statuses.filter((s) => s.categoryId !== null);
  const history = useMemo(() => Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((m) => {
    const st = budgetStatuses(d.budgets, d.categories, d.transactions, m);
    const g = st.find((s) => s.categoryId === null);
    const budget = g?.amount ?? st.filter((s) => !s.isSub).reduce((s, x) => s + x.amount, 0);
    const spent = g?.spent ?? st.filter((s) => !s.isSub).reduce((s, x) => s + x.spent, 0);
    return { label: formatMonth(m, "MMM yy"), budget, spent, month: m, items: st };
  }), [d, month]);

  const totalCategoryBudget = others.filter((s) => !s.isSub).reduce((s, x) => s + x.amount, 0);
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const dayOfMonth = month === current ? new Date().getDate() : month < current ? daysInMonth : 0;

  return (
    <div>
      <PageHeader title="Presupuestos" subtitle="Controla cuánto gastas cada mes"
        actions={<Button onClick={() => setEditing({ status: null })}><Plus /> Nuevo presupuesto</Button>} />

      <div className="mb-5 flex items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior"><ChevronLeft /></Button>
        <p className="min-w-40 text-center font-semibold capitalize">{formatMonth(month, "MMMM yyyy")}</p>
        <Button variant="secondary" size="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente"><ChevronRight /></Button>
        {month !== current && <Button variant="ghost" size="sm" onClick={() => setMonth(current)}>Hoy</Button>}
      </div>

      {statuses.length === 0 ? (
        <Card><EmptyState icon={<PiggyBank />} title="Sin presupuestos" description="Define un presupuesto global y/o por categoría para recibir avisos al 50 %, 75 %, 90 % y 100 %."
          action={<Button onClick={() => setEditing({ status: null })}><Plus /> Crear presupuesto</Button>} /></Card>
      ) : (
        <div className="space-y-5">
          {global && (
            <Card className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Presupuesto global</p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight"><Money value={global.spent} /> <span className="text-lg font-normal text-muted-foreground">/ <Money value={global.amount} /></span></p>
                  <p className={cn("mt-1 text-sm", global.remaining < 0 ? "text-expense" : "text-muted-foreground")}>
                    {global.remaining >= 0 ? `Te quedan ${fmt(global.remaining)}` : `Te has pasado ${fmt(-global.remaining)}`}
                    {dayOfMonth > 0 && dayOfMonth < daysInMonth && global.remaining > 0 && ` · ${fmt(global.remaining / (daysInMonth - dayOfMonth + 1))}/día`}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ status: global })} aria-label="Editar presupuesto global"><Pencil /></Button>
              </div>
              <div className="relative mt-4">
                <Progress value={global.pct} className="h-3" />
                {dayOfMonth > 0 && <div className="absolute -top-1 h-5 w-0.5 rounded bg-foreground/50" style={{ left: `${(dayOfMonth / daysInMonth) * 100}%` }} title="Hoy" />}
              </div>
              <Thresholds pct={global.pct} />
              {totalCategoryBudget > 0 && <p className="mt-3 text-xs text-muted-foreground">Suma de presupuestos por categoría: {fmt(totalCategoryBudget)}</p>}
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {others.map((s) => (
              <Card key={s.key} className="p-4">
                <div className="flex items-center gap-3">
                  <IconBadge name={s.icon} color={s.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground tabular">{fmt(s.spent)} de {fmt(s.amount)}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-sm font-semibold tabular", s.pct >= 100 ? "text-expense" : s.pct >= 90 ? "text-warning" : "")}>{Math.round(s.pct)} %</p>
                    <p className={cn("text-xs tabular", s.remaining < 0 ? "text-expense" : "text-muted-foreground")}>{s.remaining >= 0 ? `quedan ${fmt(s.remaining, { decimals: false })}` : `+${fmt(-s.remaining, { decimals: false })}`}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ status: s })} aria-label={`Editar ${s.name}`}><Pencil /></Button>
                </div>
                <Progress value={s.pct} color={s.color} className="mt-3" />
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title="Historial" subtitle="Gasto real frente a presupuestado (últimos 6 meses)" />
            <CardBody>
              <MonthlyBars data={history} keys={[{ key: "budget", name: "Presupuesto", color: "var(--muted-foreground)" }, { key: "spent", name: "Gastado", color: "var(--chart-1)" }]} />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Mes</th><th className="text-right">Presupuesto</th><th className="text-right">Gastado</th><th className="text-right">Diferencia</th><th className="text-right">Cumplidos</th></tr></thead>
                  <tbody>
                    {history.slice().reverse().map((h) => (
                      <tr key={h.month} className="border-t border-border">
                        <td className="py-2 capitalize">{h.label}</td>
                        <td className="text-right tabular">{fmt(h.budget)}</td>
                        <td className="text-right tabular">{fmt(h.spent)}</td>
                        <td className={cn("text-right tabular", h.budget - h.spent < 0 ? "text-expense" : "text-income")}>{fmt(h.budget - h.spent, { sign: true })}</td>
                        <td className="text-right tabular">{h.items.filter((i) => i.pct <= 100).length}/{h.items.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.status ? "Editar presupuesto" : "Nuevo presupuesto"} size="sm">
        {editing && <BudgetForm key={editing.status?.budgetId ?? "new"} status={editing.status} month={month} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function Thresholds({ pct }: { pct: number }) {
  return (
    <div className="mt-3 flex gap-2">
      {BUDGET_THRESHOLDS.map((t) => (
        <span key={t} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium",
          pct >= t ? (t >= 100 ? "bg-expense/15 text-expense" : t >= 90 ? "bg-warning/20 text-warning" : "bg-accent text-accent-foreground") : "bg-muted text-muted-foreground")}>
          {t} %
        </span>
      ))}
    </div>
  );
}

function BudgetForm({ status, month, onClose }: { status: BudgetStatus | null; month: string; onClose: () => void }) {
  const d = useData();
  const { save, remove } = useFinance();
  const existing = status ? d.budgets.find((b) => b.id === status.budgetId) : undefined;
  const [scope, setScope] = useState<"global" | "category">(existing ? (existing.categoryId ? "category" : "global") : d.budgets.some((b) => !b.categoryId) ? "category" : "global");
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [amount, setAmount] = useState(existing ? String(existing.amount).replace(".", ",") : "");
  const [applies, setApplies] = useState<"all" | "month">(existing?.month ? "month" : "all");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const b: Budget = {
      id: existing?.id ?? newId(),
      categoryId: scope === "global" ? null : categoryId,
      amount: parseAmount(amount) ?? NaN,
      month: applies === "month" ? `${month}-01` : null,
    };
    if (scope === "category" && !b.categoryId) return setErrors({ categoryId: "Elige una categoría" });
    const r = budgetSchema.safeParse(b);
    if (!r.success) return setErrors(fieldErrors(r.error));
    // Si ya hay uno con el mismo ámbito y periodo, se sobrescribe
    const clash = d.budgets.find((x) => x.id !== b.id && x.categoryId === b.categoryId && x.month === b.month);
    if (clash) b.id = clash.id;
    // Si se cambia de "todos los meses" a "solo este mes", crear uno nuevo y mantener el general
    if (existing && existing.month === null && b.month !== null && !clash) b.id = newId();
    try { await save("budgets", b); toast.success("Presupuesto guardado"); onClose(); }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }); }
  }

  async function del() {
    if (!existing || !confirm("¿Eliminar este presupuesto?")) return;
    try { await remove("budgets", existing.id); toast.success("Presupuesto eliminado"); onClose(); }
    catch (e) { toast.error("No se pudo eliminar", { description: (e as Error).message }); }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <Segmented value={scope} onChange={setScope} className="w-full" options={[{ value: "global", label: "Global" }, { value: "category", label: "Categoría / subcategoría" }]} />
      {scope === "category" && (
        <Field label="Categoría o subcategoría" error={errors.categoryId}>
          <CategorySelect categories={d.categories} kind="expense" value={categoryId} onChange={setCategoryId} includeAll placeholder="Elige…" />
        </Field>
      )}
      <Field label="Importe mensual" error={errors.amount}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoFocus /></Field>
      <Field label="Se aplica a">
        <Segmented value={applies} onChange={setApplies} className="w-full" options={[{ value: "all", label: "Todos los meses" }, { value: "month", label: `Solo ${formatMonth(month, "MMMM")}` }]} />
      </Field>
      <div className="flex gap-2">
        {existing && <Button variant="ghost" className="text-expense" onClick={del}>Eliminar</Button>}
        <Button type="submit" className="ml-auto">Guardar</Button>
      </div>
    </form>
  );
}
