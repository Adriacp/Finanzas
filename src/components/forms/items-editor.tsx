"use client";
import { Command } from "cmdk";
import { Check, ChevronDown, Plus, Search, ShoppingBasket, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { normalize } from "@/core/insights";
import { parseAmount, round2 } from "@/core/money";
import { findProductByName, itemsTotal, lastUnitPrice, lineTotal, productsByUsage } from "@/core/products";
import type { Product, TransactionItem } from "@/core/types";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
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

function ItemRow({ item, isAuto, onManual, onChange, onRemove, history }: {
  item: TransactionItem;
  /** Su total se calcula solo (lo que falta del importe) */
  isAuto: boolean;
  onManual: () => void;
  onChange: (patch: Partial<TransactionItem>) => void;
  onRemove: () => void;
  history: ReturnType<typeof useData>;
}) {
  // Texto mientras se escribe; el resto del tiempo se muestran los valores calculados
  const [editing, setEditing] = useState<{ field: "q" | "p" | "t"; text: string } | null>(null);
  const shown = (field: "q" | "p" | "t", value: number) =>
    editing?.field === field ? editing.text : value ? (field === "q" ? num(value, 3) : num(value, field === "p" ? 3 : 2, 2)) : "";

  function onType(field: "q" | "p" | "t", text: string) {
    setEditing({ field, text });
    const v = parseAmount(text);
    if (v === null) return;
    if (field === "q" && v > 0) onChange({ quantity: v, amount: lineTotal(v, item.unitPrice) });
    if (field === "p" || field === "t") onManual();
    if (field === "p") onChange({ unitPrice: v, amount: lineTotal(item.quantity, v) });
    if (field === "t") onChange({ amount: round2(v), unitPrice: item.quantity > 0 ? Math.round((v / item.quantity) * 1e4) / 1e4 : v });
  }

  const pickProduct = (p: Product) => {
    const last = lastUnitPrice(p.id, history.transactionItems, history.transactions);
    // En la línea automática manda el importe; en las demás se propone el último precio pagado
    if (isAuto) return onChange({ productId: p.id, name: p.name });
    const unitPrice = item.unitPrice || last || 0;
    onChange({ productId: p.id, name: p.name, unitPrice, amount: lineTotal(item.quantity, unitPrice) });
  };
  const unit = history.products.find((p) => p.id === item.productId)?.unit ?? "ud";

  return (
    <div className="rounded-xl border border-border p-2 animate-in">
      <div className="flex items-center gap-1.5">
        <ProductPicker value={item.productId} name={item.name} onPick={pickProduct} />
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Quitar ${item.name || "línea"}`} className="shrink-0 text-muted-foreground hover:text-expense"><Trash2 /></Button>
      </div>
      <div className="mt-1.5 grid grid-cols-[1fr_1.2fr_1.2fr] gap-1.5">
        <label className="min-w-0">
          <span className="mb-0.5 block text-[10px] text-muted-foreground">Cantidad ({unit})</span>
          <input inputMode="decimal" className={inputCls} value={shown("q", item.quantity)} placeholder="1"
            onFocus={() => setEditing({ field: "q", text: num(item.quantity, 3) })} onChange={(e) => onType("q", e.target.value)} onBlur={() => setEditing(null)} />
        </label>
        <label className="min-w-0">
          <span className="mb-0.5 block text-[10px] text-muted-foreground">Precio / {unit}</span>
          <input inputMode="decimal" className={inputCls} value={shown("p", item.unitPrice)} placeholder="0,00"
            onFocus={() => setEditing({ field: "p", text: item.unitPrice ? num(item.unitPrice, 3) : "" })} onChange={(e) => onType("p", e.target.value)} onBlur={() => setEditing(null)} />
        </label>
        <label className="min-w-0">
          <span className="mb-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
            Total {isAuto && <span className="rounded bg-accent px-1 font-medium text-accent-foreground" title="Lo que falta del importe">auto</span>}
          </span>
          <input inputMode="decimal" className={cn(inputCls, "font-semibold")} value={shown("t", item.amount)} placeholder="0,00"
            onFocus={() => setEditing({ field: "t", text: item.amount ? num(item.amount, 2) : "" })} onChange={(e) => onType("t", e.target.value)} onBlur={() => setEditing(null)} />
        </label>
      </div>
    </div>
  );
}

/** Selector de producto con buscador; si no existe, permite crearlo al momento. */
function ProductPicker({ value, name, onPick }: { value: string | null; name: string; onPick: (p: Product) => void }) {
  const d = useData();
  const save = useFinance((s) => s.save);
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sorted = useMemo(() => productsByUsage(d.products, d.transactionItems), [d.products, d.transactionItems]);
  const shown = useMemo(() => {
    const n = normalize(q);
    return (n ? sorted.filter((p) => normalize(p.name).includes(n)) : sorted).slice(0, 80);
  }, [sorted, q]);
  const exact = q.trim() ? findProductByName(d.products, q) : undefined;

  async function create() {
    const nameNew = q.trim().slice(0, 80);
    if (!nameNew) return;
    const p: Product = { id: newId(), name: nameNew.charAt(0).toUpperCase() + nameNew.slice(1), unit: "ud", categoryId: null };
    try {
      await save("products", p);
      toast.success(`Producto «${p.name}» creado`);
      onPick(p);
      setOpen(false);
      setQ("");
    } catch (e) {
      toast.error("No se pudo crear el producto", { description: (e as Error).message });
    }
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
    <ResponsivePicker open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }} desktop={desktop} title="Producto" trigger={trigger}
      contentClassName="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
      <Command shouldFilter={false} loop className="outline-none">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Command.Input value={q} onValueChange={setQ} autoFocus={desktop} placeholder="Buscar o crear producto…"
            className="h-11 w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
        </div>
        <Command.List className={cn("overflow-y-auto overscroll-contain p-1.5", desktop ? "max-h-72" : "max-h-[55dvh]")}>
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
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.unit}</span>
              {p.id === value && <Check className="size-4 text-primary" />}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </ResponsivePicker>
  );
}
