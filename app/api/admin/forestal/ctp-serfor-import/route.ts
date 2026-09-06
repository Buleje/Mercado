import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { auditCtp } from "@/lib/forestal/ctp-audit";

/**
 * Importar los registros del Libro de Operaciones que el SNIFFS exporta y que
 * el importador de ADR-138 no cubría: **Consumos** (Sección 2) y **Retrozado**
 * (Apartado 2).
 *
 * Los otros tres (Ingresos, Producción, Salidas) siguen entrando por
 * `wood-entries/import`, que ya los resuelve con sus invariantes.
 *
 * DOS PASOS, nunca a ciegas:
 *  1. `preview` — resuelve cada fila contra el libro y dice qué haría, SIN
 *     escribir. Es donde se ve que un código no existe o que una troza ya está
 *     retrozada.
 *  2. `commit` — escribe sólo lo nuevo. Una fila que falla se reporta y el resto
 *     sigue: abortar entero por una celda obliga a rehacer las otras doscientas.
 *
 * El server NUNCA confía en el cliente: re-valida todo y re-resuelve los
 * códigos contra la base, aunque el navegador ya lo haya hecho.
 */

const MAX_FILAS = 5000;

/** Una fila de Consumos ya parseada por `ctp-formatos-serfor`. */
const consumoSchema = z.object({
  fila: z.number().int().positive().optional(),
  fecha: z.string().max(20).nullable().optional(),
  codigoOrigen: z.string().trim().min(1).max(120),
  especieComun: z.string().trim().max(200).nullable().optional(),
  cantidad: z.number().positive().max(99_999_999),
  lote: z.string().trim().max(80).nullable().optional(),
  observaciones: z.string().trim().max(500).nullable().optional(),
});

/** Una fila del Apartado 2. Los diámetros vienen en METROS en el formato. */
const retrozoSchema = z.object({
  fila: z.number().int().positive().optional(),
  fecha: z.string().max(20).nullable().optional(),
  codigoMadre: z.string().trim().min(1).max(120),
  codigoRetrozo: z.string().trim().min(1).max(120),
  diametroMayor: z.number().nonnegative().max(999).nullable().optional(),
  diametroMenor: z.number().nonnegative().max(999).nullable().optional(),
  longitud: z.number().positive().max(200).nullable().optional(),
  volumenFinal: z.number().positive().max(99_999),
  observaciones: z.string().trim().max(500).nullable().optional(),
});

const bodySchema = z.object({
  mode: z.enum(["preview", "commit"]),
  registro: z.enum(["consumos", "retrozado"]),
  fileName: z.string().trim().max(200).optional(),
  consumos: z.array(consumoSchema).max(MAX_FILAS).optional().default([]),
  retrozado: z.array(retrozoSchema).max(MAX_FILAS).optional().default([]),
});

type Accion = "crear" | "creado" | "existe" | "error";
type ResultadoFila = { fila?: number; codigo: string; accion: Accion; mensaje: string };

/**
 * El formato del SNIFFS imprime los diámetros del retrozado en METROS (0.60) y
 * la base los guarda en CENTÍMETROS. Un 60 sin convertir sería un tronco de 60
 * metros de diámetro; un 0.60 guardado como cm, uno de 6 mm.
 *
 * Se decide por magnitud y no por la cabecera: hay exports que ya vienen en cm
 * (el reporte de la captura muestra «60» y «59» bajo «Diametro Mayor (m)»), así
 * que confiar en la unidad declarada guardaría basura en la mitad de los casos.
 */
export function aCentimetros(v: number | null | undefined): number | null {
  if (v == null || !(v > 0)) return null;
  /* Ningún tronco tiene 5 cm ni 5 m de diámetro: por debajo de 5 el número
     está en metros y hay que multiplicar. */
  return v < 5 ? Math.round(v * 100 * 100) / 100 : Math.round(v * 100) / 100;
}

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const rl = await applyRateLimit(req, "MODERATE", "ctp-serfor-import"); if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }
  const { mode, registro, fileName } = parsed.data;
  const escribir = mode === "commit";

  try {
    const filas: ResultadoFila[] =
      registro === "retrozado"
        ? await procesarRetrozado(auth.tenantId, auth.username, parsed.data.retrozado, escribir)
        : await procesarConsumos(auth.tenantId, parsed.data.consumos, escribir);

    const resumen = {
      creados: filas.filter((f) => f.accion === "creado").length,
      porCrear: filas.filter((f) => f.accion === "crear").length,
      existen: filas.filter((f) => f.accion === "existe").length,
      errores: filas.filter((f) => f.accion === "error").length,
    };

    /* El import se audita SOLO al escribir: un fiscalizador quiere saber cómo
       entraron los datos, no cuántas veces alguien miró el preview. */
    if (escribir && (resumen.creados > 0 || resumen.errores > 0)) {
      auditCtp({
        tenantId: auth.tenantId,
        action: "ctp_import",
        entity: "ForestCtpImport",
        entityId: fileName || registro,
        detail:
          `Importó ${registro === "retrozado" ? "retrozados" : "consumos"}` +
          `${fileName ? ` desde «${fileName}»` : ""}: ${resumen.creados} creados` +
          `${resumen.existen ? `, ${resumen.existen} ya existían` : ""}` +
          `${resumen.errores ? `, ${resumen.errores} con error` : ""}`,
        user: auth.username,
      });
    }

    return NextResponse.json({ mode, registro, resumen, filas });
  } catch (e) {
    logger.error("[ctp-serfor-import] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo procesar el archivo." }, { status: 503 });
  }
}

/**
 * Apartado 2 · Retrozado.
 *
 * Cada fila del formato es UN pedazo. Se agrupan por madre porque `retrozar`
 * corta la troza de una vez —dentro de una transacción con lock sobre la
 * madre— y llamarlo pedazo por pedazo abriría la puerta a que dos filas del
 * mismo archivo compitan por el mismo volumen.
 */
async function procesarRetrozado(
  tenantId: string,
  usuario: string,
  filas: z.infer<typeof retrozoSchema>[],
  escribir: boolean,
): Promise<ResultadoFila[]> {
  const out: ResultadoFila[] = [];
  const porMadre = new Map<string, typeof filas>();
  for (const f of filas) {
    const k = f.codigoMadre.trim();
    porMadre.set(k, [...(porMadre.get(k) ?? []), f]);
  }

  for (const [codigoMadre, pedazos] of porMadre) {
    const madre = await WoodEntriesDB.buscarTrozaPorCodigo(tenantId, codigoMadre);
    if (!madre) {
      for (const p of pedazos) {
        out.push({ fila: p.fila, codigo: p.codigoRetrozo, accion: "error", mensaje: `No existe la troza ${codigoMadre} en el libro.` });
      }
      continue;
    }
    if (madre.consumidaEnId) {
      for (const p of pedazos) {
        out.push({ fila: p.fila, codigo: p.codigoRetrozo, accion: "error", mensaje: `La troza ${codigoMadre} ya se consumió: no se puede retrozar.` });
      }
      continue;
    }

    /* Los que ya están en el libro se saltan — el importador es insert-only y
       re-cortar una troza duplicaría su volumen. */
    const yaExisten = new Set(madre.retrozos.map((r) => r.codificacion));
    const nuevos = pedazos.filter((p) => !yaExisten.has(p.codigoRetrozo.trim()));
    for (const p of pedazos.filter((x) => yaExisten.has(x.codigoRetrozo.trim()))) {
      out.push({ fila: p.fila, codigo: p.codigoRetrozo, accion: "existe", mensaje: "Ya está en el libro." });
    }
    if (nuevos.length === 0) continue;

    if (!escribir) {
      for (const p of nuevos) {
        out.push({ fila: p.fila, codigo: p.codigoRetrozo, accion: "crear", mensaje: `Se corta de ${codigoMadre} · ${p.volumenFinal} m³` });
      }
      continue;
    }

    try {
      await WoodEntriesDB.retrozar(
        tenantId,
        madre.id,
        nuevos.map((p) => ({
          codificacion: p.codigoRetrozo.trim(),
          /* Un 0 donde el libro no trae la medida, no un null: el cálculo lee
             el 0 como «no medido» y usa el volumen del documento, que es el que
             manda. El `as never` que había acá tapaba justamente que estos tres
             podían venir vacíos. */
          d1Cm: aCentimetros(p.diametroMayor) ?? 0,
          d2Cm: aCentimetros(p.diametroMenor) ?? 0,
          largoM: p.longitud ?? 0,
          volumenM3: p.volumenFinal,
          /* «T/D: Troza Descartada» es la nota que el propio formato usa para
             el pedazo que no sirve. */
          descarte: /t\s*\/?\s*d|descart/i.test(p.observaciones ?? ""),
          observaciones: p.observaciones ?? null,
        })),
        { fecha: nuevos[0].fecha ? new Date(`${nuevos[0].fecha}T12:00:00Z`) : undefined, usuario },
      );
      for (const p of nuevos) {
        out.push({ fila: p.fila, codigo: p.codigoRetrozo, accion: "creado", mensaje: `Cortado de ${codigoMadre}` });
      }
    } catch (e) {
      /* El mensaje de la invariante es el que sirve: dice QUÉ regla se violó
         («los pedazos suman más que la madre»), no un 500 genérico. */
      const msg = e instanceof Error ? e.message : "No se pudo retrozar.";
      for (const p of nuevos) out.push({ fila: p.fila, codigo: p.codigoRetrozo, accion: "error", mensaje: msg });
    }
  }
  return out;
}

/**
 * Sección 2 · Consumos.
 *
 * El consumo del libro vive en `ForestCtpConsumo` (ingreso → corrida en m³) y
 * en la troza (`consumidaEnId`), y las dos caras se escriben juntas: por eso
 * este import RESUELVE y VALIDA pero no crea la corrida — sin saber a qué
 * corrida pertenece cada consumo, escribirlo sería inventar la atribución que
 * la invariante I2 existe para proteger.
 *
 * Lo que sí hace: decir exactamente qué troza es cada código, si está libre y
 * cuánto volumen tiene, para que el operador arme la corrida con los datos ya
 * cruzados en vez de buscarlos uno por uno.
 */
async function procesarConsumos(
  tenantId: string,
  filas: z.infer<typeof consumoSchema>[],
  escribir: boolean,
): Promise<ResultadoFila[]> {
  const out: ResultadoFila[] = [];

  for (const f of filas) {
    const codigo = f.codigoOrigen.trim();
    const troza = await WoodEntriesDB.buscarTrozaPorCodigo(tenantId, codigo);

    if (!troza) {
      out.push({ fila: f.fila, codigo, accion: "error", mensaje: "Ese código no existe en el libro: cargá primero el ingreso." });
      continue;
    }
    if (troza.noRecepcionada) {
      out.push({ fila: f.fila, codigo, accion: "error", mensaje: "La guía la declara pero no llegó al patio (ADR-325)." });
      continue;
    }
    if (troza.consumidaEnId) {
      out.push({ fila: f.fila, codigo, accion: "existe", mensaje: "Ya figura consumida en una corrida." });
      continue;
    }
    if (troza.retrozos.length > 0) {
      /* La madre retrozada no se consume: van los pedazos. Contarla con ellos
         sería la misma madera dos veces (regla T1). */
      out.push({
        fila: f.fila,
        codigo,
        accion: "error",
        mensaje: `Está retrozada en ${troza.retrozos.length} pedazos: se consumen los pedazos, no la madre.`,
      });
      continue;
    }

    const vol = troza.volumenM3 == null ? null : Number(troza.volumenM3);
    if (vol != null && f.cantidad > vol + 0.0001) {
      out.push({
        fila: f.fila,
        codigo,
        accion: "error",
        mensaje: `El consumo (${f.cantidad} m³) supera el volumen de la troza (${vol} m³).`,
      });
      continue;
    }

    out.push({
      fila: f.fila,
      codigo,
      accion: escribir ? "crear" : "crear",
      mensaje: `Troza libre · ${vol ?? "sin volumen"} m³${f.lote ? ` · lote ${f.lote}` : ""}. Sumala a una corrida para registrar el consumo.`,
    });
  }
  return out;
}
