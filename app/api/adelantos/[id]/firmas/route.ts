import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { permisoAdelantos, permisoEntregar, PREFIJO_CLAVE_CAJERO, VENTANA_FIRMA_CAJERO_MS } from "@/lib/adelantos/permisos";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { FirmarDatosSchema } from "@/lib/adelantos/entregar-schema";
import type { ImagenGuardada, RegistroFirmasRespuesta } from "@/lib/adelantos/entregar-tipos";
import { imagenesDeFirma, jsonDe, leerMultipartFirma } from "@/lib/adelantos/imagen-firma.server";
import { guardarEnRegistro, type ImagenAGuardar } from "@/lib/adelantos/guardar-en-registro.server";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { AdelantoFirmasDB } from "@/lib/db/adelanto-firmas.db";


/**
 * GET /api/adelantos/[id]/firmas — el registro de firmas y huellas (ADR-491),
 * la más nueva primero; `vigente` = la última de su tipo. Permiso de lectura.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  const rl = await applyRateLimit(req, "DRIVE_READ", "adelantos-firmas");
  if (rl) return rl;
  const { id } = await params;
  try {
    if (!(await AdelantosDB.comprobanteDe(auth.tenantId, id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const respuesta: RegistroFirmasRespuesta = { firmas: await AdelantoFirmasDB.listar(auth.tenantId, id) };
    return NextResponse.json(respuesta, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[adelantos/firmas] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/**
 * POST /api/adelantos/[id]/firmas — multipart `datos` (`FirmarDatosSchema`) +
 * `firma` (+ `huella`). Agrega al registro (nunca reemplaza filas: la nueva
 * pasa a ser la vigente). Ya no toca `comprobanteUrl`.
 *
 * Quién: `adelantos:write`; reemplazar una firma o huella VIGENTE, sólo admin o
 * dueño. El cajero (sin `adelantos`) sólo con `entregaKey` = la clave del alta
 * que hizo, dentro de 2 h y sin vigente de ese tipo: es el «Reintentar firma»
 * de Entregar cuando la imagen no se guardó.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-firmas"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  /* El permiso ANTES de leer el cuerpo (403 antes que 400): la matriz, o la
     puerta del cajero (que además exige `entregaKey`, mirado abajo). */
  const sinPermiso = permisoAdelantos(auth.role, "write");
  const comoCajero = !!sinPermiso;
  if (sinPermiso && permisoEntregar(auth.role)) return sinPermiso;

  const leido = await leerMultipartFirma(req, { archivos: ["firma", "huella"], textos: ["datos"] });
  if (!leido.ok) return NextResponse.json({ error: leido.error, ...(leido.issues ? { issues: leido.issues } : {}) }, { status: leido.status });
  const parsed = FirmarDatosSchema.safeParse(jsonDe(leido.textos.datos));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const d = parsed.data;

  /* El cajero sólo con la clave de SU alta. */
  if (sinPermiso && !d.entregaKey) return sinPermiso;

  if (!leido.archivos.firma) return NextResponse.json({ error: "No llegó la firma.", code: "firma_obligatoria" }, { status: 400 });
  if (leido.archivos.huella && !d.consentimientoHuella) {
    return NextResponse.json({ error: "Para guardar la huella, la persona tiene que aceptar el aviso.", code: "falta_consentimiento" }, { status: 400 });
  }

  let a: Awaited<ReturnType<typeof AdelantosDB.datosParaFirmar>>;
  let vig: Awaited<ReturnType<typeof AdelantoFirmasDB.vigentes>>;
  try {
    a = await AdelantosDB.datosParaFirmar(auth.tenantId, id);
    if (!a) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    /* Un reintento de lo que YA quedó vuelve lo mismo (antes de mirar vigentes:
       la vigente es la de este mismo intento). */
    const ya = await AdelantoFirmasDB.porIdempotencia(auth.tenantId, id, [`${d.idempotencyKey}:FIRMA`, `${d.idempotencyKey}:HUELLA`]);
    const yaFirma = ya.find((f) => f.tipo === "FIRMA");
    if (yaFirma) {
      const yaHuella = ya.find((f) => f.tipo === "HUELLA");
      return NextResponse.json(
        {
          firma: { guardada: true, id: yaFirma.id, sha256: yaFirma.sha256 },
          huella: yaHuella ? { guardada: true, id: yaHuella.id, sha256: yaHuella.sha256 } : null,
          repetido: true,
        },
        { status: 200 },
      );
    }
    vig = await AdelantoFirmasDB.vigentes(auth.tenantId, id);
  } catch (e) {
    logger.error("[adelantos/firmas] lectura error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  if (a.status === "CANCELADO") return NextResponse.json({ error: "Este adelanto está anulado: no se firma.", code: "anulado" }, { status: 409 });

  const reemplaza = !!vig.firma || (!!leido.archivos.huella && !!vig.huella);
  if (comoCajero) {
    const propio =
      a.idempotencyKey === `${PREFIJO_CLAVE_CAJERO}${d.entregaKey}` && a.direccion === "DADO" && Date.now() - a.createdAt.getTime() < VENTANA_FIRMA_CAJERO_MS;
    if (!propio || reemplaza) return sinPermiso ?? NextResponse.json({ error: "forbidden" }, { status: 403 });
  } else if (reemplaza) {
    const prohibido = soloAdminODueno(auth.role, "reemplazar la firma o la huella que ya tiene un adelanto");
    if (prohibido) return prohibido;
  }

  const imgs = await imagenesDeFirma(leido.archivos);
  if ("error" in imgs) return NextResponse.json({ error: imgs.error, code: imgs.code }, { status: imgs.status });

  const imagenes: ImagenAGuardar[] = [];
  if (imgs.firma) imagenes.push({ tipo: "FIRMA", webp: imgs.firma, trazos: d.trazos });
  if (imgs.huella) imagenes.push({ tipo: "HUELLA", webp: imgs.huella, consentimiento: d.consentimientoHuella ?? null });
  let r: { firma: ImagenGuardada | null; huella: ImagenGuardada | null };
  try {
    r = await guardarEnRegistro(
      auth.tenantId,
      { id: a.id, montoAdelantado: a.montoAdelantado, moneda: a.moneda, codigoOperacion: a.codigoOperacion },
      imagenes,
      { firmante: d.firmante, pedidoPor: auth.username, clave: d.idempotencyKey },
    );
  } catch (e) {
    logger.error("[adelantos/firmas] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar la firma. Prueba de nuevo." }, { status: 502 });
  }
  if (!r.firma?.guardada) return NextResponse.json({ error: "No se pudo guardar la firma. Prueba de nuevo.", huella: r.huella }, { status: 502 });

  logActivity(
    "Firmar",
    "adelanto",
    `Adelanto ${a.codigoOperacion ?? id}: firma${r.huella?.guardada ? " y huella" : ""} en la pantalla${reemplaza ? " (reemplaza la vigente, que queda en el registro)" : ""}`,
    id,
    auth.username,
    undefined,
    auth.tenantId,
  ).catch((err) => logger.error("[adelantos/firmas] logActivity failed", { error: String(err) }));
  return NextResponse.json({ firma: r.firma, huella: r.huella }, { status: 201 });
}
