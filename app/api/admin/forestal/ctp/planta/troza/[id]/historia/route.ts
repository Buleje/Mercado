import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { ForestTrozaHistoriaDB } from "@/lib/db/forest-troza-historia.db";

/**
 * GET /api/admin/forestal/ctp/planta/troza/[id]/historia → { trozaId, codigo, eventos: EventoTroza[] }
 *
 * La vida de una troza con las fechas del Libro (ADR-465): recepción, mixto,
 * lote, retrozado, corrida, apartado/despacho de su producto y despacho entero.
 * Ordenados por fecha. Una troza de otro negocio → 404 (el `tenantId` va en el
 * WHERE: no se confirma que exista).
 */

const idSchema = z.string().trim().min(1).max(64);

export const GET = withApiHandler(
  "forestal-ctp-planta-troza-historia",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const rl = await applyRateLimit(req, "GENEROUS", "ctp");
    if (rl) return rl;
    if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
      return NextResponse.json({ error: "specialization_disabled", message: "El módulo CTP no está habilitado." }, { status: 403 });
    }
    const id = idSchema.safeParse((await ctx.params).id);
    if (!id.success) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    const historia = await ForestTrozaHistoriaDB.de(auth.tenantId, id.data);
    if (!historia) return NextResponse.json({ error: "not_found", message: "Esa troza no existe en este negocio." }, { status: 404 });
    return NextResponse.json(historia);
  },
);
