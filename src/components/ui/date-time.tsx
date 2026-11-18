"use client";
import {
  addDays, addMonths, addYears, format, isSameMonth, startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { forwardRef, useContext, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { formatDate, fromISO, todayISO, toISO } from "@/core/dates";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { ResponsivePicker, useIsDesktop } from "./overlay";
import { FieldLabelContext } from "./select";

const triggerCls =
  "flex w-full items-center gap-2 rounded-xl border border-input bg-card px-3 h-11 md:h-10 text-left text-foreground transition-colors hover:border-foreground/25 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-expense cursor-pointer";

/** Botón que abre el selector (compatible con Radix asChild: reenvía ref y props). */
const Trigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; empty: boolean; onClear?: () => void }>(
  ({ icon, empty, onClear, children, className, ...p }, ref) => (
    <button ref={ref} type="button" aria-haspopup="dialog" className={cn(triggerCls, className)} {...p}>
      <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <span className={cn("min-w-0 flex-1 truncate tabular", empty && "text-muted-foreground")}>{children}</span>
      {onClear && !empty && (
        <span role="button" tabIndex={-1} aria-label="Quitar" onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-3.5" />
        </span>
      )}
    </button>
  ),
);
Trigger.displayName = "Trigger";

// ===========================================================================
// Fecha
// ===========================================================================
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

function friendlyDate(iso: string) {
  const t = todayISO();
  const prefix = iso === t ? "Hoy, " : iso === toISO(addDays(fromISO(t), -1)) ? "Ayer, " : iso === toISO(addDays(fromISO(t), 1)) ? "Mañana, " : "";
  return prefix + formatDate(iso, prefix ? "d MMM yyyy" : "EEE, d MMM yyyy");
}

export function DatePicker({
  value, onChange, allowClear, placeholder = "Elige una fecha", min, max, showYesterday, id, disabled, "aria-label": ariaLabel, "aria-invalid": invalid,
}: {
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  allowClear?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
  /** Muestra el atajo «Ayer» (útil al registrar gastos). */
  showYesterday?: boolean;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const desktop = useIsDesktop();
  const label = useContext(FieldLabelContext);
  const pick = (iso: string | null) => { onChange(iso); setOpen(false); };

  return (
    <ResponsivePicker open={open} onOpenChange={setOpen} desktop={desktop} title={label ?? ariaLabel ?? "Elige una fecha"} contentClassName="w-[19.5rem]"
      trigger={
        <Trigger id={id} disabled={disabled} aria-label={ariaLabel} aria-invalid={invalid} aria-expanded={open} icon={<CalendarDays />} empty={!value}
          onClick={() => !desktop && setOpen(true)} onClear={allowClear ? () => onChange(null) : undefined}>
          {value ? friendlyDate(value) : placeholder}
        </Trigger>
      }>
      <Calendar value={value ?? null} onSelect={pick} min={min} max={max} />
      <div className="mt-3 flex gap-2 border-t border-border pt-3">
        <Button size="sm" variant="secondary" onClick={() => pick(todayISO())} disabled={(!!min && todayISO() < min) || (!!max && todayISO() > max)}>Hoy</Button>
        {showYesterday && <Button size="sm" variant="secondary" onClick={() => pick(toISO(addDays(new Date(), -1)))}>Ayer</Button>}
        {allowClear && value && <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => pick(null)}>Quitar fecha</Button>}
      </div>
    </ResponsivePicker>
  );
}

function Calendar({ value, onSelect, min, max }: { value: string | null; onSelect: (iso: string) => void; min?: string; max?: string }) {
  const initial = value ?? todayISO();
  const [view, setView] = useState(() => startOfMonth(fromISO(initial)));
  const [cursor, setCursor] = useState(initial);
  const [mode, setMode] = useState<"days" | "months">("days");
  const gridRef = useRef<HTMLDivElement>(null);
  const focusOnMove = useRef(false);
  const today = todayISO();

  const start = startOfWeek(view, { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => toISO(addDays(start, i))); // 6 semanas: altura estable
  const outOfRange = (iso: string) => (!!min && iso < min) || (!!max && iso > max);

  useEffect(() => {
    if (!focusOnMove.current) return;
    focusOnMove.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)?.focus();
  }, [cursor, view]);

  function onKeyDown(e: KeyboardEvent) {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = toISO(addDays(fromISO(cursor), delta));
    focusOnMove.current = true;
    setCursor(next);
    if (!isSameMonth(fromISO(next), view)) setView(startOfMonth(fromISO(next)));
  }

  if (mode === "months") {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Button variant="ghost" size="icon-sm" onClick={() => setView(addYears(view, -1))} aria-label="Año anterior"><ChevronLeft /></Button>
          <span className="font-semibold tabular">{format(view, "yyyy")}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setView(addYears(view, 1))} aria-label="Año siguiente"><ChevronRight /></Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, m) => new Date(view.getFullYear(), m, 1)).map((d) => {
            const selected = value?.startsWith(format(d, "yyyy-MM"));
            return (
              <button key={m(d)} type="button" onClick={() => { setView(d); setMode("days"); }}
                className={cn("h-11 rounded-xl text-sm capitalize transition-colors cursor-pointer",
                  selected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted", format(d, "yyyy-MM") === today.slice(0, 7) && !selected && "text-primary font-medium")}>
                {format(d, "MMM", { locale: es }).replace(".", "")}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" onClick={() => setView(subMonths(view, 1))} aria-label="Mes anterior"><ChevronLeft /></Button>
        <button type="button" onClick={() => setMode("months")} className="rounded-lg px-2 py-1 font-semibold capitalize hover:bg-muted cursor-pointer" aria-label="Elegir mes y año">
          {format(view, "MMMM yyyy", { locale: es })}
        </button>
        <Button variant="ghost" size="icon-sm" onClick={() => setView(addMonths(view, 1))} aria-label="Mes siguiente"><ChevronRight /></Button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div ref={gridRef} role="grid" onKeyDown={onKeyDown} className="grid grid-cols-7 gap-0.5">
        {days.map((iso) => {
          const inMonth = isSameMonth(fromISO(iso), view);
          const selected = iso === value;
          const disabled = outOfRange(iso);
          return (
            <button key={iso} type="button" data-date={iso} disabled={disabled} tabIndex={iso === cursor ? 0 : -1}
              aria-label={formatDate(iso, "EEEE d 'de' MMMM yyyy")} aria-pressed={selected}
              onClick={() => onSelect(iso)} onFocus={() => setCursor(iso)}
              className={cn(
                "grid aspect-square place-items-center rounded-xl text-sm tabular transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-25",
                !inMonth && "text-muted-foreground/50",
                selected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted",
                iso === today && !selected && "font-semibold text-primary ring-1 ring-inset ring-primary/40",
              )}>
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
const m = (d: Date) => d.getMonth();

// ===========================================================================
// Hora: dos columnas circulares que se desplazan y encajan en la franja central (estilo iPhone).
// Truco para el bucle sin coste: la lista se repite muchas veces y se empieza en la copia central;
// cuando el desplazamiento se detiene lejos del centro, se salta en silencio al mismo número de la
// copia central (las copias son idénticas, así que no se nota). Sin cilindro 3D ni cálculos por
// fotograma: solo filas planas y scroll nativo.
// ===========================================================================
const ITEM_H = 40;
const VISIBLE = 5;
const pad2 = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));
/** ~600 filas por columna: margen de sobra para cualquier gesto antes de recentrar. Impar para tener copia central. */
const copiesFor = (n: number) => Math.ceil(600 / n) | 1;

function WheelColumn({ items, index, onChange, label, openToken }: { items: string[]; index: number; onChange: (i: number) => void; label: string; openToken: number }) {
  const n = items.length;
  const copies = copiesFor(n);
  const total = n * copies;
  const mid = Math.floor(copies / 2) * n;
  const rowOf = (v: number) => mid + v;
  const valueOf = (row: number) => ((row % n) + n) % n;
  const clampRow = (r: number) => Math.max(0, Math.min(total - 1, r));

  const ref = useRef<HTMLDivElement>(null);
  const [liveRow, setLiveRow] = useState(rowOf(index));
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef(0);
  const selfScroll = useRef(false);

  const placeAt = (row: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = row * ITEM_H;
    setLiveRow(row);
  };

  // Posicionar sin animación si el valor cambia desde fuera (p. ej. «Ahora»)
  useLayoutEffect(() => {
    if (selfScroll.current) { selfScroll.current = false; return; }
    placeAt(rowOf(index));
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cada vez que se abre el selector: centrar en el valor actual (también en el siguiente
  // fotograma, por si el panel termina de colocarse después)
  const indexRef = useRef(index);
  indexRef.current = index;
  useLayoutEffect(() => {
    selfScroll.current = false;
    const place = () => placeAt(rowOf(indexRef.current));
    place();
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [openToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); cancelAnimationFrame(frame.current); }, []);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    // Resaltar en vivo (como mucho una vez por fotograma)
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setLiveRow(clampRow(Math.round(el.scrollTop / ITEM_H))));
    // Cuando el desplazamiento se detiene: confirmar el valor y volver a la copia central
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const row = clampRow(Math.round(el.scrollTop / ITEM_H));
      const v = valueOf(row);
      if (Math.abs(row - rowOf(v)) >= n) placeAt(rowOf(v)); // salto invisible: mismo número, copia central
      if (v !== index) { selfScroll.current = true; onChange(v); }
    }, 120);
  }

  /** Al tocar una fila o usar el teclado: el valor se guarda al instante y el scroll se anima después. */
  const go = (row: number) => {
    const r = clampRow(row);
    const v = valueOf(r);
    setLiveRow(r);
    if (v !== index) { selfScroll.current = true; onChange(v); }
    ref.current?.scrollTo({ top: r * ITEM_H, behavior: "smooth" });
  };

  function onKeyDown(e: KeyboardEvent) {
    const d = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
    if (d) { e.preventDefault(); go(liveRow + d); }
    const copyStart = liveRow - valueOf(liveRow);
    if (e.key === "Home") { e.preventDefault(); go(copyStart); }
    if (e.key === "End") { e.preventDefault(); go(copyStart + n - 1); }
  }

  return (
    <div className="relative flex-1">
      <div className="pointer-events-none absolute inset-x-1 rounded-xl bg-muted" style={{ top: ITEM_H * ((VISIBLE - 1) / 2), height: ITEM_H }} />
      <div ref={ref} onScroll={onScroll} onKeyDown={onKeyDown} tabIndex={0} role="listbox" aria-label={label} aria-activedescendant={`${label}-${liveRow}`}
        className="relative snap-y snap-mandatory overflow-y-auto overscroll-contain scrollbar-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        style={{
          height: ITEM_H * VISIBLE,
          paddingBlock: ITEM_H * ((VISIBLE - 1) / 2),
          maskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
        }}>
        {Array.from({ length: total }, (_, row) => (
          <button key={row} id={`${label}-${row}`} type="button" role="option" aria-selected={row === liveRow} tabIndex={-1} onClick={() => go(row)}
            className={cn("block w-full snap-center text-center text-xl tabular transition-colors cursor-pointer",
              row === liveRow ? "font-semibold text-foreground" : "text-muted-foreground")}
            style={{ height: ITEM_H }}>
            {items[row % n]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TimePicker({
  value, onChange, allowClear, placeholder = "Sin hora", id, disabled, "aria-label": ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (hhmm: string | null) => void;
  allowClear?: boolean;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const desktop = useIsDesktop();
  const label = useContext(FieldLabelContext);
  const now = () => { const d = new Date(); return [d.getHours(), d.getMinutes()] as const; };
  const parse = (v: string | null | undefined) => (v && /^\d{2}:\d{2}/.test(v) ? [Number(v.slice(0, 2)), Number(v.slice(3, 5))] as const : now());
  const [[h, mi], setDraftState] = useState(() => parse(value));
  // Copia síncrona del valor: los toques rápidos (hora, minuto y «Listo» seguidos) nunca leen un valor antiguo
  const draft = useRef<readonly [number, number]>([h, mi]);
  const setDraft = (d: readonly [number, number]) => { draft.current = d; setDraftState(d); };

  const [openToken, setOpenToken] = useState(0);
  useEffect(() => { if (open) { setDraft(parse(value)); setOpenToken((t) => t + 1); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (hh: number, mm: number) => { setDraft([hh, mm]); onChange(`${pad2(hh)}:${pad2(mm)}`); };
  const setHour = (hh: number) => commit(hh, draft.current[1]);
  const setMinute = (mm: number) => commit(draft.current[0], mm);

  return (
    <ResponsivePicker open={open} onOpenChange={setOpen} desktop={desktop} title={label ?? ariaLabel ?? "Elige la hora"} contentClassName="w-64"
      trigger={
        <Trigger id={id} disabled={disabled} aria-label={ariaLabel} aria-expanded={open} icon={<Clock />} empty={!value}
          onClick={() => !desktop && setOpen(true)} onClear={allowClear ? () => onChange(null) : undefined}>
          {value ? value.slice(0, 5) : placeholder}
        </Trigger>
      }>
      <div className="flex items-center gap-1">
        <WheelColumn label="Horas" items={HOURS} index={h} onChange={setHour} openToken={openToken} />
        <span className="pb-0.5 text-xl font-semibold text-muted-foreground">:</span>
        <WheelColumn label="Minutos" items={MINUTES} index={mi} onChange={setMinute} openToken={openToken} />
      </div>
      <div className="mt-3 flex gap-2 border-t border-border pt-3">
        <Button size="sm" variant="secondary" onClick={() => { const [hh, mm] = now(); commit(hh, mm); }}>Ahora</Button>
        {allowClear && value && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => { onChange(null); setOpen(false); }}>Quitar</Button>}
        <Button size="sm" className="ml-auto" onClick={() => { commit(draft.current[0], draft.current[1]); setOpen(false); }}>Listo</Button>
      </div>
    </ResponsivePicker>
  );
}
