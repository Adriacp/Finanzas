"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Hueco que ocupa el teclado en pantalla (sobre todo en iPhone).
 *
 * Safari en iOS no encoge la página al abrir el teclado: lo pone encima. Un elemento fijado
 * abajo (nuestra hoja inferior) quedaría tapado. `visualViewport` dice qué parte de la pantalla
 * sigue visible, así la hoja se coloca justo encima del teclado y se acorta.
 * Solo escucha mientras la hoja está abierta y solo en pantallas de móvil.
 */
function useKeyboardInset(active: boolean): { inset: number; visibleHeight: number } | null {
  const [state, setState] = useState<{ inset: number; visibleHeight: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) { setState(null); return; }
    const mobile = window.matchMedia("(max-width: 767px)");
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!mobile.matches) return setState(null);
        // Espacio tapado por abajo = alto de la ventana − (alto visible + desplazamiento de la parte visible)
        const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        setState(inset > 40 ? { inset, visibleHeight: Math.round(vv.height) } : null); // < 40 px: barras del navegador, no teclado
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return state;
}

/**
 * Modal responsive: hoja inferior (bottom sheet) en móvil, diálogo centrado en escritorio.
 * En el móvil, con el teclado abierto, la hoja sube y se acorta para que siga viéndose lo que escribes.
 */
export function Modal({
  open, onOpenChange, title, description, children, footer, size = "md",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const keyboard = useKeyboardInset(open);
  const keyboardStyle: CSSProperties | undefined = keyboard
    ? { bottom: keyboard.inset, maxHeight: Math.max(160, keyboard.visibleHeight - 8) }
    : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-fade" />
        <Dialog.Content
          style={keyboardStyle}
          data-keyboard={keyboard ? "open" : undefined}
          className={cn(
            "fixed z-50 flex flex-col bg-card text-card-foreground shadow-2xl outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl border-t border-border animate-sheet transition-[bottom,max-height] duration-150 ease-out",
            // Con el teclado abierto: hoja redondeada también abajo, flotando sobre el teclado
            "data-[keyboard=open]:rounded-3xl data-[keyboard=open]:border",
            "md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-h-[88vh] md:w-full md:rounded-3xl md:border md:animate-pop",
            size === "sm" && "md:max-w-md",
            size === "md" && "md:max-w-xl",
            size === "lg" && "md:max-w-3xl",
          )}
        >
          <div className={cn("mx-auto mt-2.5 h-1 w-10 rounded-full bg-border md:hidden", keyboard && "hidden")} />
          <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3 md:px-6 md:pt-5", keyboard && "pt-3 pb-2")}>
            <div>
              <Dialog.Title className={cn("text-lg font-semibold tracking-tight", keyboard && "text-base")}>{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className={cn("mt-0.5 text-sm text-muted-foreground", keyboard && "sr-only")}>{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === "string" ? title : "Diálogo"}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="-mr-1 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 md:px-6">{children}</div>
          {footer && <div className="flex gap-2 border-t border-border px-5 py-3 pb-safe md:px-6 [&>*]:flex-1 md:[&>*]:flex-none md:justify-end">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
