/**
 * Poner la misma fecha de cobro a varios adelantos de un golpe (Cobranza).
 *
 * Los atajos se calculan en HORA DE LIMA: a las 20:00 de Pucallpa el reloj UTC
 * ya marca mañana, y «en 30 días» contado desde el día UTC se corría un día.
 * Todo viaja como día «AAAA-MM-DD»; `instanteDeVencimiento` lo vuelve mediodía
 * de Lima al guardarlo.
 */

import { limaDateKey } from "@/lib/utils";

export type AtajoFechaCobro = "en-15" | "en-30" | "fin-de-mes";

export const ATAJOS_FECHA_COBRO: ReadonlyArray<{ id: AtajoFechaCobro; label: string }> = [
  { id: "en-15", label: "En 15 días" },
  { id: "en-30", label: "En 30 días" },
  { id: "fin-de-mes", label: "Fin de mes" },
];

const aClave = (u: Date) => u.toISOString().slice(0, 10);

/** «2026-10-25» + 15 → «2026-11-09». Aritmética en UTC sobre el día suelto. */
export function sumarDias(dia: string, dias: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  return aClave(new Date(Date.UTC(y, m - 1, d + dias)));
}

/** Último día del mes de «AAAA-MM-DD». */
export function finDeMes(dia: string): string {
  const [y, m] = dia.split("-").map(Number);
  return aClave(new Date(Date.UTC(y, m, 0)));
}

/** El día que corresponde al atajo, contado desde HOY en Lima. */
export function fechaDeAtajo(atajo: AtajoFechaCobro, ahora: Date | number = new Date()): string {
  const hoy = limaDateKey(ahora);
  if (atajo === "en-15") return sumarDias(hoy, 15);
  if (atajo === "en-30") return sumarDias(hoy, 30);
  return finDeMes(hoy);
}

export interface CandidatoLote {
  id: string;
  status: string;
  direccion: string;
  modalidad: string;
  fechaAdelanto: Date | string;
}

export type MotivoOmitido = "no_abierto" | "no_dado" | "entregas_pactadas" | "antes_del_adelanto";

/**
 * Cuáles reciben la fecha y cuáles no, y por qué. Sólo ABIERTO y DADO; las
 * ENTREGAS_PACTADAS ya traen su propia fecha por cuota, así que no se pisan; y
 * nunca antes del día en que se dio la plata (misma regla que el alta).
 */
export function repartirLote(
  candidatos: readonly CandidatoLote[],
  dia: string,
): { aplicar: string[]; omitidos: Array<{ id: string; motivo: MotivoOmitido }> } {
  const aplicar: string[] = [];
  const omitidos: Array<{ id: string; motivo: MotivoOmitido }> = [];
  for (const c of candidatos) {
    const motivo: MotivoOmitido | null =
      c.status !== "ABIERTO"
        ? "no_abierto"
        : c.direccion !== "DADO"
          ? "no_dado"
          : c.modalidad === "ENTREGAS_PACTADAS"
            ? "entregas_pactadas"
            : dia < limaDateKey(c.fechaAdelanto)
              ? "antes_del_adelanto"
              : null;
    if (motivo) omitidos.push({ id: c.id, motivo });
    else aplicar.push(c.id);
  }
  return { aplicar, omitidos };
}
