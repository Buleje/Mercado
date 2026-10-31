import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { limpiarDocumento } from "@/lib/adelantos/recibo-firmado";
import { OpcionesPasskeySchema } from "@/lib/adelantos/passkey-schema";
import { enlaceParaPasskey, fallaPasskey, MENSAJES_PASSKEY } from "@/lib/adelantos/passkey-enlace.server";
import { opcionesDeConfirmacion, opcionesDeRegistro } from "@/lib/adelantos/passkey.server";
import { MAX_PASSKEYS_VIGENTES, type OpcionesPasskeyRespuesta } from "@/lib/adelantos/passkey-tipos";
import { AdelantoFirmasDB } from "@/lib/db/adelanto-firmas.db";
import { AdelantoPasskeysDB } from "@/lib/db/adelanto-passkeys.db";

/**
 * POST /api/public/adelantos/[token]/passkey/opciones — ADR-513. La página del
 * enlace pide con qué confirmar la huella del celular: si la persona ya tiene
 * una passkey para ESTE dominio, «confirmar» (get) con sus vigentes reales; si
 * no tiene NINGUNA (en ningún dominio), «registrar» (create). Si tiene una en
 * otro dominio, 409 `ya_registrada`: el enlace no suma un segundo celular (otro
 * subdominio permitido no abre esa puerta); lo cambia el administrador
 * revocando la anterior desde la ficha. Sin sesión: el token es la credencial
 * (sha256, vence, un uso) y de él salen negocio, adelanto y persona.
 *
 * Antes de nada, el DNI: con la ficha con DNI, el escrito tiene que coincidir
 * (suma intento fallido como `…/firmar`); así una llave nunca queda atada a la
 * persona sin ese control. STRICT por IP, balde propio.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "adelanto-passkey");
  if (_rl) return _rl;
  const { token } = await params;
  const r = await enlaceParaPasskey(req, token);
  if (r instanceof NextResponse) return r;
  const { enlace, c } = r;

  const body: unknown = await req.json().catch(() => ({}));
  const parsed = OpcionesPasskeySchema.safeParse(body ?? {});
  if (!parsed.success) return fallaPasskey("datos_invalidos", 400);

  const documento = limpiarDocumento(parsed.data.documento ?? "");
  if (enlace.documentoEsperado && documento !== enlace.documentoEsperado) {
    const { revocado } = await AdelantoFirmasDB.sumarIntentoFallido(enlace.tenantId, enlace.enlaceId).catch((e: unknown) => {
      logger.error("[public/adelantos/passkey] no se pudo sumar el intento", { error: String(e) });
      return { revocado: false };
    });
    return fallaPasskey("dni_no_coincide", 422, revocado ? `${MENSAJES_PASSKEY.dni_no_coincide} El enlace se bloqueó: pide uno nuevo.` : undefined);
  }

  try {
    const existentes = await AdelantoPasskeysDB.vigentesDe(c.tenantId, c.beneficiarioId, c.rpId);
    let respuesta: OpcionesPasskeyRespuesta;
    if (existentes.length > 0) {
      respuesta = { modo: "confirmar", opciones: await opcionesDeConfirmacion(c, existentes) };
    } else {
      const total = await AdelantoPasskeysDB.cuantasVigentes(c.tenantId, c.beneficiarioId);
      if (total >= MAX_PASSKEYS_VIGENTES) return fallaPasskey("tope_llaves", 409);
      if (total > 0) return fallaPasskey("ya_registrada", 409);
      respuesta = { modo: "registrar", opciones: await opcionesDeRegistro(c, existentes) };
    }
    return NextResponse.json(respuesta, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[public/adelantos/passkey] opciones error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo preparar la huella del celular. Prueba de nuevo." }, { status: 503 });
  }
}
