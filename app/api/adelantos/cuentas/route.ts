import { NextRequest, NextResponse } from "next/server";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { unificarCuentas, type ParteParaUnificar } from "@/lib/adelantos/cuenta-unificada";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";
import { requireAdmin } from "@/lib/require-admin";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";

/**
 * `ForestCuentaDB.listar` trae como mucho esta cantidad (su propio `take`,
 * ver forest-cuenta.db.ts — no se toca esa clase acá). Si la respuesta llega
 * justo a este número, puede haber más movimientos sin traer: se avisa con
 * `truncado` en vez de mostrar un saldo que puede quedar corto en silencio.
 */
const LIMITE_MOVIMIENTOS_FORESTAL = 2000;

/**
 * GET /api/adelantos/cuentas — Adelantos y la cuenta corriente forestal, una
 * fila por persona (ADR-412 §5). `forestal:false` cuando el tenant no tiene la
 * especialización: no se toca `ForestCuentaMov`/`ForestParty` de un negocio
 * que ni siquiera las usa.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const [beneficiarios, saldosAdelantos, forestal] = await Promise.all([
      AdelantosDB.listBeneficiarios(auth.tenantId),
      // `saldosPorPersona` agrega EN LA BASE (groupBy): a diferencia de
      // `list()` no tiene tope de 500 filas — una cuenta no puede quedar
      // corta sin avisar.
      AdelantosDB.saldosPorPersona(auth.tenantId),
      isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"),
    ]);

    let partes: ParteParaUnificar[] = [];
    let movimientos: MovimientoCuenta[] = [];
    let truncado = false;
    if (forestal) {
      // Con inactivos: una parte dada de baja del directorio pero con cuenta
      // viva no puede desaparecer de la unión.
      const [listaPartes, listaMovs] = await Promise.all([
        ForestDirectorioDB.listarPartes(auth.tenantId, { incluirInactivos: true }),
        ForestCuentaDB.listar(auth.tenantId),
      ]);
      partes = listaPartes.map((p) => ({ id: p.id, nombre: p.nombre, docNumero: p.docNumero, telefono: p.telefono }));
      movimientos = listaMovs;
      truncado = listaMovs.length >= LIMITE_MOVIMIENTOS_FORESTAL;
    }

    const personas = unificarCuentas({
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
      })),
      partes,
      movimientos,
    });

    // Sin caché: justo después de `vincular_parte` esta misma ruta tiene que
    // reflejar el vínculo nuevo — un `max-age` la dejaba mostrando la fila
    // vieja hasta 30 s (revisión de código, hallazgo medio).
    return NextResponse.json({ forestal, personas, truncado }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[adelantos/cuentas] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
