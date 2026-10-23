import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { membreteParaPdf } from "@/lib/documentos/membrete-servidor";
import { GanadoDB } from "@/lib/db/rrhh-ganado.db";
import { CarpetaAjenaError } from "@/lib/db/documents.db";
import { EnlacesEntidadDB, SubidaFallidaError } from "@/lib/db/enlaces-entidad.db";
import { ROLES_ENTIDAD_SENSIBLE } from "@/lib/documentos/enlaces-entidad";
import { esFechaKey, rangoDeDias } from "@/lib/rrhh/fechas";
import { RRHH_COMPLETO } from "@/lib/rrhh/roles";
import { calcularQuedaPorPagar, explicarGanado } from "@/lib/rrhh/ganado";
import { pdfPagoSemanal } from "@/lib/rrhh/pago-semanal-pdf";

const MAX_DIAS_RANGO = 93;

const Body = z.object({
  desde: z.string().trim().min(1).max(10),
  hasta: z.string().trim().min(1).max(10),
  colaboradorId: z.string().trim().min(1).max(100).optional(),
});

/**
 * POST /api/admin/rrhh/pago-semanal/archivar — archiva el pago semanal de cada
 * colaborador como PDF en el Drive («Equipo/Pagos/<nombre>/<semana>»), atado por
 * el tag `colaborador:<id>` y visible sólo a admin/owner (ADR-502). NO calcula
 * montos: los toma de `GanadoDB.periodo` (misma fuente que `/api/rrhh/ganado`).
 * Un comprobante por persona con `total > 0`.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = applyRateLimit(req, "STRICT", "rrhh:pago-semanal-archivar");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const { desde, hasta, colaboradorId } = parsed.data;

    const dias = rangoDeDias(desde, hasta);
    if (!esFechaKey(desde) || !esFechaKey(hasta) || dias.length === 0 || dias.length > MAX_DIAS_RANGO) {
      return NextResponse.json({ error: "rango_invalido" }, { status: 422 });
    }

    const hoy = limaDateKey();
    const [ganado, { membrete, logo }] = await Promise.all([
      GanadoDB.periodo(auth.tenantId, { desde, hasta, hoy, colaboradorId }),
      membreteParaPdf(auth.tenantId),
    ]);

    // Carpeta «…/<semana>» y tag buscable: el período sortable, no "DD/MM".
    const semana = `${desde} a ${hasta}`;

    let archivados = 0;
    let fallidas = 0;
    const documentIds: string[] = [];

    for (const persona of ganado.personas) {
      if (persona.total <= 0) continue;
      try {
        const queda = calcularQuedaPorPagar({ total: persona.total, adelantos: persona.adelantos });
        const pdf = await pdfPagoSemanal({
          membrete,
          logo,
          nombre: persona.nombre,
          puesto: persona.puesto,
          desde,
          hasta,
          total: persona.total,
          comoSale: explicarGanado(persona),
          conteo: persona.conteo,
          adelantos: persona.adelantos
            ? { abiertosPen: persona.adelantos.abiertosPen, descontadoPen: persona.adelantos.descontadoPen }
            : null,
          aPagar: queda?.aPagar ?? null,
          deuda: queda?.deuda ?? null,
        });
        const documentId = await EnlacesEntidadDB.archivar(
          auth.tenantId,
          "colaborador",
          { id: persona.colaboradorId, nombre: persona.nombre, periodo: semana },
          {
            pdf,
            nombreArchivo: `Pago ${semana} — ${persona.nombre}`,
            extraTags: [semana],
            allowedRoles: ROLES_ENTIDAD_SENSIBLE,
          },
          auth.role,
          auth.username,
        );
        documentIds.push(documentId);
        archivados++;
      } catch (e) {
        fallidas++;
        logger.error("[rrhh/pago-semanal/archivar] persona fallo", {
          colaboradorId: persona.colaboradorId,
          esStorage: e instanceof SubidaFallidaError,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({ ok: true, archivados, fallidas, documentIds });
  } catch (e) {
    if (e instanceof CarpetaAjenaError) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
    logger.error("[rrhh/pago-semanal/archivar] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "pago_semanal_failed" }, { status: 500 });
  }
}
