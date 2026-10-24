

// Tipos y formatos de la ficha rápida de una tienda (TenantDetailModal y sus pestañas).
export type TabDetalle =
  | "resumen" | "salud" | "uso" | "facturacion" | "avisos" | "seguridad" | "credenciales" | "actividad" | "notas";
export type ActivityRow = {
  id: string;
  action: string;
  detail?: string | null;
  user?: string | null;
  createdAt: string;
};
export type NoteRow = { id: string; body: string; author: string; createdAt: string };
export type SecurityInfo = {
  username: string | null;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  lastLoginDetail: string | null;
};

export function fmtD(d: string | null) {
  return d
    ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
}
export function fmtDT(d: string) {
  return new Date(d).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function fmtMoney(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function unlimited(v: number) {
  return v === -1 ? "∞" : v.toLocaleString("es-PE");
}
export function pct(u: number, m: number) {
  return m === -1 ? 0 : Math.min(100, Math.round((u / m) * 100));
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** «jueves 10/09» (con el año si no es el actual); «—» sin fecha. Días escritos a mano, no Intl. */
export function fmtDia(iso: string | null | undefined): string {
  if (!iso) return "—";
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "—";
  const dd = String(f.getDate()).padStart(2, "0");
  const mm = String(f.getMonth() + 1).padStart(2, "0");
  const anio = f.getFullYear() !== new Date().getFullYear() ? `/${f.getFullYear()}` : "";
  return `${DIAS[f.getDay()]} ${dd}/${mm}${anio}`;
}
/** «jueves 10/09 · 14:05». */
export function fmtDiaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "—";
  return `${fmtDia(iso)} · ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
}
/** Días enteros desde hoy hasta la fecha (negativo = ya pasó); null sin fecha. */
export function diasHasta(iso: string | null | undefined, ahora: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.ceil((t - ahora) / 86_400_000);
}
