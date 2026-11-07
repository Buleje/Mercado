import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";
import { leerMultipartFirma } from "@/lib/adelantos/imagen-firma.server";
import { bajarFirmaPrivada, borrarFirmaPrivada, subirFirmaPrivada } from "@/lib/adelantos/firma-storage";
import {
  esErrorFotoDocumento,
  esRutaFotoDocumento,
  MAX_BYTES_PEDIDO_FOTO_DOCUMENTO,
  normalizarFotoDocumento,
  rutaFotoDocumento,
} from "@/lib/adelantos/foto-documento.server";

/**
 * La foto del DNI de una persona de Adelantos (ADR-525, Ley 29733).
 *
 *  · POST  multipart `archivo` (JPG/PNG/WebP/HEIC, ≤ 8 MB): la pasa a WebP sin
 *    metadatos, la guarda en el bucket PRIVADO y anota su ruta en
 *    `fotoDocumentoKey`. Si ya había una, la reemplaza y borra la vieja.
 *  · GET   la imagen, sólo con sesión, permiso de adelantos y del MISMO negocio
 *    (el tenant del JWT va en el WHERE: otro negocio → 404). Nunca una URL.
 *  · DELETE la borra (columna y archivo).
 *
 * Todo queda en el historial; la vista, una vez por hora y por quien mira.
 */

const DEDUPE_VISTA_SEG = 60 * 60;
const noEsta = () => NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-foto-documento"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;

  const leido = await leerMultipartFirma(req, { archivos: ["archivo"], textos: [], maxBytes: MAX_BYTES_PEDIDO_FOTO_DOCUMENTO });
  if (!leido.ok) return NextResponse.json({ error: leido.error, ...(leido.issues ? { issues: leido.issues } : {}) }, { status: leido.status });
  const file = leido.archivos.archivo;
  if (!file) return NextResponse.json({ error: "No llegó la foto del documento (campo «archivo»)." }, { status: 400 });

  let actual: Awaited<ReturnType<typeof AdelantosDB.fotoDocumentoDe>>;
  try {
    actual = await AdelantosDB.fotoDocumentoDe(auth.tenantId, id);
  } catch (e) {
    logger.error("[adelantos/foto-documento] lectura error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  if (!actual) return noEsta();

  const foto = await normalizarFotoDocumento(file);
  if (esErrorFotoDocumento(foto)) return NextResponse.json({ error: foto.error, code: foto.code }, { status: foto.status });

  let ruta: string;
  try {
    ruta = rutaFotoDocumento(auth.tenantId, id, Date.now(), randomBytes(12).toString("hex"));
  } catch {
    return noEsta();
  }
  const subida = await subirFirmaPrivada(ruta, foto.webp).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
  if (!subida.ok) return NextResponse.json({ error: "No se pudo guardar la foto. Prueba de nuevo." }, { status: 502 });

  let guardada: boolean;
  try {
    guardada = await AdelantosDB.cambiarFotoDocumento(auth.tenantId, id, actual.fotoDocumentoKey, ruta);
  } catch (e) {
    await borrarFirmaPrivada(ruta);
    logger.error("[adelantos/foto-documento] guardar error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  if (!guardada) {
    await borrarFirmaPrivada(ruta);
    return NextResponse.json({ error: "Alguien cambió la foto mientras subías esta. Vuelve a abrir la ficha.", code: "cambio" }, { status: 409 });
  }
  /* La anterior ya no la alcanza ninguna columna: se borra (no se archiva, es un DNI). */
  if (actual.fotoDocumentoKey && esRutaFotoDocumento(actual.fotoDocumentoKey, auth.tenantId, id)) {
    await borrarFirmaPrivada(actual.fotoDocumentoKey);
  }
  const que = actual.fotoDocumentoKey ? "reemplazó" : "guardó";
  logActivity("Adjuntar", "adelanto", `Persona ${actual.nombre}: ${que} la foto del documento (privada)`, id, auth.username, undefined, auth.tenantId).catch((err) =>
    logger.error("[adelantos/foto-documento] logActivity failed", { error: String(err) }),
  );
  return NextResponse.json({ tieneFotoDocumento: true }, { status: 201 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  /* Brandon 30-10: la foto del DNI la ve solo quien edita adelantos. El analista (solo lectura) ve la
     ficha y que hay foto, pero no la imagen: es dato personal sensible (Ley 29733). */
  const sinEditar = permisoAdelantos(auth.role, "write");
  if (sinEditar) return sinEditar;
  // Contador propio: con la clave de subir/borrar, 20 vistas en 5 min bloqueaban subir y borrar (revisión 30-10).
  const rl = await applyRateLimit(req, "DRIVE_READ", "adelantos-foto-documento-ver");
  if (rl) return rl;
  const { id } = await params;

  let actual: Awaited<ReturnType<typeof AdelantosDB.fotoDocumentoDe>>;
  try {
    actual = await AdelantosDB.fotoDocumentoDe(auth.tenantId, id);
  } catch (e) {
    logger.error("[adelantos/foto-documento] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  const ruta = actual?.fotoDocumentoKey;
  /* La ruta tiene que ser de la carpeta de ESTA persona de ESTE negocio: una
     columna escrita a mano con otra ruta no abre el archivo de nadie. */
  if (!ruta || !esRutaFotoDocumento(ruta, auth.tenantId, id)) return noEsta();
  const binario = await bajarFirmaPrivada(ruta).catch((e: unknown) => {
    logger.error("[adelantos/foto-documento] no se pudo bajar", { error: String(e) });
    return null;
  });
  if (!binario) return noEsta();

  const quien = auth.username || "unknown";
  const clave = `adelanto-dni-vista:${auth.tenantId}:${quien}:${id}`;
  if (cacheStore.get<true>(clave) == null) {
    cacheStore.set(clave, true, DEDUPE_VISTA_SEG);
    logActivity("Ver", "adelanto", `Persona ${actual?.nombre ?? id}: vio la foto del documento`, id, quien, undefined, auth.tenantId).catch((err) =>
      logger.error("[adelantos/foto-documento] logActivity failed", { error: String(err) }),
    );
  }

  return new NextResponse(new Uint8Array(binario), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(binario.length),
      "Content-Disposition": "inline",
      /* Ni el disco del navegador guarda un DNI; otro sitio no lo incrusta con la cookie de quien mira. */
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-foto-documento"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  // DELETE pide «delete» como el resto de las rutas de adelantos (guardián adelantos-permisos-matriz).
  const sinPermiso = permisoAdelantos(auth.role, "delete");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;

  try {
    const actual = await AdelantosDB.fotoDocumentoDe(auth.tenantId, id);
    if (!actual) return noEsta();
    if (!actual.fotoDocumentoKey) return NextResponse.json({ tieneFotoDocumento: false });
    /* Primero el archivo y después la columna (revisión 30-10): al revés, si fallaba el borrado el DNI quedaba
       en el bucket sin columna que lo alcance. Si entre medio otro subió una foto nueva, la columna ya apunta a
       la nueva, el cambio de abajo no la toca (409) y lo borrado era la vieja, que igual sobraba. */
    if (esRutaFotoDocumento(actual.fotoDocumentoKey, auth.tenantId, id)) await borrarFirmaPrivada(actual.fotoDocumentoKey);
    const quitada = await AdelantosDB.cambiarFotoDocumento(auth.tenantId, id, actual.fotoDocumentoKey, null);
    if (!quitada) return NextResponse.json({ error: "Alguien cambió la foto recién. Vuelve a abrir la ficha.", code: "cambio" }, { status: 409 });
    logActivity("Eliminar", "adelanto", `Persona ${actual.nombre}: borró la foto del documento`, id, auth.username, undefined, auth.tenantId).catch((err) =>
      logger.error("[adelantos/foto-documento] logActivity failed", { error: String(err) }),
    );
    return NextResponse.json({ tieneFotoDocumento: false });
  } catch (e) {
    logger.error("[adelantos/foto-documento] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
