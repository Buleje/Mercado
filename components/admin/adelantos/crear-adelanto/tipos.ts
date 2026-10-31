import type { AdelantoConceptoRecibido, AdelantoDireccion } from "@/lib/adelantos/direccion";
import type { ResumenPersona } from "@/lib/adelantos/saldo-persona";
import type { DbAdelanto, DbBeneficiario } from "@/lib/db/adelantos.db";

/**
 * Las cifras por dirección que el servidor suma a `ResumenPersona` (ADR-448
 * §2.6). Opcionales a propósito: una respuesta de antes no las trae, y
 * `cuentaDePersona` (lib/adelantos/modos-alta) las arma con lo que sí viene.
 */
export type CifrasPorDireccion = {
  teDebe?: Record<string, number>;
  leDebes?: Record<string, number>;
  recibidoPendiente?: Record<string, number>;
  recibidoExcedido?: Record<string, number>;
  /** Cuántos recibidos siguen abiertos (`adelantosAbiertos` cuenta sólo lo dado). */
  recibidosAbiertos?: number;
};

/**
 * Una persona con lo que el mostrador necesita saber de ella antes de darle más
 * plata. Los agregados los calcula el endpoint de beneficiarios.
 */
export type BeneficiarioConSaldo = DbBeneficiario & ResumenPersona & CifrasPorDireccion;

/** Un adelanto que puede traer de qué lado está la plata (sin el campo = DADO). */
export type AdelantoConDireccion = DbAdelanto & {
  direccion?: AdelantoDireccion | null;
  conceptoRecibido?: AdelantoConceptoRecibido | null;
};

/** Una cuota del plan, tal como se edita en pantalla (todo string hasta enviar). */
export type CuotaBorrador = {
  /** Clave estable de React: reordenar por índice re-monta las filas. */
  key: string;
  descripcion: string;
  valor: string;
  fecha: string;
};
