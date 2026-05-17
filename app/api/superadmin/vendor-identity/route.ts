/**
 * POST /api/superadmin/vendor-identity
 *
 * Permite al superadmin re-verificar la identidad de un vendor (DNI o RUC)
 * contra RENIEC / SUNAT desde el panel de aprobaciones. Útil para:
 *   - Verificar manualmente antes de aprobar un application
 *   - Re-checkear vendors existentes (RENIEC actualiza estado, SUNAT puede
 *     marcar NO HABIDO)
 *   - Comparar el nombre devuelto contra el ownerName de la application
 *
 * Auth: requirePlatformAPI (cookie PLATFORM_SESSION). NO se persiste el
 * resultado — el frontend lo muestra al operador y, si decide aprobar,
 * el log queda en Activity Log con identityVerified=true.
 *
 * Cache: hereda el cache 24h de lib/integrations/{reniec,sunat-ruc}.ts.
 * Multiple llamadas con el mismo DNI/RUC son baratas.
 *
 * Audit ref: TD-058 (RENIEC/SUNAT scaffold). Endpoint creado 2026-05-17.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { verifyDni, namesMatch } from "@/lib/integrations/reniec";
import { verifyRuc, isInvoiceable } from "@/lib/integrations/sunat-ruc";

const DNI_REGEX = /^\d{8}$/;
const RUC_REGEX = /^(10|15|17|20)\d{9}$/;

const VerifySchema = z
  .object({
    dni: z.string().regex(DNI_REGEX, "DNI inválido").optional(),
    ruc: z.string().regex(RUC_REGEX, "RUC inválido").optional(),
    /** Opcional: nombre del owner según la application — para comparar contra RENIEC */
    ownerName: z.string().max(100).optional(),
  })
  .refine(
    (data) => !!(data.dni || data.ruc),
    { message: "Debes enviar dni o ruc", path: ["dni"] },
  );

export async function POST(req: NextRequest) {
  // Rate-limit por IP STRICT — protege RENIEC API token (cobro por consulta)
  const rl = applyRateLimit(req, "STRICT", "superadmin-vendor-identity");
  if (rl) return rl;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { dni, ruc, ownerName } = parsed.data;

  try {
    if (ruc) {
      const result = await verifyRuc(ruc);
      logger.info("[superadmin/vendor-identity] RUC checked", {
        rucLast4: ruc.slice(-4),
        source: result.source,
        ok: result.ok,
        invoiceable: isInvoiceable(result),
        by: auth.username,
      });
      return NextResponse.json({
        type: "RUC",
        ok: result.ok,
        invoiceable: isInvoiceable(result),
        razonSocial: result.razonSocial ?? null,
        estado: result.estado ?? null,
        condicion: result.condicion ?? null,
        direccion: result.direccion ?? null,
        source: result.source,
        reason: result.reason ?? null,
      });
    }

    if (dni) {
      const result = await verifyDni(dni);
      const fullName = result.fullName ?? null;
      const ownerMatches = ownerName && fullName
        ? namesMatch(fullName, ownerName)
        : null;
      logger.info("[superadmin/vendor-identity] DNI checked", {
        dniLast4: dni.slice(-4),
        source: result.source,
        ok: result.ok,
        nameMatch: ownerMatches,
        by: auth.username,
      });
      return NextResponse.json({
        type: "DNI",
        ok: result.ok,
        fullName,
        ownerNameMatches: ownerMatches,
        source: result.source,
        reason: result.reason ?? null,
      });
    }

    return NextResponse.json({ error: "Sin DNI ni RUC" }, { status: 400 });
  } catch (err) {
    logger.error("[superadmin/vendor-identity] unexpected", {
      err: err instanceof Error ? err.message : String(err),
      by: auth.username,
    });
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
