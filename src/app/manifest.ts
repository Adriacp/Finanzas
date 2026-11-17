import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finanzas — gestión financiera personal",
    short_name: "Finanzas",
    description: "Controla tus ingresos, gastos, presupuestos y objetivos de ahorro.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0f12",
    theme_color: "#0f0f12",
    lang: "es",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Añadir movimiento", url: "/transactions?new=1" },
      { name: "Análisis", url: "/analytics" },
    ],
  };
}
