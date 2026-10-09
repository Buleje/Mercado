

// Tipos y formatos de la ficha rápida de una tienda (TenantDetailModal y sus pestañas).
export type TabDetalle = "resumen" | "salud" | "uso" | "facturacion" | "seguridad" | "actividad" | "notas";
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
  return `S/${n.toFixed(2)}`;
}
export function unlimited(v: number) {
  return v === -1 ? "∞" : v.toLocaleString("es-PE");
}
export function pct(u: number, m: number) {
  return m === -1 ? 0 : Math.min(100, Math.round((u / m) * 100));
}
