import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { MembreteDB } from "@/lib/db/membrete.db";
import { CarpetaAjenaError } from "@/lib/db/documents.db";
import { EnlacesEntidadDB, SubidaFallidaError } from "@/lib/db/enlaces-entidad.db";
import { ROLES_ENTIDAD_SENSIBLE } from "@/lib/documentos/enlaces-entidad";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { estadoCuentaUnificado } from "@/lib/adelantos/estado-cuenta-unificado";
import { pdfEstadoDeCuenta } from "@/lib/adelantos/estado-cuenta-pdf";

const Body = z.object({ terceroId: z.string().trim().min(1).max(100), nombre: z.string().trim().min(1).max(120) });

/**
 * POST /api/admin/documents/estado-cuenta — arma el estado de cuenta de un
 * tercero (el `DbBeneficiario.id` de Adelantos) en PDF y lo archiva en
 * «Terceros/<nombre>» con el tag `tercero:<id>`, visible sólo a admin/owner.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "STRICT", "documents:estado-cuenta");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const { terceroId, nombre } = parsed.data;

    // Ownership por tenantId en el WHERE: un tercero de otro negocio no existe.
    const tercero = await AdelantosDB.getBeneficiario(auth.tenantId, terceroId);
    if (!tercero) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Mismo cálculo que /api/adelantos/cuentas/estado: Adelantos + cuenta forestal
    // de la parte vinculada a la ficha (sin vínculo = sin forestal, igual que antes).
    const parteId = tercero.forestPartyId ?? null;
    const [adelantos, forestales] = await Promise.all([
      AdelantosDB.list(auth.tenantId, { beneficiarioId: terceroId, direccion: "todas" }),
      parteId ? ForestCuentaDB.listar(auth.tenantId, { parteId }) : Promise.resolve([]),
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
    const membrete = await MembreteDB.del(auth.tenantId);
    const pdf = await pdfEstadoDeCuenta(membrete, tercero.nombre || nombre, movimientos);

    const documentId = await EnlacesEntidadDB.archivar(
      auth.tenantId,
      "tercero",
      { id: terceroId, nombre: tercero.nombre || nombre },
      { pdf, nombreArchivo: `Estado de cuenta — ${tercero.nombre || nombre}.pdf`, allowedRoles: ROLES_ENTIDAD_SENSIBLE },
      auth.role,
      auth.username,
    );
    return NextResponse.json({ ok: true, documentId });
  } catch (e) {
    if (e instanceof CarpetaAjenaError) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
    if (e instanceof SubidaFallidaError) return NextResponse.json({ error: "storage_upload_fail" }, { status: 502 });
    logger.error("[documents.estado-cuenta] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "estado_cuenta_failed" }, { status: 500 });
  }
}
