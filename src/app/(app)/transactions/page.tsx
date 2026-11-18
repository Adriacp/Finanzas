"use client";
import { ArrowLeftRight, Filter, Plus, Search, Star, Trash2, Upload, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { countActiveFilters, filterTransactions, sortTransactions } from "@/core/filters";
import { allTags } from "@/core/insights";
import { itemsByTransaction, withVariants } from "@/core/products";
import type { TxFilters, TxStatus, TxType } from "@/core/types";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { useTxDialog } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useMoney } from "@/components/ui/money";
import { GroupedTransactions } from "@/components/shared";
import { AccountSelect, CategorySelect, SubcategorySelect } from "@/components/forms/pickers";
import { CsvImportDialog } from "@/components/forms/csv-import";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-time";

const TYPE_LABELS: Record<TxType, string> = { expense: "Gastos", income: "Ingresos", transfer: "Transferencias", refund: "Reembolsos" };
const STATUS_LABELS: Record<TxStatus, string> = { paid: "Pagado", pending: "Pendiente", scheduled: "Programado" };
const PAGE = 120;

function TransactionsInner() {
  const d = useData();
  const { save, remove, removeMany } = useFinance();
  const openNew = useTxDialog((s) => s.openNew);
  const fmt = useMoney();
  const params = useSearchParams();
  const router = useRouter();

  const [filters, setFilters] = useState<TxFilters>(() => {
    const f: TxFilters = {};
    if (params.get("q")) f.q = params.get("q")!;
    if (params.get("status")) f.statuses = [params.get("status") as TxStatus];
    if (params.get("category")) f.categoryIds = [params.get("category")!];
    if (params.get("account")) f.accountIds = [params.get("account")!];
    if (params.get("product")) f.productIds = [params.get("product")!];
    if (params.get("from")) f.from = params.get("from")!;
    if (params.get("to")) f.to = params.get("to")!;
    return f;
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showImport, setShowImport] = useState(params.get("import") === "1");
  const [limit, setLimit] = useState(PAGE);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [viewName, setViewName] = useState("");
  const [savingView, setSavingView] = useState(false);

  useEffect(() => { setLimit(PAGE); }, [filters]);

  const itemsMap = useMemo(() => itemsByTransaction(d.transactionItems), [d.transactionItems]);
  // Filtrar por un producto genérico incluye todas sus marcas/variantes
  const effectiveFilters = useMemo(() => (filters.productIds?.length ? { ...filters, productIds: withVariants(filters.productIds, d.products) } : filters), [filters, d.products]);
  const results = useMemo(() => sortTransactions(filterTransactions(d.transactions, effectiveFilters, d.categories, d.accounts, itemsMap)), [d, effectiveFilters, itemsMap]);
  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const t of results) { if (t.type === "income") inc += t.amount; if (t.type === "expense") exp += t.amount; if (t.type === "refund") exp -= t.amount; }
    return { inc, exp };
  }, [results]);
  const active = countActiveFilters(filters);

  const toggle = (id: string, v: boolean) => setSelection((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  async function bulkDelete() {
    if (!confirm(`¿Eliminar ${selection.size} movimiento(s)? Esta acción no se puede deshacer.`)) return;
    try { await removeMany("transactions", [...selection]); toast.success("Movimientos eliminados"); setSelection(new Set()); }
    catch (e) { toast.error("No se pudieron eliminar", { description: (e as Error).message }); }
  }

  async function saveView() {
    if (!viewName.trim()) return;
    try { await save("savedViews", { id: newId(), name: viewName.trim(), filters }); toast.success("Vista guardada"); setSavingView(false); setViewName(""); }
    catch (e) { toast.error("No se pudo guardar la vista", { description: (e as Error).message }); }
  }

  return (
    <div>
      <PageHeader title="Movimientos" subtitle={`${results.length} movimientos · ${fmt(totals.inc)} ingresos · ${fmt(totals.exp)} gastos`}
        actions={<>
          <Button variant="secondary" onClick={() => setShowImport(true)}><Upload /> <span className="hidden sm:inline">Importar CSV</span></Button>
          <Button onClick={() => openNew()}><Plus /> Añadir</Button>
        </>} />

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar concepto, comercio, importe (>50), #etiqueta…" value={filters.q ?? ""} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <Button variant={active ? "subtle" : "secondary"} onClick={() => setShowFilters(true)} className="shrink-0">
          <Filter /> <span className="hidden sm:inline">Filtros</span> {active > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{active}</span>}
        </Button>
      </div>

      {/* Chips de tipo + vistas guardadas */}
      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {(Object.keys(TYPE_LABELS) as TxType[]).map((t) => {
          const on = filters.types?.includes(t);
          return (
            <button key={t} onClick={() => setFilters({ ...filters, types: on ? filters.types!.filter((x) => x !== t) : [...(filters.types ?? []), t] })}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
              {TYPE_LABELS[t]}
            </button>
          );
        })}
        <span className="mx-1 w-px shrink-0 bg-border" />
        {d.savedViews.map((v) => (
          <span key={v.id} className="group inline-flex shrink-0 items-center rounded-full border border-border bg-card text-xs font-medium">
            <button className="flex items-center gap-1 py-1.5 pl-3 pr-1 cursor-pointer" onClick={() => setFilters(v.filters)}><Star className="size-3 text-warning" /> {v.name}</button>
            <button aria-label={`Eliminar vista ${v.name}`} className="pr-2 text-muted-foreground hover:text-expense cursor-pointer" onClick={() => remove("savedViews", v.id)}><X className="size-3" /></button>
          </span>
        ))}
        {(active > 0 || filters.q) && (
          <>
            <button onClick={() => setSavingView(true)} className="shrink-0 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">+ Guardar vista</button>
            <button onClick={() => { setFilters({}); router.replace("/transactions"); }} className="shrink-0 px-2 text-xs text-primary cursor-pointer">Limpiar</button>
          </>
        )}
      </div>

      {selection.size > 0 && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-border bg-card p-2 pl-3 shadow-lg animate-pop lg:top-4">
          <span className="text-sm font-medium tabular whitespace-nowrap">{selection.size} <span className="hidden sm:inline">seleccionados</span><span className="sm:hidden">selec.</span></span>
          <Button variant="ghost" size="sm" onClick={() => setSelection(new Set(results.slice(0, limit).map((t) => t.id)))}>
            <span className="sm:hidden">Todos</span><span className="hidden sm:inline">Seleccionar visibles</span>
          </Button>
          <div className="ml-auto flex shrink-0 gap-1">
            <Button variant="ghost" size="sm" onClick={() => setSelection(new Set())} aria-label="Cancelar selección">
              <X className="sm:hidden" /><span className="hidden sm:inline">Cancelar</span>
            </Button>
            <Button variant="danger" size="sm" onClick={bulkDelete}><Trash2 /> Eliminar</Button>
          </div>
        </div>
      )}

      <Card className="p-2 md:p-3">
        {results.length === 0 ? (
          <EmptyState icon={<ArrowLeftRight />} title={d.transactions.length ? "Sin resultados" : "Aún no hay movimientos"}
            description={d.transactions.length ? "Prueba con otros filtros o términos de búsqueda." : "Registra tu primer gasto o importa el extracto de tu banco."}
            action={!d.transactions.length && <Button onClick={() => openNew()}><Plus /> Añadir movimiento</Button>} />
        ) : (
          <>
            <GroupedTransactions txs={results.slice(0, limit)} selection={selection} onToggle={toggle} />
            {results.length > limit && <div className="p-3 text-center"><Button variant="secondary" onClick={() => setLimit(limit + PAGE)}>Cargar más ({results.length - limit})</Button></div>}
          </>
        )}
      </Card>

      <FiltersDialog open={showFilters} onOpenChange={setShowFilters} value={filters} onChange={setFilters} />
      <CsvImportDialog open={showImport} onOpenChange={(o) => { setShowImport(o); if (!o && params.get("import")) router.replace("/transactions"); }} />

      <Modal open={savingView} onOpenChange={setSavingView} title="Guardar vista favorita" size="sm"
        footer={<><Button variant="secondary" onClick={() => setSavingView(false)}>Cancelar</Button><Button onClick={saveView} disabled={!viewName.trim()}>Guardar</Button></>}>
        <Field label="Nombre de la vista"><Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Ej. Restaurantes este año" autoFocus maxLength={60} onKeyDown={(e) => e.key === "Enter" && saveView()} /></Field>
      </Modal>
    </div>
  );
}

function FiltersDialog({ open, onOpenChange, value, onChange }: { open: boolean; onOpenChange: (o: boolean) => void; value: TxFilters; onChange: (f: TxFilters) => void }) {
  const d = useData();
  const [f, setF] = useState<TxFilters>(value);
  useEffect(() => { if (open) setF(value); }, [open, value]);
  const tags = useMemo(() => allTags(d.transactions), [d.transactions]);
  const parentCat = f.categoryIds?.[0] ?? null;
  const num = (s: string) => (s === "" ? undefined : Number(s.replace(",", ".")));

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Filtros" description="Combina todos los filtros que necesites"
      footer={<><Button variant="secondary" onClick={() => { onChange({ q: value.q }); onOpenChange(false); }}>Restablecer</Button><Button onClick={() => { onChange(f); onOpenChange(false); }}>Aplicar</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <Select value={f.types?.[0] ?? ""} onChange={(e) => setF({ ...f, types: e.target.value ? [e.target.value as TxType] : undefined })}>
            <option value="">Todos</option>{(Object.keys(TYPE_LABELS) as TxType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={f.statuses?.[0] ?? ""} onChange={(e) => setF({ ...f, statuses: e.target.value ? [e.target.value as TxStatus] : undefined })}>
            <option value="">Todos</option>{(Object.keys(STATUS_LABELS) as TxStatus[]).map((t) => <option key={t} value={t}>{STATUS_LABELS[t]}</option>)}
          </Select>
        </Field>
        <Field label="Categoría">
          <CategorySelect categories={d.categories} value={parentCat} placeholder="Todas" onChange={(v) => setF({ ...f, categoryIds: v ? [v] : undefined, subcategoryIds: undefined })} />
        </Field>
        <Field label="Subcategoría">
          <SubcategorySelect categories={d.categories} parentId={parentCat} value={f.subcategoryIds?.[0] ?? null} onChange={(v) => setF({ ...f, subcategoryIds: v ? [v] : undefined })} />
        </Field>
        <Field label="Cuenta">
          <AccountSelect accounts={d.accounts} value={f.accountIds?.[0] ?? null} placeholder="Todas" onChange={(v) => setF({ ...f, accountIds: v ? [v] : undefined })} />
        </Field>
        <Field label="Producto">
          <Select value={f.productIds?.[0] ?? ""} onChange={(e) => setF({ ...f, productIds: e.target.value ? [e.target.value] : undefined })}>
            <option value="">Todos</option>
            {[...d.products].filter((p) => !p.parentId).sort((a, b) => a.name.localeCompare(b.name, "es")).map((g) => {
              const variants = d.products.filter((p) => p.parentId === g.id).sort((a, b) => a.name.localeCompare(b.name, "es"));
              return variants.length ? (
                <optgroup key={g.id} label={g.name}>
                  <option value={g.id}>{g.name} (todas las marcas)</option>
                  {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </optgroup>
              ) : <option key={g.id} value={g.id}>{g.name}</option>;
            })}
          </Select>
        </Field>
        <Field label="Comercio"><Input value={f.merchant ?? ""} onChange={(e) => setF({ ...f, merchant: e.target.value || undefined })} /></Field>
        <Field label="Desde"><DatePicker value={f.from} onChange={(v) => setF({ ...f, from: v ?? undefined })} allowClear placeholder="Cualquiera" /></Field>
        <Field label="Hasta"><DatePicker value={f.to} onChange={(v) => setF({ ...f, to: v ?? undefined })} allowClear placeholder="Cualquiera" /></Field>
        <Field label="Importe mínimo"><Input inputMode="decimal" value={f.minAmount ?? ""} onChange={(e) => setF({ ...f, minAmount: num(e.target.value) })} /></Field>
        <Field label="Importe máximo"><Input inputMode="decimal" value={f.maxAmount ?? ""} onChange={(e) => setF({ ...f, maxAmount: num(e.target.value) })} /></Field>
        <Field label="Fijo / variable">
          <Select value={f.fixed ?? ""} onChange={(e) => setF({ ...f, fixed: (e.target.value || undefined) as TxFilters["fixed"] })}>
            <option value="">Todos</option><option value="fixed">Solo fijos</option><option value="variable">Solo variables</option>
          </Select>
        </Field>
        <Field label="Etiqueta">
          <Select value={f.tags?.[0] ?? ""} onChange={(e) => setF({ ...f, tags: e.target.value ? [e.target.value] : undefined })}>
            <option value="">Todas</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

export default function TransactionsPage() {
  return <Suspense><TransactionsInner /></Suspense>;
}
