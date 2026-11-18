"use client";
import { Command } from "cmdk";
import { Check, ChevronDown, Plus, Search, ShoppingBasket, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { normalize } from "@/core/insights";
import { parseAmount, round2 } from "@/core/money";
import { findProductByName, formatOptions, formatPackage, itemsTotal, lastUnitPrice, lineTotal, packageUnitsFor, productsByUsage, supportsPackages, toBaseUnit, usedPackageSizes } from "@/core/products";
import { ProductDialog } from "./product-dialog";
import type { Product, TransactionItem } from "@/core/types";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ResponsivePicker, useIsDesktop } from "@/components/ui/overlay";
import { useMoney } from "@/components/ui/money";
import { cn } from "@/lib/utils";

/** Número a texto en formato español: mínimo 2 decimales para importes (2,30), hasta `max` si hacen falta (4,975). */
const num = (n: number, max = 3, min = 0) =>
  Number.isFinite(n) ? n.toLocaleString("es-ES", { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: false }) : "";
const inputCls =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-right tabular text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15";

/**
 * Desglose opcional de un movimiento por productos (p. ej. huevos, leche…).
 * Cantidad × precio = total; al editar el total se recalcula el precio unitario.
 *
 * Automático:
 *  - Si ya has escrito el importe del movimiento, la última línea añadida se queda con lo que falta
 *    (con un solo producto, su total es el importe entero). Al escribir su precio a mano deja de ser automática.
 *  - Si no has escrito el importe, el importe sigue a la suma de las líneas.
 */
export function ItemsEditor({ items, onChange, amount, amountManual, onSyncAmount, onUseSum }: {
  items: TransactionItem[];
  onChange: (items: TransactionItem[]) => void;
  /** Importe total del movimiento (para comparar con la suma de las líneas) */
  amount: number;
  /** El importe lo ha escrito el usuario (si no, el importe sigue a la suma de las líneas) */
  amountManual: boolean;
  onSyncAmount: (sum: number) => void;
  onUseSum: (sum: number) => void;
}) {
  const d = useData();
  const fmt = useMoney();
  const sum = itemsTotal(items);
  const diff = round2(amount - sum);
  // Línea que se queda con «lo que falta» y líneas con precio puesto a mano
  const [autoId, setAutoId] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(() => new Set(items.map((i) => i.id)));

  // Importe escrito: la línea automática toma el resto (importe − resto de líneas)
  useEffect(() => {
    if (!amountManual) return;
    let target = autoId;
    // Un único producto sin precio propio: su total es el importe completo
    if (!target && items.length === 1 && !touched.has(items[0].id)) { setAutoId(items[0].id); target = items[0].id; }
    if (!target) return;
    const line = items.find((i) => i.id === target);
    if (!line) return;
    const rest = Math.max(0, round2(amount - itemsTotal(items.filter((i) => i.id !== target))));
    if (Math.abs(line.amount - rest) < 0.005) return;
    onChange(items.map((i) => (i.id === target ? { ...i, amount: rest, unitPrice: i.quantity > 0 ? Math.round((rest / i.quantity) * 1e4) / 1e4 : rest } : i)));
  }, [amountManual, amount, autoId, items, touched]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sin importe escrito: el importe del movimiento es la suma de las líneas
  useEffect(() => {
    if (!amountManual && items.length > 0 && sum > 0 && Math.abs(sum - amount) >= 0.005) onSyncAmount(sum);
  }, [amountManual, sum]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (id: string, patch: Partial<TransactionItem>) => onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => { if (id === autoId) setAutoId(null); onChange(items.filter((it) => it.id !== id)); };
  const markManual = (id: string) => {
    setTouched((t) => new Set(t).add(id));
    if (id === autoId) setAutoId(null);
  };
  const add = () => {
    const line: TransactionItem = { id: newId(), transactionId: "", productId: null, name: "", quantity: 1, unitPrice: 0, amount: 0, sortOrder: items.length };
    // La anterior línea automática se queda con su valor; la nueva pasa a llevarse lo que falte
    setAutoId(amountManual ? line.id : null);
    if (autoId) setTouched((t) => new Set(t).add(autoId));
    onChange([...items, line]);
  };

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
          Opcional: apunta lo que has comprado (huevos, leche…) y su precio para ver cuánto gastas en cada producto y dónde te sale más barato.
        </p>
      )}
      {items.map((it) => (
        <ItemRow key={it.id} item={it} isAuto={amountManual && it.id === autoId} onManual={() => markManual(it.id)}
          onChange={(p) => update(it.id, p)} onRemove={() => remove(it.id)} history={d} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={add}><Plus /> Añadir producto</Button>
        {items.length > 0 && (
          <div className="ml-auto text-right text-xs">
            <p>Suma: <b className="tabular">{fmt(sum)}</b></p>
            {amount > 0 && Math.abs(diff) >= 0.01 && (
              <p className={cn("tabular", diff < 0 ? "text-expense" : "text-muted-foreground")}>
                {diff > 0 ? `Sin desglosar: ${fmt(diff)}` : `La suma supera el importe en ${fmt(-diff)}`}
              </p>
            )}
          </div>
        )}
      </div>
      {items.length > 0 && sum > 0 && Math.abs(diff) >= 0.01 && (
        <Button variant="ghost" size="sm" className="text-primary" onClick={() => onUseSum(sum)}>
          Usar la suma ({fmt(sum)}) como importe
        </Button>
      )}
    </div>
  );
}

const NONE = "__none__";
const NEW = "__new__";
const OTHER = "__other__";

function ItemRow({ item, isAuto, onManual, onChange, onRemove, history }: {
  item: TransactionItem;
  /** Su total se calcula solo (lo que falta del importe) */
  isAuto: boolean;
  onManual: () => void;
  onChange: (patch: Partial<TransactionItem>) => void;
  onRemove: () => void;
  history: ReturnType<typeof useData>;
}) {
  const fmt = useMoney();
  const { save, variantsSupported, itemFormatsSupported } = useFinance();
  // Producto de la línea: puede ser el genérico («Bebida energética») o una marca suya («Powerking»)
  const product = history.products.find((p) => p.id === item.productId);
  const root = product?.parentId ? history.products.find((p) => p.id === product.parentId) ?? product : product;
  const brands = root ? history.products.filter((p) => p.parentId === root.id).sort((a, b) => a.name.localeCompare(b.name, "es")) : [];
  const unit = product?.unit ?? "ud";
  // Formato de esta compra (p. ej. lata de 500 ml = 0,5 l). Sin la migración 0004 se usa el habitual de la marca.
  const size = itemFormatsSupported ? (item.packageSize && item.packageSize > 0 ? item.packageSize : null) : product?.packageSize ?? null;
  const packs = size ? item.quantity / size : item.quantity;
  const packPrice = size ? item.unitPrice * size : item.unitPrice;
  const [askBrand, setAskBrand] = useState(false);
  const [askFormat, setAskFormat] = useState(false);

  // Texto mientras se escribe; el resto del tiempo se muestran los valores calculados
  const [editing, setEditing] = useState<{ field: "q" | "p" | "t"; text: string } | null>(null);
  const shown = (field: "q" | "p" | "t") => {
    if (editing?.field === field) return editing.text;
    if (field === "q") return packs ? num(packs, 3) : "";
    if (field === "p") return packPrice ? num(packPrice, 3, 2) : "";
    return item.amount ? num(item.amount, 2, 2) : "";
  };

  function onType(field: "q" | "p" | "t", text: string) {
    setEditing({ field, text });
    const v = parseAmount(text);
    if (v === null) return;
    if (field === "p" || field === "t") onManual();
    if (field === "q" && v > 0) {
      const quantity = size ? Math.round(v * size * 1e6) / 1e6 : v;
      onChange({ quantity, amount: size ? round2(v * packPrice) : lineTotal(quantity, item.unitPrice) });
    }
    if (field === "p") {
      const unitPrice = size ? Math.round((v / size) * 1e4) / 1e4 : v;
      onChange({ unitPrice, amount: size ? round2(packs * v) : lineTotal(item.quantity, v) });
    }
    if (field === "t") onChange({ amount: round2(v), unitPrice: item.quantity > 0 ? Math.round((v / item.quantity) * 1e4) / 1e4 : v });
  }

  /** Formato que se propone al elegir un producto/marca: el último usado, o su formato habitual */
  const defaultSize = (p: Product): number | null => {
    if (!itemFormatsSupported) return p.packageSize ?? null;
    const last = usedPackageSizes(p.id, history.transactionItems, history.transactions)[0];
    return last ?? p.packageSize ?? null;
  };

  /** Cambiar el producto o la marca conservando cuántos envases/unidades se apuntaron */
  function applyProduct(p: Product) {
    const newSize = defaultSize(p);
    const n = packs || 1;
    const quantity = newSize ? Math.round(n * newSize * 1e6) / 1e6 : size ? item.quantity || 1 : n;
    if (isAuto) return onChange({ productId: p.id, name: p.name, quantity, packageSize: newSize });
    const unitPrice = lastUnitPrice(p.id, history.transactionItems, history.transactions) ?? item.unitPrice ?? 0;
    onChange({ productId: p.id, name: p.name, quantity, packageSize: newSize, unitPrice, amount: lineTotal(quantity, unitPrice) });
  }

  /** Cambiar el formato de esta compra (se mantienen los envases y el precio por envase) */
  function changeFormat(newSize: number | null) {
    if (!newSize) return onChange({ packageSize: null });
    const n = packs || 1;
    const quantity = Math.round(n * newSize * 1e6) / 1e6;
    if (isAuto || !packPrice) return onChange({ packageSize: newSize, quantity });
    onChange({ packageSize: newSize, quantity, unitPrice: Math.round((packPrice / newSize) * 1e4) / 1e4, amount: round2(n * packPrice) });
  }

  async function createBrand(name: string) {
    if (!root) return;
    const clash = brands.find((b) => normalize(b.name) === normalize(name));
    if (clash) { applyProduct(clash); return; }
    const p: Product = { id: newId(), name, unit: root.unit, categoryId: root.categoryId, parentId: root.id, packageSize: null };
    try {
      await save("products", p);
      toast.success(`Marca «${name}» añadida a ${root.name}`);
      applyProduct(p);
    } catch (e) {
      toast.error("No se pudo crear la marca", { description: (e as Error).message });
    }
  }

  const showBrand = !!root && variantsSupported;
  const usedSizes = product ? [...usedPackageSizes(product.id, history.transactionItems, history.transactions), product.packageSize, root?.packageSize] : [];
  const showFormat = !!product && itemFormatsSupported && (supportsPackages(unit) || usedSizes.some((x) => x && x > 0));
  const formats = showFormat ? formatOptions(unit, [...usedSizes, size]) : [];

  return (
    <div className="rounded-xl border border-border p-2 animate-in">
      <div className="flex items-center gap-1.5">
        <ProductPicker value={root?.id ?? null} name={root?.name ?? item.name} onPick={applyProduct} />
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Quitar ${item.name || "línea"}`} className="shrink-0 text-muted-foreground hover:text-expense"><Trash2 /></Button>
      </div>

      {(showBrand || showFormat) && (
        <div className={cn("mt-1.5 grid gap-1.5", showBrand && showFormat ? "grid-cols-2" : "grid-cols-1")}>
          {showBrand && (
            <label className="min-w-0">
              <span className="mb-0.5 block text-[10px] text-muted-foreground">Marca</span>
              <Select className="h-10 md:h-10" value={product?.parentId ? product.id : NONE} aria-label="Marca"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === NEW) return setAskBrand(true);
                  const target = v === NONE ? root : brands.find((b) => b.id === v);
                  if (target) applyProduct(target);
                }}>
                <option value={NONE}>Sin marca</option>
                {brands.map((b) => <option key={b.id} value={b.id} data-description={b.packageSize ? `habitual ${formatPackage(b.packageSize, b.unit)}` : undefined}>{b.name}</option>)}
                <option value={NEW} data-icon="plus" data-color="#6366f1">Nueva marca…</option>
              </Select>
            </label>
          )}
          {showFormat && (
            <label className="min-w-0">
              <span className="mb-0.5 block text-[10px] text-muted-foreground">Formato</span>
              <Select className="h-10 md:h-10" value={size ? String(Math.round(size * 1e6) / 1e6) : NONE} aria-label="Formato"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === OTHER) return setAskFormat(true);
                  changeFormat(v === NONE ? null : Number(v));
                }}>
                <option value={NONE} data-description={`apuntas la cantidad en ${unit}`}>Sin formato</option>
                {formats.map((f) => <option key={f.size} value={String(f.size)} data-description={f.used ? "ya usado" : undefined}>{formatPackage(f.size, unit)}</option>)}
                <option value={OTHER} data-icon="plus" data-color="#6366f1">Otro tamaño…</option>
              </Select>
            </label>
          )}
        </div>
      )}

      <div className="mt-1.5 grid grid-cols-[1fr_1.2fr_1.2fr] gap-1.5">
        <label className="min-w-0">
          <span className="mb-0.5 block truncate text-[10px] text-muted-foreground">{size ? "Envases" : `Cantidad (${unit})`}</span>
          <input inputMode="decimal" className={inputCls} value={shown("q")} placeholder="1"
            onFocus={() => setEditing({ field: "q", text: num(packs, 3) })} onChange={(e) => onType("q", e.target.value)} onBlur={() => setEditing(null)} />
        </label>
        <label className="min-w-0">
          <span className="mb-0.5 block truncate text-[10px] text-muted-foreground">{size ? "Precio / envase" : `Precio / ${unit}`}</span>
          <input inputMode="decimal" className={inputCls} value={shown("p")} placeholder="0,00"
            onFocus={() => setEditing({ field: "p", text: packPrice ? num(packPrice, 3) : "" })} onChange={(e) => onType("p", e.target.value)} onBlur={() => setEditing(null)} />
        </label>
        <label className="min-w-0">
          <span className="mb-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
            Total {isAuto && <span className="rounded bg-accent px-1 font-medium text-accent-foreground" title="Lo que falta del importe">auto</span>}
          </span>
          <input inputMode="decimal" className={cn(inputCls, "font-semibold")} value={shown("t")} placeholder="0,00"
            onFocus={() => setEditing({ field: "t", text: item.amount ? num(item.amount, 2) : "" })} onChange={(e) => onType("t", e.target.value)} onBlur={() => setEditing(null)} />
        </label>
      </div>
      {size && item.quantity > 0 && (
        <p className="mt-1 px-0.5 text-[11px] text-muted-foreground tabular">
          {num(packs, 3)} × {formatPackage(size, unit)} = {num(item.quantity, 3)} {unit}
          {item.unitPrice > 0 && <> · <b className="text-foreground">{fmt(item.unitPrice)}/{unit}</b></>}
        </p>
      )}

      <NameDialog open={askBrand} onOpenChange={setAskBrand} title={`Nueva marca de ${root?.name ?? ""}`} placeholder="Ej. Burn"
        hint="Se añade como marca de este producto y se compara con las demás por precio por unidad. El tamaño lo eliges en cada compra."
        onSubmit={(name) => { setAskBrand(false); createBrand(name); }} />
      <FormatDialog open={askFormat} onOpenChange={setAskFormat} unit={unit}
        onSubmit={(s) => { setAskFormat(false); changeFormat(s); }} />
    </div>
  );
}

/** Pide un nombre (p. ej. una marca nueva) en una hoja/diálogo pequeño. */
function NameDialog({ open, onOpenChange, title, placeholder, hint, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; placeholder: string; hint: string; onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => { if (open) setName(""); }, [open]);
  const ok = name.trim().length > 0;
  const submit = () => ok && onSubmit(name.trim().replace(/\s+/g, " ").slice(0, 80));
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={!ok}>Añadir</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} autoFocus maxLength={80} />
        <p className="text-xs text-muted-foreground">{hint}</p>
      </form>
    </Modal>
  );
}

/** Tamaño de envase a medida (p. ej. 750 ml) para una compra concreta. */
function FormatDialog({ open, onOpenChange, unit, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; unit: string; onSubmit: (size: number) => void;
}) {
  const units = packageUnitsFor(unit);
  const [text, setText] = useState("");
  const [u, setU] = useState(units[0].unit);
  const touched = useRef(false);
  useEffect(() => { if (open) { setText(""); setU(units[0].unit); touched.current = false; } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // La unidad se deduce del número mientras no se elija a mano: 750 → ml, 1,5 → l
  useEffect(() => {
    if (touched.current) return;
    const v = parseAmount(text);
    if (v === null || v <= 0) return;
    const g = unit === "l" ? (v >= 20 ? "ml" : "l") : unit === "kg" ? (v >= 10 ? "g" : "kg") : unit === "docena" ? (v > 1 ? "ud" : "docena") : unit;
    if (units.some((x) => x.unit === g)) setU(g);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = parseAmount(text);
  const base = v && v > 0 ? toBaseUnit(v, u, unit) : null;
  const submit = () => base && onSubmit(base);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Tamaño del envase" size="sm"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={!base}>Usar</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-2">
        <div className="flex gap-2">
          <Input inputMode="decimal" className="flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder={unit === "l" ? "750" : unit === "kg" ? "400" : "1"} autoFocus />
          <Select className="w-24" value={u} onChange={(e) => { touched.current = true; setU(e.target.value); }} aria-label="Unidad del envase">
            {units.map((x) => <option key={x.unit} value={x.unit}>{x.unit}</option>)}
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">{base ? `Cada envase = ${formatPackage(base, unit)}` : `Contenido de un envase; el precio se compara por ${unit}.`}</p>
      </form>
    </Modal>
  );
}

/** Selector de producto con buscador; si no existe, permite crearlo al momento. */
function ProductPicker({ value, name, onPick }: { value: string | null; name: string; onPick: (p: Product) => void }) {
  const d = useData();
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const parentName = useMemo(() => new Map(d.products.map((p) => [p.id, p.name])), [d.products]);
  const sorted = useMemo(() => productsByUsage(d.products, d.transactionItems), [d.products, d.transactionItems]);
  const shown = useMemo(() => {
    const n = normalize(q);
    // Busca también por el producto genérico: «energética» muestra Powerking y V
    return (n ? sorted.filter((p) => normalize(`${p.name} ${p.parentId ? parentName.get(p.parentId) ?? "" : ""}`).includes(n)) : sorted).slice(0, 80);
  }, [sorted, q, parentName]);
  const exact = q.trim() ? findProductByName(d.products, q) : undefined;

  /** Crear abre el diálogo para elegir unidad, si es variante de otro producto y su formato */
  function create() {
    const nameNew = q.trim().slice(0, 80);
    if (!nameNew) return;
    setOpen(false);
    setQ("");
    setCreating(nameNew);
  }

  const trigger = (
    <button type="button" onClick={() => !desktop && setOpen(true)} aria-haspopup="listbox" aria-expanded={open}
      className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-card px-2.5 text-left text-sm hover:border-foreground/25 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 cursor-pointer">
      <ShoppingBasket className="size-4 shrink-0 text-muted-foreground" />
      <span className={cn("min-w-0 flex-1 truncate", !name && "text-muted-foreground")}>{name || "Elige un producto"}</span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );

  return (
    <>
    <ResponsivePicker open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }} desktop={desktop} title="Producto" trigger={trigger}
      contentClassName="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
      <Command shouldFilter={false} loop className="outline-none">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Command.Input value={q} onValueChange={setQ} autoFocus={desktop} placeholder="Buscar o crear producto…"
            className="h-11 w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
        </div>
        <Command.List className={cn("overflow-y-auto overscroll-contain p-1.5", desktop && "max-h-72")}>
          {q.trim() && !exact && (
            <Command.Item value="__create" onSelect={create}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-sm font-medium text-primary data-[selected=true]:bg-muted">
              <Plus className="size-4" /> Crear «{q.trim()}»
            </Command.Item>
          )}
          {shown.length === 0 && !q.trim() && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Aún no tienes productos</p>}
          {shown.map((p) => (
            <Command.Item key={p.id} value={p.id} onSelect={() => { onPick(p); setOpen(false); setQ(""); }}
              className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-sm data-[selected=true]:bg-muted", !desktop && "min-h-12")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.name}</span>
                {p.parentId && <span className="block truncate text-xs text-muted-foreground">{parentName.get(p.parentId)}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{p.packageSize ? formatPackage(p.packageSize, p.unit) : p.unit}</span>
              {p.id === value && <Check className="size-4 text-primary" />}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </ResponsivePicker>
    {/* Fuera del panel del selector: el panel se desmonta al cerrarse */}
    <ProductDialog open={creating !== null} onOpenChange={(o) => !o && setCreating(null)} initial={null} defaultName={creating ?? ""}
      onSaved={(p) => { setCreating(null); onPick(p); }} />
    </>
  );
}
