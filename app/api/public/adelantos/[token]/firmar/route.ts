import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { FirmarPublicoDatosSchema } from "@/lib/adelantos/entregar-schema";
import type { CodigoErrorPublico, EstadoEnlace, FirmarPublicoRespuesta, TipoFirma } from "@/lib/adelantos/entregar-tipos";
import { TOKEN_RE } from "@/lib/adelantos/registro-firmas";
import { limpiarDocumento } from "@/lib/adelantos/recibo-firmado";
import { imagenesDeFirma, jsonDe, leerMultipartFirma } from "@/lib/adelantos/imagen-firma.server";
import { borrarSubidas, subirParaRegistro, type Subida } from "@/lib/adelantos/guardar-en-registro.server";
import { AdelantoFirmasDB, type RegistrarFirmaInput } from "@/lib/db/adelanto-firmas.db";
import { comoConfirmacion, PasskeyAlFirmarSchema } from "@/lib/adelantos/passkey-schema";
import { contextoDe, fallaPasskey, rpDelPedido } from "@/lib/adelantos/passkey-enlace.server";
import { filaDeConstancia, verificarConfirmacion, type ConfirmacionPasskey } from "@/lib/adelantos/passkey.server";
import { METODO_PASSKEY, VERSION_CONSENTIMIENTO_PASSKEY } from "@/lib/adelantos/passkey-tipos";

/**
 * POST /api/public/adelantos/[token]/firmar — la persona firma el recibo del
 * adelanto desde su celular, SIN sesión (ADR-491). El token es la credencial:
 * 256 bits, la base guarda sólo su sha256, un uso, vence, revocable.
 *
 * Exento de CSRF por prefijo (`lib/csrf.ts`, igual que contratos): no hay
 * cookie de sesión que abusar. STRICT por IP (10 cada 15 min).
 *
 * La respuesta nunca lleva ids (ni del adelanto ni del negocio): un token no
 * abre la puerta a otro adelanto.
 *
 * (ADR-513) La huella puede llegar como foto (`huella`) o como la confirmación
 * de la passkey del celular (`passkey`, JSON): se verifica acá, contra el reto
 * de un uso atado a este adelanto y monto, y el contador de la llave sube en la
 * misma transacción que la firma. Nunca las dos a la vez.
 */
const MENSAJES: Record<CodigoErrorPublico, string> = {
  no_encontrado: "Este enlace no existe. Pide uno nuevo a quien te dio el adelanto.",
  vencido: "Este enlace venció. Pide uno nuevo a quien te dio el adelanto.",
  usado: "Este recibo ya se firmó con este enlace.",
  revocado: "Este enlace ya no sirve. Pide uno nuevo a quien te dio el adelanto.",
  anulado: "Este adelanto se anuló: no hay nada que firmar.",
  dni_no_coincide: "El DNI no coincide con el de la persona del adelanto.",
  falta_huella: "Falta la foto de tu huella.",
  falta_consentimiento: "Para guardar la huella tienes que aceptar el aviso.",
  no_es_imagen: "La imagen no se pudo leer. Prueba de nuevo.",
  muy_grande: "La imagen pesa demasiado. Prueba de nuevo.",
};
const STATUS_ESTADO: Record<Exclude<EstadoEnlace, "pendiente">, number> = { vencido: 410, usado: 409, revocado: 410, anulado: 409 };

function falla(code: CodigoErrorPublico, status: number, mensaje = MENSAJES[code]): NextResponse {
  return NextResponse.json({ error: mensaje, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "adelanto-firmar");
  if (_rl) return _rl;
  const { token } = await params;
  /* Un token con otra forma no toca la base. */
  if (!TOKEN_RE.test(token)) return falla("no_encontrado", 404);

  let enlace: Awaited<ReturnType<typeof AdelantoFirmasDB.enlacePorToken>>;
  try {
    enlace = await AdelantoFirmasDB.enlacePorToken(token);
  } catch (e) {
    logger.error("[public/adelantos/firmar] lectura error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer el enlace. Prueba de nuevo." }, { status: 503 });
  }
  if (!enlace) return falla("no_encontrado", 404);
  if (enlace.estado !== "pendiente") return falla(enlace.estado, STATUS_ESTADO[enlace.estado]);

  const leido = await leerMultipartFirma(req, { archivos: ["firma", "huella"], textos: ["datos", "passkey"] });
  if (!leido.ok) return NextResponse.json({ error: leido.error, ...(leido.issues ? { issues: leido.issues } : {}) }, { status: leido.status });
  const parsed = FirmarPublicoDatosSchema.safeParse(jsonDe(leido.textos.datos));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const d = parsed.data;

  /* D9: si la ficha tiene DNI, el escrito tiene que coincidir (5 intentos y se revoca). */
  const documento = limpiarDocumento(d.firmante.documento);
  if (enlace.documentoEsperado && documento !== enlace.documentoEsperado) {
    const { revocado } = await AdelantoFirmasDB.sumarIntentoFallido(enlace.tenantId, enlace.enlaceId).catch((e: unknown) => {
      logger.error("[public/adelantos/firmar] no se pudo sumar el intento", { error: String(e) });
      return { revocado: false };
    });
    return falla("dni_no_coincide", 422, revocado ? `${MENSAJES.dni_no_coincide} El enlace se bloqueó: pide uno nuevo.` : undefined);
  }
  if (!leido.archivos.firma) return NextResponse.json({ error: "Falta tu firma." }, { status: 400 });
  const conPasskey = typeof leido.textos.passkey === "string" && leido.textos.passkey.length > 0;
  if (conPasskey && leido.archivos.huella) {
    return NextResponse.json({ error: "Manda la foto de tu huella o la confirmación del celular, no las dos." }, { status: 400 });
  }
  if (enlace.pideHuella && !leido.archivos.huella && !conPasskey) return falla("falta_huella", 422);
  if (leido.archivos.huella && !d.consentimientoHuella) return falla("falta_consentimiento", 422);

  /* La passkey se verifica ANTES de subir nada: el reto se consume acá. */
  let pk: ConfirmacionPasskey | null = null;
  if (conPasskey) {
    const pp = PasskeyAlFirmarSchema.safeParse(jsonDe(leido.textos.passkey));
    if (!pp.success) return fallaPasskey("datos_invalidos", 400);
    const rp = rpDelPedido(req);
    if (!rp) return fallaPasskey("origen_no_permitido", 403);
    let v: Awaited<ReturnType<typeof verificarConfirmacion>>;
    try {
      v = await verificarConfirmacion(contextoDe(enlace, rp), comoConfirmacion(pp.data.respuesta));
    } catch (e) {
      logger.error("[public/adelantos/firmar] passkey error", { error: e instanceof Error ? e.message : String(e) });
      return NextResponse.json({ error: "No se pudo verificar la huella del celular. Prueba de nuevo." }, { status: 503 });
    }
    if (!v.ok) return fallaPasskey(v.code, v.status);
    pk = v;
  }

  const imgs = await imagenesDeFirma(leido.archivos);
  if ("error" in imgs) return falla(imgs.code, imgs.status, imgs.error);

  const aSubir: { tipo: TipoFirma; webp: Buffer }[] = [];
  if (imgs.firma) aSubir.push({ tipo: "FIRMA", webp: imgs.firma });
  if (imgs.huella) aSubir.push({ tipo: "HUELLA", webp: imgs.huella });
  const subidas: (Subida | null)[] = [];
  for (const s of aSubir) {
    subidas.push(await subirParaRegistro(enlace.tenantId, enlace.adelantoId, s.tipo, s.webp).catch(() => null));
  }
  if (subidas.some((s) => !s)) {
    await borrarSubidas(subidas);
    return NextResponse.json({ error: "No se pudo guardar tu firma. Prueba de nuevo." }, { status: 502 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 400) ?? null;
  const base = {
    adelantoId: enlace.adelantoId,
    canal: "ENLACE" as const,
    firmanteNombre: d.firmante.nombre,
    firmanteDocumento: documento,
    montoFirmado: enlace.montoAdelantado,
    monedaFirmada: enlace.moneda,
    codigoOperacion: enlace.codigoOperacion,
    pedidoPor: enlace.creadoPor,
    enlaceId: enlace.enlaceId,
    ip,
    userAgent,
  };
  const filas: RegistrarFirmaInput[] = aSubir.map((s, i) => {
    const sub = subidas[i] as Subida;
    return {
      adelantoId: enlace.adelantoId,
      tipo: s.tipo,
      canal: "ENLACE",
      /* Lo que escribió quien firmó; el documento, el escrito (D9: si la ficha
         no tenía, se guarda acá y NO se copia a la ficha). */
      firmanteNombre: d.firmante.nombre,
      firmanteDocumento: documento,
      ruta: sub.ruta,
      sha256: sub.sha256,
      bytes: sub.bytes,
      montoFirmado: enlace.montoAdelantado,
      monedaFirmada: enlace.moneda,
      codigoOperacion: enlace.codigoOperacion,
      pedidoPor: enlace.creadoPor,
      enlaceId: enlace.enlaceId,
      ip,
      userAgent,
      consentimiento: s.tipo === "HUELLA" ? (d.consentimientoHuella ?? null) : null,
      trazos: s.tipo === "FIRMA" ? d.trazos : undefined,
      idempotencyKey: `enlace:${enlace.enlaceId}:${s.tipo}`,
    };
  });
  if (pk) {
    filas.push({
      ...base,
      tipo: "HUELLA",
      ...filaDeConstancia(enlace.tenantId, enlace.adelantoId, pk.constancia),
      consentimiento: VERSION_CONSENTIMIENTO_PASSKEY,
      metodo: METODO_PASSKEY,
      credentialId: pk.passkey.credentialId,
      constancia: pk.constancia,
      idempotencyKey: `enlace:${enlace.enlaceId}:HUELLA`,
    });
  }

  let r: Awaited<ReturnType<typeof AdelantoFirmasDB.firmarPorEnlace>>;
  try {
    r = await AdelantoFirmasDB.firmarPorEnlace(
      enlace.tenantId,
      enlace.enlaceId,
      filas,
      pk ? { passkeyId: pk.passkey.id, anterior: pk.passkey.counter, nuevo: pk.contadorNuevo } : undefined,
    );
  } catch (e) {
    await borrarSubidas(subidas);
    logger.error("[public/adelantos/firmar] firmar error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar tu firma. Prueba de nuevo." }, { status: 503 });
  }
  if (r !== "ok") {
    await borrarSubidas(subidas);
    if (r === "contador_bajo") return fallaPasskey("contador_bajo", 409);
    return falla(r, STATUS_ESTADO[r]);
  }

  logActivity(
    "Firmar",
    "adelanto",
    `Adelanto ${enlace.codigoOperacion ?? enlace.adelantoId}: firmado por enlace en el celular${pk ? ` (lo confirmó el aparato registrado para la persona, passkey; ${pk.constancia.registro.mismoEnlace ? "llave registrada con este mismo enlace" : "llave registrada con otro enlace"})` : imgs.huella ? " (con huella)" : ""}`,
    enlace.adelantoId,
    "enlace de firma",
    undefined,
    enlace.tenantId,
  ).catch((err) => logger.error("[public/adelantos/firmar] logActivity failed", { error: String(err) }));
  const respuesta: FirmarPublicoRespuesta = { ok: true, codigoOperacion: enlace.codigoOperacion, firmadoEn: new Date().toISOString() };
  return NextResponse.json(respuesta, { headers: { "Cache-Control": "no-store" } });
}
