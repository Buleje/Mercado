/**
 * eudr-expediente — el paquete que pide un comprador europeo, en un archivo.
 *
 * La DDS sola no alcanza: el importador de la UE tiene que poder demostrar
 * (Reg. 2023/1115, arts. 4 y 9) que recibió la declaración, la geolocalización
 * de las parcelas, la evidencia de legalidad del origen y la cadena que une el
 * embarque con esas parcelas. Hoy eso salía en tres descargas distintas y un
 * PDF impreso a mano; acá se arma un expediente ordenado y numerado.
 *
 * PURO: devuelve la lista de archivos (nombre + contenido). Comprimirlos y
 * bajarlos es del componente — así el contenido, que es lo que se audita, se
 * puede testear sin navegador.
 */
import type { DdsData, DdsPlot } from "./eudr-types";

export interface EmisorExpediente {
  razonSocial?: string;
  ruc?: string;
  codigoCtp?: string;
  registroArffs?: string;
  arffs?: string;
  direccion?: string;
  titulos?: { tipo: string; codigo: string; vencimiento?: string }[];
}

/** Un string vacío no es un dato: en un expediente se escribe el guión. */
const o = (v: string | undefined | null): string => (v && v.trim() ? v.trim() : "—");

/**
 * Un título vencido invalida el origen: listarlo como si nada convierte al
 * expediente en el problema. `hoy` entra por parámetro para poder testearlo.
 */
export function lineaTitulo(t: { tipo: string; codigo: string; vencimiento?: string }, hoy: string): string {
  const v = (t.vencimiento ?? "").trim();
  const estado = !v ? "" : v < hoy ? ` · VENCIDO el ${v}` : ` · vence ${v}`;
  return `  ${t.tipo}: ${o(t.codigo)}${estado}`;
}

export interface ArchivoExpediente {
  nombre: string;
  contenido: string;
}

/** Una celda CSV segura: los nombres de concesión traen comas y comillas. */
export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csvRow = (cells: unknown[]) => cells.map(csvCell).join(";");

const fechaLarga = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Lima" });
};

/** Nombre de archivo sin sorpresas: un N° de guía trae barras y espacios. */
export function slugArchivo(v: string): string {
  return (v || "despacho")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "despacho";
}

const coordDe = (p: DdsPlot): string =>
  p.lat != null && p.lng != null
    ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`
    : p.hasPolygon ? "polígono (ver 02-parcelas.geojson)" : "SIN GEOLOCALIZAR";

/** GeoJSON de las parcelas DE ESTE despacho (no de todos los orígenes del CTP). */
export function geoJsonDelDespacho(dds: DdsData): string {
  const features = dds.plots.flatMap((p) => {
    const props = {
      originCode: p.originCode,
      originType: p.originType,
      region: p.region,
      pais: p.pais,
      deforestationFree: p.deforestationFree,
      corteEudr: "2020-12-31",
      gtfs: p.gtfs,
      especies: p.especies,
      cites: p.cites,
      despachoGtf: dds.gtfSalida,
    };
    if (p.polygonJson) {
      try {
        const geom = JSON.parse(p.polygonJson) as { type?: string; coordinates?: unknown };
        if (geom?.type && geom.coordinates != null) {
          return [{ type: "Feature", geometry: { type: geom.type, coordinates: geom.coordinates }, properties: props }];
        }
      } catch {
        // Polígono ilegible: cae al punto, y el faltante ya se lista en los gaps.
      }
    }
    if (p.lat != null && p.lng != null) {
      return [{ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: props }];
    }
    return [];
  });

  return JSON.stringify(
    {
      type: "FeatureCollection",
      metadata: {
        generadoAt: dds.generadoAt,
        despachoGtf: dds.gtfSalida,
        producto: dds.producto,
        crs: "EPSG:4326 (WGS84)",
        norma: "Reglamento (UE) 2023/1115 — art. 9.1.d",
      },
      features,
    },
    null,
    2,
  );
}

/** Cadena de custodia en CSV: qué parcela sostiene qué parte del embarque. */
export function cadenaCsv(dds: DdsData): string {
  const head = csvRow([
    "origen", "tipo", "region", "pais", "coordenadas", "poligono",
    "sin_deforestacion_post_2020", "guias_gtf_de_ingreso", "especies", "cites",
  ]);
  const filas = dds.plots.map((p) =>
    csvRow([
      p.originCode, p.originType, p.region ?? "", p.pais, coordDe(p),
      p.hasPolygon ? "sí" : "no",
      p.deforestationFree ? "sí" : "NO ATESTADO",
      p.gtfs.join(" | "), p.especies.join(" | "), p.cites ? "sí" : "no",
    ]),
  );
  // BOM: Excel en Windows abre el CSV con acentos rotos sin él.
  return `﻿${[head, ...filas].join("\r\n")}\r\n`;
}

/**
 * Arma el expediente. `baseUrl` sólo se usa para el enlace de verificación
 * pública (el mismo que lleva el QR del certificado).
 */
export function construirExpedienteEudr(
  dds: DdsData,
  emisor: EmisorExpediente,
  opts: { ddsHtml: string; baseUrl?: string; hoy?: string },
): ArchivoExpediente[] {
  // Fecha de referencia para vencimientos (YYYY-MM-DD, hora de Perú).
  const hoy = opts.hoy ?? new Date().toISOString().slice(0, 10);
  const vencidos = (emisor.titulos ?? []).filter((t) => (t.vencimiento ?? "").trim() && (t.vencimiento as string) < hoy);
  const negligible = dds.riesgo === "negligible";
  const verifyUrl = opts.baseUrl
    ? `${opts.baseUrl.replace(/\/+$/, "")}/verificar/despacho/${encodeURIComponent(dds.despachoId)}`
    : null;

  const leeme = [
    "EXPEDIENTE DE DILIGENCIA DEBIDA — EUDR (Reglamento UE 2023/1115)",
    "=".repeat(64),
    "",
    `Despacho:        ${dds.producto}${dds.especie ? ` · ${dds.especie}` : ""}`,
    `Cantidad:        ${dds.cantidad} ${dds.unidad}`,
    `GTF de salida:   ${dds.gtfSalida ?? "—"}`,
    `Destino:         ${dds.destino ?? "—"}`,
    `Operador:        ${o(emisor.razonSocial)}${emisor.ruc?.trim() ? ` · RUC ${emisor.ruc}` : ""}`,
    `Código de CTP:   ${o(emisor.codigoCtp)}`,
    `Autoridad:       ${o(emisor.arffs)}${emisor.registroArffs?.trim() ? ` · registro ${emisor.registroArffs}` : ""}`,
    `Generado:        ${fechaLarga(dds.generadoAt)}`,
    "",
    `EVALUACIÓN DE RIESGO: ${negligible ? "NEGLIGIBLE" : "NO NEGLIGIBLE — el expediente está incompleto"}`,
    "",
    ...(vencidos.length
      ? [`ATENCIÓN: ${vencidos.length} título(s) habilitante(s) del operador figuran VENCIDOS (ver 04-operador.txt).`, ""]
      : []),
    ...(dds.gaps.length
      ? ["Falta resolver antes de declarar riesgo negligible:", ...dds.gaps.map((g) => `  - ${g}`), ""]
      : []),
    "CONTENIDO",
    "-".repeat(64),
    "01-declaracion-dds.html   Declaración de Diligencia Debida (art. 4).",
    "                          Abrir en el navegador e imprimir a PDF para firmar.",
    "02-parcelas.geojson       Geolocalización de las parcelas de cosecha (art. 9.1.d),",
    "                          WGS84 / EPSG:4326. Abre en QGIS, geojson.io o Google Earth.",
    "03-cadena-de-custodia.csv Qué parcela y qué guía forestal (GTF) sostienen el embarque.",
    "04-operador.txt           Datos registrales del centro de transformación.",
    ...(verifyUrl ? ["05-verificacion.txt       Enlace para contrastar el embarque contra el libro, en vivo."] : []),
    "",
    "ALCANCE",
    "-".repeat(64),
    "Los datos salen del Libro de Operaciones CTP del operador. Este expediente",
    "no reemplaza a la GTF ni al LO-CTP oficial de SERFOR: los acompaña.",
    "La fecha de corte de deforestación de la EUDR es el 31 de diciembre de 2020.",
  ].join("\n");

  const operador = [
    "OPERADOR / CENTRO DE TRANSFORMACIÓN PRIMARIA",
    "=".repeat(64),
    `Razón social:            ${o(emisor.razonSocial)}`,
    `RUC:                     ${o(emisor.ruc)}`,
    `Código de CTP (ARFFS):   ${o(emisor.codigoCtp)}`,
    `Registro ante la ARFFS:  ${o(emisor.registroArffs)}`,
    `Autoridad competente:    ${o(emisor.arffs)}`,
    `Dirección de la planta:  ${o(emisor.direccion)}`,
    "",
    "TÍTULOS HABILITANTES DEL ORIGEN",
    "-".repeat(64),
    ...(emisor.titulos?.length
      ? emisor.titulos.map((t) => lineaTitulo(t, hoy))
      : ["  (el operador no declaró títulos habilitantes en su ficha)"]),
    ...(vencidos.length
      ? ["", `ATENCIÓN: ${vencidos.length} título(s) figuran VENCIDOS al ${hoy}. Un título vencido`,
         "no ampara aprovechamiento nuevo: verificá la renovación ante la ARFFS."]
      : []),
    "",
    "La legalidad del aprovechamiento se sostiene en esos títulos y en las guías",
    "de transporte forestal (GTF) listadas en 03-cadena-de-custodia.csv,",
    "verificables ante la autoridad forestal regional que las emitió.",
  ].join("\n");

  const archivos: ArchivoExpediente[] = [
    { nombre: "LEEME.txt", contenido: leeme },
    { nombre: "01-declaracion-dds.html", contenido: opts.ddsHtml },
    { nombre: "02-parcelas.geojson", contenido: geoJsonDelDespacho(dds) },
    { nombre: "03-cadena-de-custodia.csv", contenido: cadenaCsv(dds) },
    { nombre: "04-operador.txt", contenido: operador },
  ];

  if (verifyUrl) {
    archivos.push({
      nombre: "05-verificacion.txt",
      contenido: [
        "VERIFICACIÓN EN VIVO",
        "=".repeat(64),
        "Este enlace consulta el libro del operador en el momento en que se abre,",
        "y muestra la cadena de custodia, el ANEXO N° 04 y si el período ya fue",
        "cerrado (registro inmutable). Es el mismo destino del QR del certificado.",
        "",
        verifyUrl,
      ].join("\n"),
    });
  }

  return archivos;
}

/** Nombre del ZIP: identificable en la bandeja de entrada del comprador. */
export function nombreExpediente(dds: DdsData): string {
  return `expediente-eudr-${slugArchivo(dds.gtfSalida ?? dds.despachoId)}.zip`;
}
