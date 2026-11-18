"use client";
import { addDays, subMonths } from "date-fns";
import { ArrowRight, Landmark, CalendarClock, Lightbulb, Plus, TrendingDown, TrendingUp, TriangleAlert, CircleCheck, Sparkle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { budgetStatuses } from "@/core/budgets";
import { fromISO, monthKey, monthsBetween, PERIOD_LABELS, previousRange, todayISO, toISO, formatDate } from "@/core/dates";
import { expenseByCategory, monthlySeries, netWorthSeries, pctChange, summarize, wealth } from "@/core/finance";
import { monthlyInsights } from "@/core/insights";
import { upcomingPayments } from "@/core/recurring";
import { sortTransactions } from "@/core/filters";
import { useData, useFinance } from "@/store/finance-store";
import { useTxDialog } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { BalanceSetupDialog } from "@/components/forms/balance-setup";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Money, useMoney } from "@/components/ui/money";
import { CategoryDonut, IncomeExpenseChart, NetWorthChart } from "@/components/charts/charts";
import { Delta, PeriodPicker, TransactionRow, usePeriod } from "@/components/shared";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const d = useData();
  const fmt = useMoney();
  const openNew = useTxDialog((s) => s.openNew);
  const { key, range } = usePeriod();
  const today = todayISO();

  const m = useMemo(() => {
    const cur = summarize(d.transactions, range);
    const prev = summarize(d.transactions, previousRange(range));
    const w = wealth(d.accounts, d.transactions);
    const chartMonths = (() => {
      const months = monthsBetween(range);
      return months.length >= 3 ? months.slice(-12) : monthsBetween({ from: toISO(subMonths(fromISO(range.to), 5)), to: range.to });
    })();
    const nwMonths = monthsBetween({ from: toISO(subMonths(fromISO(today), 11)), to: today });
    return {
      cur, prev, w,
      series: monthlySeries(d.transactions, chartMonths),
      nw: netWorthSeries(d.accounts, d.transactions, nwMonths),
      cats: expenseByCategory(d.transactions, range, d.categories),
      budgets: budgetStatuses(d.budgets, d.categories, d.transactions, monthKey(today)),
      insights: monthlyInsights(d.transactions, d.categories, d.recurring, today, (n) => fmt(n)),
      latest: sortTransactions(d.transactions.filter((t) => t.date <= today)).slice(0, 7),
      pending: sortTransactions(d.transactions.filter((t) => t.status !== "paid")).reverse().slice(0, 5),
      upcoming: upcomingPayments(d.recurring, { from: today, to: toISO(addDays(fromISO(today), 14)) }).slice(0, 5),
    };
  }, [d, range, today, fmt]);

  const pendingTotal = m.pending.reduce((s, t) => s + (t.type === "expense" ? t.amount : 0), 0);
  const nwChange = m.nw.length > 1 ? m.nw[m.nw.length - 1].value - m.nw[0].value : 0;
  const hour = new Date().getHours();
  const greeting = hour < 7 ? "Buenas noches" : hour < 14 ? "Buenos días" : hour < 21 ? "Buenas tardes" : "Buenas noches";
  const isEmpty = d.transactions.length === 0;
  const schemaOutdated = useFinance((s) => s.schemaOutdated);
  const updateProfile = useFinance((s) => s.updateProfile);
  const [balancesOpen, setBalancesOpen] = useState(false);
  const askBalances = d.profile.balancesConfirmed !== true && !schemaOutdated && d.accounts.some((a) => !a.archived);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{greeting}{d.profile.displayName ? `, ${d.profile.displayName}` : ""}</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Resumen</h1>
        </div>
        <PeriodPicker />
      </div>

      {askBalances && (
        <Card className="flex flex-wrap items-center gap-3 border-primary/30 bg-accent/40 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Landmark className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">¿Cuánto dinero tienes de verdad en cada cuenta?</p>
            <p className="text-sm text-muted-foreground">Indica tu saldo real para que «Disponible» y «Patrimonio» cuadren con tu banco.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => updateProfile({ balancesConfirmed: true }).catch((e) => toast.error((e as Error).message))}>Ya están bien</Button>
            <Button size="sm" onClick={() => setBalancesOpen(true)}>Indicar saldos</Button>
          </div>
        </Card>
      )}
      <BalanceSetupDialog open={balancesOpen} onOpenChange={setBalancesOpen} />

      {/* Patrimonio */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_20rem_at_0%_0%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent)]" />
        <div className="relative grid gap-4 p-5 md:grid-cols-[1fr_1.3fr] md:p-6">
          <div className="flex flex-col justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Patrimonio total</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight tabular md:text-5xl"><Money value={m.w.netWorth} /></p>
              <p className="mt-2 text-sm text-muted-foreground">
                <span className={cn("font-medium tabular", nwChange >= 0 ? "text-income" : "text-expense")}>{fmt(nwChange, { sign: true })}</span> en los últimos 12 meses
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/70 p-3">
                <p className="text-xs text-muted-foreground">Saldo disponible</p>
                <p className="mt-0.5 text-lg font-semibold"><Money value={m.w.available} /></p>
              </div>
              <Link href="/transactions?status=pending" className="rounded-xl bg-muted/70 p-3 transition-colors hover:bg-muted">
                <p className="text-xs text-muted-foreground">Gastos pendientes</p>
                <p className="mt-0.5 text-lg font-semibold text-warning"><Money value={pendingTotal} /></p>
              </Link>
            </div>
          </div>
          <div className="-mx-2 md:mx-0"><NetWorthChart data={m.nw} height={190} /></div>
        </div>
      </Card>

      {/* KPIs del periodo */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Kpi label="Ingresos" value={m.cur.income} delta={pctChange(m.cur.income, m.prev.income)} icon={<TrendingUp />} tone="income" />
        <Kpi label="Gastos" value={m.cur.expense} delta={pctChange(m.cur.expense, m.prev.expense)} invert icon={<TrendingDown />} tone="expense" />
        <Kpi label="Balance" value={m.cur.balance} delta={pctChange(m.cur.balance, m.prev.balance)} colored />
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Tasa de ahorro</p>
          <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular", m.cur.savingsRate >= 20 ? "text-income" : m.cur.savingsRate < 0 ? "text-expense" : "")}>
            {m.cur.income > 0 ? `${Math.round(m.cur.savingsRate)} %` : "—"}
          </p>
          <Progress value={Math.max(0, m.cur.savingsRate)} color="var(--income)" warn={false} className="mt-3 h-1.5" />
        </Card>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{PERIOD_LABELS[key]} · comparado con el periodo anterior equivalente</p>

      {isEmpty && (
        <Card>
          <EmptyState icon={<Sparkle />} title="Empieza registrando tu primer movimiento"
            description="Añade un gasto o ingreso en segundos. También puedes importar un CSV de tu banco desde Movimientos."
            action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => openNew()}><Plus /> Añadir movimiento</Button><Link href="/transactions?import=1"><Button variant="secondary">Importar CSV</Button></Link></div>} />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Evolución financiera" subtitle="Ingresos y gastos por mes" />
          <CardBody><IncomeExpenseChart data={m.series} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Gastos por categoría" subtitle={PERIOD_LABELS[key]} action={<Link href="/analytics" className="text-xs font-medium text-primary">Ver análisis</Link>} />
          <CardBody>
            {m.cats.length ? (
              <>
                <CategoryDonut data={m.cats} height={180} center={<div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold tabular">{fmt(m.cur.expense, { decimals: false })}</p></div>} />
                <ul className="mt-4 space-y-2.5">
                  {m.cats.slice(0, 5).map((c) => (
                    <li key={c.id ?? "none"} className="flex items-center gap-2.5 text-sm">
                      <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground tabular">{Math.round(c.share)} %</span>
                      <Money value={c.amount} className="w-24 text-right font-medium" />
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="py-10 text-center text-sm text-muted-foreground">Sin gastos en este periodo</p>}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Últimos movimientos" action={<Link href="/transactions" className="inline-flex items-center gap-1 text-xs font-medium text-primary">Ver todos <ArrowRight className="size-3" /></Link>} />
          <CardBody className="px-3">
            {m.latest.length ? m.latest.map((t) => <TransactionRow key={t.id} t={t} />) : <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay movimientos</p>}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Presupuestos del mes" action={<Link href="/budgets" className="text-xs font-medium text-primary">Gestionar</Link>} />
            <CardBody className="space-y-4">
              {m.budgets.length === 0 && <p className="text-sm text-muted-foreground">Define presupuestos para controlar tu gasto mensual.</p>}
              {m.budgets.slice(0, 5).map((b) => (
                <div key={b.key}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{b.name}</span>
                    <span className={cn("text-xs tabular", b.pct >= 100 ? "text-expense" : b.pct >= 90 ? "text-warning" : "text-muted-foreground")}>{Math.round(b.pct)} %</span>
                  </div>
                  <Progress value={b.pct} color={b.categoryId ? b.color : undefined} />
                  <p className="mt-1 text-xs text-muted-foreground tabular">{fmt(b.spent)} de {fmt(b.amount)}</p>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Próximos pagos" subtitle="Pendientes y recurrentes (14 días)" action={<Link href="/calendar" className="text-xs font-medium text-primary">Calendario</Link>} />
            <CardBody className="space-y-1 px-3">
              {m.pending.length === 0 && m.upcoming.length === 0 && <p className="px-2 text-sm text-muted-foreground">No hay pagos próximos.</p>}
              {m.pending.map((t) => <TransactionRow key={t.id} t={t} />)}
              {m.upcoming.map((u) => {
                const c = d.categories.find((x) => x.id === (u.recurring.subcategoryId ?? u.recurring.categoryId));
                return (
                  <Link href="/recurring" key={`${u.recurring.id}-${u.date}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/70">
                    <IconBadge name={c?.icon ?? "repeat"} color={c?.color ?? "#14b8a6"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.recurring.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3" /> {formatDate(u.date, "EEE d MMM")}</p>
                    </div>
                    <Money value={-u.recurring.amount} className="text-sm font-semibold" />
                  </Link>
                );
              })}
            </CardBody>
          </Card>
        </div>
      </div>

      {m.insights.length > 0 && !isEmpty && (
        <Card>
          <CardHeader title="Resumen inteligente del mes" subtitle="Comparación automática y previsiones" />
          <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {m.insights.map((i) => (
              <div key={i.id} className="flex gap-3 rounded-xl border border-border p-3.5">
                <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4",
                  i.tone === "positive" ? "bg-income/12 text-income" : i.tone === "negative" ? "bg-expense/12 text-expense" : i.tone === "warning" ? "bg-warning/15 text-warning" : "bg-accent text-accent-foreground")}>
                  {i.tone === "positive" ? <CircleCheck /> : i.tone === "warning" || i.tone === "negative" ? <TriangleAlert /> : <Lightbulb />}
                </span>
                <div>
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{i.body}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, delta, invert, icon, tone, colored }: { label: string; value: number; delta: number | null; invert?: boolean; icon?: React.ReactNode; tone?: "income" | "expense"; colored?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon && <span className={cn("grid size-7 place-items-center rounded-lg [&_svg]:size-3.5", tone === "income" ? "bg-income/12 text-income" : "bg-expense/12 text-expense")}>{icon}</span>}
      </div>
      <p className="mt-1 text-xl font-semibold tracking-tight md:text-2xl"><Money value={value} colored={colored} /></p>
      <Delta value={delta} invert={invert} className="mt-2" />
    </Card>
  );
}
