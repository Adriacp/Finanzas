import type { Account, AccountType, Category, CategoryKind } from "./types";

interface CategorySeed {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  essential: boolean;
  description: string;
  subs: string[];
}

/** Categorías iniciales. El usuario puede modificarlas libremente después. */
export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: "Vivienda", kind: "expense", icon: "house", color: "#6366f1", essential: true, description: "Hogar, suministros y mantenimiento",
    subs: ["Alquiler", "Hipoteca", "Comunidad", "Electricidad", "Agua", "Gas", "Internet", "Móvil", "Mantenimiento", "Muebles", "Decoración", "Limpieza"] },
  { name: "Alimentación", kind: "expense", icon: "shopping-basket", color: "#22c55e", essential: true, description: "Supermercado y comidas fuera",
    subs: ["Supermercado", "Restaurantes", "Cafeterías", "Comida a domicilio", "Comida rápida", "Otros alimentos"] },
  { name: "Transporte", kind: "expense", icon: "car", color: "#0ea5e9", essential: true, description: "Desplazamientos y vehículo",
    subs: ["Gasolina", "Transporte público", "Taxi", "Uber / Cabify", "Parking", "Peajes", "Mantenimiento del vehículo", "Seguro del vehículo", "ITV", "Alquiler de vehículos"] },
  { name: "Ocio y entretenimiento", kind: "expense", icon: "party-popper", color: "#f97316", essential: false, description: "Tiempo libre, viajes y diversión",
    subs: ["Cine", "Conciertos", "Discotecas", "Bares", "Viajes", "Hoteles", "Actividades", "Videojuegos", "Streaming", "Hobbies"] },
  { name: "Compras", kind: "expense", icon: "shopping-bag", color: "#ec4899", essential: false, description: "Ropa, tecnología y artículos personales",
    subs: ["Ropa", "Calzado", "Tecnología", "Electrónica", "Accesorios", "Cosmética", "Cuidado personal", "Hogar", "Regalos"] },
  { name: "Salud", kind: "expense", icon: "heart-pulse", color: "#ef4444", essential: true, description: "Salud y bienestar",
    subs: ["Farmacia", "Médico", "Dentista", "Seguro médico", "Gimnasio", "Psicología", "Tratamientos"] },
  { name: "Educación", kind: "expense", icon: "graduation-cap", color: "#8b5cf6", essential: true, description: "Formación y aprendizaje",
    subs: ["Cursos", "Libros", "Formación online", "Material educativo"] },
  { name: "Finanzas", kind: "expense", icon: "landmark", color: "#64748b", essential: true, description: "Comisiones, impuestos, préstamos y seguros",
    subs: ["Comisiones bancarias", "Intereses", "Impuestos", "Préstamos", "Inversiones", "Ahorro", "Seguros"] },
  { name: "Suscripciones", kind: "expense", icon: "repeat", color: "#14b8a6", essential: false, description: "Servicios recurrentes",
    subs: ["Netflix", "Spotify", "Amazon Prime", "iCloud", "Aplicaciones", "Software", "Otros servicios recurrentes"] },
  { name: "Mascotas", kind: "expense", icon: "paw-print", color: "#a16207", essential: true, description: "Cuidado de mascotas",
    subs: ["Alimentación", "Veterinario", "Higiene", "Accesorios"] },
  { name: "Ingresos", kind: "income", icon: "trending-up", color: "#10b981", essential: false, description: "Todas tus fuentes de ingresos",
    subs: ["Nómina", "Pagas extras", "Freelance", "Negocios", "Inversiones", "Intereses", "Alquileres", "Devoluciones", "Regalos", "Otros ingresos"] },
  { name: "Otros", kind: "expense", icon: "circle-ellipsis", color: "#94a3b8", essential: false, description: "Gastos sin clasificar",
    subs: ["Gastos imprevistos", "Donaciones", "Multas", "Otros gastos"] },
];

/** Genera las filas de categorías (padres + hijas) con IDs ya asignados. */
export function buildDefaultCategories(newId: () => string): Category[] {
  const out: Category[] = [];
  DEFAULT_CATEGORIES.forEach((c, i) => {
    const parentId = newId();
    out.push({ id: parentId, parentId: null, kind: c.kind, name: c.name, icon: c.icon, color: c.color, description: c.description, essential: c.essential, sortOrder: i });
    c.subs.forEach((s, j) =>
      out.push({ id: newId(), parentId, kind: c.kind, name: s, icon: c.icon, color: c.color, description: null, essential: c.essential, sortOrder: j }),
    );
  });
  return out;
}

export function buildDefaultAccounts(newId: () => string, currency = "EUR"): Account[] {
  return [
    { id: newId(), name: "Cuenta principal", type: "checking", institution: null, initialBalance: 0, currency, color: "#6366f1", icon: "landmark", archived: false, sortOrder: 0 },
    { id: newId(), name: "Efectivo", type: "cash", institution: null, initialBalance: 0, currency, color: "#22c55e", icon: "banknote", archived: false, sortOrder: 1 },
  ];
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Cuenta corriente",
  savings: "Cuenta de ahorro",
  cash: "Efectivo",
  credit_card: "Tarjeta de crédito",
  debit_card: "Tarjeta de débito",
  paypal: "PayPal",
  investment: "Inversión",
  other: "Otra",
};

export const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  checking: "landmark",
  savings: "piggy-bank",
  cash: "banknote",
  credit_card: "credit-card",
  debit_card: "credit-card",
  paypal: "wallet",
  investment: "chart-line",
  other: "wallet",
};

export const PAYMENT_METHODS = ["Tarjeta", "Efectivo", "Transferencia", "Bizum", "Domiciliación", "PayPal", "Apple Pay", "Google Pay", "Otro"];

export const PAYMENT_METHOD_ICONS: Record<string, string> = {
  Tarjeta: "credit-card",
  Efectivo: "banknote",
  Transferencia: "arrow-left-right",
  Bizum: "smartphone",
  Domiciliación: "landmark",
  PayPal: "wallet",
  "Apple Pay": "smartphone",
  "Google Pay": "smartphone",
  Otro: "circle-ellipsis",
};

export const PALETTE = ["#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#0ea5e9", "#3b82f6", "#64748b", "#a16207", "#94a3b8"];

export const CATEGORY_ICONS = [
  "house", "shopping-basket", "car", "party-popper", "shopping-bag", "heart-pulse", "graduation-cap", "landmark", "repeat", "paw-print",
  "trending-up", "circle-ellipsis", "utensils", "coffee", "plane", "bus", "fuel", "gift", "gamepad-2", "music", "film", "dumbbell",
  "pill", "baby", "shirt", "smartphone", "laptop", "book-open", "briefcase", "piggy-bank", "receipt", "zap", "droplet", "wifi",
  "wrench", "sparkles", "tag", "wallet", "banknote", "credit-card", "target", "umbrella", "hammer", "tree-palm", "beer", "ticket",
];
