import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { IaConversacionesDB } from "@/lib/db/ia-conversaciones.db";
import { resolverAprobacion } from "@/lib/asistente/confirmar-app";

/**
 * POST /api/admin/ia/confirmar `{ conversacionId, aprobacionId, decision }`
 * → `{ mensaje: MensajeApp }` (el «✅ …» o «✖ …» del asistente, ya guardado).
 */
const Cuerpo = z.object({
  conversacionId: z.string().min(1).max(64),
  aprobacionId: z.string().min(1).max(128),
  decision: z.enum(["aprobar", "rechazar"]),
});

export async function POST(req: NextRequest) {
  const limitado = await applyRateLimit(req, "STRICT", "ia-confirmar");
  if (limitado) return limitado;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = Cuerpo.safeParse(await leerJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: "Pedido no válido." }, { status: 400 });
  }
  const { conversacionId, aprobacionId, decision } = parsed.data;

  if (!(await IaConversacionesDB.existe(auth.tenantId, auth.username, conversacionId))) {
    return NextResponse.json({ error: "not_found", message: "Esa conversación ya no existe." }, { status: 404 });
  }

  try {
    const r = await resolverAprobacion({
      tenantId: auth.tenantId,
      username: auth.username,
      role: auth.role,
      conversacionId,
      aprobacionId,
      decision,
    });
    if (!r.ok && r.status === 404) {
      /**
       * Vencido (10 min, reinicio u otra instancia): la tarjeta sale también del
       * historial, si no reaparece en cada recarga con un «Sí» que ya no sirve.
       */
      const vencido = "⌛ Esa operación ya no está pendiente: ya se anotó, se canceló o venció. Si falta, mándamela de nuevo.";
      await IaConversacionesDB.quitarPendiente(auth.tenantId, auth.username, conversacionId, aprobacionId);
      const aviso = await IaConversacionesDB.agregarMensajes(auth.tenantId, auth.username, conversacionId, [
        { role: "assistant", content: vencido },
      ]);
      return NextResponse.json({ error: "not_found", message: vencido, mensaje: aviso?.[0] ?? null }, { status: 404 });
    }
    if (!r.ok) return NextResponse.json({ error: "forbidden", message: r.message }, { status: r.status });

    const guardados = await IaConversacionesDB.agregarMensajes(auth.tenantId, auth.username, conversacionId, [
      { role: "assistant", content: r.texto, extra: r.extra },
    ]);
    await IaConversacionesDB.quitarPendiente(auth.tenantId, auth.username, conversacionId, aprobacionId);
    if (!guardados?.[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ mensaje: guardados[0] });
  } catch (err) {
    logger.error("[ia-confirmar] falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error", message: "No pude confirmar. Intenta de nuevo." }, { status: 500 });
  }
}
