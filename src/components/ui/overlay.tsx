"use client";
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Modal } from "./modal";

/** true en pantallas ≥ 768 px (panel flotante); false en móvil (hoja inferior). */
export function useIsDesktop() {
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

/**
 * Contenedor de selectores: panel flotante anclado al botón en escritorio,
 * hoja inferior en el móvil. Mismo aspecto que el desplegable de la app.
 */
export function ResponsivePicker({
  open, onOpenChange, trigger, title, children, desktop, contentClassName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Botón que abre el selector (debe aceptar ref y props: se usa con asChild). */
  trigger: ReactElement;
  title: ReactNode;
  children: ReactNode;
  desktop: boolean;
  contentClassName?: string;
}) {
  if (!desktop) {
    return (
      <>
        {trigger}
        <Modal open={open} onOpenChange={onOpenChange} title={title} size="sm">
          {children}
        </Modal>
      </>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12}
          // Dentro de un diálogo, el bloqueo de scroll del diálogo impediría usar la rueda aquí
          onWheel={(e) => e.stopPropagation()}
          className={cn("z-[60] overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-2xl animate-pop", contentClassName)}>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
