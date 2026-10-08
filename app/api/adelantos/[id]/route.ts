import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantoConLiquidacionError, AdelantoNoCancelableError, AdelantosDB, DireccionNoCorregibleError, ReglaDeRecibidoError } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { motivoSchema } from "@/lib/forestal/motivo";
import { AdelantoNoControlableError, AdelantosControlDB } from "@/lib/db/adelantos-control.db";
import { PATRON_DIA } from "@/lib/adelantos/control-edicion";
import { randomBytes } from "crypto";
import sharp from "sharp";
import { esReciboFirmado, PREFIJO_PRIVADO, rutaFirmaPrivada } from "@/lib/adelantos/recibo-firmado";
import { borrarFirmaPrivada, subirFirmaPrivada } from "@/lib/adelantos/firma-storage";

const PatchSchema = z.object({
  notas: z.string().max(1000).nullable().optional(),
  cancelar: z.boolean().optional(),
  /**
   * Al anular: por qué vía volvió la plata al cajón. Ausente = NO revierte.
   *
   * Anular puede significar que fue un error y el efectivo nunca salió, o que se
   * está dando por perdido. Sólo el primero devuelve plata, y eso lo sabe la
   * persona — por eso es explícito y por defecto no hace nada.
   */
  devolucionCaja: z.enum(["efectivo", "yape", "plin", "tarjeta", "transferencia"]).nullable().optional(),
})
  /* `strict` + el refine: un `{}` o una clave desconocida caían en
     `updateNotas(null)` y BORRABAN las notas devolviendo 200. Editar notas
     exige mandar `notas` (aunque sea `null`, que es borrarlas a propósito). */
  .strict()
  .refine((d) => d.notas !== undefined || d.cancelar === true, { message: "Manda las notas o `cancelar: true`." });

/**
 * (ADR-448) Re-marcar de qué lado está la plata de un adelanto cargado al
 * revés — en Blas, ADL-0003/4 de WASACO son pagos por el aserrío guardados como
 * plata dada. No mueve la caja: lo que entró o salió ese día ya pasó.
 */
const CorregirDireccionSchema = z
  .object({
    action: z.literal("corregirDireccion"),
    direccion: z.enum(["DADO", "RECIBIDO"]),
    conceptoRecibido: z.enum(["SERVICIO", "PRESTAMO"]).nullable().optional(),
    motivo: motivoSchema({ mensaje: "Escribe por qué cambias la dirección (al menos 3 letras)." }),
  })
  .strict();

/**
 * Poner vencimiento o atar a un permiso un adelanto ya dado (2026-09-30).
 * `strict`: mezclado con `notas` o `cancelar` es otro pedido, y antes de esto un
 * `{ fechaVencimiento }` caía en el esquema de notas, que lo descartaba y
 * BORRABA el motivo guardado.
 */
const ControlSchema = z
  .object({
    /** Día de Lima; `null` = quitar la fecha. */
    fechaVencimiento: z.string().regex(PATRON_DIA, "La fecha va como AAAA-MM-DD.").nullable().optional(),
    /** Permiso de este negocio; `null` = desatar. */
    contratoId: z.string().trim().max(64).nullable().optional(),
  })
  .strict()
  .refine((d) => d.fechaVencimiento !== undefined || d.contratoId !== undefined, {
    message: "Manda la fecha o el permiso.",
  });

const esPedidoDeControl = (body: unknown): boolean =>
  !!body && typeof body === "object" && ("fechaVencimiento" in body || "contratoId" in body);

// GET /api/adelantos/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;
  try {
    const adelanto = await AdelantosDB.getById(auth.tenantId, id);
    if (!adelanto) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(adelanto);
  } catch (e) {
    logger.error("[adelantos/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// PATCH /api/adelantos/[id] — editar notas, cancelar, poner vencimiento / permiso, corregir la dirección o adjuntar el recibo firmado
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;
  /* El recibo firmado llega como ARCHIVO: lo sube el servidor a la carpeta
     privada después de validar todo (antes, el cliente lo subía al bucket
     público y cada 4xx dejaba una hoja con DNI huérfana). */
  if ((req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    return adjuntarComprobante(req, auth, id);
  }
  try {
    const body: unknown = await req.json().catch(() => null);
    if (body && typeof body === "object" && (body as { action?: unknown }).action === "corregirDireccion") {
      return corregirDireccion(req, auth, id, body);
    }
    if (body && typeof body === "object" && (body as { action?: unknown }).action === "adjuntarComprobante") {
      return NextResponse.json(
        { error: "La hoja firmada se manda como archivo (multipart/form-data), no como URL.", code: "sin_archivo" },
        { status: 400 },
      );
    }
    if (esPedidoDeControl(body)) return controlar(auth, id, body);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    /* Anular hace desaparecer una deuda: es `delete` en la matriz (admin y
       dueño; manager NO, aunque pase `requireAdmin(req, ["admin"])` por el bypass
       de gestión). Editar las notas es `write` (arriba). */
    if (parsed.data.cancelar) {
      const sinBorrar = permisoAdelantos(auth.role, "delete");
      if (sinBorrar) return sinBorrar;
    }
    /* ADR-448: anular un RECIBIDO devolviendo la plata la saca de la caja — sólo
       admin o dueño (`manager` pasa el chequeo de arriba por el bypass de gestión). */
    const updated = parsed.data.cancelar
      ? await AdelantosDB.cancel(auth.tenantId, id, parsed.data.devolucionCaja, {
          puedeSacarPlataDeRecibido: soloAdminODueno(auth.role) === null,
        })
      : await AdelantosDB.updateNotas(auth.tenantId, id, parsed.data.notas ?? null);
    if (!updated) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    logActivity(parsed.data.cancelar ? "Cancelar" : "Editar", "adelanto", `Adelanto ${id}`, id, auth.username, undefined, auth.tenantId).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json(updated);
  } catch (e) {
    /* Ya anulado o ya liquidado: no hay saldo que devolver. El modal muestra `error` tal cual. */
    if (e instanceof AdelantoNoCancelableError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof AdelantoConLiquidacionError) return NextResponse.json({ error: e.message, code: e.code, liquidacion: e.liquidacion }, { status: 409 });
    if (e instanceof ReglaDeRecibidoError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    logger.error("[adelantos/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/**
 * PATCH `{ action: "corregirDireccion", direccion, conceptoRecibido?, motivo }`.
 *
 * Sólo admin o dueño: `requireAdmin(req, ["admin"])` deja pasar a `manager`
 * por el bypass de gestión, así que va el chequeo explícito. Cambiar el lado de
 * la plata da vuelta quién le debe a quién.
 */
async function corregirDireccion(
  req: NextRequest,
  auth: { tenantId: string; username: string; role: string },
  id: string,
  body: unknown,
): Promise<NextResponse> {
  const prohibido = soloAdminODueno(auth.role, "corregir de qué lado está la plata de un adelanto");
  if (prohibido) return prohibido;
  const parsed = CorregirDireccionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  try {
    const hecho = await AdelantosDB.corregirDireccion(auth.tenantId, id, {
      direccion: parsed.data.direccion,
      conceptoRecibido: parsed.data.conceptoRecibido ?? null,
      motivo: parsed.data.motivo,
      usuario: auth.username,
    });
    if (!hecho) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    /* El rastro (antes → después, motivo) ya quedó en la auditoría DENTRO de la
       transacción de la DB class: acá no se escribe otro renglón. */
    return NextResponse.json({
      ...hecho.adelanto,
      correccion: {
        antes: hecho.antes,
        despues: hecho.despues,
        cajaMovida: false,
        aviso: "La caja no se movió: si ese día la plata entró o salió distinto, anótalo en la caja a mano.",
        excedeLimite: hecho.excedeLimite,
      },
    });
  } catch (e) {
    if (e instanceof DireccionNoCorregibleError) {
      return NextResponse.json(
        { error: e.message, code: e.code, ...(e.movimiento ? { movimiento: e.movimiento } : {}) },
        { status: e.status },
      );
    }
    logger.error("[adelantos/id] corregirDireccion error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/**
 * PATCH `{ fechaVencimiento?: "AAAA-MM-DD" | null, contratoId?: string | null }`.
 *
 * `write` en la matriz (el mismo permiso que editar las notas, chequeado
 * arriba): no mueve plata. Sólo adelantos ABIERTOS; el permiso tiene que ser de
 * este negocio (422 si no); el rastro queda en la auditoría dentro de la misma
 * transacción.
 */
async function controlar(
  auth: { tenantId: string; username: string; role: string },
  id: string,
  body: unknown,
): Promise<NextResponse> {
  const parsed = ControlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  try {
    const hecho = await AdelantosControlDB.controlar(auth.tenantId, id, {
      ...(parsed.data.fechaVencimiento !== undefined ? { fechaVencimiento: parsed.data.fechaVencimiento } : {}),
      ...(parsed.data.contratoId !== undefined ? { contratoId: parsed.data.contratoId || null } : {}),
      usuario: auth.username,
    });
    if (!hecho) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ id, ...hecho });
  } catch (e) {
    if (e instanceof AdelantoNoControlableError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    logger.error("[adelantos/id] controlar error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/**
 * PATCH multipart `{ action: "adjuntarComprobante", anterior, file }` — el
 * recibo firmado en la pantalla (08-10) queda como la foto del comprobante, la
 * misma columna que llena «Adjuntar archivo» en el alta. `write` (chequeado
 * arriba): no mueve plata ni saldo. Reemplazar una foto que YA tiene (voucher
 * o recibo firmado) es sólo de admin o dueño (403 al encargado).
 *
 * Ley 29733: la hoja lleva DNI + firma + monto. El orden es lo que importa:
 *  1. el adelanto (de ESTE negocio, no anulado, con la foto `anterior` que se
 *     vio al firmar; `""` = ninguna) — 404/409 sin haber subido nada;
 *  2. la imagen (lo que sharp dice que ES, pasada a WebP sin metadatos);
 *  3. subirla a la carpeta PRIVADA del adelanto;
 *  4. compara-y-cambia; si otro la cambió entretanto, se BORRA lo subido.
 * La columna guarda `priv:<ruta>`; se ve por `GET …/comprobante`. La
 * actividad dice que se firmó (quién y cuándo los pone el log), no la ruta.
 */
const AdjuntarSchema = z
  .object({
    action: z.literal("adjuntarComprobante"),
    anterior: z.string().max(500),
  })
  .strict();

/** Vercel corta el cuerpo en 4,5 MB; la hoja en JPEG pesa 0,2-1 MB. */
const MAX_BYTES_HOJA = 4 * 1024 * 1024;
/**
 * La hoja sale de un lienzo de 1000 px de ancho (`hoja-firma.ts`) con el voucher
 * arriba acotado: ~1-3 MP. 12 MP da aire y corta antes una bomba de
 * descompresión (un PNG chico que se abre en 40 MP de RAM).
 */
const MAX_PIXELES_HOJA = 12_000_000;
/**
 * `warning` es lo más estricto de sharp (`none` < `truncated` < `error` <
 * `warning`) y su valor por defecto en 0.34: explícito para que un cambio de
 * versión no lo afloje. Un JPEG cortado o con datos corruptos → 422.
 */
const OPCIONES_SHARP_HOJA = { limitInputPixels: MAX_PIXELES_HOJA, failOn: "warning" } as const;
const TIPOS_HOJA = new Set(["image/jpeg", "image/png", "image/webp"]);
const FORMATOS_HOJA = new Set(["jpeg", "png", "webp"]);

async function adjuntarComprobante(
  req: NextRequest,
  auth: { tenantId: string; username: string; role: string },
  id: string,
): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Manda la hoja firmada como multipart/form-data." }, { status: 400 });
  }
  const campos: Record<string, string> = {};
  let file: File | null = null;
  for (const [k, v] of form.entries()) {
    if (k === "file" && v instanceof File && !file) file = v;
    else if (typeof v === "string" && !(k in campos)) campos[k] = v;
    else return NextResponse.json({ error: "Datos inválidos", issues: [`Campo repetido o inesperado: ${k}`] }, { status: 400 });
  }
  const parsed = AdjuntarSchema.safeParse(campos);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No llegó la hoja firmada." }, { status: 400 });
  if (!TIPOS_HOJA.has(file.type)) {
    return NextResponse.json({ error: "La hoja firmada tiene que ser una imagen (JPG, PNG o WebP).", code: "no_es_imagen" }, { status: 422 });
  }
  if (file.size > MAX_BYTES_HOJA) {
    return NextResponse.json({ error: "La hoja firmada pesa más de 4 MB.", code: "muy_grande" }, { status: 413 });
  }
  const anterior = parsed.data.anterior.trim() || null;

  /* 1. El adelanto, antes de subir nada. */
  let actual: Awaited<ReturnType<typeof AdelantosDB.comprobanteDe>>;
  try {
    actual = await AdelantosDB.comprobanteDe(auth.tenantId, id);
  } catch (e) {
    logger.error("[adelantos/id] adjuntarComprobante lectura error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  if (!actual) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const anulado = rechazoDeFirma(actual.status === "CANCELADO" ? "anulado" : null);
  if (anulado) return anulado;
  /* Reemplazar la foto que YA tiene (el voucher del alta o un recibo firmado
     antes) es sólo de admin o dueño: con `write`, un encargado cambiaba el
     voucher de un RECIBIDO por cualquier imagen. Se mira la columna de la base,
     no lo que dice el cliente; y el compara-y-cambia de abajo (`anterior` =
     null → sólo si sigue vacía) cierra la carrera. Firmar uno sin foto sigue
     siendo `write`.
     08-10 (integrador): la PRIMERA firma sobre el voucher del alta sigue siendo
     `write` —si no, un encargado no podía firmar ningún adelanto con voucher, que
     es el caso normal—; el voucher queda arriba en la hoja y su ruta en la
     actividad (`anterior`), así que el original siempre se recupera. Lo que
     exige admin/dueño es reemplazar un recibo YA FIRMADO. */
  if (actual.comprobanteUrl && esReciboFirmado(actual.comprobanteUrl)) {
    const prohibido = soloAdminODueno(auth.role, "reemplazar la foto o el recibo firmado que ya tiene un adelanto");
    if (prohibido) return prohibido;
  }
  const rechazo = rechazoDeFirma((actual.comprobanteUrl ?? null) !== anterior ? "cambio" : null);
  if (rechazo) return rechazo;

  /* 2. La imagen: lo que ES, no lo que declara el navegador. */
  let webp: Buffer;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { format } = await sharp(buf, OPCIONES_SHARP_HOJA).metadata();
    if (!format || !FORMATOS_HOJA.has(format)) {
      return NextResponse.json({ error: "La hoja firmada tiene que ser una imagen (JPG, PNG o WebP).", code: "no_es_imagen" }, { status: 422 });
    }
    webp = await sharp(buf, OPCIONES_SHARP_HOJA)
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (e) {
    logger.warn("[adelantos/id] la hoja firmada no es una imagen legible", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "La hoja firmada no es una imagen que se pueda leer.", code: "no_es_imagen" }, { status: 422 });
  }

  /* 3. A la carpeta privada del adelanto. */
  let ruta: string;
  try {
    ruta = rutaFirmaPrivada(auth.tenantId, id, Date.now(), randomBytes(8).toString("hex"));
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const subida = await subirFirmaPrivada(ruta, webp).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
  if (!subida.ok) return NextResponse.json({ error: "No se pudo guardar la hoja firmada. Prueba de nuevo." }, { status: 502 });

  /* 4. Compara-y-cambia; lo que no quedó, no se deja en el bucket. */
  const comprobanteUrl = `${PREFIJO_PRIVADO}${ruta}`;
  let r: Awaited<ReturnType<typeof AdelantosDB.adjuntarComprobante>>;
  try {
    r = await AdelantosDB.adjuntarComprobante(auth.tenantId, id, comprobanteUrl, anterior);
  } catch (e) {
    await borrarFirmaPrivada(ruta);
    logger.error("[adelantos/id] adjuntarComprobante error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  if (r !== "ok") {
    await borrarFirmaPrivada(ruta);
    if (r === "no-existe") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return rechazoDeFirma(r) ?? NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  /* Al volver a firmar, la hoja anterior NO se borra: queda archivada en la
     misma carpeta privada (y la nueva la lleva arriba). La actividad guarda la
     referencia a la anterior (`priv:<ruta>` o la URL del voucher: una ruta, sin
     nombre ni DNI) para poder volver a ella; la nueva está en la columna. */
  const reemplaza = !anterior
    ? ""
    : `${esReciboFirmado(anterior) ? " (reemplaza el recibo firmado anterior, que queda archivado)" : " (la foto que tenía va arriba en la hoja)"} · anterior: ${anterior}`;
  logActivity("Firmar", "adelanto", `Adelanto ${id}: recibo firmado en la pantalla y guardado como comprobante${reemplaza}`, id, auth.username, undefined, auth.tenantId).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
  return NextResponse.json({ id, comprobanteUrl });
}

function rechazoDeFirma(motivo: "anulado" | "cambio" | null): NextResponse | null {
  if (motivo === "anulado") return NextResponse.json({ error: "Este adelanto está anulado: no se firma.", code: "anulado" }, { status: 409 });
  if (motivo === "cambio") {
    return NextResponse.json({ error: "Alguien cambió la foto de este adelanto mientras firmabas. Ciérralo, ábrelo de nuevo y vuelve a firmar.", code: "cambio" }, { status: 409 });
  }
  return null;
}

// DELETE /api/adelantos/[id] — soft-cancel (no borra historial)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "delete");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;
  try {
    // El DELETE no lleva body: cancela sin tocar la caja. Para anular
    // devolviendo el efectivo se usa el PATCH con `devolucionCaja`, que es donde
    // alguien puede decir por qué vía volvió la plata.
    const cancelled = await AdelantosDB.cancel(auth.tenantId, id);
    if (!cancelled) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    logActivity("Cancelar", "adelanto", `Adelanto ${id} cancelado`, id, auth.username, undefined, auth.tenantId).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AdelantoNoCancelableError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof AdelantoConLiquidacionError) return NextResponse.json({ error: e.message, code: e.code, liquidacion: e.liquidacion }, { status: 409 });
    logger.error("[adelantos/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
