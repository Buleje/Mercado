import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { comoRegistro, RegistrarPasskeySchema } from "@/lib/adelantos/passkey-schema";
import { enlaceParaPasskey, fallaPasskey } from "@/lib/adelantos/passkey-enlace.server";
import { opcionesDeConfirmacion, verificarRegistro } from "@/lib/adelantos/passkey.server";
import type { OpcionesPasskeyRespuesta } from "@/lib/adelantos/passkey-tipos";
import { AdelantoPasskeysDB } from "@/lib/db/adelanto-passkeys.db";

/**
 * POST /api/public/adelantos/[token]/passkey/registrar — ADR-513. El celular
 * creó la llave (WebAuthn create): se verifica en el servidor contra el reto de
 * un uso, el origen de la lista y el rpId, y queda atada a la persona del
 * adelanto en ESTE negocio, con el enlace, la IP y el navegador del registro.
 * Sólo si la persona no tiene ninguna vigente (409 `ya_registrada`; el tope,
 * 409 `tope_llaves`). Devuelve de una las opciones para confirmar el recibo con
 * esa llave (el registro solo no firma nada).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "adelanto-passkey");
  if (_rl) return _rl;
  const { token } = await params;
  const r = await enlaceParaPasskey(req, token);
  if (r instanceof NextResponse) return r;
  const { enlace, c } = r;

  const body: unknown = await req.json().catch(() => null);
  const parsed = RegistrarPasskeySchema.safeParse(body);
  if (!parsed.success) return fallaPasskey("datos_invalidos", 400);

  try {
    const v = await verificarRegistro(c, comoRegistro(parsed.data.respuesta), {
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent")?.slice(0, 400) ?? null,
    });
    if (!v.ok) return fallaPasskey(v.code, v.status);
    logActivity(
      "Registrar",
      "adelanto",
      `Adelanto ${enlace.codigoOperacion ?? enlace.adelantoId}: se registró un celular (passkey) para la persona en ${c.rpId}`,
      enlace.adelantoId,
      "enlace de firma",
      undefined,
      enlace.tenantId,
    ).catch((err) => logger.error("[public/adelantos/passkey] logActivity failed", { error: String(err) }));
    const existentes = await AdelantoPasskeysDB.vigentesDe(c.tenantId, c.beneficiarioId, c.rpId);
    const respuesta: OpcionesPasskeyRespuesta = { modo: "confirmar", opciones: await opcionesDeConfirmacion(c, existentes) };
    return NextResponse.json(respuesta, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[public/adelantos/passkey] registrar error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar la huella del celular. Prueba de nuevo." }, { status: 503 });
  }
}
