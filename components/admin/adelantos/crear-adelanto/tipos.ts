import type { ResumenPersona } from "@/lib/adelantos/saldo-persona";
import type { DbBeneficiario } from "@/lib/db/adelantos.db";

/**
 * Una persona con lo que el mostrador necesita saber de ella antes de darle más
 * plata. Los tres agregados los calcula el endpoint de beneficiarios.
 */
export type BeneficiarioConSaldo = DbBeneficiario & ResumenPersona;

/** Una cuota del plan, tal como se edita en pantalla (todo string hasta enviar). */
export type CuotaBorrador = {
  /** Clave estable de React: reordenar por índice re-monta las filas. */
  key: string;
  descripcion: string;
  valor: string;
  fecha: string;
};
