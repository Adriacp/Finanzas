"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { normalize } from "@/core/insights";
import type { Category, CategoryKind } from "@/core/types";
import { categorySchema, fieldErrors } from "@/core/validation";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { ColorPicker, IconPicker } from "./pickers";

/**
 * Crear una categoría o subcategoría sin salir del formulario (p. ej. «Material escolar»).
 * Las subcategorías heredan el icono, el color y el carácter necesario/prescindible de su categoría.
 */
export function QuickCategoryDialog({ open, onOpenChange, parentId, kind, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = nueva categoría; id = nueva subcategoría dentro de esa categoría */
  parentId: string | null;
  kind: CategoryKind;
  onCreated: (c: Category) => void;
}) {
  const d = useData();
  const save = useFinance((s) => s.save);
  const parent = parentId ? d.categories.find((c) => c.id === parentId) : undefined;
  const fresh = (): Category => ({
    id: newId(), parentId, kind, name: "", icon: parent?.icon ?? "tag", color: parent?.color ?? "#6366f1", description: null,
    essential: parent?.essential ?? false, sortOrder: d.categories.filter((c) => c.parentId === parentId && c.kind === kind).length,
  });
  const [c, setC] = useState<Category>(fresh);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setC(fresh()); setErrors({}); } }, [open, parentId, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    const row = { ...c, name: c.name.trim() };
    const r = categorySchema.safeParse(row);
    if (!r.success) return setErrors(fieldErrors(r.error));
    if (d.categories.some((x) => x.parentId === row.parentId && x.kind === row.kind && normalize(x.name) === normalize(row.name)))
      return setErrors({ name: parent ? `Ya existe en ${parent.name}` : "Ya existe una categoría con ese nombre" });
    setSaving(true);
    try {
      await save("categories", row);
      toast.success(parent ? `Subcategoría «${row.name}» creada en ${parent.name}` : `Categoría «${row.name}» creada`);
      onCreated(row);
      onOpenChange(false);
    } catch (e) {
      toast.error("No se pudo crear", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title={parent ? `Nueva subcategoría en ${parent.name}` : "Nueva categoría"}
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={saving}>Crear</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div className="flex items-end gap-3">
          <IconBadge name={c.icon} color={c.color} size="lg" />
          <Field label="Nombre" error={errors.name} className="flex-1">
            <Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder={parent ? "Ej. Material escolar" : "Ej. Educación de los niños"} autoFocus maxLength={60} />
          </Field>
        </div>
        {!parent && (
          <>
            <Field label="Color"><ColorPicker value={c.color} onChange={(v) => setC({ ...c, color: v })} /></Field>
            <Field label="Icono"><IconPicker value={c.icon} onChange={(v) => setC({ ...c, icon: v })} color={c.color} /></Field>
            {kind === "expense" && <Switch checked={c.essential} onChange={(v) => setC({ ...c, essential: v })} label="Gasto necesario" description="Para el análisis de necesarios frente a prescindibles" />}
          </>
        )}
        <p className="text-xs text-muted-foreground">Puedes editarla, reordenarla o borrarla cuando quieras en Categorías.</p>
      </form>
    </Modal>
  );
}
