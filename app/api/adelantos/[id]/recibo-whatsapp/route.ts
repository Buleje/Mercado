import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { leerMultipartFirma } from "@/lib/adelantos/imagen-firma.server";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { AdelantosReciboDB } from "@/lib/db/adelantos-recibo.db";
import { CarpetaAjenaError, DocumentsDB } from "@/lib/db/documents.db";
import { EnlacesEntidadDB, SubidaFallidaError } from "@/lib/db/enlaces-entidad.db";
import { ROLES_ENTIDAD_SENSIBLE } from "@/lib/documentos/enlaces-entidad";
import { MembreteDB } from "@/lib/db/membrete.db";
import { montoConMoneda } from "@/lib/adelantos/comprobante";
import {
  ACCION_RECIBO_WHATSAPP,
  DIAS_ENLACE_RECIBO,
  MAX_BYTES_RECIBO_PDF,
  MOTIVO_RECIBO_SOLO_DUENO,
  TAG_RECIBO_ADELANTO,
  celularParaRecibo,
  detalleEnvio,
  momentoDeLaFoto,
  pdfLlevaAlgunDocumento,
  puedeMandarRecibo,
  tagDelAdelanto,
} from "@/lib/adelantos/recibo-whatsapp";

/**
 * El recibo del adelanto por WhatsApp (23-10), en dos pasos:
 *
 * POST (multipart `file` = el PDF del recibo, `telefono`): lo guarda en el
 * Archivo, en la carpeta PRIVADA de la persona (candado de dueño, ADR-502), y
 * devuelve un enlace `/d/<token>` que vence a las 72 h. Si ya hay un recibo de
 * este adelanto armado después de su último cambio y con enlace vivo, se usa
 * ese (no un PDF nuevo por cada «Preparar»). La copia tiene que llegar con el
 * DNI tapado: si lo trae entero, se rechaza (Ley 29733). No anota «enviado».
 *
 * PUT (JSON `{ documentoId, telefono, via }`): se abrió WhatsApp con el
 * enlace (`whatsapp`) o se compartió el PDF desde el celular (`compartido`).
 * Queda en la actividad (quién, cuándo, a qué número, por dónde) y, si la
 * ficha de la persona estaba vacía, se anota el celular. «Enviado» = se abrió
 * el chat: WhatsApp no le avisa a nadie si el mensaje llegó.
 *
 * Lo que dice el mensaje (persona, código, monto, negocio) sale de la base:
 * el POST lo devuelve. El PDF lo arma el navegador (jsPDF, como el «Recibo
 * PDF» del menú); acá se revisa que sea un PDF y que no lleve el DNI entero.
 *
 * Sólo dueño y administrador (`puedeMandarRecibo`): el encargado tiene permiso
 * de adelantos, pero no entra a la carpeta privada de la persona.
 */

type Ctx = { params: Promise<{ id: string }> };

async function adelantoParaRecibo(tenantId: string, id: string) {
  const a = await AdelantosDB.getById(tenantId, id);
  if (!a) return { error: NextResponse.json({ error: "No encontrado" }, { status: 404 }) } as const;
  if (a.status === "CANCELADO") return { error: NextResponse.json({ error: "Este adelanto está anulado.", code: "anulado" }, { status: 409 }) } as const;
  return { a } as const;
}

/** Los guardias de los dos pasos: CSRF, límite y sesión. El permiso va en cada handler (lo exige la matriz). */
async function guardias(req: NextRequest, clave: string) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return { error: csrfFail } as const;
  const rl = await applyRateLimit(req, "MODERATE", clave);
  if (rl) return { error: rl } as const;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return { error: auth } as const;
  return { auth } as const;
}

/** El candado de la carpeta de la persona: el encargado no escribe ahí y su enlace no abriría. */
function candadoDelRecibo(role: string): NextResponse | null {
  if (puedeMandarRecibo(role)) return null;
  return NextResponse.json({ error: MOTIVO_RECIBO_SOLO_DUENO, code: "candado_carpeta" }, { status: 403 });
}

/** El nombre del negocio para el mensaje; sin él el mensaje sale igual. */
async function nombreDelNegocio(tenantId: string): Promise<string> {
  try {
    return (await MembreteDB.del(tenantId)).nombre?.trim() ?? "";
  } catch (err) {
    logger.warn("[adelantos/recibo-wa] membrete.fail", { err: String(err) });
    return "";
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await guardias(req, "adelantos-recibo-wa");
  if (g.error) return g.error;
  const { auth } = g;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const candado = candadoDelRecibo(auth.role);
  if (candado) return candado;
  const { id } = await params;

  const leido = await leerMultipartFirma(req, { archivos: ["file"], textos: ["telefono"], maxBytes: MAX_BYTES_RECIBO_PDF });
  if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: leido.status });
  const file = leido.archivos.file;
  if (!file) return NextResponse.json({ error: "No llegó el PDF del recibo." }, { status: 400 });
  const cel = celularParaRecibo(leido.textos.telefono);
  if (!cel.ok) return NextResponse.json({ error: cel.error, code: "celular" }, { status: 400 });

  const pdf = new Uint8Array(await file.arrayBuffer());
  // Por contenido, no por el nombre: un PDF empieza con «%PDF-».
  if (pdf.length < 8 || String.fromCharCode(...pdf.slice(0, 5)) !== "%PDF-") {
    return NextResponse.json({ error: "Lo que llegó no es un PDF." }, { status: 400 });
  }

  try {
    const r = await adelantoParaRecibo(auth.tenantId, id);
    if (r.error) return r.error;
    const { a } = r;
    const nombre = a.beneficiario?.nombre?.trim() || "Persona";
    const codigo = a.codigoOperacion?.trim() || null;
    const [firmas, negocio] = await Promise.all([
      AdelantosReciboDB.firmasDelRecibo(auth.tenantId, a.id),
      nombreDelNegocio(auth.tenantId),
    ]);
    if (pdfLlevaAlgunDocumento(pdf, [a.beneficiario?.documento, ...firmas.documentos])) {
      return NextResponse.json(
        { error: "El recibo para mandar tiene que llevar el DNI tapado. Recarga la página y vuelve a prepararlo.", code: "dni_completo" },
        { status: 400 },
      );
    }
    const datos = { nombre, codigo, monto: montoConMoneda(a.montoAdelantado, a.moneda), negocio };
    const respuesta = (documentoId: string, token: string, venceEn: Date, reusado: boolean) =>
      NextResponse.json({
        documentoId,
        ruta: `/d/${token}`,
        venceEn: venceEn.toISOString(),
        nueve: cel.nueve,
        reusado,
        datos,
      });

    /* Un recibo armado después del último cambio (el adelanto, su firma o
       huella, su foto) y con enlace para rato: el mismo papel, sin otro PDF. */
    const cambios = [new Date(a.updatedAt), firmas.ultima, momentoDeLaFoto(a.comprobanteUrl)].filter(
      (d): d is Date => !!d && Number.isFinite(d.getTime()),
    );
    const despuesDe = new Date(Math.max(...cambios.map((d) => d.getTime()), 0));
    const vivo = await AdelantosReciboDB.reciboVivo(auth.tenantId, a.id, despuesDe);
    // `findByShareToken` repite lo que decide si el enlace abre HOY (candado, quien lo sacó).
    if (vivo && (await DocumentsDB.findByShareToken(vivo.token))) return respuesta(vivo.documentoId, vivo.token, vivo.expiresAt, true);

    const documentoId = await EnlacesEntidadDB.archivar(
      auth.tenantId,
      "tercero",
      { id: a.beneficiarioId, nombre },
      {
        pdf,
        nombreArchivo: `Recibo ${codigo ?? "de adelanto"} — ${nombre}.pdf`,
        extraTags: [tagDelAdelanto(a.id), TAG_RECIBO_ADELANTO],
        allowedRoles: ROLES_ENTIDAD_SENSIBLE,
      },
      auth.role,
      auth.username,
    );
    const share = await DocumentsDB.createShare(auth.tenantId, documentoId, {
      viewerRole: undefined,
      createdById: auth.username,
      expiresInDays: DIAS_ENLACE_RECIBO,
    });
    if (!share) return NextResponse.json({ error: "No se pudo crear el enlace del recibo." }, { status: 500 });
    DocumentsDB.log(auth.tenantId, {
      documentId: documentoId,
      actorId: auth.username,
      action: "share",
      metadata: { token: share.token.slice(0, 8) + "…", expiresAt: share.expiresAt, motivo: "recibo-adelanto-whatsapp", adelantoId: a.id },
    }).catch((err) => logger.warn("[adelantos/recibo-wa] documents.audit.fail", { err: String(err) }));
    return respuesta(documentoId, share.token, new Date(share.expiresAt), false);
  } catch (e) {
    if (e instanceof CarpetaAjenaError) return NextResponse.json({ error: "No se encontró la carpeta de la persona." }, { status: 404 });
    if (e instanceof SubidaFallidaError) return NextResponse.json({ error: "No se pudo guardar el PDF. Prueba de nuevo." }, { status: 502 });
    logger.error("[adelantos/recibo-wa] preparar error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo preparar el recibo." }, { status: 500 });
  }
}

const Enviado = z.object({
  documentoId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/),
  telefono: z.string().trim().min(1).max(30),
  via: z.enum(["whatsapp", "compartido"]).default("whatsapp"),
});

export async function PUT(req: NextRequest, { params }: Ctx) {
  const g = await guardias(req, "adelantos-recibo-wa-enviado");
  if (g.error) return g.error;
  const { auth } = g;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const candado = candadoDelRecibo(auth.role);
  if (candado) return candado;
  const { id } = await params;

  const parsed = Enviado.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  const cel = celularParaRecibo(parsed.data.telefono);
  if (!cel.ok) return NextResponse.json({ error: cel.error, code: "celular" }, { status: 400 });

  try {
    const r = await adelantoParaRecibo(auth.tenantId, id);
    if (r.error) return r.error;
    const { a } = r;
    // El envío se anota sólo con un recibo de ESTE adelanto (etiqueta `adelanto:<id>`, mismo tenant).
    if (!(await AdelantosReciboDB.esReciboDelAdelanto(auth.tenantId, parsed.data.documentoId, a.id))) {
      return NextResponse.json({ error: "Ese recibo no es de este adelanto: vuelve a prepararlo.", code: "documento_ajeno" }, { status: 404 });
    }
    const { via } = parsed.data;
    await logActivity(
      ACCION_RECIBO_WHATSAPP,
      "adelanto",
      detalleEnvio({ codigo: a.codigoOperacion ?? null, adelantoId: a.id, nueve: cel.nueve, documentoId: parsed.data.documentoId, via }),
      a.id,
      auth.username,
      undefined,
      auth.tenantId,
      { tirar: true },
    );
    const celularAnotado = await AdelantosReciboDB.anotarCelularSiFalta(auth.tenantId, a.beneficiarioId, cel.nueve);
    return NextResponse.json({ enviadoEn: new Date().toISOString(), nueve: cel.nueve, por: auth.username, via, celularAnotado });
  } catch (e) {
    logger.error("[adelantos/recibo-wa] registrar envío error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo anotar el envío." }, { status: 500 });
  }
}
