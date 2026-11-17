"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Modal responsive: hoja inferior (bottom sheet) en móvil, diálogo centrado en escritorio.
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
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-fade" />
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed z-50 flex flex-col bg-card text-card-foreground shadow-2xl outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl border-t border-border animate-sheet",
            "md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-h-[88vh] md:w-full md:rounded-3xl md:border md:animate-pop",
            size === "sm" && "md:max-w-md",
            size === "md" && "md:max-w-xl",
            size === "lg" && "md:max-w-3xl",
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border md:hidden" />
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 md:px-6 md:pt-5">
            <div>
              <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === "string" ? title : "Diálogo"}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="-mr-1 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-5 md:px-6">{children}</div>
          {footer && <div className="flex gap-2 border-t border-border px-5 py-3 pb-safe md:px-6 [&>*]:flex-1 md:[&>*]:flex-none md:justify-end">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
