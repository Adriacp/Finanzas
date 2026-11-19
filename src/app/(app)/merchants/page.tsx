"use client";
import { Info, Store, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatDate, PERIOD_LABELS, type PeriodKey, periodRange } from "@/core/dates";
import { formatUnitPrice } from "@/core/products";
import { compareMerchants, merchantGroups, type MerchantComparison } from "@/core/merchants";
import { useData } from "@/store/finance-store";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Money, useMoney } from "@/components/ui/money";
import { cn } from "@/lib/utils";

const PERIODS: PeriodKey[] = ["last_3m", "last_6m", "year", "prev_year"];
const pct = (index: number) => Math.round(index - 100);

export default function MerchantsPage() {
  const d = useData();
  const fmt = useMoney();
  const [period, setPeriod] = useState<PeriodKey | "all">("all");
  const range = period === "all" ? undefined : periodRange(period);
  const groups = useMemo(() => merchantGroups(d.transactions, d.categories, range), [d.transactions, d.categories, range?.from, range?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const [groupId, setGroupId] = useState<string>("");
  useEffect(() => { if (!groups.some((g) => g.categoryId === groupId)) setGroupId(groups[0]?.categoryId ?? ""); }, [groups, groupId]);

  const result = useMemo(
    () => (groupId ? compareMerchants(groupId, d.transactions, d.transactionItems, d.products, range) : null),
    [groupId, d.transactions, d.transactionItems, d.products, range?.from, range?.to], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const group = groups.find((g) => g.categoryId === groupId);
  const indexed = result?.merchants.filter((m) => m.priceIndex !== null) ?? [];
  const cheapest = indexed[0];
  const priciest = indexed.length > 1 ? indexed[indexed.length - 1] : undefined;
  const maxDev = Math.max(5, ...indexed.map((m) => Math.abs(m.priceIndex! - 100)));

  return (
    <div className="space-y-5">
      <PageHeader title="Comercios" subtitle="Compara dónde te sale más caro comprar" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tipo de comercio">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={groups.length === 0}>
            {groups.length === 0 && <option value="">Sin datos suficientes</option>}
            {groups.map((g) => <option key={g.categoryId} value={g.categoryId}>{g.name} · {g.merchants} comercios</option>)}
          </Select>
        </Field>
        <Field label="Periodo">
          <Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey | "all")}>
            <option value="all">Todo el historial</option>
            {PERIODS.map((k) => <option key={k} value={k}>{PERIOD_LABELS[k]}</option>)}
          </Select>
        </Field>
      </div>

      {!result || !group ? (
        <Card><EmptyState icon={<Store />} title="Aún no hay comercios que comparar"
          description="Cuando tengas gastos en al menos dos comercios del mismo tipo (p. ej. dos supermercados) con el comercio indicado, aparecerán aquí." /></Card>
      ) : (
        <>
          {cheapest && priciest ? (
            <Card className="grid gap-3 p-4 sm:grid-cols-2">
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-income/15 text-income"><TrendingDown className="size-5" /></span>
                <div><p className="text-xs text-muted-foreground">Más barato en {group.name.toLowerCase()}</p>
                  <p className="font-semibold">{cheapest.name} <span className="text-income">{pct(cheapest.priceIndex!)} %</span></p>
                  <p className="text-xs text-muted-foreground">respecto a la media, en {cheapest.comparedProducts} productos comparados</p></div>
              </div>
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-expense/15 text-expense"><TrendingUp className="size-5" /></span>
                <div><p className="text-xs text-muted-foreground">Más caro en {group.name.toLowerCase()}</p>
                  <p className="font-semibold">{priciest.name} <span className="text-expense">+{pct(priciest.priceIndex!)} %</span></p>
                  <p className="text-xs text-muted-foreground">respecto a la media, en {priciest.comparedProducts} productos comparados</p></div>
              </div>
            </Card>
          ) : (
            <Card className="flex gap-3 p-4 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>Para saber qué comercio es más caro hace falta comparar <b>los mismos productos</b>: añade el «Desglose por productos» en tus compras
                (p. ej. huevos o leche en dos sitios distintos). Mientras tanto se compara el gasto y el ticket medio.</p>
            </Card>
          )}

          <Card>
            <CardHeader title={`Ranking de ${group.name.toLowerCase()}`} subtitle="Del más barato al más caro según el precio de los productos que compras en varios sitios" />
            <CardBody className="space-y-1 px-3">
              {result.merchants.map((m, i) => <MerchantRow key={m.key} m={m} rank={i + 1} maxDev={maxDev} />)}
            </CardBody>
          </Card>

          {result.products.length > 0 && (
            <Card>
              <CardHeader title="Productos con más diferencia de precio" subtitle="Precio medio por unidad en cada comercio" />
              <CardBody className="space-y-3">
                {result.products.slice(0, 30).map((p) => (
                  <div key={p.product.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{p.product.name}</p>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular", p.spreadPct >= 15 ? "bg-expense/15 text-expense" : "bg-warning/15 text-warning")}>
                        +{String(p.spreadPct).replace(".", ",")} %
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Más barato en <b className="text-income">{p.cheapest.merchant}</b> ({formatUnitPrice(p.cheapest.avgUnitPrice, p.product.unit, fmt)}),
                      más caro en <b className="text-expense">{p.priciest.merchant}</b> ({formatUnitPrice(p.priciest.avgUnitPrice, p.product.unit, fmt)})
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.prices.map((x, i) => (
                        <span key={x.merchantKey} className={cn("rounded-lg px-2 py-1 text-[11px] tabular",
                          i === 0 ? "bg-income/12 text-income" : i === p.prices.length - 1 ? "bg-expense/12 text-expense" : "bg-muted text-muted-foreground")}>
                          {x.merchant} {formatUnitPrice(x.avgUnitPrice, p.product.unit, fmt)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function MerchantRow({ m, rank, maxDev }: { m: MerchantComparison; rank: number; maxDev: number }) {
  const fmt = useMoney();
  const dev = m.priceIndex !== null ? m.priceIndex - 100 : null;
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold tabular">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-medium">{m.name}</p>
          {dev !== null ? (
            <span className={cn("shrink-0 text-sm font-semibold tabular", dev < -0.5 ? "text-income" : dev > 0.5 ? "text-expense" : "text-muted-foreground")}>
              {dev > 0 ? "+" : ""}{Math.round(dev)} %
            </span>
          ) : <span className="shrink-0 text-xs text-muted-foreground">sin productos comparables</span>}
        </div>
        {/* Barra centrada en la media: izquierda = más barato, derecha = más caro */}
        {dev !== null && (
          <div className="relative mt-1.5 h-1.5 rounded-full bg-muted">
            <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
            <span className={cn("absolute inset-y-0 rounded-full", dev < 0 ? "bg-income" : "bg-expense")}
              style={dev < 0 ? { right: "50%", width: `${(Math.abs(dev) / maxDev) * 50}%` } : { left: "50%", width: `${(dev / maxDev) * 50}%` }} />
          </div>
        )}
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {m.visits} {m.visits === 1 ? "compra" : "compras"} · ticket medio {fmt(m.avgTicket)} · última {formatDate(m.lastDate, "d MMM yy")}
        </p>
      </div>
      <Money value={m.total} className="shrink-0 text-sm font-semibold" />
    </div>
  );
}
