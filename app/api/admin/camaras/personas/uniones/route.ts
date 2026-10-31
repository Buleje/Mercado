import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { ROLES_CARPETA_PERSONAS } from "@/lib/camaras/personas-drive.server";
import { diaDeLima } from "@/lib/camaras/personas-galeria";
import {
  claveGrupoSchema,
  diaSchema,
  separarVisitante,
  unirVisitantes,
} from "@/lib/camaras/visitantes-uniones.server";

/**
 * /api/admin/camaras/personas/uniones — corregir a mano el agrupado de
 * visitantes del día (ADR-479). No toca fotos: guarda «el grupo B es el mismo
 * que el A» y `GET personas/resumen` lo aplica al armar el día.
 *
 * POST   `{ dia, a, b }` → `{ ok, cambio }`: B pasa a ser A.
 * DELETE `{ dia, clave }` → `{ ok, cambio }`: B vuelve a ser un visitante aparte.
 *
 * Mismos roles que ven la carpeta «Personas»: quien mira las fotos es quien
 * sabe que «este y este son el mismo». Sólo cambia una estimación del día.
 */
const unirSchema = z.object({ dia: diaSchema, a: claveGrupoSchema, b: claveGrupoSchema });
const separarSchema = z.object({ dia: diaSchema, clave: claveGrupoSchema });

/** Sesión, CSRF, límite y cuerpo JSON; si algo falla, la respuesta a devolver. */
async function preparar(req: NextRequest, nombre: string) {
  const auth = await requireAdmin(req, [...ROLES_CARPETA_PERSONAS]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", nombre);
  if (rl) return rl;
  try {
    return { auth, body: (await req.json()) as unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
}

const invalido = (message: string) => NextResponse.json({ error: "validation_error", message }, { status: 400 });

export const POST = withApiHandler("camaras-visitantes-unir", async (req: NextRequest) => {
  const p = await preparar(req, "camaras-visitantes-uniones");
  if (p instanceof Response) return p;
  const q = unirSchema.safeParse(p.body);
  if (!q.success) return invalido("Faltan el día o los dos visitantes a juntar.");
  if (q.data.a === q.data.b) return invalido("Elige otro visitante: es el mismo grupo.");
  const cambio = await unirVisitantes(
    p.auth.tenantId,
    q.data.dia,
    { a: q.data.a, b: q.data.b },
    diaDeLima(new Date()),
    p.auth.username ?? "unknown",
  );
  return NextResponse.json({ ok: true, cambio });
});

export const DELETE = withApiHandler("camaras-visitantes-separar", async (req: NextRequest) => {
  const p = await preparar(req, "camaras-visitantes-uniones");
  if (p instanceof Response) return p;
  const q = separarSchema.safeParse(p.body);
  if (!q.success) return invalido("Falta el día o el visitante a separar.");
  const cambio = await separarVisitante(p.auth.tenantId, q.data.dia, q.data.clave, p.auth.username ?? "unknown");
  return NextResponse.json({ ok: true, cambio });
});
