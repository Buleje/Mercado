import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestLoteMixtoDB } from "@/lib/db/forest-lote-mixto.db";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import {
  accionLoteMixtoSchema,
  crearLoteMixtoSchema,
  queryLoteMixtoSchema,
} from "@/lib/forestal/lote-mixto";

/**
 * Lotes MIXTOS (ADR-441): la pila escaneada en Consumos, de varias especies,
 * que se reparte en lotes de aserrío por especie+permiso.
 *
 * GET   → los mixtos del negocio con su pila, tarjetas y lotes hijos
 *         (`?status=abierto|repartido|anulado`, `?id=`, `?limite=`) → `{ mixtos, total }`.
 * POST  → abre el mixto, o devuelve el que ya está abierto (`nuevo: true`
 *         fuerza uno nuevo) → `{ mixto, nuevo }` (201 si se creó, 200 si ya estaba).
 * PATCH → `accion`: agregar | quitar | repartir | anular (contrato en
 *         `lib/forestal/lote-mixto.ts`, `accionLoteMixtoSchema`).
 *
 * Apartar y repartir son trabajo de patio (almacenero incluido, como armar un
 * lote). Anular sólo dueño o administrador: deshace lo que varios equipos
 * escanearon durante días.
 */

async function guard(req: NextRequest, roles: AdminRole[] = ["admin", "almacenero", "owner"]) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:lotes-mixtos");
  if (rl) return { error: rl };
  const auth = await requireAdmin(req, roles);
  if (auth instanceof NextResponse) return { error: auth };
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return { error: NextResponse.json({ error: "specialization_disabled" }, { status: 403 }) };
  }
  return { auth };
}

async function leerJson(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

export async function GET(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;
    const parsed = queryLoteMixtoSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return ctpValidationResponse(parsed.error);
    const mixtos = await ForestLoteMixtoDB.list(g.auth.tenantId, parsed.data);
    return NextResponse.json({ mixtos, total: mixtos.length });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-mixtos.GET", "");
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const json = await leerJson(req);
    if (!json.ok) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    /* Un POST sin cuerpo es «abrí el mixto»: `{}` es un pedido válido. */
    const parsed = crearLoteMixtoSchema.safeParse(json.body ?? {});
    if (!parsed.success) return ctpValidationResponse(parsed.error);
    const r = await ForestLoteMixtoDB.crear(g.auth.tenantId, {
      notas: parsed.data.notas ?? null,
      contratoId: parsed.data.contratoId ?? null,
      reusarAbierto: parsed.data.nuevo !== true,
      createdBy: g.auth.username ?? "unknown",
    });
    return NextResponse.json(r, { status: r.nuevo ? 201 : 200 });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-mixtos.POST", "");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const json = await leerJson(req);
    if (!json.ok) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    const parsed = accionLoteMixtoSchema.safeParse(json.body);
    if (!parsed.success) return ctpValidationResponse(parsed.error);
    const d = parsed.data;
    const tenantId = g.auth.tenantId;
    const user = g.auth.username ?? "unknown";

    /* El guard admite al almacenero porque apartar y repartir son su trabajo;
       anular se recorta acá, junto a lo que hace (mismo patrón que
       `deshacer-forzado` en lotes-aserrio). */
    if (d.accion === "anular" && !["admin", "owner"].includes(g.auth.role)) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "Anular un lote mixto suelta lo que se escaneó durante días. Sólo el dueño o un administrador puede hacerlo.",
        },
        { status: 403 },
      );
    }

    switch (d.accion) {
      case "agregar":
        return NextResponse.json(await ForestLoteMixtoDB.reservar(tenantId, d.loteMixtoId, d.trozaIds, user));
      case "quitar":
        return NextResponse.json(await ForestLoteMixtoDB.quitar(tenantId, d.loteMixtoId, d.trozaIds, user));
      case "repartir":
        return NextResponse.json(
          await ForestLoteMixtoDB.repartir(tenantId, d.loteMixtoId, { destinos: d.destinos, notas: d.notas }, user),
        );
      case "anular":
        return NextResponse.json(await ForestLoteMixtoDB.anular(tenantId, d.loteMixtoId, d.motivo, user));
    }
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-mixtos.PATCH", "");
  }
}
