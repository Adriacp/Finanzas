"use client";
import { endOfMonth, format, subMonths } from "date-fns";
import { ChevronLeft, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate, formatMonth, fromISO, monthsBetween, todayISO, toISO } from "@/core/dates";
import {
  averages, expenseByCategory, expenseByDay, expenseByWeekday, monthlySeries, netWorthSeries, splitEssential, splitFixedVariable,
  type CategoryTotal,
} from "@/core/finance";
import { savingsForecast } from "@/core/insights";
import { useData } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon";
import { Select } from "@/components/ui/input";
import { PageHeader, Segmented } from "@/components/ui/misc";
import { Money, useMoney } from "@/components/ui/money";
import { CategoryDonut, ForecastLine, IncomeExpenseChart, MonthlyBars, NetWorthChart, SimpleBars } from "@/components/charts/charts";
import { PeriodPicker, usePeriod } from "@/components/shared";

const monthRange = (m: string) => ({ from: `${m}-01`, to: toISO(endOfMonth(fromISO(`${m}-01`))) });

export default function AnalyticsPage() {
  const d = useData();
  const fmt = useMoney();
  const { range } = usePeriod();
  const today = todayISO();
  const [level, setLevel] = useState<"category" | "subcategory">("category");
  const [drill, setDrill] = useState<CategoryTotal | null>(null);

  const months = useMemo(() => {
    const m = monthsBetween(range);
    return m.length >= 2 ? m : monthsBetween({ from: toISO(subMonths(fromISO(range.to), 5)), to: range.to });
  }, [range]);

  const a = useMemo(() => {
    const avg = averages(d.transactions, range);
    return {
      avg,
      series: monthlySeries(d.transactions, months),
      cats: drill ? expenseByCategory(d.transactions, range, d.categories, "subcategory", drill.id ?? undefined) : expenseByCategory(d.transactions, range, d.categories, level),
      weekday: expenseByWeekday(d.transactions, range),
      topDays: expenseByDay(d.transactions, range).slice(0, 5),
      fixed: splitFixedVariable(d.transactions, range),
      essential: splitEssential(d.transactions, range, d.categories),
      nw: netWorthSeries(d.accounts, d.transactions, months),
      forecast: savingsForecast(d.transactions, today),
    };
  }, [d, range, months, level, drill, today]);

  // Comparación entre dos meses
  const allMonths = useMemo(() => monthsBetween({ from: toISO(subMonths(fromISO(today), 23)), to: today }).reverse(), [today]);
  const [mA, setMA] = useState(allMonths[0]);
  const [mB, setMB] = useState(allMonths[1]);
  const compare = useMemo(() => {
    const ca = expenseByCategory(d.transactions, monthRange(mA), d.categories);
    const cb = new Map(expenseByCategory(d.transactions, monthRange(mB), d.categories).map((c) => [c.name, c.amount]));
    const names = [...new Set([...ca.map((c) => c.name), ...cb.keys()])];
    const aMap = new Map(ca.map((c) => [c.name, c.amount]));
    return names.map((n) => ({ label: n.length > 12 ? `${n.slice(0, 11)}…` : n, a: aMap.get(n) ?? 0, b: cb.get(n) ?? 0 })).sort((x, y) => y.a + y.b - (x.a + x.b)).slice(0, 8);
  }, [d, mA, mB]);

  // Comparación entre años (mes a mes)
  const year = fromISO(today).getFullYear();
  const yearly = useMemo(() => {
    const cur = monthlySeries(d.transactions, Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`));
    const prev = monthlySeries(d.transactions, Array.from({ length: 12 }, (_, i) => `${year - 1}-${String(i + 1).padStart(2, "0")}`));
    return cur.map((c, i) => ({ label: formatMonth(c.month, "MMM"), cur: c.expense, prev: prev[i].expense }));
  }, [d.transactions, year]);

  // Dónde ahorrar: categorías prescindibles con más gasto
  const savingsTips = useMemo(() => {
    const months3 = { from: format(subMonths(fromISO(today), 3), "yyyy-MM-01"), to: toISO(endOfMonth(subMonths(fromISO(today), 1))) };
    const byId = new Map(d.categories.map((c) => [c.id, c]));
    return expenseByCategory(d.transactions, months3, d.categories, "subcategory")
      .filter((c) => c.id && !byId.get(c.id)?.essential)
      .slice(0, 4)
      .map((c) => ({ ...c, monthly: c.amount / 3 }));
  }, [d, today]);

  const totalFV = a.fixed.fixed + a.fixed.variable;
  const totalEss = a.essential.essential + a.essential.discretionary;

  return (
    <div className="space-y-5">
      <PageHeader title="Análisis" subtitle="Entiende a dónde va tu dinero" actions={<PeriodPicker />} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Gasto total</p><p className="mt-1 text-xl font-semibold"><Money value={a.avg.summary.expense} /></p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Gasto medio diario</p><p className="mt-1 text-xl font-semibold"><Money value={a.avg.daily} /></p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Gasto medio mensual</p><p className="mt-1 text-xl font-semibold"><Money value={a.avg.monthly} /></p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Tasa de ahorro</p><p className="mt-1 text-xl font-semibold">{a.avg.summary.income > 0 ? `${Math.round(a.avg.summary.savingsRate)} %` : "—"}</p></Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Ingresos frente a gastos" subtitle="Evolución mensual" />
          <CardBody><IncomeExpenseChart data={a.series} height={260} /></CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader
            title={drill ? <span className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" onClick={() => setDrill(null)} aria-label="Volver"><ChevronLeft /></Button>{drill.name}</span> : "Gastos por categoría"}
            subtitle={drill ? "Subcategorías" : "Pulsa una categoría para ver el detalle"}
            action={!drill && <Segmented size="sm" value={level} onChange={setLevel} options={[{ value: "category", label: "Cat." }, { value: "subcategory", label: "Subcat." }]} />} />
          <CardBody>
            {a.cats.length ? (
              <>
                <CategoryDonut data={a.cats} height={200} onSelect={!drill && level === "category" ? setDrill : undefined}
                  center={<div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold tabular">{fmt(a.cats.reduce((s, c) => s + c.amount, 0), { decimals: false })}</p></div>} />
                <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto">
                  {a.cats.map((c) => (
                    <li key={c.id ?? "none"}>
                      <button className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-sm hover:bg-muted cursor-pointer"
                        onClick={() => !drill && level === "category" && setDrill(c)}>
                        <IconBadge name={c.icon} color={c.color} size="sm" />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="text-xs text-muted-foreground tabular">{c.share.toFixed(1).replace(".", ",")} %</span>
                        <Money value={c.amount} className="w-24 text-right font-medium" />
                      </button>
                    </li>
                  ))}
                </ul>
                {drill?.id && <Link href={`/transactions?category=${drill.id}&from=${range.from}&to=${range.to}`} className="mt-3 block text-center text-xs font-medium text-primary">Ver movimientos</Link>}
              </>
            ) : <p className="py-10 text-center text-sm text-muted-foreground">Sin gastos en este periodo</p>}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Comparación entre meses" subtitle="Gasto por categoría"
            action={<div className="flex gap-1.5">
              <Select className="h-8 w-28 text-xs" value={mA} onChange={(e) => setMA(e.target.value)}>{allMonths.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}</Select>
              <Select className="h-8 w-28 text-xs" value={mB} onChange={(e) => setMB(e.target.value)}>{allMonths.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}</Select>
            </div>} />
          <CardBody><MonthlyBars data={compare} keys={[{ key: "a", name: formatMonth(mA, "MMMM yy"), color: "var(--chart-1)" }, { key: "b", name: formatMonth(mB, "MMMM yy"), color: "var(--muted-foreground)" }]} height={260} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Comparación entre años" subtitle={`Gastos ${year} frente a ${year - 1}`} />
          <CardBody><MonthlyBars data={yearly} keys={[{ key: "cur", name: String(year), color: "var(--chart-1)" }, { key: "prev", name: String(year - 1), color: "var(--muted-foreground)" }]} height={260} /></CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Días de mayor gasto" subtitle="Por día de la semana" />
          <CardBody>
            <SimpleBars data={a.weekday} height={160} />
            <ul className="mt-3 space-y-1.5 text-sm">
              {a.topDays.map((t) => (
                <li key={t.date} className="flex justify-between"><span className="capitalize text-muted-foreground">{formatDate(t.date, "EEEE d MMM")}</span><Money value={t.amount} className="font-medium" /></li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Composición del gasto" />
          <CardBody className="space-y-6">
            <Split label="Fijos frente a variables" a={{ label: "Fijos", value: a.fixed.fixed, color: "var(--chart-1)" }} b={{ label: "Variables", value: a.fixed.variable, color: "var(--warning)" }} total={totalFV} />
            <Split label="Necesarios frente a prescindibles" a={{ label: "Necesarios", value: a.essential.essential, color: "var(--income)" }} b={{ label: "Prescindibles", value: a.essential.discretionary, color: "var(--expense)" }} total={totalEss} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Dónde puedes ahorrar" subtitle="Gastos prescindibles (media de 3 meses)" />
          <CardBody className="space-y-3">
            {savingsTips.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay suficientes datos.</p>}
            {savingsTips.map((t) => (
              <div key={t.id} className="flex items-start gap-3">
                <IconBadge name={t.icon} color={t.color} size="sm" />
                <div className="flex-1 text-sm">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{fmt(t.monthly)}/mes · reduciéndolo un 20 % ahorrarías <b className="text-income">{fmt(t.monthly * 0.2 * 12, { decimals: false })}/año</b></p>
                </div>
              </div>
            ))}
            {savingsTips.length > 0 && <p className="flex gap-2 rounded-xl bg-accent p-3 text-xs text-accent-foreground"><Lightbulb className="size-4 shrink-0" /> Marca tus categorías como “necesarias” en Categorías para afinar este análisis.</p>}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Evolución del patrimonio" />
          <CardBody><NetWorthChart data={a.nw} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Previsión de ahorro" subtitle={`Según tu media de los últimos 3 meses: ${fmt(a.forecast.monthlyAverage)}/mes`} />
          <CardBody><ForecastLine data={a.forecast.projection.map((v, i) => ({ label: formatMonth(format(subMonths(fromISO(today), -(i + 1)), "yyyy-MM"), "MMM yy"), value: v }))} /></CardBody>
        </Card>
      </div>
    </div>
  );
}

function Split({ label, a, b, total }: { label: string; a: { label: string; value: number; color: string }; b: { label: string; value: number; color: string }; total: number }) {
  const pa = total > 0 ? (a.value / total) * 100 : 0;
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        <div style={{ width: `${pa}%`, background: a.color }} className="transition-all duration-700" />
        <div style={{ width: `${total > 0 ? 100 - pa : 0}%`, background: b.color }} className="transition-all duration-700" />
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <span><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: a.color }} />{a.label} <b className="tabular"><Money value={a.value} decimals={false} /></b> <span className="text-xs text-muted-foreground">{Math.round(pa)} %</span></span>
        <span><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: b.color }} />{b.label} <b className="tabular"><Money value={b.value} decimals={false} /></b></span>
      </div>
    </div>
  );
}
