const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Admite la clave "anon" clásica o la nueva "publishable" (sb_publishable_…)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

export const supabaseConfig = { url, anonKey };

/** Supabase está configurado con valores reales (no los del ejemplo). */
export const isSupabaseConfigured = /^https?:\/\//.test(url) && anonKey.length > 20 && !url.includes("TU-PROYECTO");

/** Modo demo: sin Supabase, datos guardados solo en este navegador. */
export const isDemoMode = !isSupabaseConfigured && process.env.NEXT_PUBLIC_ENABLE_DEMO !== "false";

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
