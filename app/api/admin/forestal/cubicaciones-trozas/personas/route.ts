import { NextRequest, NextResponse } from "next/server";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { unificarCuentas } from "@/lib/adelantos/cuenta-unificada";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ROLES_CUBICAR, guardCubicacion, noStore, responderError } from "../_comun";

/**
 * GET /api/admin/forestal/cubicaciones-trozas/personas (ADR-478, B6).
 *
 * «¿De quién es la madera?» del modal «Guardar en la cuenta». El almacenero
 * guarda la cubicación (B6) pero `/api/adelantos/cuentas` le responde 403 (no
 * lee Adelantos): el modal se quedaba sin personas. Acá van las MISMAS filas
 * de «Cuenta por persona» (misma unión por id o documento y el mismo filtro:
 * sólo quien tiene algo abierto), sin documento ni teléfono (Ley 29733: lo
 * mínimo para elegir). Los saldos de Adelantos van sólo a quien puede leerlos
 * (`conSaldos`), igual que en `/api/adelantos`.
 */
export async function GET(req: NextRequest) {
  const g = await guardCubicacion(req, { roles: ROLES_CUBICAR, escritura: false });
  if (g instanceof Response) return g;
  const tenantId = g.auth.tenantId;
  try {
    const [beneficiarios, saldos, forestal] = await Promise.all([
      AdelantosDB.listBeneficiarios(tenantId),
      AdelantosDB.saldosPorPersona(tenantId, { direccion: "todas" }),
      isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"),
    ]);
    const [partes, movimientos] = await Promise.all([
      forestal ? ForestDirectorioDB.listarPartes(tenantId, { incluirInactivos: true }) : Promise.resolve([]),
      forestal ? ForestCuentaDB.listar(tenantId) : Promise.resolve([]),
    ]);
    const unificadas = unificarCuentas({
      beneficiarios: beneficiarios.map((b) => ({
        id: b.id, nombre: b.nombre, documento: b.documento ?? null, telefono: null, forestPartyId: b.forestPartyId ?? null,
      })),
      adelantos: saldos.map((s) => ({
        beneficiarioId: s.beneficiarioId, status: s.status, saldoPendiente: s.saldoPendiente, moneda: s.moneda, cantidad: s.cantidad, direccion: s.direccion,
      })),
      partes: partes.map((p) => ({ id: p.id, nombre: p.nombre, docNumero: p.docNumero, telefono: null })),
      movimientos,
    });
    const conSaldos = permisoAdelantos(g.auth.role, "read") === null;
    const personas = unificadas.map((p) => ({
      clave: p.clave, nombre: p.nombre, beneficiarioId: p.beneficiarioId, parteId: p.parteId, ...(conSaldos ? { adelantos: p.adelantos } : {}),
    }));
    return NextResponse.json({ personas, conSaldos }, { headers: noStore });
  } catch (e) {
    return responderError(e, "GET personas", tenantId);
  }
}
