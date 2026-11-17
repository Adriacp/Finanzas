import { ImageResponse } from "next/og";

/** Icono de la app generado en el servidor (PNG) para PWA e iOS. */
export function appIcon(size: number, radius: number) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 55%, #d946ef 100%)", borderRadius: radius }}>
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17l5-5 4 4 7-8" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
