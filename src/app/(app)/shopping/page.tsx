"use client";
import { Check, ChevronDown, ListChecks, Minus, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { checkedToItems, bestMerchantForList, estimatedTotal, shoppingInsights, type ShoppingInsight } from "@/core/shopping";
import { itemsTotal } from "@/core/products";
import type { Product, ShoppingItem } from "@/core/types";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { useTxDialog } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { useMoney } from "@/components/ui/money";
import { ProductPicker } from "@/components/forms/items-editor";
import { cn } from "@/lib/utils";

export default function ShoppingPage() {
  const d = useData();
  const fmt = useMoney();
  const { save, removeMany, shoppingSupported } = useFinance();
  const openNew = useTxDialog((s) => s.openNew);
  const [text, setText] = useState("");
  const [showDone, setShowDone] = useState(true);

  const insights = useMemo(
    () => shoppingInsights([...d.shoppingItems].sort((a, b) => a.sortOrder - b.sortOrder), d.products, d.transactionItems, d.transactions),
    [d.shoppingItems, d.products, d.transactionItems, d.transactions],
  );
  const pending = insights.filter((i) => !i.item.checked);
  const done = insights.filter((i) => i.item.checked);
  const total = estimatedTotal(pending);
  const best = useMemo(
    () => bestMerchantForList(pending.map((i) => i.item), d.products, d.transactionItems, d.transactions),
    [d.shoppingItems, d.products, d.transactionItems, d.transactions], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!shoppingSupported) {
    return (
      <>
        <PageHeader title="Lista de la compra" />
        <Card>
          <EmptyState icon={<TriangleAlert />} title="Falta actualizar la base de datos"
            description="Ejecuta supabase/migrations/0005_shopping_list.sql en Supabase → SQL Editor y recarga la app." />
        </Card>
      </>
    );
  }

  const nextOrder = () => d.shoppingItems.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;

  async function guard(p: Promise<unknown>) {
    try { await p; } catch (e) { toast.error("No se pudo guardar", { description: e instanceof Error ? e.message : undefined }); }
  }

  function addProduct(p: Product) {
    const same = d.shoppingItems.find((i) => !i.checked && i.productId === p.id);
    if (same) return void guard(save("shoppingItems", { ...same, quantity: (same.quantity ?? 1) + 1 }));
    void guard(save("shoppingItems", { id: newId(), productId: p.id, name: p.name, quantity: 1, note: null, checked: false, sortOrder: nextOrder() }));
  }

  function addText() {
    const name = text.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) return;
    setText("");
    const known = d.products.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (known) return addProduct(known);
    void guard(save("shoppingItems", { id: newId(), productId: null, name, quantity: 1, note: null, checked: false, sortOrder: nextOrder() }));
  }

  const setItem = (item: ShoppingItem, patch: Partial<ShoppingItem>) => guard(save("shoppingItems", { ...item, ...patch }));

  function finish() {
    const lines = checkedToItems(done, newId);
    const amount = itemsTotal(lines);
    const doneIds = done.map((i) => i.item.id);
    openNew(
      { type: "expense", merchant: best?.merchant ?? null, concept: best ? `Compra ${best.merchant}` : "Compra", amount },
      { items: lines.length ? lines : undefined, onSaved: () => { void guard(removeMany("shoppingItems", doneIds)); } },
    );
  }

  return (
    <>
      <PageHeader title="Lista de la compra" subtitle="Marca lo que vas metiendo en el carro y termina la compra con el desglose hecho" />

      <Card className="mb-4 space-y-2 p-3">
        <div className="flex"><ProductPicker value={null} name="" onPick={addProduct} /></div>
        <form onSubmit={(e) => { e.preventDefault(); addText(); }} className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="…o escribe algo (pilas, bolsas…)" maxLength={80} aria-label="Añadir texto libre" />
          <Button type="submit" size="icon" aria-label="Añadir" disabled={!text.trim()}><Plus /></Button>
        </form>
      </Card>

      {insights.length === 0 ? (
        <Card>
          <EmptyState icon={<ListChecks />} title="Tu lista está vacía" description="Elige un producto o escribe lo que necesitas. Verás su último precio y dónde te sale más barato." />
        </Card>
      ) : (
        <div className="space-y-4 pb-28 lg:pb-0">
          {pending.length > 0 && (
            <Card className="divide-y divide-border overflow-hidden">
              {pending.map((i) => <Row key={i.item.id} i={i} fmt={fmt} onToggle={() => setItem(i.item, { checked: true })}
                onQty={(q) => setItem(i.item, { quantity: q })} onRemove={() => guard(removeMany("shoppingItems", [i.item.id]))} />)}
            </Card>
          )}
          {done.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <button type="button" onClick={() => setShowDone((v) => !v)} className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <ChevronDown className={cn("size-4 transition-transform", !showDone && "-rotate-90")} /> En el carro ({done.length})
                </button>
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => guard(removeMany("shoppingItems", done.map((x) => x.item.id)))}><Trash2 /> Quitar marcados</Button>
              </div>
              {showDone && (
                <Card className="divide-y divide-border overflow-hidden">
                  {done.map((i) => <Row key={i.item.id} i={i} fmt={fmt} done onToggle={() => setItem(i.item, { checked: false })}
                    onQty={(q) => setItem(i.item, { quantity: q })} onRemove={() => guard(removeMany("shoppingItems", [i.item.id]))} />)}
                </Card>
              )}
            </section>
          )}
        </div>
      )}

      {insights.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-xl lg:static lg:mt-4 lg:rounded-2xl lg:border lg:bg-card lg:px-5">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tabular">Estimado: {fmt(total)}</p>
              {best && <p className="truncate text-xs text-muted-foreground">Te sale más barato en <b className="text-foreground">{best.merchant}</b> ({fmt(best.total)})</p>}
            </div>
            <Button onClick={finish} disabled={done.length === 0}><Check /> Terminar compra</Button>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ i, fmt, done, onToggle, onQty, onRemove }: {
  i: ShoppingInsight; fmt: (n: number) => string; done?: boolean; onToggle: () => void; onQty: (q: number) => void; onRemove: () => void;
}) {
  const qty = i.item.quantity ?? 1;
  const hint = [
    i.lastUnitPrice !== null && i.estimated !== null ? `último ${fmt(i.estimated / qty)}` : null,
    i.cheapestMerchant ? `más barato en ${i.cheapestMerchant.merchant}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="flex min-h-14 items-center gap-1 pr-2">
      <button type="button" onClick={onToggle} aria-pressed={!!done} aria-label={done ? `Desmarcar ${i.item.name}` : `Marcar ${i.item.name}`}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 text-left cursor-pointer">
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2", done ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
          {done && <Check className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-medium", done && "text-muted-foreground line-through")}>{i.item.name}</span>
          {hint && <span className="line-clamp-2 text-xs text-muted-foreground">{hint}</span>}
        </span>
      </button>
      <div className="flex shrink-0 items-center">
        <Button variant="ghost" size="icon-sm" aria-label="Menos" disabled={qty <= 1} onClick={() => onQty(qty - 1)}><Minus /></Button>
        <span className="w-6 text-center text-sm tabular">{String(qty).replace(".", ",")}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Más" onClick={() => onQty(qty + 1)}><Plus /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Quitar ${i.item.name}`} onClick={onRemove}><Trash2 /></Button>
      </div>
    </div>
  );
}
