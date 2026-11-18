import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { FieldLabelContext } from "./select";

export { Select } from "./select";

const base =
  "w-full rounded-xl border border-input bg-card px-3.5 h-11 md:h-10 text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:opacity-60 aria-[invalid=true]:border-expense";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(base, className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(base, "h-auto min-h-20 py-2.5 resize-y", className)} {...p} />
));
Textarea.displayName = "Textarea";

export function Field({ label, error, hint, children, className, htmlFor }: { label?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <FieldLabelContext.Provider value={label ?? null}>{children}</FieldLabelContext.Provider>
      {error ? <p className="text-xs text-expense">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
