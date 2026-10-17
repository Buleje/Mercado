import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasDB } from "@/lib/db/camaras.db";
import { CamarasHikConnectDB } from "@/lib/db/camaras-hik-connect.db";
import { CamarasMarcadoresDB } from "@/lib/db/camaras-marcadores.db";
import { accionMarcadoresSchema } from "@/lib/camaras/marcadores";

/**
 * Marcadores de troza (ADR-480).
 *
 * GET   → `{ asignaciones, libres, camaras }`: qué marcador tiene cada troza
 *         (lo vencido sale como «salio»: se reusa al asignar), cuántos ids
 *         de troza quedan libres y las cámaras que pueden contar (las que
 *         sacan foto por Hik-Connect, la que lee marcadores primero).
 * PATCH → `{ accion: "asignar", trozaIds }` (los libres más bajos, para las
 *         hojas A4) · `{ accion: "vincular", marcador, trozaId }` (uno
 *         plastificado) · `{ accion: "liberar", marcadores }`.
 *
 * Roles: admin, dueño y almacenero (quien imprime las etiquetas). La troza se
 * busca SIEMPRE con el `tenantId` del JWT: la de otro negocio se rechaza.
 */
const ROLES = ["admin", "owner", "almacenero"] as const;

export const GET = withApiHandler("camaras-marcadores-leer", async (req: NextRequest) => {
  const auth = await requireAdmin(req, [...ROLES]);
  if (auth instanceof NextResponse) return auth;
  const [r, camaras, cuenta] = await Promise.all([
    CamarasMarcadoresDB.asignaciones(auth.tenantId),
    CamarasDB.list(auth.tenantId),
    CamarasHikConnectDB.leer(auth.tenantId),
  ]);
  const enlaces = cuenta?.enlaces ?? {};
  return NextResponse.json({
    ...r,
    camaras: camaras
      .filter((c) => c.activa)
      .map((c) => ({ id: c.id, nombre: c.nombre, leeMarcadores: Boolean(c.leeMarcadores), sacaFoto: Boolean(enlaces[c.id]) }))
      .sort((a, b) => Number(b.leeMarcadores) - Number(a.leeMarcadores)),
  });
});

export const PATCH = withApiHandler("camaras-marcadores-cambiar", async (req: NextRequest) => {
  const auth = await requireAdmin(req, [...ROLES]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "camaras-marcadores");
  if (rl) return rl;
  const p = accionMarcadoresSchema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return NextResponse.json(
      { error: "validation_error", message: "Pedido de marcadores inválido." },
      { status: 400 },
    );
  const user = auth.username ?? "unknown";
  const d = p.data;
  if (d.accion === "asignar") return NextResponse.json(await CamarasMarcadoresDB.asignar(auth.tenantId, d.trozaIds, user));
  if (d.accion === "vincular")
    return NextResponse.json(await CamarasMarcadoresDB.vincular(auth.tenantId, d.marcador, d.trozaId, user));
  return NextResponse.json(await CamarasMarcadoresDB.liberar(auth.tenantId, d.marcadores, user));
});
