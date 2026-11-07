/**
 * Contrato de «Refinanciar préstamo»: lo que pide la ruta y lo que arma el
 * modal salen de este archivo (11-10: el modal mandaba `{monto, tasaInteres,
 * numeroCuotas, sistemaAmortizacion}`, la ruta pedía otros nombres y el botón
 * daba 400 siempre).
 *
 * Se refinancia el capital pendiente que calcula el servidor; el modal ya no
 * manda monto (el campo «Nuevo monto» no lo usaba nadie).
 */
import { z } from "zod";
import type { SistemaAmortizacion } from "@/lib/prestamos/amortizacion";

export const RefinanciarSchema = z.object({
  /** % MENSUAL, como en el alta. Sin ella se mantiene la del préstamo. */
  nuevaTasa: z.number().min(0).max(100).optional(),
  nuevasCuotas: z.number().int().min(1).max(120),
  sistema: z.enum(["FRANCES", "ALEMAN", "AMERICANO"]).optional(),
});

export type CuerpoRefinanciar = z.infer<typeof RefinanciarSchema>;

/** Del texto de los campos del modal al cuerpo del POST, o el error a mostrar. */
export function cuerpoRefinanciar(campos: {
  tasa: string;
  cuotas: string;
  sistema: SistemaAmortizacion;
}): { ok: true; cuerpo: CuerpoRefinanciar } | { ok: false; error: string } {
  const tasa = Number.parseFloat(campos.tasa);
  const cuotas = Number(campos.cuotas);
  if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) return { ok: false, error: "Tasa inválida (0 a 100 % mensual)" };
  if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 120) return { ok: false, error: "N° cuotas inválido (1 a 120)" };
  return { ok: true, cuerpo: { nuevaTasa: tasa, nuevasCuotas: cuotas, sistema: campos.sistema } };
}
