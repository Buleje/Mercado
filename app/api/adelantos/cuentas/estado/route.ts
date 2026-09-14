import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { sonLaMismaCuenta } from "@/lib/adelantos/cuenta-unificada";
import { datosPagoDelNegocio, estadoCuentaUnificado, totalesDeEstadoCuenta } from "@/lib/adelantos/estado-cuenta-unificado";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

/**
 * GET /api/adelantos/cuentas/estado?beneficiario=&parte= — el detalle línea a
 * línea de UNA persona (ADR-412 §5): lo que hace falta para el WhatsApp y el
 * PDF que no trae `/api/adelantos/cuentas` (esa sólo resume). Al menos uno de
 * los dos parámetros; los dos si la persona tiene ficha Y parte vinculada.
 *
 * IDOR: `beneficiario`/`parte` se validan CONTRA ESTE TENANT antes de leer
 * nada — mismo cuidado que el resto del módulo (memoria: beneficiario ajeno).
 *
 * Con los dos, tienen que ser la MISMA cuenta (`sonLaMismaCuenta`, el criterio
 * de `unificarCuentas`) o 409: con la lista desactualizada,
 * `beneficiario=B1&parte=P2` juntaba dos cuentas y la deuda de P2 salía por el
 * WhatsApp de B1.
 */
const QuerySchema = z
  .object({
    beneficiario: z.string().min(1).max(60).optional(),
    parte: z.string().min(1).max(60).optional(),
  })
  .refine((v) => v.beneficiario || v.parte, { message: "Falta el beneficiario o la parte" });

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const sp = req.nextUrl.searchParams;
    const parsed = QuerySchema.safeParse({
      beneficiario: sp.get("beneficiario") ?? undefined,
      parte: sp.get("parte") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const { beneficiario: beneficiarioId, parte: parteId } = parsed.data;

    const [persona, fichaParte, movimientos, settings] = await Promise.all([
      beneficiarioId ? AdelantosDB.getBeneficiario(auth.tenantId, beneficiarioId) : Promise.resolve(null),
      // Con las dadas de baja: la fila de la cuenta sigue mostrando una parte
      // borrada mientras tenga plata viva, y validar con `getParte` (que las
      // excluye) le daba 404 al WhatsApp y al PDF de esa misma fila.
      parteId ? ForestDirectorioDB.getParteParaEstadoCuenta(auth.tenantId, parteId) : Promise.resolve(null),
      parteId ? ForestCuentaDB.listar(auth.tenantId, { parteId }) : Promise.resolve<MovimientoCuenta[]>([]),
      SettingsDB.get(auth.tenantId),
    ]);

    if (beneficiarioId && !persona) return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    // Ni ficha ni movimientos en ESTE tenant: la parte no es de acá. (El
    // movimiento no tiene FK a la parte: puede sobrevivir a su fila.)
    if (parteId && !fichaParte && movimientos.length === 0) {
      return NextResponse.json({ error: "Parte no encontrada" }, { status: 404 });
    }

    if (persona && parteId) {
      const propia = persona.forestPartyId ?? null;
      // Sólo importa si el vínculo propio apunta a OTRA parte: ¿sigue viva? A un
      // puntero a una parte que ya no existe la unión lo trata como "sin vincular".
      const vinculoPropioVigente =
        propia !== null && propia !== parteId
          ? Boolean(await ForestDirectorioDB.getParte(auth.tenantId, propia)) ||
            (await ForestCuentaDB.listar(auth.tenantId, { parteId: propia })).length > 0
          : false;
      const misma = sonLaMismaCuenta({
        beneficiario: { id: persona.id, documento: persona.documento ?? null, forestPartyId: propia },
        // Una parte borrada no le lleva documento a la unión (`listarPartes` no la trae).
        parte: { id: parteId, docNumero: fichaParte && !fichaParte.borrada ? fichaParte.parte.docNumero : null },
        parteVinculadaA: fichaParte?.vinculadaA ?? null,
        vinculoPropioVigente,
      });
      if (!misma) {
        return NextResponse.json({ error: "La persona y la parte no son la misma cuenta" }, { status: 409 });
      }
    }

    let adelantos: Awaited<ReturnType<typeof AdelantosDB.list>> = [];
    if (persona) adelantos = await AdelantosDB.list(auth.tenantId, { beneficiarioId: persona.id });

    const lineas = estadoCuentaUnificado(
      adelantos.map((a) => ({
        status: a.status,
        codigoOperacion: a.codigoOperacion ?? null,
        fechaAdelanto: a.fechaAdelanto,
        montoAdelantado: a.montoAdelantado,
        moneda: a.moneda,
        entregas: a.entregas.map((e) => ({ fecha: e.fecha, descripcion: e.descripcion ?? null, valor: e.valor })),
      })),
      movimientos,
    );
    const totales = totalesDeEstadoCuenta(lineas);
    // A dónde se le paga AL NEGOCIO (su configuración), nunca la cuenta de la
    // persona: los datos bancarios de su ficha son para transferirLE a ella.
    const pago = datosPagoDelNegocio(settings);

    // Sin caché: mismo criterio que `/api/adelantos/cuentas` — un estado de
    // cuenta que se manda por WhatsApp no puede ser el de hace 30 s.
    return NextResponse.json({ lineas, totales, pago }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[adelantos/cuentas/estado] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
