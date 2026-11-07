/**
 * Cómo se dice y se pinta cada valor de un alquiler (ADR-524). Montos,
 * atrasos y alertas los calcula el servidor (`resumen`); acá sólo palabras.
 */
import type {
  AlquilerDto,
  EstadoAlquiler,
  MedioPagoAlquiler,
  NuestroPapel,
  TipoAlertaAlquiler,
} from "@/lib/admin/fichas-tramites-alquileres";
import { MESES_NOMBRES } from "../comun/fechas";
import type { TonoInsignia } from "../comun/Insignia";

export const ESTADO_ALQUILER_UI: Record<EstadoAlquiler, { texto: string; tono: TonoInsignia }> = {
  negociacion: { texto: "En negociación", tono: "info" },
  vigente: { texto: "Vigente", tono: "success" },
  terminado: { texto: "Terminado", tono: "neutral" },
};

export const PAPEL_UI: Record<NuestroPapel, string> = {
  arrendador: "Alquilamos el local (somos los dueños)",
  inquilino: "Nos alquilan (somos inquilinos)",
  gestor: "Lo gestionamos por el dueño",
};

export const MEDIO_UI: Record<MedioPagoAlquiler, string> = {
  transferencia: "Transferencia",
  deposito: "Depósito",
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  cheque: "Cheque",
  otro: "Otro",
};

export const ALERTA_TONO: Record<TipoAlertaAlquiler, TonoInsignia> = {
  pago_atrasado: "error",
  pago_incompleto: "warning",
  fin_cerca: "warning",
  aviso_no_renovar: "warning",
  garantia_pendiente: "warning",
};

/** «setiembre 2026» para "2026-09". */
export function textoPeriodo(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return `${MESES_NOMBRES[(m ?? 1) - 1] ?? periodo} ${a}`;
}

/** «set.» para la grilla. */
export function mesCorto(periodo: string): string {
  const m = Number(periodo.slice(5, 7));
  return (MESES_NOMBRES[m - 1] ?? "").slice(0, 3);
}

export const duenoDe = (a: AlquilerDto): string => a.duenoNombre ?? a.duenoTexto ?? "";
export const inquilinoDe = (a: AlquilerDto): string => a.inquilinoNombre ?? a.inquilinoTexto ?? "";

/** "2026-09" + 1 → "2026-10" (aritmética de calendario, no de plata). */
export function sumarPeriodo(p: string, n: number): string {
  const [a, m] = p.split("-").map(Number);
  const t = (a ?? 0) * 12 + ((m ?? 1) - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Último mes que se puede registrar: el fin del contrato, o un año después de hoy si no tiene fin. */
export const ultimoPeriodo = (a: AlquilerDto, mesHoy: string): string => a.finEl?.slice(0, 7) ?? sumarPeriodo(mesHoy, 12);

/** Los meses del contrato, del inicio al último («2026-01», «2026-02», …). Tope de 20 años. */
export function periodosDelContrato(a: AlquilerDto, mesHoy: string): string[] {
  const fin = ultimoPeriodo(a, mesHoy);
  const out: string[] = [];
  for (let p = a.inicioEl.slice(0, 7); p <= fin && out.length < 240; p = sumarPeriodo(p, 1)) out.push(p);
  return out;
}

export type EstadoMes = "pagado" | "parcial" | "atrasado" | "por_pagar" | "sin_pago" | "futuro" | "fuera";

export const ESTADO_MES_UI: Record<EstadoMes, { texto: string; tono: TonoInsignia }> = {
  pagado: { texto: "Pagado", tono: "success" },
  parcial: { texto: "Pagado en parte", tono: "warning" },
  atrasado: { texto: "Atrasado", tono: "error" },
  por_pagar: { texto: "Toca pagar", tono: "warning" },
  sin_pago: { texto: "Sin pago", tono: "neutral" },
  futuro: { texto: "Futuro", tono: "neutral" },
  fuera: { texto: "Fuera del plazo", tono: "neutral" },
};

/** Qué es cada mes: el atraso, lo pagado en parte y el próximo los dice el servidor (`resumen`). */
export function estadoDelMes(a: AlquilerDto, periodo: string, mesHoy: string): EstadoMes {
  if (periodo < a.inicioEl.slice(0, 7) || (a.finEl && periodo > a.finEl.slice(0, 7))) return "fuera";
  if (faltaDelMes(a, periodo) !== null) return "parcial";
  if (a.pagos.some((p) => p.periodo === periodo)) return "pagado";
  if (a.resumen.periodosAtrasados.includes(periodo)) return "atrasado";
  if (periodo === a.resumen.proximoPeriodo) return "por_pagar";
  return periodo < mesHoy ? "sin_pago" : "futuro";
}

/** Lo que falta de un mes pagado en parte, tal como lo calculó el servidor (R2); null si no es parcial. */
export function faltaDelMes(a: AlquilerDto, periodo: string): number | null {
  return (a.resumen.periodosParciales ?? []).find((x) => x.periodo === periodo)?.falta ?? null;
}
