import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { PlacaHistorialDB } from "@/lib/db/placa-historial.db";
import { leerPlaca } from "@/lib/forestal/placa-peru";
import { juntarLoDelSistema } from "@/lib/forestal/placa-historial";
import { consultarPlacaExterna, placaExternaDisponible } from "@/lib/integrations/placa-peru";

/**
 * /api/admin/forestal/placa?placa=W2D853 — «Buscar placa» del bloque
 * Transporte de la guía (CTP y Libro TH), 29-09-2026.
 *
 * GET → {
 *   placa:   la lectura de la placa (formateada, zona registral, aviso);
 *   sistema: lo que el negocio ya sabe de ella — Directorio + guías vigentes
 *            (Libro TH, despachos/ingresos del CTP, consultas SERFOR), un dato
 *            por casillero con de dónde salió (`juntarLoDelSistema`);
 *   externo: marca/modelo/color de SUNARP (json.pe) si hay `PLACA_API_TOKEN`,
 *            si no `null` con `externoDisponible: false`. Con el tope de
 *            consultas pagas alcanzado (negocio o plataforma), `externoEstado:
 *            "tope"`; si el negocio ya sabe la marca, `"omitida"` (sólo caché,
 *            no se gasta una consulta). La línea que lo dice, en `externoMotivo`;
 * }
 *
 * Una placa que no puede existir → 422 con el motivo: no se busca «QA-450».
 * Guard: requireAdmin (admin, almacenero, owner — los del GET de
 * `loth/despacho-guia`) → rate limit → libro CTP o Libro TH habilitado.
 */

async function ensureSpec(tenantId: string) {
  const ok =
    (await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro")) ||
    (await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro"));
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "Ni el Libro CTP ni el Libro de Títulos Habilitantes están habilitados para este negocio." },
        { status: 403 },
      );
}

const querySchema = z.object({
  placa: z.string().trim().min(1, "Falta la placa").max(20, "Una placa no lleva más de 7 caracteres"),
});

export const GET = withApiHandler("forestal-placa-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "placa");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const q = querySchema.safeParse({ placa: req.nextUrl.searchParams.get("placa") ?? "" });
  if (!q.success) {
    return NextResponse.json({ error: "validation_error", message: q.error.issues[0]?.message ?? "Placa no válida" }, { status: 422 });
  }
  const lectura = leerPlaca(q.data.placa);
  if (lectura.estado !== "valida") {
    return NextResponse.json(
      { error: "placa_invalida", message: lectura.estado === "vacia" ? "Falta la placa" : lectura.motivo },
      { status: 422 },
    );
  }

  try {
    const registros = await PlacaHistorialDB.registros(auth.tenantId, lectura.normalizada);
    const sistema = juntarLoDelSistema(lectura.normalizada, registros);
    // Lo que SUNARP agrega a la guía es la marca: si el Directorio o una guía
    // del negocio ya la traen, no se gasta una consulta (sólo se mira la caché).
    // El modelo no se guarda en ningún lado del negocio: la marca es la señal.
    const externo = await consultarPlacaExterna(auth.tenantId, lectura.normalizada, Date.now(), {
      soloCache: Boolean(sistema.datos.marca),
    });
    return NextResponse.json({
      placa: {
        normalizada: lectura.normalizada,
        formateada: lectura.formateada,
        tipo: lectura.tipo,
        zona: lectura.zona,
        aviso: lectura.aviso,
      },
      sistema,
      externo: externo.estado === "encontrada" ? { ...externo.datos, consultadoEn: externo.consultadoEn } : null,
      externoDisponible: placaExternaDisponible(),
      externoEstado: externo.estado,
      externoMotivo: externo.estado === "error" || externo.estado === "tope" || externo.estado === "omitida" ? externo.motivo : null,
    });
  } catch (err) {
    logger.error("[forestal-placa.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
