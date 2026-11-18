"use client";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  Children, createContext, Fragment, isValidElement, useContext, useEffect, useId, useMemo, useRef, useState,
  type ChangeEvent, type ReactElement, type ReactNode, type SelectHTMLAttributes,
} from "react";
import { normalize } from "@/core/insights";
import { cn } from "@/lib/utils";
import { IconBadge } from "./icon";
import { Modal } from "./modal";

/** El componente Field comparte su etiqueta para usarla como título de la hoja en el móvil. */
export const FieldLabelContext = createContext<ReactNode>(null);

interface Opt {
  value: string;
  label: string;
  icon?: string;
  color?: string;
  description?: string;
  disabled?: boolean;
  group?: string;
}

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean; label?: string } & Record<`data-${string}`, string | undefined>;

const textOf = (n: ReactNode): string =>
  typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(textOf).join("") : isValidElement(n) ? textOf((n.props as { children?: ReactNode }).children) : "";

/** Lee los <option>/<optgroup> hijos (como un <select> nativo), incluidos los generados con .map() y fragmentos. */
function readOptions(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<OptionProps>;
    if (el.type === Fragment) return void readOptions(el.props.children, group, out);
    if (el.type === "optgroup") return void readOptions(el.props.children, el.props.label, out);
    if (el.type === "option") {
      const label = textOf(el.props.children);
      out.push({
        value: String(el.props.value ?? label),
        label,
        icon: el.props["data-icon"],
        color: el.props["data-color"],
        description: el.props["data-description"],
        disabled: el.props.disabled,
        group,
      });
    }
  });
  return out;
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

const trigger =
  "flex w-full items-center gap-2 rounded-xl border border-input bg-card px-3 h-11 md:h-10 text-left text-foreground transition-colors hover:border-foreground/25 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-expense cursor-pointer";

function OptionIcon({ o, size = "sm" }: { o: Opt; size?: "sm" | "xs" }) {
  if (o.icon) return <IconBadge name={o.icon} color={o.color ?? "#94a3b8"} size="sm" className={size === "xs" ? "size-6 rounded-md [&_svg]:size-3.5" : undefined} />;
  if (o.color) return <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} />;
  return null;
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "multiple"> & { value?: string | number | null };

/**
 * Selector propio con la misma API que un <select> nativo (value, onChange(e) con e.target.value, hijos <option>/<optgroup>).
 * Escritorio: panel flotante. Móvil: hoja inferior. Buscador automático cuando hay muchas opciones.
 * Atributos opcionales en <option>: data-icon, data-color, data-description.
 */
export function Select({ value, onChange, children, disabled, id, className, name, ...rest }: SelectProps) {
  const options = useMemo(() => readOptions(children), [children]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const desktop = useIsDesktop();
  const fieldLabel = useContext(FieldLabelContext);
  const listId = useId();
  const cmdRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === String(value ?? ""));
  const searchable = options.length > 8;
  const ariaLabel = rest["aria-label"];

  const shown = useMemo(() => {
    const n = normalize(q);
    return n ? options.filter((o) => normalize(`${o.label} ${o.group ?? ""} ${o.description ?? ""}`).includes(n)) : options;
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    const idx = Math.max(0, options.findIndex((o) => o.value === String(value ?? "")));
    setActive(`o${idx}`);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al abrir, desplazar la lista hasta la opción seleccionada
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => cmdRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "center" }), 30);
    return () => clearTimeout(t);
  }, [open]);

  function pick(v: string) {
    setOpen(false);
    if (v === String(value ?? "")) return;
    const target = { value: v, name } as HTMLSelectElement;
    onChange?.({ target, currentTarget: target } as ChangeEvent<HTMLSelectElement>);
  }

  const button = (
    <button
      type="button"
      id={id}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listId}
      aria-label={ariaLabel}
      aria-invalid={rest["aria-invalid"]}
      onClick={() => !desktop && setOpen(true)}
      className={cn(trigger, className)}
    >
      {current && <OptionIcon o={current} size="xs" />}
      <span className={cn("min-w-0 flex-1 truncate", (!current || current.value === "") && "text-muted-foreground")}>
        {current?.label ?? "Selecciona…"}
      </span>
      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
    </button>
  );

  // Agrupar las opciones visibles respetando el orden original
  const groups: { name?: string; items: { o: Opt; key: string }[] }[] = [];
  shown.forEach((o) => {
    const key = `o${options.indexOf(o)}`;
    const last = groups[groups.length - 1];
    if (last && last.name === o.group) last.items.push({ o, key });
    else groups.push({ name: o.group, items: [{ o, key }] });
  });

  const list = (
    <Command ref={cmdRef} shouldFilter={false} loop value={active} onValueChange={setActive} tabIndex={-1} className="outline-none"
      onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      {searchable && (
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Command.Input value={q} onValueChange={setQ} autoFocus={desktop} placeholder="Buscar…"
            className="h-11 w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
        </div>
      )}
      <Command.List id={listId} className={cn("overflow-y-auto overscroll-contain p-1.5", desktop ? "max-h-72" : "max-h-[60dvh]")}>
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">Sin resultados</Command.Empty>
        {groups.map((g, gi) => (
          <Command.Group key={`${g.name ?? ""}-${gi}`} heading={g.name}
            className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground">
            {g.items.map(({ o, key }) => {
              const selected = o.value === String(value ?? "");
              return (
                <Command.Item key={key} value={key} disabled={o.disabled} onSelect={() => pick(o.value)}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-3 rounded-xl px-2.5 text-sm outline-none transition-colors",
                    desktop ? "min-h-10 py-1.5" : "min-h-12 py-2",
                    "data-[selected=true]:bg-muted data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40",
                    selected && "font-medium",
                  )}>
                  <OptionIcon o={o} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", o.value === "" && "text-muted-foreground")}>{o.label}</span>
                    {o.description && <span className="block truncate text-xs text-muted-foreground">{o.description}</span>}
                  </span>
                  {selected && <Check className="size-4 shrink-0 text-primary" />}
                </Command.Item>
              );
            })}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  );

  if (!desktop) {
    return (
      <>
        {button}
        <Modal open={open} onOpenChange={setOpen} title={fieldLabel ?? ariaLabel ?? "Selecciona una opción"} size="sm">
          <div className="-mx-2">{list}</div>
        </Modal>
      </>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{button}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12}
          onOpenAutoFocus={(e) => { if (!searchable) { e.preventDefault(); cmdRef.current?.focus(); } }}
          // Dentro de un diálogo, el bloqueo de scroll del diálogo impediría usar la rueda en la lista
          onWheel={(e) => e.stopPropagation()}
          className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-56 max-w-[min(26rem,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-pop">
          {list}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
