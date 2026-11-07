import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { applyRateLimitWithTenant } from "@/lib/rate-limit";
import { aiCostGuard } from "@/lib/ai/cost-control";
import {
  FORMATOS_IMAGEN_Y_PDF,
  costoMaximoLecturaUsd,
  estadoLectorIA,
  gastoDeLectura,
  paginasDePdf,
  visionExtractJSON,
} from "@/lib/ai/vision-extract";
import { AVISO_IA_NO_DISPONIBLE } from "@/lib/ai/aviso-clave-ia";
import { veDetalleDeClaveIA } from "@/lib/ai/detalle-clave-ia";
import { DocumentsDB } from "@/lib/db/documents.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestPlanDocumentosDB } from "@/lib/db/forest-plan-documentos.db";
import { analyzeDocumentContent } from "@/lib/documents/analyze-document";
import { enColaDeAnalisis } from "@/lib/documents/cola-analisis";
import { downloadFromStorage } from "@/lib/documents/storage";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { JSON_SCHEMA_CONSTANCIA, LecturaCrudaSchema, PROMPT_CONSTANCIA, normalizarLectura } from "@/lib/forestal/loth-constancia-ocr";
import {
  JSON_SCHEMA_RESOLUCION,
  PROMPT_RESOLUCION,
  ResolucionCrudaSchema,
  juntarLecturas,
  lecturaDesdeConstancia,
  leerResolucionDeTexto,
  normalizarResolucion,
  resolucionVacia,
  type LecturaResolucion,
} from "@/lib/forestal/loth-resolucion-lectura";
import { propuestaContraPlan } from "@/lib/forestal/loth-resolucion-propuesta";
import { archivosDeVista } from "@/lib/forestal/loth-plan-papeles";
import { logger } from "@/lib/logger";
import { entrar, cuerpo } from "../_comun";

/**
 * /api/admin/forestal/plan/documentos/leer-resolucion — «Llenar desde la resolución».
 *
 * POST { planId, documentId } → { lectura, propuesta, fuente, avisos, archivo }
 *
 * `archivo` = nombre, quién lo subió y cuándo: la ventana lo muestra al lado
 * de lo leído (cualquiera con acceso a la carpeta pudo subir un papel).
 *
 * Lee la resolución (o el certificado de registro de la plantación) que YA
 * está en la carpeta del plan y la compara con lo que el plan guarda. NO
 * guarda nada: la pantalla muestra «hoy / el papel dice» y la persona marca
 * qué pasa al plan (PATCH /plan y PUT /plan/species, los de siempre).
 *
 * Con qué lee:
 *   · siempre, el texto que el Archivo sacó al subirlo (`ocrText`: el texto
 *     del PDF o el OCR del servidor). Si todavía no lo tiene, lo saca ahora.
 *   · si hay IA de visión, además mira el archivo (certificado de plantación
 *     → el lector del alta; resolución de bosque → `PROMPT_RESOLUCION`), y lo
 *     que no leyó lo completa el texto. Sin IA, avisa y sigue con el texto.
 *
 * Sólo admin y dueño: lo que se propone es el techo de la tala (T6).
 */

const Body = z.object({ planId: z.string().trim().min(1).max(40), documentId: z.string().trim().min(1).max(40) });

/* Lo mismo que el lector del alta: una resolución son pocas hojas y cada hoja se paga. */
const MAX_PAGINAS_PDF = 5;
const MAX_BYTES_IA = 8 * 1024 * 1024;
const MAX_TOKENS = 3000;

type Fuente = "texto" | "ia" | "ia+texto";

export const POST = withApiHandler("forestal-plan-leer-resolucion", async (req: NextRequest) => {
  const auth = await entrar(req, "escribir");
  if (auth instanceof Response) return auth;
  const prohibido = soloAdminODueno(auth.role, "llenar el plan desde la resolución");
  if (prohibido) return prohibido;
  const rl = applyRateLimitWithTenant(req, "MODERATE", auth.tenantId, "loth-leer-resolucion", { maxReqs: 30, windowSec: 60 * 60 });
  if (rl) return rl;
  const body = await cuerpo(req, Body);
  if (body instanceof NextResponse) return body;

  const [plan, vista, especies] = await Promise.all([
    ForestPlanDB.getPlan(auth.tenantId, body.planId),
    ForestPlanDocumentosDB.vista(auth.tenantId, body.planId, auth.role),
    ForestPlanDB.listSpecies(auth.tenantId, body.planId),
  ]);
  if (!plan || !vista) return NextResponse.json({ error: "plan_no_encontrado", message: "Ese plan de manejo no existe en este negocio." }, { status: 404 });
  /* Sólo un archivo de las carpetas de ESTE plan: la ruta no es un lector suelto del Archivo. */
  if (!archivosDeVista(vista).some((a) => a.documentId === body.documentId)) {
    return NextResponse.json({ error: "no_es_del_plan", message: "Ese archivo no está en las carpetas de este plan." }, { status: 400 });
  }
  let doc = await DocumentsDB.getById(auth.tenantId, body.documentId, auth.role);
  if (!doc) return NextResponse.json({ error: "not_found", message: "No encontré ese archivo." }, { status: 404 });

  const avisos: string[] = [];
  /* Recién subido: el análisis de la subida puede seguir en la cola. Se saca
     ahora sólo el texto (sin IA, sin gasto: la IA mira el archivo abajo) y se
     relee; la fecha leída queda como sugerencia, igual que en la subida. */
  if (!doc.ocrText?.trim()) {
    await enColaDeAnalisis(doc.id, () =>
      analyzeDocumentContent(auth.tenantId, body.documentId, auth.username, auth.role, { conVision: false, conIA: false, soloSugerirVencimiento: true }),
    ).catch((err) =>
      logger.warn("[leer-resolucion] analisis_fail", { error: String(err), tenantId: auth.tenantId.slice(-6) }),
    );
    doc = (await DocumentsDB.getById(auth.tenantId, body.documentId, auth.role)) ?? doc;
  }
  const conocidas = especies.map((e) => ({ comun: e.speciesCommon, cientifico: e.speciesScientific }));
  const deTexto = leerResolucionDeTexto(doc.ocrText ?? "", conocidas);

  const plantacion = plan.planType === "PLANTACION";
  const lector = estadoLectorIA(await veDetalleDeClaveIA(req));
  const esPdf = doc.mimeType === "application/pdf";
  const leible = (FORMATOS_IMAGEN_Y_PDF as readonly string[]).includes(doc.mimeType) && (!esPdf || lector.leePdf);
  let deIA: LecturaResolucion | null = null;

  if (!lector.activo) {
    avisos.push(`${lector.aviso ?? AVISO_IA_NO_DISPONIBLE} Se leyó sólo el texto del archivo.`);
  } else if (!leible) {
    avisos.push("La IA de esta tienda no lee este tipo de archivo: se leyó sólo su texto.");
  } else if (doc.size > MAX_BYTES_IA) {
    avisos.push("El archivo es muy grande para la IA: se leyó sólo su texto.");
  } else {
    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) {
      avisos.push("No pude bajar el archivo para la IA: se leyó sólo su texto.");
    } else {
      const base64 = buf.toString("base64");
      const paginas = esPdf ? await paginasDePdf(base64) : undefined;
      if (esPdf && (paginas == null || paginas > MAX_PAGINAS_PDF)) {
        avisos.push(`El PDF tiene más de ${MAX_PAGINAS_PDF} hojas: la IA no lo leyó, se leyó sólo su texto.`);
      } else {
        const reserva = costoMaximoLecturaUsd({ maxTokens: MAX_TOKENS, paginasPdf: paginas ?? undefined });
        if (!(await aiCostGuard.canSpend(auth.tenantId, reserva))) {
          avisos.push("Se acabó el presupuesto de lectura con IA de este mes: se leyó sólo el texto.");
        } else {
          const comun = {
            imageBase64: `data:${doc.mimeType};base64,${base64}`,
            formatos: FORMATOS_IMAGEN_Y_PDF,
            maxTokens: MAX_TOKENS,
            logTag: "[leer-resolucion]",
            verDetalleDeClave: await veDetalleDeClaveIA(req),
          };
          if (plantacion) {
            const r = await visionExtractJSON({ ...comun, prompt: PROMPT_CONSTANCIA, schema: LecturaCrudaSchema, jsonSchema: JSON_SCHEMA_CONSTANCIA });
            const gasto = gastoDeLectura(r, reserva);
            if (gasto != null) await aiCostGuard.recordSpend(auth.tenantId, gasto);
            if (r.ok) deIA = lecturaDesdeConstancia(normalizarLectura(r.data));
            else avisos.push("La IA no pudo leer el archivo: se usó su texto.");
          } else {
            const r = await visionExtractJSON({ ...comun, prompt: PROMPT_RESOLUCION, schema: ResolucionCrudaSchema, jsonSchema: JSON_SCHEMA_RESOLUCION });
            const gasto = gastoDeLectura(r, reserva);
            if (gasto != null) await aiCostGuard.recordSpend(auth.tenantId, gasto);
            if (r.ok) deIA = normalizarResolucion(r.data);
            else avisos.push("La IA no pudo leer el archivo: se usó su texto.");
          }
          if (deIA && resolucionVacia(deIA)) deIA = null;
        }
      }
    }
  }

  const lectura = juntarLecturas(deIA, deTexto);
  const fuente: Fuente = deIA ? (resolucionVacia(deTexto) ? "ia" : "ia+texto") : "texto";
  if (resolucionVacia(lectura)) {
    return NextResponse.json(
      {
        error: "sin_datos",
        message: doc.ocrText?.trim()
          ? "En el archivo no encontré el N°, la fecha ni las especies. Revisa que sea la resolución o el certificado."
          : "Todavía no pude leer el texto de este archivo. Prueba en un minuto o carga los datos a mano.",
        avisos,
      },
      { status: 422 },
    );
  }
  const propuesta = propuestaContraPlan(
    {
      id: plan.id,
      planType: plan.planType,
      planNumber: plan.planNumber,
      resolucionNumber: plan.resolucionNumber,
      resolucionDate: plan.resolucionDate,
      vigenciaDesde: plan.vigenciaDesde,
      vigenciaHasta: plan.vigenciaHasta,
      titularName: plan.titularName,
      arffs: plan.arffs,
    },
    especies.map((e) => ({
      id: e.id,
      speciesCommon: e.speciesCommon,
      speciesScientific: e.speciesScientific,
      volumenAutorizadoM3: e.volumenAutorizadoM3 == null ? null : Number(e.volumenAutorizadoM3),
      arbolesAutorizados: e.arbolesAutorizados,
    })),
    lectura,
  );
  const archivo = {
    nombre: doc.name,
    subidoPor: doc.uploadedById || null,
    subidoEl: doc.uploadedAt || null,
  };
  return NextResponse.json({ lectura, propuesta, fuente, archivo, avisos: [...avisos, ...lectura.avisos] });
});
