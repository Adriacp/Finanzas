"use client";
import { ChevronDown, ShoppingBasket, Copy, Paperclip, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatDate, relativeDayLabel, todayISO } from "@/core/dates";
import { isPaidInFuture } from "@/core/finance";
import { allTags, findDuplicates, merchantSuggestions, suggestCategory } from "@/core/insights";
import { parseAmount } from "@/core/money";
import type { Transaction, TransactionItem, TxStatus, TxType } from "@/core/types";
import { fieldErrors, transactionSchema } from "@/core/validation";
import { newId } from "@/data/repository";
import { useFinance } from "@/store/finance-store";
import { useTxDialog } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented, Switch } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useMoney } from "@/components/ui/money";
import { AccountSelect, CategorySelect, PaymentMethodSelect, SubcategorySelect, TagInput } from "./pickers";
import { ItemsEditor } from "./items-editor";
import { cn } from "@/lib/utils";
import { DatePicker, TimePicker } from "@/components/ui/date-time";

const TYPE_OPTIONS: { value: TxType; label: string }[] = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "transfer", label: "Transferencia" },
  { value: "refund", label: "Reembolso" },
];
const STATUS_OPTIONS: { value: TxStatus; label: string }[] = [
  { value: "paid", label: "Pagado" },
  { value: "pending", label: "Pendiente" },
  { value: "scheduled", label: "Programado" },
];

const nowTime = () => new Date().toTimeString().slice(0, 5);

function blank(defaultAccount: string | null): Omit<Transaction, "id"> {
  return {
    type: "expense", amount: 0, concept: "", categoryId: null, subcategoryId: null, date: todayISO(), time: nowTime(),
    accountId: defaultAccount, toAccountId: null, paymentMethod: null, merchant: null, description: null, tags: [],
    isFixed: false, isRecurring: false, recurringId: null, status: "paid", attachmentPath: null, notes: null,
  };
}

export function TransactionDialog() {
  const { open, close, initial, mode } = useTxDialog();
  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title={mode === "edit" ? "Editar movimiento" : "Nuevo movimiento"} size="md">
      {open && <TransactionForm key={`${mode}-${initial?.id ?? "new"}-${open}`} />}
    </Modal>
  );
}

function TransactionForm() {
  const { initial, mode, close, openDuplicate, sourceId } = useTxDialog();
  const data = useFinance((s) => s.data)!;
  const { saveTransaction, remove, repo, schemaOutdated } = useFinance();
  const fmt = useMoney();
  const defaultAccount = data.accounts.find((a) => !a.archived)?.id ?? null;
  const [tx, setTx] = useState<Omit<Transaction, "id"> & { id?: string }>(() => ({ ...blank(defaultAccount), ...(initial ?? {}) }));
  const [amountText, setAmountText] = useState(initial?.amount ? String(initial.amount).replace(".", ",") : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [futureAsk, setFutureAsk] = useState<{ again: boolean } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  // Desglose por productos (opcional): al editar se carga el existente; al duplicar se copia
  const [items, setItems] = useState<TransactionItem[]>(() => {
    const src = mode === "edit" ? initial?.id : sourceId;
    if (!src) return [];
    const list = data.transactionItems.filter((i) => i.transactionId === src).sort((a, b) => a.sortOrder - b.sortOrder);
    return mode === "edit" ? list : list.map((i) => ({ ...i, id: newId() }));
  });
  const [showItems, setShowItems] = useState(() => items.length > 0);
  const [showMore, setShowMore] = useState(mode === "edit" && !!(initial?.merchant || initial?.notes || initial?.tags?.length || initial?.description || initial?.attachmentPath));
  const categoryTouched = useRef(mode === "edit" || !!initial?.categoryId);
  const amountRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Transaction>(k: K, v: Transaction[K]) => setTx((p) => ({ ...p, [k]: v }));
  const kind = tx.type === "income" ? "income" : "expense";
  const merchants = useMemo(() => merchantSuggestions(data.transactions), [data.transactions]);
  const tags = useMemo(() => allTags(data.transactions), [data.transactions]);

  useEffect(() => {
    const t = setTimeout(() => amountRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  // Al cambiar de tipo, limpiar la categoría si ya no corresponde
  useEffect(() => {
    if (tx.type === "transfer") { setTx((p) => ({ ...p, categoryId: null, subcategoryId: null })); return; }
    const c = data.categories.find((x) => x.id === tx.categoryId);
    if (c && c.kind !== kind) setTx((p) => ({ ...p, categoryId: null, subcategoryId: null }));
  }, [tx.type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sugerencia automática de categoría según concepto/comercio
  const suggestion = useMemo(() => {
    if (tx.type === "transfer") return null;
    const text = `${tx.concept} ${tx.merchant ?? ""}`.trim();
    return suggestCategory(text, data.transactions, data.categories, kind);
  }, [tx.concept, tx.merchant, tx.type, kind, data.transactions, data.categories]);

  useEffect(() => {
    if (suggestion && !categoryTouched.current) setTx((p) => ({ ...p, categoryId: suggestion.categoryId, subcategoryId: suggestion.subcategoryId }));
  }, [suggestion]);

  const amount = parseAmount(amountText) ?? 0;
  const duplicates = useMemo(
    () => (amount > 0 && tx.concept.length > 1 ? findDuplicates({ ...tx, amount: Math.abs(amount) }, data.transactions) : []),
    [amount, tx, data.transactions],
  );

  async function submit(again = false, opts: { status?: TxStatus; confirmedFuture?: boolean } = {}) {
    const candidate = { ...tx, ...(opts.status ? { status: opts.status } : {}), amount: Math.abs(amount), concept: tx.concept.trim(), merchant: tx.merchant?.trim() || null };
    const parsed = transactionSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      if (fieldErrors(parsed.error).amount) amountRef.current?.focus();
      return;
    }
    setErrors({});
    const lines = candidate.type === "expense" ? items : [];
    if (lines.some((i) => !i.productId || !i.name.trim())) {
      setShowItems(true);
      toast.error("Elige el producto de cada línea del desglose o quita las líneas vacías");
      return;
    }
    if (lines.some((i) => !(i.quantity > 0))) {
      setShowItems(true);
      toast.error("La cantidad de cada producto debe ser mayor que 0");
      return;
    }
    // «Pagado» con fecha futura: casi siempre debería estar programado. Preguntar antes de guardar.
    if (!opts.confirmedFuture && isPaidInFuture(candidate, new Date())) {
      setFutureAsk({ again });
      return;
    }
    setFutureAsk(null);
    if (opts.status) set("status", opts.status);
    setSaving(true);
    try {
      let attachmentPath = candidate.attachmentPath;
      if (file && repo) {
        attachmentPath = await repo.uploadAttachment(file);
        if (candidate.attachmentPath) repo.removeAttachment(candidate.attachmentPath).catch(() => {});
      }
      const row: Transaction = { ...candidate, ...parsed.data, attachmentPath, id: tx.id ?? newId(), createdAt: tx.createdAt };
      const alerts = await saveTransaction(row, row.type === "expense" ? items : []);
      toast.success(mode === "edit" ? "Movimiento actualizado" : "Movimiento guardado", { description: `${row.concept} · ${fmt(row.amount)}` });
      for (const a of alerts) {
        const msg = a.threshold! >= 100 ? `Has superado el presupuesto de ${a.name}` : `Has consumido el ${a.threshold} % del presupuesto de ${a.name}`;
        (a.threshold! >= 90 ? toast.error : toast.warning)(msg, { description: `${fmt(a.spent)} de ${fmt(a.amount)}`, duration: 7000 });
      }
      if (again) {
        setTx({ ...blank(row.accountId), date: row.date, type: row.type });
        setAmountText("");
        setItems([]);
        setFile(null);
        categoryTouched.current = false;
        amountRef.current?.focus();
      } else close();
    } catch (e) {
      toast.error("No se pudo guardar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!tx.id || !confirm("¿Eliminar este movimiento? Esta acción no se puede deshacer.")) return;
    try {
      await remove("transactions", tx.id);
      if (tx.attachmentPath) repo?.removeAttachment(tx.attachmentPath).catch(() => {});
      toast.success("Movimiento eliminado");
      close();
    } catch (e) {
      toast.error("No se pudo eliminar", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function viewAttachment() {
    if (!tx.attachmentPath || !repo) return;
    try {
      const url = await repo.attachmentUrl(tx.attachmentPath);
      const w = window.open();
      if (w) { w.opener = null; w.location.href = url; }
    } catch (e) {
      toast.error("No se pudo abrir el adjunto", { description: e instanceof Error ? e.message : undefined });
    }
  }

  const typeColor = tx.type === "expense" ? "text-expense" : tx.type === "income" || tx.type === "refund" ? "text-income" : "text-transfer";

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4" noValidate>
      <Segmented value={tx.type} onChange={(v) => set("type", v)} options={TYPE_OPTIONS} className="w-full" size="sm" />

      <div className="rounded-2xl bg-muted/60 px-4 py-4 text-center">
        <label htmlFor="tx-amount" className="text-xs text-muted-foreground">Importe</label>
        <div className={cn("flex items-center justify-center gap-1 text-4xl font-semibold tracking-tight tabular", typeColor)}>
          <span>{tx.type === "expense" ? "−" : tx.type === "transfer" ? "" : "+"}</span>
          <input id="tx-amount" ref={amountRef} inputMode="decimal" autoComplete="off" placeholder="0,00" value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,-]/g, ""))} aria-invalid={!!errors.amount}
            className="w-44 bg-transparent text-center outline-none placeholder:text-muted-foreground/40" style={{ fontSize: "inherit" }} />
          <span className="text-2xl text-muted-foreground">€</span>
        </div>
        {errors.amount && <p className="mt-1 text-xs text-expense">{errors.amount}</p>}
      </div>

      <Field label="Concepto" error={errors.concept} htmlFor="tx-concept">
        <Input id="tx-concept" value={tx.concept} onChange={(e) => set("concept", e.target.value)} placeholder="Ej. Compra supermercado" maxLength={120} aria-invalid={!!errors.concept} autoComplete="off" />
      </Field>

      {tx.type === "transfer" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde" error={errors.accountId}>
            <AccountSelect accounts={data.accounts} value={tx.accountId} onChange={(v) => set("accountId", v)} placeholder="Cuenta origen" />
          </Field>
          <Field label="Hacia" error={errors.toAccountId}>
            <AccountSelect accounts={data.accounts} value={tx.toAccountId} onChange={(v) => set("toAccountId", v)} placeholder="Cuenta destino" exclude={tx.accountId} />
          </Field>
          <p className="col-span-2 -mt-1 text-xs text-muted-foreground">Las transferencias entre tus cuentas no cuentan como ingreso ni como gasto.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<span className="inline-flex items-center gap-1">Categoría {suggestion && !categoryTouched.current && tx.categoryId === suggestion.categoryId && <Sparkles className="size-3 text-primary" aria-label="Sugerida" />}</span>}>
              <CategorySelect categories={data.categories} kind={kind} value={tx.categoryId} onChange={(v) => { categoryTouched.current = true; setTx((p) => ({ ...p, categoryId: v, subcategoryId: null })); }} />
            </Field>
            <Field label="Subcategoría">
              <SubcategorySelect categories={data.categories} parentId={tx.categoryId} value={tx.subcategoryId} onChange={(v) => { categoryTouched.current = true; set("subcategoryId", v); }} />
            </Field>
          </div>
          <Field label="Cuenta o tarjeta">
            <AccountSelect accounts={data.accounts} value={tx.accountId} onChange={(v) => set("accountId", v)} />
          </Field>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" error={errors.date}><DatePicker value={tx.date} onChange={(v) => v && set("date", v)} showYesterday aria-invalid={!!errors.date} /></Field>
        <Field label="Hora"><TimePicker value={tx.time} onChange={(v) => set("time", v)} allowClear /></Field>
      </div>

      <Field label="Estado">
        <Segmented value={tx.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} className="w-full" size="sm" />
      </Field>

      {duplicates.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">¿Posible duplicado?</p>
            <p className="text-xs text-muted-foreground">
              Ya existe «{duplicates[0].concept}» por {fmt(duplicates[0].amount)} el {formatDate(duplicates[0].date)}.
            </p>
          </div>
        </div>
      )}

      {tx.type === "expense" && (
        <div className="rounded-xl border border-border">
          <button type="button" onClick={() => setShowItems((s) => !s)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium cursor-pointer">
            <span className="flex items-center gap-2">
              <ShoppingBasket className="size-4 text-muted-foreground" /> Desglose por productos
              {items.length > 0 ? <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">{items.length}</span>
                : <span className="text-xs font-normal text-muted-foreground">(opcional)</span>}
            </span>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", showItems && "rotate-180")} />
          </button>
          {showItems && (
            <div className="border-t border-border p-2.5">
              {schemaOutdated
                ? <p className="text-xs text-muted-foreground">Para guardar el desglose falta actualizar la base de datos (migración 0002).</p>
                : <ItemsEditor items={items} onChange={setItems} amount={Math.abs(amount)} onUseSum={(sum) => setAmountText(String(sum).replace(".", ","))} />}
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={() => setShowMore((s) => !s)} className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer">
        Más detalles <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} />
      </button>

      {showMore && (
        <div className="space-y-4 animate-in">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Comercio">
              <Input list="merchants" value={tx.merchant ?? ""} onChange={(e) => set("merchant", e.target.value || null)} placeholder="Establecimiento" maxLength={80} />
              <datalist id="merchants">{merchants.map((m) => <option key={m} value={m} />)}</datalist>
            </Field>
            <Field label="Método de pago">
              <PaymentMethodSelect value={tx.paymentMethod} onChange={(v) => set("paymentMethod", v)} />
            </Field>
          </div>
          <Field label="Etiquetas"><TagInput value={tx.tags} onChange={(v) => set("tags", v)} suggestions={tags} /></Field>
          <Field label="Descripción"><Input value={tx.description ?? ""} onChange={(e) => set("description", e.target.value || null)} maxLength={500} /></Field>
          <Field label="Notas personales"><Textarea value={tx.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} rows={2} maxLength={2000} /></Field>
          <div className="rounded-xl border border-border px-3 py-1">
            <Switch checked={tx.isFixed} onChange={(v) => set("isFixed", v)} label="Gasto fijo" description="Desactívalo si es un gasto variable" />
            <Switch checked={tx.isRecurring} onChange={(v) => set("isRecurring", v)} label="Recurrente" description="Se repite periódicamente" />
          </div>
          <Field label="Ticket o factura" hint="Imagen o PDF (máx. 10 MB)">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-input px-3 text-sm hover:bg-muted">
                <Paperclip className="size-4" /> {file ? file.name : tx.attachmentPath ? "Reemplazar archivo" : "Adjuntar o hacer foto"}
                <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              {file && <Button variant="ghost" size="icon-sm" onClick={() => setFile(null)} aria-label="Quitar archivo"><X /></Button>}
              {tx.attachmentPath && !file && (
                <>
                  <Button variant="secondary" size="sm" onClick={viewAttachment}>Ver adjunto</Button>
                  <Button variant="ghost" size="sm" onClick={() => set("attachmentPath", null)}>Quitar</Button>
                </>
              )}
            </div>
          </Field>
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-border bg-card px-5 pt-3 pb-safe md:-mx-6 md:px-6">
        {mode === "edit" && (
          <>
            <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Eliminar" className="text-expense"><Trash2 /></Button>
            <Button variant="ghost" size="icon" onClick={() => openDuplicate({ ...(tx as Transaction) })} aria-label="Duplicar"><Copy /></Button>
          </>
        )}
        <div className="ml-auto flex gap-2">
          {mode === "create" && <Button variant="secondary" onClick={() => submit(true)} disabled={saving}>Guardar y otro</Button>}
          <Button type="submit" disabled={saving} className="min-w-28">{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </div>

      <Modal open={!!futureAsk} onOpenChange={(o) => !o && setFutureAsk(null)} title="¿Pagado en una fecha futura?" size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setFutureAsk(null)}>Volver</Button>
          <Button variant="secondary" disabled={saving} onClick={() => submit(futureAsk?.again, { confirmedFuture: true })}>Guardar como pagado</Button>
          <Button disabled={saving} onClick={() => submit(futureAsk?.again, { status: "scheduled", confirmedFuture: true })}>Programarlo</Button>
        </>}>
        <div className="space-y-3 text-sm">
          <p>
            Has marcado como <b>pagado</b> «{tx.concept.trim() || "este movimiento"}» por <b className="tabular">{fmt(Math.abs(amount))}</b> con{" "}
            {tx.date === todayISO() && tx.time
              ? <>fecha <b>hoy a las {tx.time.slice(0, 5)}</b>, una hora que todavía no ha llegado.</>
              : <>fecha <b>{relativeDayLabel(tx.date).toLowerCase()}</b>{tx.date ? ` (${formatDate(tx.date)})` : ""}.</>}
          </p>
          <p className="text-muted-foreground">
            Un movimiento pagado cuenta ya en tus saldos y gastos. Si el dinero todavía no ha salido, márcalo como <b className="text-foreground">programado</b>:
            aparecerá en el calendario y en «Próximos pagos» hasta ese día.
          </p>
        </div>
      </Modal>
    </form>
  );
}
