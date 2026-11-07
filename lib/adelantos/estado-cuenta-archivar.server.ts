import "server-only";

/**
 * El estado de cuenta de una persona del padrón de Adelantos, en PDF y
 * archivado en «Terceros/<nombre>» (ADR-502). Una sola receta para el botón del
 * Archivo (`POST /api/admin/documents/estado-cuenta`) y para el asistente
 * (`papeles_liquidacion`, ADR-528): salió de la ruta para que los dos papeles
 * no puedan diferir.
 *
 * Mismo cálculo que `/api/adelantos/cuentas/estado`: Adelantos + la cuenta
 * forestal de la parte vinculada a la ficha (sin vínculo = sin forestal).
 */

import { AdelantosDB } from "@/lib/db/adelantos.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { EnlacesEntidadDB } from "@/lib/db/enlaces-entidad.db";
import { ROLES_ENTIDAD_SENSIBLE } from "@/lib/documentos/enlaces-entidad";
import { membreteParaPdf } from "@/lib/documentos/membrete-servidor";
import {
  estadoCuentaUnificado,
  totalesDeEstadoCuenta,
  type TotalesEstadoCuenta,
} from "@/lib/adelantos/estado-cuenta-unificado";
import { pdfEstadoDeCuenta } from "@/lib/adelantos/estado-cuenta-pdf";

export interface EstadoDeCuentaArchivado {
  documentId: string;
  nombre: string;
  nombreArchivo: string;
  lineas: number;
  totales: TotalesEstadoCuenta;
}

/**
 * null = la persona no es de este negocio (ownership por tenantId en el WHERE).
 * Tira `CarpetaAjenaError` / `SubidaFallidaError` de la subida tal cual.
 */
export async function archivarEstadoDeCuenta(
  tenantId: string,
  terceroId: string,
  opciones: { nombreRespaldo?: string; rol?: string; usuario?: string },
): Promise<EstadoDeCuentaArchivado | null> {
  const tercero = await AdelantosDB.getBeneficiario(tenantId, terceroId);
  if (!tercero) return null;
  const nombre = tercero.nombre || opciones.nombreRespaldo || "Sin nombre";

  const parteId = tercero.forestPartyId ?? null;
  const [adelantos, forestales] = await Promise.all([
    AdelantosDB.list(tenantId, { beneficiarioId: terceroId, direccion: "todas" }),
    parteId ? ForestCuentaDB.listar(tenantId, { parteId }) : Promise.resolve([]),
  ]);
  const movimientos = estadoCuentaUnificado(
    adelantos.map((a) => ({
      status: a.status,
      codigoOperacion: a.codigoOperacion ?? null,
      fechaAdelanto: a.fechaAdelanto,
      montoAdelantado: a.montoAdelantado,
      moneda: a.moneda,
      direccion: a.direccion,
      entregas: a.entregas.map((e) => ({ fecha: e.fecha, descripcion: e.descripcion ?? null, valor: e.valor })),
    })),
    forestales,
  );
  const { membrete, logo } = await membreteParaPdf(tenantId);
  const pdf = await pdfEstadoDeCuenta(membrete, nombre, movimientos, logo);

  const nombreArchivo = `Estado de cuenta — ${nombre}.pdf`;
  const documentId = await EnlacesEntidadDB.archivar(
    tenantId,
    "tercero",
    { id: terceroId, nombre },
    { pdf, nombreArchivo, allowedRoles: ROLES_ENTIDAD_SENSIBLE },
    opciones.rol,
    opciones.usuario,
  );
  return { documentId, nombre, nombreArchivo, lineas: movimientos.length, totales: totalesDeEstadoCuenta(movimientos) };
}
