import type { Account, Budget, Category, FinanceData, Goal, Profile, Recurring, SavedView, Transaction } from "@/core/types";

/**
 * Contrato de acceso a datos. La UI y el store solo hablan con esta interfaz,
 * nunca con Supabase directamente. La futura app iOS (Expo) puede reutilizar
 * la implementación de Supabase tal cual (supabase-js funciona en React Native).
 */
export interface EntityMap {
  accounts: Account;
  categories: Category;
  transactions: Transaction;
  budgets: Budget;
  recurring: Recurring;
  goals: Goal;
  savedViews: SavedView;
}
export type EntityKey = keyof EntityMap;

export interface FinanceRepository {
  readonly kind: "supabase" | "local";
  loadAll(): Promise<FinanceData>;
  upsert<K extends EntityKey>(entity: K, row: EntityMap[K]): Promise<EntityMap[K]>;
  insertMany<K extends EntityKey>(entity: K, rows: EntityMap[K][]): Promise<void>;
  remove<K extends EntityKey>(entity: K, id: string): Promise<void>;
  removeMany<K extends EntityKey>(entity: K, ids: string[]): Promise<void>;
  updateProfile(patch: Partial<Omit<Profile, "id">>): Promise<Profile>;
  /**
   * Marca de forma atómica que los datos iniciales se van a crear.
   * Devuelve true solo a quien la marca primero (evita sembrar dos veces si
   * se abren dos pestañas o dispositivos a la vez).
   */
  claimSeed(): Promise<boolean>;
  uploadAttachment(file: File): Promise<string>;
  attachmentUrl(path: string): Promise<string>;
  removeAttachment(path: string): Promise<void>;
  /** Restaura una copia de seguridad: borra todos los datos del usuario y los sustituye. */
  replaceAll(data: Omit<FinanceData, "profile"> & { profile?: Partial<Profile> }): Promise<void>;
}

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Orden seguro de inserción/borrado respetando claves foráneas. */
export const ENTITY_ORDER: EntityKey[] = ["accounts", "categories", "recurring", "transactions", "budgets", "goals", "savedViews"];
