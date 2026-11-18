/**
 * Modelo de dominio. Este directorio (src/core) es TypeScript puro, sin
 * dependencias de React, Next.js ni del navegador, para poder reutilizarlo
 * tal cual en la futura app iOS (Expo / React Native).
 */

export type ID = string;
/** Fecha ISO sin hora: YYYY-MM-DD */
export type ISODate = string;

export type TxType = "expense" | "income" | "transfer" | "refund";
export type TxStatus = "paid" | "pending" | "scheduled";
export type CategoryKind = "expense" | "income";
export type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "credit_card"
  | "debit_card"
  | "paypal"
  | "investment"
  | "other";
export type Frequency = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";
export type Usage = "high" | "medium" | "low";

export interface Profile {
  id: ID;
  displayName: string | null;
  currency: string;
  monthlyBudget: number | null;
  seeded: boolean;
  /** Catálogo de productos por defecto ya creado (opcional: perfiles antiguos sin la migración 0002). */
  productsSeeded?: boolean;
  /** El usuario ya ha revisado/ajustado los saldos reales de sus cuentas. */
  balancesConfirmed?: boolean;
}

export interface Account {
  id: ID;
  name: string;
  type: AccountType;
  institution: string | null;
  initialBalance: number;
  currency: string;
  color: string;
  icon: string;
  archived: boolean;
  sortOrder: number;
}

export interface Category {
  id: ID;
  parentId: ID | null;
  kind: CategoryKind;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  /** Gasto necesario (true) frente a prescindible (false) */
  essential: boolean;
  sortOrder: number;
}

export interface Transaction {
  id: ID;
  type: TxType;
  /** Siempre positivo; el signo lo determina `type`. */
  amount: number;
  concept: string;
  categoryId: ID | null;
  subcategoryId: ID | null;
  date: ISODate;
  time: string | null;
  accountId: ID | null;
  toAccountId: ID | null;
  paymentMethod: string | null;
  merchant: string | null;
  description: string | null;
  tags: string[];
  isFixed: boolean;
  isRecurring: boolean;
  recurringId: ID | null;
  status: TxStatus;
  attachmentPath: string | null;
  notes: string | null;
  createdAt?: string;
}

export interface Budget {
  id: ID;
  /** null = presupuesto global */
  categoryId: ID | null;
  amount: number;
  /** YYYY-MM-01 para un mes concreto; null = se aplica a todos los meses */
  month: ISODate | null;
}

export interface Recurring {
  id: ID;
  name: string;
  amount: number;
  type: "expense" | "income";
  frequency: Frequency;
  nextDate: ISODate;
  startDate: ISODate;
  endDate: ISODate | null;
  categoryId: ID | null;
  subcategoryId: ID | null;
  accountId: ID | null;
  isSubscription: boolean;
  isFixed: boolean;
  status: "active" | "cancelled";
  usage: Usage | null;
  merchant: string | null;
  notes: string | null;
}

/** Producto del catálogo del usuario (p. ej. «Huevos», «Gasolina 95»). */
export interface Product {
  id: ID;
  name: string;
  /** Unidad en la que se mide y compara el precio: ud, kg, l, docena, paquete… (las variantes heredan la del genérico) */
  unit: string;
  categoryId: ID | null;
  /** Si es una variante/marca (p. ej. «V»), el producto genérico al que pertenece («Bebida energética») */
  parentId?: ID | null;
  /** Contenido de un envase en la unidad del producto (p. ej. 0,5 para una lata de 500 ml medida en litros) */
  packageSize?: number | null;
}

/** Línea del desglose de un movimiento (opcional). */
export interface TransactionItem {
  id: ID;
  transactionId: ID;
  productId: ID | null;
  /** Nombre en el momento de la compra (se conserva aunque se borre el producto). */
  name: string;
  quantity: number;
  unitPrice: number;
  /** Total de la línea (cantidad × precio; negativo para descuentos). */
  amount: number;
  sortOrder: number;
  /**
   * Formato del envase en esta compra, en la unidad del producto (0,5 = lata de 500 ml si se mide en litros).
   * null = sin formato: la cantidad se apunta directamente en la unidad del producto.
   */
  packageSize?: number | null;
}

export interface Goal {
  id: ID;
  name: string;
  targetAmount: number;
  savedAmount: number;
  deadline: ISODate | null;
  accountId: ID | null;
  color: string;
  icon: string;
  notes: string | null;
  archived: boolean;
}

export interface TxFilters {
  q?: string;
  types?: TxType[];
  categoryIds?: ID[];
  subcategoryIds?: ID[];
  accountIds?: ID[];
  statuses?: TxStatus[];
  tags?: string[];
  merchant?: string;
  from?: ISODate;
  to?: ISODate;
  minAmount?: number;
  maxAmount?: number;
  /** Movimientos que incluyen alguno de estos productos en su desglose */
  productIds?: ID[];
  fixed?: "fixed" | "variable";
}

export interface SavedView {
  id: ID;
  name: string;
  filters: TxFilters;
}

export interface FinanceData {
  profile: Profile;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurring: Recurring[];
  goals: Goal[];
  savedViews: SavedView[];
  products: Product[];
  transactionItems: TransactionItem[];
}

export type NewEntity<T extends { id: ID }> = Omit<T, "id"> & { id?: ID };
