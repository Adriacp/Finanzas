import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida");
const money = z.number({ error: "Introduce un importe" }).finite("Importe no válido");
const optText = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`).nullable();
const id = z.string().min(1);

export const transactionSchema = z
  .object({
    type: z.enum(["expense", "income", "transfer", "refund"]),
    amount: money.positive("El importe debe ser mayor que 0").max(1e10, "Importe demasiado alto"),
    concept: z.string().trim().min(1, "Escribe un concepto").max(120, "Máximo 120 caracteres"),
    categoryId: id.nullable(),
    subcategoryId: id.nullable(),
    date: isoDate,
    time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora no válida").nullable(),
    accountId: id.nullable(),
    toAccountId: id.nullable(),
    paymentMethod: optText(40),
    merchant: optText(80),
    description: optText(500),
    tags: z.array(z.string().trim().min(1).max(30)).max(20, "Máximo 20 etiquetas"),
    isFixed: z.boolean(),
    isRecurring: z.boolean(),
    recurringId: id.nullable(),
    status: z.enum(["paid", "pending", "scheduled"]),
    attachmentPath: z.string().nullable(),
    notes: optText(2000),
  })
  .superRefine((t, ctx) => {
    if (t.type === "transfer") {
      if (!t.accountId) ctx.addIssue({ code: "custom", path: ["accountId"], message: "Elige la cuenta de origen" });
      if (!t.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Elige la cuenta de destino" });
      if (t.accountId && t.accountId === t.toAccountId)
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Origen y destino deben ser distintos" });
    }
  });

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(80),
  type: z.enum(["checking", "savings", "cash", "credit_card", "debit_card", "paypal", "investment", "other"]),
  institution: optText(80),
  initialBalance: money.min(-1e10).max(1e10),
  currency: z.string().length(3),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1),
  archived: z.boolean(),
  sortOrder: z.number().int(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(60),
  parentId: id.nullable(),
  kind: z.enum(["expense", "income"]),
  icon: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: optText(200),
  essential: z.boolean(),
  sortOrder: z.number().int(),
});

export const budgetSchema = z.object({
  categoryId: id.nullable(),
  amount: money.min(0, "No puede ser negativo").max(1e10),
  month: isoDate.nullable(),
});

export const recurringSchema = z
  .object({
    name: z.string().trim().min(1, "Escribe un nombre").max(80),
    amount: money.positive("El importe debe ser mayor que 0"),
    type: z.enum(["expense", "income"]),
    frequency: z.enum(["weekly", "monthly", "quarterly", "semiannual", "annual"]),
    nextDate: isoDate,
    startDate: isoDate,
    endDate: isoDate.nullable(),
    categoryId: id.nullable(),
    subcategoryId: id.nullable(),
    accountId: id.nullable(),
    isSubscription: z.boolean(),
    isFixed: z.boolean(),
    status: z.enum(["active", "cancelled"]),
    usage: z.enum(["high", "medium", "low"]).nullable(),
    merchant: optText(80),
    notes: optText(1000),
  })
  .refine((r) => !r.endDate || r.endDate >= r.startDate, { path: ["endDate"], message: "Debe ser posterior al inicio" });

export const goalSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(80),
  targetAmount: money.positive("Debe ser mayor que 0"),
  savedAmount: money.min(0, "No puede ser negativo"),
  deadline: isoDate.nullable(),
  accountId: id.nullable(),
  color: z.string(),
  icon: z.string(),
  notes: optText(1000),
  archived: z.boolean(),
});

/** Convierte errores de zod en un mapa campo → mensaje para los formularios. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export const productSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(80, "Máximo 80 caracteres"),
  unit: z.string().trim().min(1, "Elige una unidad").max(20),
  categoryId: id.nullable(),
  parentId: id.nullable().optional(),
  packageSize: z.number().positive("El formato debe ser mayor que 0").max(1e6).nullable().optional(),
});

export const shoppingItemSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(80, "Máximo 80 caracteres"),
  productId: id.nullable(),
  quantity: z.number().positive("La cantidad debe ser mayor que 0").max(1e6).nullable(),
  note: optText(120),
});
