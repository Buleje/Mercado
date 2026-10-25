import "server-only";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { LiquidacionCuentaDB } from "@/lib/db/liquidacion-cuenta.db";
import { unificarCuentas, type CuentaPersona, type ParteParaUnificar } from "@/lib/adelantos/cuenta-unificada";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";
import { isSpecializationEnabled } from "@/lib/specializations";

/**
 * La cuenta por persona del negocio (adelantos + madera, ADR-412 §5), armada en
 * el servidor una sola vez para todos los que la muestran (25-10).
 *
 * Por qué existe: el Resumen decía arriba «Le debes S/ 0.00» y, en la misma
 * pantalla, la «Cuenta por persona» decía «Le debes S/ 4,479.60 a Comunidad
 * Nativa…» (madera, no adelantos). Dos fuentes, dos cifras. Ahora las cifras de
 * arriba (`AdelantosHoyTocaDB.hoyToca` → `totalesDeCuentas`) salen de esta
 * misma función, la que arma la lista.
 *
 * Es la lógica de `GET /api/adelantos/cuentas` tal cual (misma unión, mismos
 * límites). Esa ruta debería llamar a esta función en vez de repetirla: así no
 * se pueden volver a separar.
 */

/**
 * `ForestCuentaDB.listar` trae como mucho esta cantidad (su propio `take`). Si
 * la respuesta llega justo a este número, puede haber más movimientos sin
 * traer: se avisa con `truncado` en vez de dar un saldo corto en silencio.
 */
export const LIMITE_MOVIMIENTOS_FORESTAL = 2000;

export interface CuentasDelNegocio {
  /** `false` = el negocio no tiene la especialización forestal: no hay madera que unir. */
  forestal: boolean;
  personas: CuentaPersona[];
  truncado: boolean;
}

export async function cuentasDelNegocio(tenantId: string): Promise<CuentasDelNegocio> {
  if (!tenantId) throw new Error("tenantId is required");
  const [beneficiarios, saldosAdelantos, forestal, vivas] = await Promise.all([
    AdelantosDB.listBeneficiarios(tenantId),
    /* Agrega EN LA BASE (groupBy), sin el tope de 500 de `list()`. ADR-448: con
       las dos direcciones, lo recibido resta del neto. */
    AdelantosDB.saldosPorPersona(tenantId, { direccion: "todas" }),
    isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"),
    LiquidacionCuentaDB.vivasPorPersona(tenantId),
  ]);

  let partes: ParteParaUnificar[] = [];
  let movimientos: MovimientoCuenta[] = [];
  let truncado = false;
  if (forestal) {
    /* Con inactivos: una parte dada de baja con cuenta viva no puede desaparecer de la unión. */
    const [listaPartes, listaMovs] = await Promise.all([
      ForestDirectorioDB.listarPartes(tenantId, { incluirInactivos: true }),
      ForestCuentaDB.listar(tenantId),
    ]);
    partes = listaPartes.map((p) => ({ id: p.id, nombre: p.nombre, docNumero: p.docNumero, telefono: p.telefono }));
    movimientos = listaMovs;
    truncado = listaMovs.length >= LIMITE_MOVIMIENTOS_FORESTAL;
  }

  const unificadas = unificarCuentas({
    beneficiarios: beneficiarios.map((b) => ({
      id: b.id,
      nombre: b.nombre,
      documento: b.documento ?? null,
      telefono: b.telefono ?? null,
      forestPartyId: b.forestPartyId ?? null,
    })),
    adelantos: saldosAdelantos.map((g) => ({
      beneficiarioId: g.beneficiarioId,
      status: g.status,
      saldoPendiente: g.saldoPendiente,
      moneda: g.moneda,
      cantidad: g.cantidad,
      direccion: g.direccion,
    })),
    partes,
    movimientos,
  });

  /* Revisión ADR-449: cuántas liquidaciones vivas tiene cada fila (con el neto
     en 0 la fila escondía «Liquidar», y el único «Anular» vive en ese modal). */
  const personas = unificadas.map((p) => ({
    ...p,
    liquidacionesVivas:
      (p.beneficiarioId ? (vivas.porBeneficiario[p.beneficiarioId] ?? 0) : 0) + (p.parteId ? (vivas.porParte[p.parteId] ?? 0) : 0),
  }));

  return { forestal, personas, truncado };
}
