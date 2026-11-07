import { NextRequest, NextResponse } from "next/server";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { unificarCuentas } from "@/lib/adelantos/cuenta-unificada";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ROLES_CUBICAR, guardCubicacion, noStore, responderError } from "../_comun";

/**
 * GET /api/admin/forestal/cubicaciones-trozas/personas (ADR-478, B6).
 *
 * «¿De quién es la madera?» del modal «Guardar en la cuenta». El almacenero
 * guarda la cubicación (B6) pero `/api/adelantos/cuentas` le responde 403 (no
 * lee Adelantos): el modal se quedaba sin personas. Acá van las MISMAS filas
 * de «Cuenta por persona» (misma unión por id o documento; además, ADR-484,
 * toda parte activa del directorio aunque no tenga nada abierto: la venta sin
 * adelanto queda en su cuenta), sin documento ni teléfono (Ley 29733: lo
 * mínimo para elegir). Los saldos de Adelantos van sólo a quien puede leerlos
 * (`conSaldos`), igual que en `/api/adelantos`, con el saldo de su cuenta
 * forestal (ADR-484: adonde va lo que el adelanto no cubre).
 */
const movimientoEnCero = (p: { id: string; nombre: string }): MovimientoCuenta => ({
  id: `cero:${p.id}`, parteId: p.id, parteNombre: p.nombre, fecha: "1970-01-01", tipo: "cargo", concepto: "otro",
  monto: 0, moneda: "PEN", referencia: null, fleteId: null, notas: null,
});

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
      /* ADR-484: la venta sin adelanto va a la cuenta, así que todo cliente o
         proveedor ACTIVO del directorio se puede elegir aunque no tenga nada
         abierto (la unión de «Cuenta por persona» lo descarta). Un movimiento
         en cero no mueve su saldo: sólo lo deja pasar, con la misma unión por
         id o documento que el resto. */
      movimientos: [...movimientos, ...partes.filter((p) => p.activo).map(movimientoEnCero)],
    });
    const conSaldos = permisoAdelantos(g.auth.role, "read") === null;
    const personas = unificadas.map((p) => ({
      clave: p.clave, nombre: p.nombre, beneficiarioId: p.beneficiarioId, parteId: p.parteId,
      /* ADR-484: `cuenta` = saldo de su cuenta forestal (+ te debe); null = sin ficha en el directorio (lo que el adelanto no cubre no tiene dónde quedar). */
      ...(conSaldos ? { adelantos: p.adelantos, cuenta: p.parteId ? (p.madera?.saldo ?? 0) : null } : {}),
    }));
    return NextResponse.json({ personas, conSaldos }, { headers: noStore });
  } catch (e) {
    return responderError(e, "GET personas", tenantId);
  }
}
