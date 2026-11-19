"use client";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { formatDate, formatMonth } from "@/core/dates";
import { formatUnitPrice } from "@/core/products";
import type { CategoryTotal, MonthPoint } from "@/core/finance";
import { useMoney } from "@/components/ui/money";

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;

function TooltipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: string; color: string }[] }) {
  return (
    <div className="min-w-36 rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-semibold capitalize">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-full" style={{ background: r.color }} />{r.label}</span>
          <span className="tabular font-medium">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TipProps = { active?: boolean; payload?: ReadonlyArray<{ name?: string | number; value?: unknown; color?: string; payload?: any }>; label?: string | number };

/** Ingresos vs gastos por mes (área). */
export function IncomeExpenseChart({ data, height = 240 }: { data: MonthPoint[]; height?: number }) {
  const fmt = useMoney();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--income)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--income)" stopOpacity={0} /></linearGradient>
          <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--expense)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--expense)" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
        <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m, "MMM")} {...axis} />
        <YAxis tickFormatter={(v) => fmt(v, { compact: true })} width={56} {...axis} />
        <Tooltip cursor={{ stroke: "var(--border)" }} content={({ active, payload, label }: TipProps) =>
          active && payload?.length ? <TooltipBox title={formatMonth(String(label), "MMMM yyyy")} rows={payload.map((p) => ({ label: String(p.name ?? ""), value: fmt(Number(p.value)), color: p.color ?? "" }))} /> : null} />
        <Area type="monotone" dataKey="income" name="Ingresos" stroke="var(--income)" strokeWidth={2.2} fill="url(#gInc)" />
        <Area type="monotone" dataKey="expense" name="Gastos" stroke="var(--expense)" strokeWidth={2.2} fill="url(#gExp)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Barras mensuales agrupadas (comparativa). */
export function MonthlyBars({ data, height = 240, keys }: { data: object[]; height?: number; keys: { key: string; name: string; color: string }[] }) {
  const fmt = useMoney();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axis} />
        <YAxis tickFormatter={(v) => fmt(v, { compact: true })} width={56} {...axis} />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={({ active, payload, label }: TipProps) =>
          active && payload?.length ? <TooltipBox title={String(label)} rows={payload.map((p) => ({ label: String(p.name ?? ""), value: fmt(Number(p.value)), color: p.color ?? "" }))} /> : null} />
        {keys.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {keys.map((k) => <Bar key={k.key} dataKey={k.key} name={k.name} fill={k.color} radius={[6, 6, 0, 0]} maxBarSize={28} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Línea de patrimonio. */
export function NetWorthChart({ data, height = 220 }: { data: { month: string; value: number }[]; height?: number }) {
  const fmt = useMoney();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs><linearGradient id="gNw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
        <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m, "MMM")} {...axis} />
        <YAxis tickFormatter={(v) => fmt(v, { compact: true })} width={56} domain={["auto", "auto"]} {...axis} />
        <Tooltip content={({ active, payload, label }: TipProps) =>
          active && payload?.length ? <TooltipBox title={formatMonth(String(label), "MMMM yyyy")} rows={[{ label: "Patrimonio", value: fmt(Number(payload[0].value)), color: "var(--chart-1)" }]} /> : null} />
        <Area type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2.4} fill="url(#gNw)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Donut de categorías con leyenda interactiva. */
export function CategoryDonut({ data, height = 220, onSelect, center }: { data: CategoryTotal[]; height?: number; onSelect?: (c: CategoryTotal) => void; center?: ReactNode }) {
  const fmt = useMoney();
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((s, c) => s + c.amount, 0);
  const rows = rest > 0 ? [...top, { id: "__rest", name: "Otras", color: "#94a3b8", icon: "tag", amount: rest, share: data.slice(7).reduce((s, c) => s + c.share, 0), count: 0 }] : top;
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="amount" nameKey="name" innerRadius="68%" outerRadius="96%" paddingAngle={2} stroke="none" cornerRadius={6}
            onClick={(d: { payload?: CategoryTotal }) => d.payload && d.payload.id !== "__rest" && onSelect?.(d.payload)} className={onSelect ? "cursor-pointer" : ""}>
            {rows.map((r) => <Cell key={r.id ?? "none"} fill={r.color} />)}
          </Pie>
          <Tooltip content={({ active, payload }: TipProps) => {
            const p = payload?.[0]?.payload as CategoryTotal | undefined;
            return active && p ? <TooltipBox title={p.name} rows={[{ label: `${p.share.toFixed(1).replace(".", ",")} %`, value: fmt(p.amount), color: p.color }]} /> : null;
          }} />
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{center}</div>}
    </div>
  );
}

/** Barras horizontales simples (p. ej. días de la semana). */
export function SimpleBars({ data, height = 200, color = "var(--chart-1)" }: { data: { name: string; amount: number }[]; height?: number; color?: string }) {
  const fmt = useMoney();
  const max = Math.max(...data.map((d) => d.amount));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <XAxis dataKey="name" {...axis} />
        <YAxis hide />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={({ active, payload, label }: TipProps) =>
          active && payload?.length ? <TooltipBox title={String(label)} rows={[{ label: "Gasto", value: fmt(Number(payload[0].value)), color }]} /> : null} />
        <Bar dataKey="amount" radius={[8, 8, 8, 8]} maxBarSize={36}>
          {data.map((d) => <Cell key={d.name} fill={color} fillOpacity={d.amount === max ? 1 : 0.35} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ForecastLine({ data, height = 200 }: { data: { label: string; value: number }[]; height?: number }) {
  const fmt = useMoney();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axis} />
        <YAxis tickFormatter={(v) => fmt(v, { compact: true })} width={56} {...axis} />
        <Tooltip content={({ active, payload, label }: TipProps) =>
          active && payload?.length ? <TooltipBox title={String(label)} rows={[{ label: "Ahorro acumulado", value: fmt(Number(payload[0].value)), color: "var(--income)" }]} /> : null} />
        <Line type="monotone" dataKey="value" stroke="var(--income)" strokeWidth={2.4} strokeDasharray="6 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Evolución del precio unitario de un producto (un punto por compra). */
export function PriceHistoryChart({ data, height = 180, unit }: { data: { date: string; price: number; merchant: string | null }[]; height?: number; unit: string }) {
  const fmt = useMoney();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={(d) => formatDate(String(d), "d MMM")} minTickGap={24} {...axis} />
        <YAxis tickFormatter={(v) => fmt(v)} width={64} domain={["auto", "auto"]} {...axis} />
        <Tooltip content={({ active, payload }: TipProps) => {
          const p = payload?.[0]?.payload as { date: string; price: number; merchant: string | null } | undefined;
          return active && p ? <TooltipBox title={formatDate(p.date)} rows={[{ label: p.merchant ?? "Sin comercio", value: formatUnitPrice(p.price, unit, fmt), color: "var(--chart-1)" }]} /> : null;
        }} />
        <Line type="monotone" dataKey="price" stroke="var(--chart-1)" strokeWidth={2.2} dot={{ r: 3, fill: "var(--chart-1)" }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
