import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { claveDeParte, conflictosConDirectorio, descubrirEnGuias } from "@/lib/forestal/directorio-desde-guias";

/**
 * /api/admin/forestal/directorio/candidatos — proveedores que ya están en las
 * guías de ingreso y todavía no en la libreta (ADR-357 §proveedor).
 *
 * Sólo lee `WoodEntry` en su forma liviana (`proveedoresParaDirectorio`, sin
 * `gtfDatos`): el resto de los roles (destinatario/transportista/conductor)
 * sigue descubriéndose en la tarjeta general del Directorio, que sí necesita
 * el cuerpo completo de la guía. Este endpoint existe para poder ofrecer el
 * alta desde el selector de dueño del cobro (ADR-412) sin traer las 500 guías
 * completas para leer tres campos.
 *
 * Guard: `spec:forestal:ctp-libro` · rate-limit GENEROUS bucket 'ctp'.
 */

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-directorio-candidatos-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  try {
    const [guias, partes] = await Promise.all([
      WoodEntriesDB.proveedoresParaDirectorio(auth.tenantId),
      // Inactivos también: proponer de nuevo a alguien que se dio de baja del
      // todo sería un alta fantasma que reaparece sola.
      ForestDirectorioDB.listarPartes(auth.tenantId, { incluirInactivos: true }),
    ]);
    const yaEnDirectorio = new Set(partes.map((p) => claveDeParte(p.docNumero, p.nombre)));
    const { partes: candidatos } = descubrirEnGuias(guias, yaEnDirectorio);
    const conflictos = conflictosConDirectorio(candidatos, partes);
    return NextResponse.json({ candidatos, conflictos });
  } catch (err) {
    logger.error("[directorio-candidatos.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
