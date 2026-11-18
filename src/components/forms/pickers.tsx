"use client";
import { X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { ACCOUNT_TYPE_LABELS, CATEGORY_ICONS, PALETTE, PAYMENT_METHOD_ICONS, PAYMENT_METHODS } from "@/core/defaults";
import type { Account, Category, CategoryKind } from "@/core/types";
import { Icon } from "@/components/ui/icon";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function sortCats(list: Category[]) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
}

export function CategorySelect({ categories, kind, value, onChange, placeholder = "Sin categoría", id, includeAll }: {
  categories: Category[]; kind?: CategoryKind; value: string | null; onChange: (v: string | null) => void; placeholder?: string; id?: string; includeAll?: boolean;
}) {
  const parents = sortCats(categories.filter((c) => !c.parentId && (!kind || c.kind === kind)));
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {includeAll
        ? parents.map((p) => (
            <optgroup key={p.id} label={p.name}>
              <option value={p.id} data-icon={p.icon} data-color={p.color}>{p.name} (toda)</option>
              {sortCats(categories.filter((c) => c.parentId === p.id)).map((s) => <option key={s.id} value={s.id} data-icon={s.icon} data-color={s.color}>{s.name}</option>)}
            </optgroup>
          ))
        : parents.map((p) => <option key={p.id} value={p.id} data-icon={p.icon} data-color={p.color} data-description={p.description ?? undefined}>{p.name}</option>)}
    </Select>
  );
}

export function SubcategorySelect({ categories, parentId, value, onChange, id }: {
  categories: Category[]; parentId: string | null; value: string | null; onChange: (v: string | null) => void; id?: string;
}) {
  const subs = sortCats(categories.filter((c) => c.parentId && c.parentId === parentId));
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} disabled={!parentId || subs.length === 0}>
      <option value="">{parentId ? "Sin subcategoría" : "Elige categoría"}</option>
      {subs.map((s) => <option key={s.id} value={s.id} data-icon={s.icon} data-color={s.color}>{s.name}</option>)}
    </Select>
  );
}

export function AccountSelect({ accounts, value, onChange, placeholder = "Sin cuenta", id, exclude }: {
  accounts: Account[]; value: string | null; onChange: (v: string | null) => void; placeholder?: string; id?: string; exclude?: string | null;
}) {
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {accounts.filter((a) => (!a.archived || a.id === value) && a.id !== exclude).sort((a, b) => a.sortOrder - b.sortOrder).map((a) => (
        <option key={a.id} value={a.id} data-icon={a.icon} data-color={a.color} data-description={[ACCOUNT_TYPE_LABELS[a.type], a.institution].filter(Boolean).join(" · ")}>{a.name}</option>
      ))}
    </Select>
  );
}

/** Forma de pago con icono propio para cada método. */
export function PaymentMethodSelect({ value, onChange, id }: { value: string | null; onChange: (v: string | null) => void; id?: string }) {
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Sin indicar</option>
      {PAYMENT_METHODS.map((m) => <option key={m} value={m} data-icon={PAYMENT_METHOD_ICONS[m] ?? "wallet"} data-color="#64748b">{m}</option>)}
    </Select>
  );
}

export function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, "").toLowerCase();
    if (t && !value.includes(t) && t.length <= 30) onChange([...value, t]);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(text); }
    else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
  };
  const listId = useId();
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
            #{t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Quitar ${t}`} className="cursor-pointer"><X className="size-3" /></button>
          </span>
        ))}
      </div>
      <Input className={cn(value.length && "mt-2")} list={listId} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
        onBlur={() => text && add(text)} placeholder="Añadir etiqueta y pulsar Enter" />
      <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={c}
          className={cn("size-8 rounded-full transition-transform cursor-pointer", value === c && "ring-2 ring-offset-2 ring-offset-card scale-110")}
          style={{ background: c, ["--tw-ring-color" as string]: c }} />
      ))}
    </div>
  );
}

export function IconPicker({ value, onChange, color }: { value: string; onChange: (v: string) => void; color: string }) {
  return (
    <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
      {CATEGORY_ICONS.map((name) => (
        <button key={name} type="button" onClick={() => onChange(name)} aria-label={name}
          className={cn("grid aspect-square place-items-center rounded-lg border border-transparent hover:bg-muted cursor-pointer [&_svg]:size-4", value === name && "border-border bg-muted")}
          style={value === name ? { color } : undefined}>
          <Icon name={name} />
        </button>
      ))}
    </div>
  );
}
