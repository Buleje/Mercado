/**
 * Cuentas (Mi Plata › Movimientos › Todo lo que entró y salió): lo que la
 * pantalla hace con la lista que ya armó el servidor. NO calcula la plata del
 * periodo (esos totales llegan hechos): solo prepara filas, filtra por tarjeta
 * y agrupa por día para dibujar. Las sumas por día son de lo que se ve.
 */
import { limaDateKey } from "@/lib/utils";
import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { GrupoCuenta, MovimientoCuenta } from "@/lib/finance/cuentas-tipos";

/** Un movimiento listo para dibujar: su día de Lima y su hora. */
export interface FilaCuenta extends MovimientoCuenta {
  /** YYYY-MM-DD en Lima. */
  dia: string;
  /** «14:05» (Lima) o "" si el dato se guardó solo con fecha. */
  hora: string;
}

export interface DiaDeCuentas {
  dia: string;
  filas: FilaCuenta[];
  /** Lo que se ve de ese día, solo PEN. */
  entra: number;
  sale: number;
}

/** Cómo se pinta cada grupo: color por token `--data-*` y de qué lado va la plata. */
export const GRUPOS: Record<GrupoCuenta, { rotulo: string; entra: boolean; texto: string; punto: string; borde: string }> = {
  adelantos: { rotulo: "Adelantos", entra: false, texto: "text-[var(--data-warning-ink)]", punto: "bg-[var(--data-warning-500)]", borde: "border-l-[var(--data-warning-500)]" },
  gastos: { rotulo: "Gastos", entra: false, texto: "text-[var(--data-error-ink)]", punto: "bg-[var(--data-error-500)]", borde: "border-l-[var(--data-error-500)]" },
  ingresos: { rotulo: "Ingresos", entra: true, texto: "text-[var(--data-success-ink)]", punto: "bg-[var(--data-success-500)]", borde: "border-l-[var(--data-success-500)]" },
};

/** Lima es UTC−5 todo el año (sin horario de verano). */
export function horaLima(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms - 5 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function prepararFilas(movimientos: readonly MovimientoCuenta[]): FilaCuenta[] {
  return movimientos.map((m) => ({ ...m, dia: limaDateKey(m.cuando), hora: m.conHora ? horaLima(m.cuando) : "" }));
}

/** Lo que deja la tarjeta tocada (`null` = todas las filas). */
export function filasDelGrupo(filas: readonly FilaCuenta[], grupo: GrupoCuenta | null): FilaCuenta[] {
  return grupo ? filas.filter((f) => f.grupo === grupo) : [...filas];
}

/** Agrupa por día en el orden en que llegan (lo más nuevo primero). */
export function agruparPorDia(filas: readonly FilaCuenta[]): DiaDeCuentas[] {
  const dias = new Map<string, DiaDeCuentas>();
  for (const f of filas) {
    let d = dias.get(f.dia);
    if (!d) {
      d = { dia: f.dia, filas: [], entra: 0, sale: 0 };
      dias.set(f.dia, d);
    }
    d.filas.push(f);
    if (f.moneda !== "PEN") continue;
    if (GRUPOS[f.grupo].entra) d.entra += f.monto;
    else d.sale += f.monto;
  }
  return [...dias.values()];
}

export const COLUMNAS_FILTRO_CUENTAS: readonly ColumnaFiltro<FilaCuenta>[] = [
  { id: "tipo", label: "Tipo", tipo: "multi", valor: (f) => f.tipo },
  { id: "persona", label: "Persona", tipo: "texto", valor: (f) => f.persona },
  { id: "detalle", label: "Detalle", tipo: "texto", valor: (f) => f.detalle },
  { id: "monto", label: "Monto", tipo: "rango", numero: (f) => f.monto, paso: 1 },
];
