import "server-only";
/**
 * Lee la guía EMITIDA de una solicitud de corrección (ADR-512) con el
 * `tenantId` de la sesión y la arma por el MISMO camino que la hoja que se
 * imprime, para que «qué dice hoy» sea lo que dice el papel:
 *
 *   · `loth_gtf`     → `ForestGtf` del Libro TH (`entradasDeLaGuia`, el de
 *     «Imprimir hoja SERFOR» y del talonario de la matricial).
 *   · `ctp_despacho` → la guía de salida de un despacho del CTP
 *     (`ForestCtpEntry` section=despacho con número): Ficha del CTP + cuerpo
 *     guardado + la cadena de origen (32) + los permisos cargados.
 *
 * Emitida = Libro TH `status = "emitida"`; CTP `status = "registrado"` y con
 * número (`guiaEditable` = borrador). Una guía de otro negocio no existe.
 */
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { ForestCtpFichaDB } from "@/lib/db/forest-ctp-ficha.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { entradasDeLaGuia } from "@/lib/forestal/gtf-matricial-valores";
import { piezasDeItems } from "@/lib/forestal/loth-guia-despacho";
import type { LothGtfCaratula, LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { unidadDelPapel, type LineaProducto } from "@/lib/forestal/ctp-gtf-formato";
import { claveFilaGTF } from "@/lib/forestal/gtf-redondeo";
import { guiaEditable } from "@/lib/forestal/gtf-estado";
import type { CtpFicha } from "@/lib/forestal/ctp-ficha-types";
import { logger } from "@/lib/logger";
import type { EntityTypeCorreccion } from "./correccion-guia";
import { casillerosDeLaHoja, filaDeLineaCtp, filaDeTroza, type FilaLeida, type GuiaLeida } from "./correccion-guia-dice";

export type LeerGuiaResultado =
  | { ok: true; guia: GuiaLeida }
  | { ok: false; error: "no_existe" }
  | { ok: false; error: "no_emitida"; estado: "anulada" | "sin_emitir" };

const fechaIso = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

async function guiaDelLibroTh(tenantId: string, id: string): Promise<LeerGuiaResultado> {
  const g = await ForestGtfDB.getById(tenantId, id);
  if (!g) return { ok: false, error: "no_existe" };
  if (g.status !== "emitida") return { ok: false, error: "no_emitida", estado: g.status === "anulada" ? "anulada" : "sin_emitir" };

  const caratula: LothGtfCaratula | null = g.gtfDatos ? null : await ForestLothDB.getActiveCaratula(tenantId);
  // Fechas y decimales como los ve la hoja (ISO y texto): la misma entrada que el modal y la matricial.
  const doc = JSON.parse(JSON.stringify(g)) as LothGtfDoc;
  const e = entradasDeLaGuia(doc, caratula);

  /* La lista imprime el código de la GUÍA (ADR-474); el libro conoce además el
     código único y el id de la troza (`trozadoId`): los tres nombran la misma fila. */
  const alias = new Map<string, string[]>();
  const items: unknown[] = Array.isArray(doc.items) ? doc.items : [];
  piezasDeItems(items).forEach((p, i) => {
    const impreso = (p.codigoGuia ?? "").trim() || p.codigo;
    if (!impreso) return;
    const crudo = items[i] as { trozadoId?: unknown } | null;
    const id = typeof crudo?.trozadoId === "string" ? crudo.trozadoId.trim() : "";
    alias.set(impreso, [...(alias.get(impreso) ?? []), p.codigo, ...(id ? [id] : [])]);
  });
  const filas: FilaLeida[] = e.filas
    .filter((f) => f.codificacion.trim())
    .map((f) => filaDeTroza(f, alias.get(f.codificacion) ?? []));

  return {
    ok: true,
    guia: { numero: g.gtfNumber.trim(), fecha: fechaIso(g.gtfDate), casilleros: casillerosDeLaHoja(e.cuerpo), filas },
  };
}

const UNIDAD: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };

type FilaDespacho = NonNullable<Awaited<ReturnType<typeof ForestCtpDB.getById>>>;

/** El renglón (34) de UNA línea de despacho, como lo arma la hoja al registrar (`lineasDeGuia`). */
function lineaDelDespacho(d: Pick<FilaDespacho, "speciesCommon" | "speciesScientific" | "productType" | "presentacion" | "unit" | "pieces" | "quantity">): LineaProducto {
  const unidad = UNIDAD[d.unit ?? "m3"] ?? d.unit ?? "m3";
  return {
    cientifico: d.speciesScientific?.trim() ?? "",
    comun: d.speciesCommon ?? "",
    tipoProducto: d.productType ?? "",
    presentacion: d.presentacion?.trim() || unidad,
    cantidad: d.pieces ?? 0,
    unidad,
    total: Number(d.quantity ?? 0) || 0,
  };
}

async function guiaDeSalidaCtp(tenantId: string, id: string): Promise<LeerGuiaResultado> {
  const d = await ForestCtpDB.getById(tenantId, id);
  if (!d || d.section !== "despacho") return { ok: false, error: "no_existe" };
  if (d.status !== "registrado") return { ok: false, error: "no_emitida", estado: "anulada" };
  if (guiaEditable(d.gtfNumber)) return { ok: false, error: "no_emitida", estado: "sin_emitir" };
  const numero = String(d.gtfNumber).trim();
  const fecha = fechaIso(d.entryDate);

  /* Una guía de varios productos son varias líneas de despacho con el mismo N°
     (ADR-362), registradas juntas: el detalle (34) lleva un renglón por cada una.
     Sólo las vigentes del mismo día —un N° repetido por error en otra fecha es
     otra guía— y siempre la elegida. */
  const hermanas = await ForestCtpDB.despachosDeLasGuias(tenantId, [numero]);
  const delPapel = [d, ...hermanas.filter((h) => h.id !== d.id && h.section === "despacho" && h.status === "registrado" && !h.deletedAt && fechaIso(h.entryDate) === fecha)]
    .sort((x, y) => x.lineNo - y.lineNo);

  const [ficha, trazas, permisos] = await Promise.all([
    ForestCtpFichaDB.get(tenantId),
    Promise.all(delPapel.map((x) => ForestCtpDespachoDB.trazabilidadCompleta(tenantId, x.id))),
    // Sin la lista, (5)(9)(10) de un título que sólo vive en los permisos salen
    // en blanco: se sigue igual (lo mismo que hace el papel sin ella).
    ForestContratoDB.list(tenantId).catch((err) => {
      logger.warn("[correccion-guia] permisos no leídos", { error: String(err), tenantId });
      return [];
    }),
  ]);

  const renglones = delPapel.map((x) => ({ lineNo: x.lineNo, despachoId: x.id, producto: lineaDelDespacho(x) }));
  /* El detalle (34) con un renglón por línea, como `lineasDeGuia` al registrar.
     No se reusa `lineasDeLaGuiaSalida`: vive en un módulo "use client" y desde
     el servidor tira (la versión de un solo renglón es este mismo armado). */
  const lineas = renglones.map((r) => r.producto);
  const cuerpo = {
    ficha: ficha as CtpFicha,
    datos: leerGtfDatos(d.gtfDatos),
    lineas,
    numeroGtf: numero,
    fechaExpedicion: fecha ?? "",
    listasTrozas: numero,
    gtfOrigen: [...new Set(trazas.flatMap((t) => t.corridas.flatMap((c) => c.guias)))].join(", "),
    registroSerfor: "",
    permisos,
  };

  /* Los renglones del detalle se nombran «Línea #N» (N del libro); el papel suma
     en uno los de la misma especie, producto y unidad, y eso se dice. */
  const grupo = (r: (typeof renglones)[number]) =>
    claveFilaGTF({ cientifico: r.producto.cientifico, comun: r.producto.comun, tipo: r.producto.tipoProducto, unidad: unidadDelPapel(r.producto.unidad) });
  const filasLineas: FilaLeida[] = renglones.map((r) =>
    filaDeLineaCtp(r, renglones.filter((o) => o !== r && grupo(o) === grupo(r)).map((o) => o.lineNo)),
  );
  /* Las piezas que salieron sin aserrar (ADR-363) también son filas nombrables:
     por su codificación o por el id de la troza. */
  const vistas = new Set<string>();
  const filasTrozas: FilaLeida[] = [];
  for (const t of trazas.flatMap((x) => x.trozas)) {
    const codigo = String(t.codificacion ?? "").trim();
    if (!codigo || vistas.has(codigo)) continue;
    vistas.add(codigo);
    filasTrozas.push({
      clave: codigo,
      alias: t.id ? [t.id] : [],
      etiqueta: `Troza ${codigo}`,
      dice: [`${t.volumenM3.toFixed(3)} m³`, t.gtfIngreso ? `entró con la GTF ${t.gtfIngreso}` : ""].filter(Boolean).join(" · "),
    });
  }

  return { ok: true, guia: { numero, fecha, casilleros: casillerosDeLaHoja(cuerpo), filas: [...filasLineas, ...filasTrozas] } };
}

/** La guía del negocio, emitida, lista para resolver lo que dice cada casillero/fila. */
export function leerGuiaParaCorreccion(
  tenantId: string,
  entityType: EntityTypeCorreccion,
  entityId: string,
): Promise<LeerGuiaResultado> {
  if (!tenantId) throw new Error("tenantId is required");
  return entityType === "loth_gtf" ? guiaDelLibroTh(tenantId, entityId) : guiaDeSalidaCtp(tenantId, entityId);
}
