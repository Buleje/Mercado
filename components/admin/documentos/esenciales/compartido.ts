import { ROL_CANDADO_DUENO } from "@/lib/documents/doc-access";

/** Cómo se dice cada rol en «Quién la ve». */
const ROL: Record<string, string> = {
  owner: "Dueño",
  admin: "Administrador",
  manager: "Encargado",
  cajero: "Cajero",
  almacenero: "Almacenero",
  repartidor: "Repartidor",
};

/** «Todos los del panel», «Sólo dueños» o la lista de roles. */
export function quienLaVe(roles: readonly string[] | null | undefined): { texto: string; cerrada: boolean } {
  const lista = roles ?? [];
  if (lista.length === 0) return { texto: "Todos los del panel", cerrada: false };
  if (lista.includes(ROL_CANDADO_DUENO)) return { texto: "Sólo dueños", cerrada: true };
  return { texto: lista.map((r) => ROL[r] ?? r).join(", "), cerrada: true };
}

const DIA = 86_400_000;

/** «hoy», «ayer», «hace 5 días», «hace 3 meses». */
export function haceCuanto(iso: string | null, ahora: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const dias = Math.floor((ahora - t) / DIA);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 31) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
}

export const papeles = (n: number) => (n === 1 ? "1 papel" : `${n} papeles`);
export const subcarpetas = (n: number) => (n === 1 ? "1 subcarpeta" : `${n} subcarpetas`);
export const veces = (n: number) => (n === 1 ? "1 vez" : `${n} veces`);

/** Campo de búsqueda (48 px, borde neutro de 1 px como el de Terceros, ADR-489). */
export const CAMPO_BUSCAR =
  "w-full h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";

export const SELECT =
  "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
