"use client";
import { ArrowLeft, ArrowRight, Pencil, Plus, Search, ShoppingBasket, Store, TrendingDown, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate, PERIOD_LABELS, type PeriodKey, periodRange } from "@/core/dates";
import { normalize } from "@/core/insights";
import { childrenMap, formatPackage, productStats, type ProductStat } from "@/core/products";
import type { Product } from "@/core/types";
import { useData, useFinance } from "@/store/finance-store";
import { useTxDialog } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Money, useMoney } from "@/components/ui/money";
import { PriceHistoryChart } from "@/components/charts/charts";
import { ProductDialog } from "@/components/forms/product-dialog";
import { cn } from "@/lib/utils";

const PERIODS: PeriodKey[] = ["month", "prev_month", "last_3m", "last_6m", "year", "prev_year"];

export default function ProductsPage() {
  const d = useData();
  const fmt = useMoney();
  const schemaOutdated = useFinance((s) => s.schemaOutdated);
  const [period, setPeriod] = useState<PeriodKey | "all">("year");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [newVariantOf, setNewVariantOf] = useState<string | null>(null);

  const range = period === "all" ? undefined : periodRange(period);
  const stats = useMemo(() => productStats(d.products, d.transactionItems, d.transactions, range), [d.products, d.transactionItems, d.transactions, range?.from, range?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const kids = useMemo(() => childrenMap(d.products), [d.products]);
  const shown = useMemo(() => {
    const n = normalize(q);
    // En la lista van los productos genéricos (sus cifras incluyen todas sus marcas);
    // la búsqueda también encuentra un genérico por el nombre de sus variantes
    return stats
      .filter((s) => !s.product.parentId)
      .filter((s) => !n || normalize([s.product.name, ...(kids.get(s.product.id) ?? []).map((k) => k.name)].join(" ")).includes(n))
      .sort((a, b) => b.total - a.total || b.count - a.count || a.product.name.localeCompare(b.product.name, "es"));
  }, [stats, q, kids]);
  const bought = shown.filter((s) => s.count > 0);
  const notBought = shown.filter((s) => s.count === 0);
  const total = bought.reduce((s, x) => s + x.total, 0);
  const current = detail ? stats.find((s) => s.product.id === detail) ?? null : null;

  return (
    <div>
      <PageHeader title="Productos" subtitle="Cuánto gastas en cada producto y dónde lo compras"
        actions={<Button onClick={() => setEditing("new")} disabled={schemaOutdated}><Plus /> Nuevo producto</Button>} />

      {schemaOutdated && (
        <Card className="mb-4 flex gap-3 border-warning/40 bg-warning/10 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
          <p>Para usar los productos falta actualizar la base de datos: ejecuta en Supabase (SQL Editor) el archivo <code>supabase/migrations/0002_products_balances.sql</code> y recarga la app.</p>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Periodo" className="w-44" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey | "all")}>
          {PERIODS.map((k) => <option key={k} value={k}>{PERIOD_LABELS[k]}</option>)}
          <option value="all">Todo el historial</option>
        </Select>
      </div>

      {bought.length > 0 && (
        <p className="mb-2 text-sm text-muted-foreground">{bought.length} productos comprados · <b className="text-foreground tabular">{fmt(total)}</b> en total</p>
      )}

      {d.products.length === 0 ? (
        <Card><EmptyState icon={<ShoppingBasket />} title="Sin productos" description="Crea productos o añádelos desde el desglose de un movimiento." /></Card>
      ) : (
        <div className="space-y-4">
          {bought.length === 0 && (
            <Card><EmptyState icon={<ShoppingBasket />} title="Aún no hay compras desglosadas en este periodo"
              description="Al añadir un gasto, abre «Desglose por productos» y apunta qué has comprado y a qué precio." /></Card>
          )}
          {bought.length > 0 && (
            <Card className="divide-y divide-border overflow-hidden">
              {bought.map((s) => <ProductRow key={s.product.id} s={s} onClick={() => setDetail(s.product.id)} />)}
            </Card>
          )}
          {notBought.length > 0 && (
            <div>
              <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Sin compras {period === "all" ? "" : "en este periodo"} ({notBought.length})</p>
              <Card className="flex flex-wrap gap-1.5 p-3">
                {notBought.map((s) => (
                  <button key={s.product.id} onClick={() => setDetail(s.product.id)}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
                    {s.product.name}
                  </button>
                ))}
              </Card>
            </div>
          )}
        </div>
      )}

      <Modal open={!!current} onOpenChange={(o) => !o && setDetail(null)} title={current?.product.name ?? ""} size="lg">
        {current && <ProductDetail key={current.product.id} s={current} onEdit={() => setEditing(current.product)} onOpen={setDetail}
          onAddVariant={() => setNewVariantOf(current.product.id)} periodLabel={period === "all" ? "Todo el historial" : PERIOD_LABELS[period]} />}
      </Modal>
      <ProductDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} initial={editing === "new" ? null : editing}
        onDeleted={() => setDetail(null)} />
      <ProductDialog open={!!newVariantOf} onOpenChange={(o) => !o && setNewVariantOf(null)} initial={null} defaultParentId={newVariantOf}
        onSaved={(p) => setDetail(p.parentId ?? p.id)} />
    </div>
  );
}

function ProductRow({ s, onClick }: { s: ProductStat; onClick: () => void }) {
  const fmt = useMoney();
  const usual = s.merchants[0]?.merchant;
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 cursor-pointer">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><ShoppingBasket className="size-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{s.product.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {s.variants.filter((v) => !v.unspecified).length > 0 && `${s.variants.filter((v) => !v.unspecified).length} marcas · `}
          {s.count} {s.count === 1 ? "compra" : "compras"}
          {s.avgUnitPrice !== null && ` · ${fmt(s.avgUnitPrice)}/${s.product.unit} de media`}
          {usual && usual !== "Sin comercio" && ` · sueles comprarlo en ${usual}`}
        </span>
      </span>
      <span className="text-right">
        <Money value={s.total} className="block font-semibold" />
        {s.lastUnitPrice !== null && <span className="block text-[11px] text-muted-foreground tabular">último {fmt(s.lastUnitPrice)}</span>}
      </span>
    </button>
  );
}

function ProductDetail({ s, onEdit, onOpen, onAddVariant, periodLabel }: {
  s: ProductStat; onEdit: () => void; onOpen: (id: string) => void; onAddVariant: () => void; periodLabel: string;
}) {
  const d = useData();
  const fmt = useMoney();
  const variantsSupported = useFinance((x) => x.variantsSupported);
  const openEdit = useTxDialog((x) => x.openEdit);
  const unit = s.product.unit;
  const history = [...s.purchases].reverse().map((p) => ({ date: p.date, price: p.unitPrice, merchant: p.merchant }));
  const category = d.categories.find((c) => c.id === s.product.categoryId);
  const parent = s.product.parentId ? d.products.find((p) => p.id === s.product.parentId) : undefined;
  const productName = new Map(d.products.map((p) => [p.id, p.name]));
  const isGeneric = !s.product.parentId;
  const brands = s.variants.filter((v) => v.avgUnitPrice !== null);

  return (
    <div className="space-y-5">
      {parent && (
        <button onClick={() => onOpen(parent.id)} className="flex items-center gap-1 text-sm font-medium text-primary cursor-pointer">
          <ArrowLeft className="size-4" /> {parent.name}
        </button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {periodLabel} · se mide en {unit}
          {s.product.packageSize ? ` · formato ${formatPackage(s.product.packageSize, unit)}` : ""}
          {category ? ` · ${category.name}` : ""}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit}><Pencil /> Editar</Button>
          {isGeneric && variantsSupported && <Button variant="secondary" size="sm" onClick={onAddVariant}><Plus /> Marca / variante</Button>}
          <Link href={`/transactions?product=${s.product.id}`}><Button variant="secondary" size="sm">Ver movimientos <ArrowRight /></Button></Link>
        </div>
      </div>

      {isGeneric && s.variants.length > 0 && (
        <Card>
          <CardHeader title="Marcas y variantes" subtitle={`Comparadas por precio por ${unit}, de más barata a más cara`} />
          <CardBody className="space-y-1 px-2">
            {s.variants.map((v, i) => (
              <button key={v.product.id + String(v.unspecified)} disabled={v.unspecified} onClick={() => onOpen(v.product.id)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent cursor-pointer">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="truncate">{v.unspecified ? "Sin marca" : v.product.name}</span>
                    {i === 0 && brands.length >= 2 && v.avgUnitPrice !== null && <span className="rounded-full bg-income/15 px-2 py-0.5 text-[10px] font-medium text-income">más barata</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {!v.unspecified && v.product.packageSize ? `${formatPackage(v.product.packageSize, unit)} · ` : ""}
                    {v.count === 0 ? "sin compras en este periodo" : `${v.count} ${v.count === 1 ? "compra" : "compras"}`}
                    {v.cheapestMerchant && v.cheapestMerchant.merchant !== "Sin comercio" && ` · más barata en ${v.cheapestMerchant.merchant} (${fmt(v.cheapestMerchant.avgUnitPrice)}/${unit})`}
                  </span>
                </span>
                <span className="shrink-0 text-right font-semibold tabular">{v.avgUnitPrice !== null ? `${fmt(v.avgUnitPrice)}/${unit}` : "—"}</span>
              </button>
            ))}
          </CardBody>
        </Card>
      )}

      {s.count === 0 ? (
        <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">No hay compras de este producto en este periodo. Añádelo en el desglose de un gasto para empezar a seguir su precio.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Gastado" value={fmt(s.total)} />
            <Stat label="Compras" value={`${s.count} · ${String(s.quantity).replace(".", ",")} ${unit}`} />
            <Stat label={`Precio medio / ${unit}`} value={s.avgUnitPrice !== null ? fmt(s.avgUnitPrice) : "—"} />
            <Stat label="Mín. – máx." value={s.minUnitPrice !== null ? `${fmt(s.minUnitPrice)} – ${fmt(s.maxUnitPrice!)}` : "—"} />
          </div>

          {s.cheapestMerchant && s.merchants[0] && s.cheapestMerchant.merchant !== s.merchants[0].merchant && (
            <div className="flex gap-3 rounded-xl border border-income/30 bg-income/10 p-3 text-sm">
              <TrendingDown className="mt-0.5 size-4 shrink-0 text-income" />
              <p>
                Sueles comprarlo en <b>{s.merchants[0].merchant}</b> ({fmt(s.merchants[0].avgUnitPrice)}/{unit}), pero en <b>{s.cheapestMerchant.merchant}</b> te sale
                a <b>{fmt(s.cheapestMerchant.avgUnitPrice)}/{unit}</b>.
              </p>
            </div>
          )}

          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Store className="size-4" /> Dónde lo compras</span>} />
            <CardBody className="space-y-2">
              {s.merchants.map((m) => (
                <div key={m.merchant} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {m.merchant}
                    {s.cheapestMerchant?.merchant === m.merchant && <span className="ml-2 rounded-full bg-income/15 px-2 py-0.5 text-[10px] font-medium text-income">más barato</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{m.count} {m.count === 1 ? "vez" : "veces"}</span>
                  <span className="w-20 text-right text-xs tabular">{fmt(m.avgUnitPrice)}/{unit}</span>
                  <Money value={m.total} className="w-20 text-right font-medium" />
                </div>
              ))}
            </CardBody>
          </Card>

          {history.length >= 2 && (
            <Card>
              <CardHeader title="Evolución del precio" subtitle={`Precio por ${unit} en cada compra`} />
              <CardBody><PriceHistoryChart data={history} unit={unit} /></CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Compras" />
            <CardBody className="px-2">
              {s.purchases.map((p) => {
                const t = d.transactions.find((x) => x.id === p.transactionId);
                return (
                  <button key={p.itemId} onClick={() => t && openEdit(t)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/60 cursor-pointer">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">{formatDate(p.date, "d MMM yy")}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {p.merchant ?? "Sin comercio"}
                      {p.productId !== s.product.id && <span className="text-xs text-muted-foreground"> · {productName.get(p.productId)}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground tabular">{String(p.quantity).replace(".", ",")} × {fmt(p.unitPrice)}</span>
                    <Money value={p.amount} className="w-20 text-right font-medium" />
                  </button>
                );
              })}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular">{value}</p>
    </div>
  );
}
