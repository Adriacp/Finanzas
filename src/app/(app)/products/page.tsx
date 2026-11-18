"use client";
import { ArrowRight, Pencil, Plus, Search, ShoppingBasket, Store, TrendingDown, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDate, PERIOD_LABELS, type PeriodKey, periodRange } from "@/core/dates";
import { PRODUCT_UNITS } from "@/core/defaults";
import { normalize } from "@/core/insights";
import { findProductByName, productStats, type ProductStat } from "@/core/products";
import type { Product } from "@/core/types";
import { productSchema, fieldErrors } from "@/core/validation";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { useTxDialog } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Money, useMoney } from "@/components/ui/money";
import { PriceHistoryChart } from "@/components/charts/charts";
import { CategorySelect } from "@/components/forms/pickers";
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

  const range = period === "all" ? undefined : periodRange(period);
  const stats = useMemo(() => productStats(d.products, d.transactionItems, d.transactions, range), [d.products, d.transactionItems, d.transactions, range?.from, range?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const n = normalize(q);
    return stats
      .filter((s) => !n || normalize(s.product.name).includes(n))
      .sort((a, b) => b.total - a.total || b.count - a.count || a.product.name.localeCompare(b.product.name, "es"));
  }, [stats, q]);
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
        {current && <ProductDetail s={current} onEdit={() => setEditing(current.product)} periodLabel={period === "all" ? "Todo el historial" : PERIOD_LABELS[period]} />}
      </Modal>
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Nuevo producto" : "Editar producto"} size="sm">
        {editing && <ProductForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing}
          onClose={(deleted) => { setEditing(null); if (deleted) setDetail(null); }} />}
      </Modal>
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

function ProductDetail({ s, onEdit, periodLabel }: { s: ProductStat; onEdit: () => void; periodLabel: string }) {
  const d = useData();
  const fmt = useMoney();
  const openEdit = useTxDialog((x) => x.openEdit);
  const unit = s.product.unit;
  const history = [...s.purchases].reverse().map((p) => ({ date: p.date, price: p.unitPrice, merchant: p.merchant }));
  const category = d.categories.find((c) => c.id === s.product.categoryId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{periodLabel} · se mide en {unit}{category ? ` · ${category.name}` : ""}</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit}><Pencil /> Editar</Button>
          <Link href={`/transactions?product=${s.product.id}`}><Button variant="secondary" size="sm">Ver movimientos <ArrowRight /></Button></Link>
        </div>
      </div>

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
                    <span className="min-w-0 flex-1 truncate">{p.merchant ?? "Sin comercio"}</span>
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

function ProductForm({ initial, onClose }: { initial: Product | null; onClose: (deleted?: boolean) => void }) {
  const d = useData();
  const { save, remove } = useFinance();
  const [p, setP] = useState<Product>(initial ?? { id: newId(), name: "", unit: "ud", categoryId: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const uses = d.transactionItems.filter((i) => i.productId === p.id).length;

  async function submit() {
    const row = { ...p, name: p.name.trim() };
    const r = productSchema.safeParse(row);
    if (!r.success) return setErrors(fieldErrors(r.error));
    const clash = findProductByName(d.products, row.name);
    if (clash && clash.id !== row.id) return setErrors({ name: "Ya tienes un producto con ese nombre" });
    try { await save("products", row); toast.success("Producto guardado"); onClose(); }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }); }
  }

  async function del() {
    const msg = uses > 0
      ? `Este producto aparece en ${uses} compras. Las compras se conservan con su nombre, pero dejarán de contar en sus estadísticas. ¿Eliminarlo?`
      : "¿Eliminar este producto?";
    if (!confirm(msg)) return;
    try { await remove("products", p.id); toast.success("Producto eliminado"); onClose(true); }
    catch (e) { toast.error("No se pudo eliminar", { description: (e as Error).message }); }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <Field label="Nombre" error={errors.name}><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Ej. Huevos camperos" autoFocus maxLength={80} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Se compra por">
          <Select value={p.unit} onChange={(e) => setP({ ...p, unit: e.target.value })}>
            {[...new Set([...PRODUCT_UNITS, p.unit])].map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="Categoría (opcional)">
          <CategorySelect categories={d.categories} kind="expense" value={p.categoryId} onChange={(v) => setP({ ...p, categoryId: v })} includeAll />
        </Field>
      </div>
      <div className={cn("flex gap-2", !initial && "justify-end")}>
        {initial && <Button variant="ghost" className="text-expense" onClick={del}>Eliminar</Button>}
        <Button type="submit" className="ml-auto">Guardar</Button>
      </div>
    </form>
  );
}
