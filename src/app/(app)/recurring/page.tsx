"use client";
import { addDays } from "date-fns";
import { CalendarClock, Check, Pencil, Plus, Repeat, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDate, fromISO, relativeDayLabel, todayISO, toISO } from "@/core/dates";
import { parseAmount } from "@/core/money";
import { advanceDate, annualCost, FREQUENCY_LABELS, monthlyCost, subscriptionTotals, transactionFromRecurring, upcomingPayments } from "@/core/recurring";
import type { Frequency, Recurring, Transaction } from "@/core/types";
import { fieldErrors, recurringSchema } from "@/core/validation";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge, EmptyState, PageHeader, Segmented, Switch } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Money, useMoney } from "@/components/ui/money";
import { AccountSelect, CategorySelect, SubcategorySelect } from "@/components/forms/pickers";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-time";

const USAGE_LABELS = { high: "Lo uso mucho", medium: "Lo uso a veces", low: "Apenas lo uso" } as const;

export default function RecurringPage() {
  const d = useData();
  const { save, saveMany } = useFinance();
  const fmt = useMoney();
  const today = todayISO();
  const [tab, setTab] = useState<"active" | "cancelled">("active");
  const [filter, setFilter] = useState<"all" | "subs" | "fixed">("all");
  const [editing, setEditing] = useState<Recurring | "new" | null>(null);

  const totals = useMemo(() => subscriptionTotals(d.recurring.filter((r) => r.isSubscription), today), [d.recurring, today]);
  const allTotals = useMemo(() => subscriptionTotals(d.recurring, today), [d.recurring, today]);
  const upcoming = useMemo(() => upcomingPayments(d.recurring, { from: today, to: toISO(addDays(fromISO(today), 30)) }), [d.recurring, today]);
  const overdue = d.recurring.filter((r) => r.status === "active" && r.nextDate < today && (!r.endDate || r.nextDate <= r.endDate));
  const list = d.recurring
    .filter((r) => r.status === tab)
    .filter((r) => filter === "all" || (filter === "subs" ? r.isSubscription : !r.isSubscription))
    .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
  const catOf = (r: Recurring) => d.categories.find((c) => c.id === (r.subcategoryId ?? r.categoryId));

  /** Registra el cobro como movimiento y avanza la próxima fecha. */
  async function registerPayment(r: Recurring, date = r.nextDate) {
    const tx: Transaction = { id: newId(), ...transactionFromRecurring(r, date) };
    try {
      await save("transactions", tx);
      const next = advanceDate(r.nextDate, r.frequency);
      const ended = r.endDate && next > r.endDate;
      await save("recurring", { ...r, nextDate: next, status: ended ? "cancelled" : r.status });
      toast.success(`Pago de ${r.name} registrado`, { description: `${fmt(r.amount)} · próximo: ${ended ? "finalizado" : formatDate(next)}` });
    } catch (e) { toast.error("No se pudo registrar", { description: (e as Error).message }); }
  }

  async function registerAllOverdue() {
    const txs: Transaction[] = [];
    const updated: Recurring[] = [];
    for (const r of overdue) {
      let next = r.nextDate;
      let guard = 0;
      while (next <= today && (!r.endDate || next <= r.endDate) && guard++ < 60) {
        txs.push({ id: newId(), ...transactionFromRecurring(r, next) });
        next = advanceDate(next, r.frequency);
      }
      updated.push({ ...r, nextDate: next, status: r.endDate && next > r.endDate ? "cancelled" : r.status });
    }
    try {
      await saveMany("transactions", txs);
      await saveMany("recurring", updated);
      toast.success(`${txs.length} pagos registrados`);
    } catch (e) { toast.error("No se pudieron registrar", { description: (e as Error).message }); }
  }

  return (
    <div>
      <PageHeader title="Recurrentes" subtitle="Suscripciones, facturas y pagos fijos" actions={<Button onClick={() => setEditing("new")}><Plus /> Nuevo</Button>} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Suscripciones / mes</p><p className="mt-1 text-xl font-semibold"><Money value={totals.monthly} /></p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Coste anual suscripciones</p><p className="mt-1 text-xl font-semibold"><Money value={totals.annual} /></p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total fijos / mes</p><p className="mt-1 text-xl font-semibold"><Money value={allTotals.monthly} /></p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Activos · cancelados</p><p className="mt-1 text-xl font-semibold">{allTotals.activeCount} · {allTotals.cancelledCount}</p></Card>
      </div>

      {overdue.length > 0 && (
        <Card className="mb-5 flex flex-wrap items-center gap-3 border-warning/40 bg-warning/10 p-4">
          <TriangleAlert className="size-5 text-warning" />
          <p className="flex-1 text-sm"><b>{overdue.length}</b> pago(s) con fecha vencida sin registrar: {overdue.map((r) => r.name).join(", ")}.</p>
          <Button size="sm" onClick={registerAllOverdue}><Check /> Registrar todos</Button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            <Segmented value={tab} onChange={setTab} options={[{ value: "active", label: "Activos" }, { value: "cancelled", label: "Cancelados" }]} />
            <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "Todos" }, { value: "subs", label: "Suscripciones" }, { value: "fixed", label: "Gastos fijos" }]} />
          </div>
          <Card className="p-2">
            {list.length === 0 ? (
              <EmptyState icon={<Repeat />} title={tab === "active" ? "Sin pagos recurrentes" : "Nada cancelado"} description="Añade Netflix, el alquiler, el gimnasio, seguros…"
                action={tab === "active" && <Button onClick={() => setEditing("new")}><Plus /> Añadir</Button>} />
            ) : list.map((r) => {
              const c = catOf(r);
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/60">
                  <IconBadge name={c?.icon ?? "repeat"} color={c?.color ?? "#14b8a6"} />
                  <button className="min-w-0 flex-1 text-left cursor-pointer" onClick={() => setEditing(r)}>
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {r.name}
                      {r.usage === "low" && <Badge className="bg-warning/15 text-warning">Poco uso</Badge>}
                      {r.type === "income" && <Badge className="bg-income/15 text-income">Ingreso</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {FREQUENCY_LABELS[r.frequency]} · {r.status === "active" ? `próximo ${relativeDayLabel(r.nextDate, today).toLowerCase()}` : `finalizado ${r.endDate ? formatDate(r.endDate) : ""}`}
                      {r.frequency !== "monthly" && ` · ${fmt(monthlyCost(r))}/mes`}
                    </p>
                  </button>
                  <div className="text-right">
                    <Money value={r.type === "expense" ? -r.amount : r.amount} className="text-sm font-semibold" />
                    <p className="text-[11px] text-muted-foreground tabular">{fmt(annualCost(r), { decimals: false })}/año</p>
                  </div>
                  {r.status === "active" && (
                    <Button variant="ghost" size="icon-sm" onClick={() => registerPayment(r)} aria-label={`Registrar pago de ${r.name}`} title="Registrar pago"><Check /></Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(r)} aria-label={`Editar ${r.name}`}><Pencil /></Button>
                </div>
              );
            })}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Próximos 30 días" subtitle={`${fmt(upcoming.filter((u) => u.recurring.type === "expense").reduce((s, u) => s + u.recurring.amount, 0))} en cargos previstos`} />
          <CardBody className="space-y-1 px-3">
            {upcoming.length === 0 && <p className="px-2 text-sm text-muted-foreground">Nada previsto.</p>}
            {upcoming.map((u) => (
              <div key={`${u.recurring.id}-${u.date}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                <div className="grid w-10 shrink-0 text-center">
                  <span className="text-[10px] uppercase text-muted-foreground">{formatDate(u.date, "MMM")}</span>
                  <span className="text-lg font-semibold leading-none">{formatDate(u.date, "d")}</span>
                </div>
                <p className="flex-1 truncate text-sm">{u.recurring.name}</p>
                <Money value={u.recurring.type === "expense" ? -u.recurring.amount : u.recurring.amount} className={cn("text-sm", u.recurring.type === "income" && "text-income")} />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Nuevo pago recurrente" : "Editar pago recurrente"}>
        {editing && <RecurringForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onPay={registerPayment} />}
      </Modal>
    </div>
  );
}

function RecurringForm({ initial, onClose, onPay }: { initial: Recurring | null; onClose: () => void; onPay: (r: Recurring) => Promise<void> }) {
  const d = useData();
  const { save, remove } = useFinance();
  const today = todayISO();
  const [r, setR] = useState<Recurring>(initial ?? {
    id: newId(), name: "", amount: 0, type: "expense", frequency: "monthly", nextDate: today, startDate: today, endDate: null,
    categoryId: null, subcategoryId: null, accountId: d.accounts.find((a) => !a.archived)?.id ?? null, isSubscription: true, isFixed: true,
    status: "active", usage: null, merchant: null, notes: null,
  });
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace(".", ",") : "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const row = { ...r, amount: parseAmount(amount) ?? NaN, name: r.name.trim() };
    const res = recurringSchema.safeParse(row);
    if (!res.success) return setErrors(fieldErrors(res.error));
    try { await save("recurring", row); toast.success("Guardado"); onClose(); }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }); }
  }

  async function del() {
    if (!initial || !confirm("¿Eliminar este pago recurrente? Los movimientos ya registrados se conservan.")) return;
    try { await remove("recurring", initial.id); toast.success("Eliminado"); onClose(); }
    catch (e) { toast.error("No se pudo eliminar", { description: (e as Error).message }); }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <Segmented value={r.type} onChange={(v) => setR({ ...r, type: v, categoryId: null, subcategoryId: null, isSubscription: v === "expense" && r.isSubscription })} className="w-full"
        options={[{ value: "expense", label: "Gasto" }, { value: "income", label: "Ingreso previsto" }]} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre del servicio" error={errors.name} className="col-span-2"><Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Ej. Netflix" autoFocus /></Field>
        <Field label="Importe" error={errors.amount}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
        <Field label="Frecuencia">
          <Select value={r.frequency} onChange={(e) => setR({ ...r, frequency: e.target.value as Frequency })}>
            {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
          </Select>
        </Field>
        <Field label="Próximo cobro" error={errors.nextDate}><DatePicker value={r.nextDate} onChange={(v) => v && setR({ ...r, nextDate: v })} aria-invalid={!!errors.nextDate} /></Field>
        <Field label="Fecha de inicio" error={errors.startDate}><DatePicker value={r.startDate} onChange={(v) => v && setR({ ...r, startDate: v })} aria-invalid={!!errors.startDate} /></Field>
        <Field label="Fecha de fin (opcional)" error={errors.endDate}><DatePicker value={r.endDate} onChange={(v) => setR({ ...r, endDate: v })} allowClear placeholder="Sin fecha de fin" min={r.startDate} aria-invalid={!!errors.endDate} /></Field>
        <Field label="Cuenta"><AccountSelect accounts={d.accounts} value={r.accountId} onChange={(v) => setR({ ...r, accountId: v })} /></Field>
        <Field label="Categoría"><CategorySelect categories={d.categories} kind={r.type} value={r.categoryId} onChange={(v) => setR({ ...r, categoryId: v, subcategoryId: null })} /></Field>
        <Field label="Subcategoría"><SubcategorySelect categories={d.categories} parentId={r.categoryId} value={r.subcategoryId} onChange={(v) => setR({ ...r, subcategoryId: v })} /></Field>
      </div>
      {r.type === "expense" && (
        <div className="rounded-xl border border-border px-3 py-1">
          <Switch checked={r.isSubscription} onChange={(v) => setR({ ...r, isSubscription: v })} label="Es una suscripción" description="Desactívalo para facturas, alquiler, seguros…" />
          <Switch checked={r.status === "active"} onChange={(v) => setR({ ...r, status: v ? "active" : "cancelled", endDate: v ? r.endDate : r.endDate ?? today })} label="Activo" />
        </div>
      )}
      {r.isSubscription && r.type === "expense" && (
        <Field label="¿Cuánto lo usas?" hint="Te avisaremos de las suscripciones que apenas usas">
          <Select value={r.usage ?? ""} onChange={(e) => setR({ ...r, usage: (e.target.value || null) as Recurring["usage"] })}>
            <option value="">Sin indicar</option>{Object.entries(USAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Notas"><Textarea rows={2} value={r.notes ?? ""} onChange={(e) => setR({ ...r, notes: e.target.value || null })} /></Field>
      <div className="flex flex-wrap gap-2">
        {initial && <Button variant="ghost" className="text-expense" onClick={del}>Eliminar</Button>}
        {initial?.status === "active" && <Button variant="secondary" onClick={async () => { await onPay(initial); onClose(); }}><CalendarClock /> Registrar pago</Button>}
        <Button type="submit" className="ml-auto">Guardar</Button>
      </div>
    </form>
  );
}
