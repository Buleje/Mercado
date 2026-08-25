"use client";

/**
 * tramites-print — el documento que se presenta en mesa de partes.
 *
 * Estructura de una solicitud administrativa peruana (Ley 27444): membrete del
 * administrado, destinatario con cargo, referencia, asunto, cuerpo numerado,
 * base legal, anexos, lugar y fecha, firma. Reusa `ctp-print-shared` — el mismo
 * motor de impresión y el mismo bloque de identidad que los demás reportes del
 * módulo, así el pie legal y el membrete viven en UN lugar (ADR-308).
 *
 * El armado del TEXTO es puro y está en `tramites-catalogo`; acá sólo se maqueta.
 */

import { GEO_PLACENAME } from "@/lib/geo";
import {
  CTP_REPORT_BASE_CSS,
  esc,
  openCtpReport,
  type CtpReportFicha,
} from "./ctp-print-shared";
import {
  AUTORIDADES,
  asuntoDe,
  cuerpoDe,
  type DatosTramite,
  type FormatoTramite,
} from "./tramites-catalogo";
import { parseGuiasInforme, resumenNumeradoHtml, tablaGuiasHtml } from "./tramites-relacion-guias";

/**
 * Rediseño 2026-08-20 (Brandon: "el formato de los documentos está feo... los
 * subtítulos con letras alargadas se ven feos"): el membrete y el "doc-tipo"
 * usaban el patrón dashboard (mayúscula + letter-spacing ancho) que en un
 * papel se lee estirado, no elegante. El acento pasó de un texto angosto a un
 * TAB de color (como una etiqueta de carpeta) y el membrete gana una regla
 * doble para leerse como membrete impreso, no como encabezado de tabla.
 * `.anexo-guias h2` ya NO se pisa acá: hereda el `h2` rediseñado de
 * `CTP_REPORT_BASE_CSS` — un solo lugar para el estilo de subtítulo.
 */
const TRAMITE_CSS = `
  /* Doble filete (ronda 2, "bordes elegantes y personalizados de la empresa"):
     una regla gruesa + una fina 5px debajo, el motivo clásico de un membrete
     impreso — no un simple \`border-bottom\` de dashboard. Vive en \`::after\`
     (no \`position:fixed\`) porque viaja con el bloque, no con la página. */
  .membrete{position:relative;border-bottom:3px solid #0f5132;padding-bottom:14px;margin-bottom:10px}
  .membrete::after{content:"";position:absolute;left:0;right:0;bottom:-6px;height:1px;background:#bdd0c6}
  .membrete-top{display:flex;align-items:flex-start;gap:14px}
  .membrete-logo{max-height:56px;max-width:150px;object-fit:contain;flex-shrink:0}
  .membrete-id{min-width:0;flex:1}
  .membrete .razon{font-size:21px;font-weight:800;color:#0f5132;letter-spacing:-.2px;line-height:1.22}
  .membrete .linea2{margin-top:4px;font-size:11.5px;color:#5c6864}
  .membrete .linea2 span+span:before{content:" · ";color:#c3cec8}
  .doc-tipo{display:inline-block;margin-top:16px;padding:5px 12px;border-radius:20px;background:#eaf3ee;color:#0f5132;font-size:12px;font-weight:700}
  /* Ronda 7 (Brandon 2026-08-20: "mejora el diseño de la hoja... mejor
     formato"): destinatario y meta pasan de líneas sueltas a una ficha con
     fondo propio — el mismo lenguaje visual que ya usa \`.id\` en los otros
     reportes CTP — para que el bloque de "datos" se lea distinto del
     \`.cuerpo\` en prosa, no como un párrafo más. */
  .dest{margin:18px 0 4px;padding:11px 14px;border:1px solid #eef2f0;border-radius:8px;background:#fafcfb;font-size:13.5px;line-height:1.6}
  .dest .cargo{font-weight:800;color:#26332c}
  .dest .ent{color:#5c6864}
  .meta{margin:14px 0 19px;padding:12px 15px;border:1px solid #e2e9e5;border-radius:10px;background:#fafcfb;font-size:12.5px}
  .meta div{margin:3px 0}
  .meta .k{color:#8b968f;display:inline-block;min-width:82px}
  .cuerpo p{margin:0 0 12px;text-align:justify}
  .cuerpo .lead{font-weight:600}
  .legal{margin-top:20px;font-size:11.5px;color:#5c6864}
  .legal li{margin:3px 0}
  .anexos li{margin:4px 0;font-size:12px}
  .firma-uno{margin-top:58px;font-size:12px;text-align:center;width:58%}
  .firma-uno .linea{border-top:1.5px solid #9aa39e;padding-top:7px;font-weight:700;font-size:13px;color:#26332c}
  .lugar{margin-top:28px;font-size:12.5px;color:#444}
  .aviso{margin-top:18px;padding:10px 13px;border-left:3px solid #b45309;border-radius:0 8px 8px 0;background:#fffbeb;color:#7c2d12;font-size:11.5px}
  .doc-pie{margin-top:30px;padding-top:10px;border-top:1px solid #eef2f0;font-size:10px;color:#a2ada6}
  @media print{.aviso{display:none}}
  /* Campos rellenables (ADR-364 ronda 7): un subrayado punteado avisa "esto
     se toca" sin que la hoja impresa se vea con líneas de formulario — el
     print/PDF nunca los recibe (\`editable\` viaja apagado ahí), pero por las
     dudas se limpia también acá. */
  .campo-editable{border-bottom:1.5px dashed #b9cdc2;border-radius:2px;padding:0 1px;transition:background .15s,border-color .15s}
  .campo-editable:hover{background:#eef6f1}
  .campo-editable:focus{outline:none;background:#f2fbf6;border-bottom-color:#2f9e6e}
  .campo-vacio{color:#98a29c;font-style:italic}
  @media print{.campo-editable{border-bottom:none;background:none!important}}
  /* Brandon 2026-08-20: "que se vea de una sola hoja" — el corte de página
     forzado ANTES del anexo dejaba la mitad de la hoja 1 en blanco en un
     trámite chico (pocas guías). Ahora fluye natural: si entra en una hoja,
     entra; si no, pagina donde de verdad haga falta (el CSS base ya evita
     cortar una fila de tabla o dejar un título colgado al pie de página). */
  .anexo-guias{margin-top:24px}
  .anexo-guias h2:not(:first-child){margin-top:26px}
  .anexo-guias h3{margin:16px 0 7px;font-size:12px;font-weight:700;color:#3d4a43}
  .tabla-guias{width:100%;border-collapse:collapse;font-size:11px;page-break-inside:auto}
  .tabla-guias th{background:#eef4f0;text-align:left;padding:6px 7px;border:1px solid #e2e9e5;text-transform:uppercase;letter-spacing:.2px;font-size:10px;color:#3d4a43}
  .tabla-guias td{padding:6px 7px;border:1px solid #e2e9e5;vertical-align:top}
  .tabla-guias tbody tr:nth-child(even) td{background:#fafbfa}
  .tabla-guias .sin-dato{color:#999;font-style:italic}
  .tabla-trozas th:first-child,.tabla-trozas td:first-child{width:110px;white-space:nowrap;font-weight:700}
  .anexo-guias .vacio{font-style:italic;color:#777;font-size:12px;margin:0 0 4px}
  /* Ronda 8: el Anexo 2 (anuladas) con el mismo verde de "Emitidas" se puede
     leer como válido a un vistazo rápido — el tinte rojo (mismo semántico
     que "anulada"/error en el resto del módulo) lo marca sin mezclar filas
     ni inventar una columna de estado. */
  .anexo-anuladas{margin-top:22px;padding:14px 16px 4px;border:1px solid #f6d4ce;border-radius:10px;background:#fffaf9}
  .anexo-anuladas h2{color:#b91c1c}
  .anexo-anuladas h2::before{background:#b91c1c}
  .anexo-anuladas .tabla-guias th{background:#fdeeec;color:#8a2c22}
  .anexo-anuladas .tabla-guias tbody tr:nth-child(even) td{background:#fdf6f5}
`;

export interface TramitePrintOpts {
  formato: FormatoTramite;
  datos: DatosTramite;
  ficha: CtpReportFicha | null;
  /** Ciudad de la firma ("Pucallpa"). El día lo pone el generador. Si el
   *  formulario trae `lugar`, ese gana: lo tipeó quien firma. */
  lugar?: string;
  /** N° de documento propio del CTP, si el titular numera sus oficios. */
  numeroDocumento?: string;
  /** Logo del membrete (ADR-364 ronda 6) — se sube una vez y queda por
   *  tenant (`tramites-logo.ts`), no viaja en `datos`. */
  logo?: { src: string; aspect: number } | null;
  /**
   * Marca los datos RELLENABLES (membrete, destinatario, asunto/referencia,
   * firma) como `contenteditable` (ADR-364 ronda 7: "editar en el mismo
   * documento"). El cuerpo redactado y la base legal NUNCA se editan acá —
   * son texto fijo de la solicitud, no un dato del operador. Sólo lo usan
   * `TramitePreview`/`TramiteDocumentoModal`; `imprimirTramite` y el PDF al
   * Drive lo dejan en `false` (default) para que el papel final no lleve
   * ninguna marca de edición.
   */
  editable?: boolean;
}

/**
 * Un dato rellenable: texto plano si `editable` está apagado (el papel que
 * se imprime o se archiva — idéntico a como salía antes de esta ronda), o un
 * `<span contenteditable>` atado a `id` cuando está prendido. `vacio` sólo
 * pinta el estilo de placeholder (itálica gris); el texto real ya lo resolvió
 * el caller con su propio fallback (autoridad, GEO_PLACENAME, etc.) — acá no
 * se inventa ningún dato nuevo, sólo se decide cómo se ve.
 */
function campoSpan(editable: boolean | undefined, id: string, texto: string, vacio: boolean): string {
  if (!editable) return esc(texto);
  return `<span class="campo-editable${vacio ? " campo-vacio" : ""}" data-campo="${id}" contenteditable="true" tabindex="0">${esc(texto)}</span>`;
}

const hoyLargo = (): string =>
  new Date().toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Lima",
  });

/** El HTML del documento. Separado del `open` para poder testear el contenido. */
export function buildTramiteHtml(o: TramitePrintOpts): string {
  const { formato, datos, ficha, editable } = o;
  const asunto = asuntoDe(formato, datos);
  const parrafos = cuerpoDe(formato, datos);
  const autoridad = AUTORIDADES[formato.autoridad];
  const firmante = (datos.firmante ?? "").trim();
  const dni = (datos.firmanteDni ?? "").trim();

  const cargoRaw = (datos.destinatarioCargo ?? "").trim();
  const entidadRaw = (datos.destinatarioEntidad ?? "").trim();
  const referenciaRaw = (datos.referencia ?? "").trim();
  const expedienteRaw = (datos.expediente ?? "").trim();

  const destinatario = `<div class="dest">
    <div class="cargo">${campoSpan(editable, "destinatarioCargo", cargoRaw || autoridad.label, !cargoRaw)}</div>
    ${entidadRaw || editable ? `<div class="ent">${campoSpan(editable, "destinatarioEntidad", entidadRaw || "Entidad (opcional)", !entidadRaw)}</div>` : ""}
    <div class="ent">Presente.—</div>
  </div>`;

  const meta = `<div class="meta">
    ${o.numeroDocumento ? `<div><span class="k">Documento:</span> ${esc(o.numeroDocumento)}</div>` : ""}
    <div><span class="k">Asunto:</span> <strong>${campoSpan(editable, "asuntoLibre", asunto || "Asunto del documento", !asunto)}</strong></div>
    ${referenciaRaw || editable ? `<div><span class="k">Referencia:</span> ${campoSpan(editable, "referencia", referenciaRaw || "N° de expediente u oficio anterior", !referenciaRaw)}</div>` : ""}
    ${expedienteRaw || editable ? `<div><span class="k">Expediente:</span> ${campoSpan(editable, "expediente", expedienteRaw || "N° de expediente", !expedienteRaw)}</div>` : ""}
  </div>`;

  // "Tengo el agrado de dirigirme…" y el "Que," de cada párrafo son la fórmula
  // que espera mesa de partes: sin eso el documento se lee como un email.
  //
  // Con `tablaGuias` (Brandon, 2026-08-20): el resumen "Emitidas/Anuladas" con
  // los N° de GTF y códigos de troza EN LÍNEA va DENTRO del cuerpo, justo
  // después del primer párrafo — es lo que un fiscalizador lee de un vistazo,
  // antes del anexo con el detalle completo. Los demás formatos (sin
  // `tablaGuias`) no cambian: mismo mapeo de siempre.
  const resumenGuiasHtml = formato.tablaGuias ? resumenNumeradoHtml(parseGuiasInforme(datos.guiasJson)) : "";
  const cuerpoHtml = formato.tablaGuias
    ? `<p>${esc(parrafos[0] ?? "")}</p>${resumenGuiasHtml}${parrafos.slice(1).map((p) => `<p>${esc(p)}</p>`).join("")}`
    : parrafos.map((p) => `<p>${esc(p)}</p>`).join("");
  const cuerpo = `<div class="cuerpo">
    <p class="lead">Tengo el agrado de dirigirme a usted para saludarlo(a) cordialmente y, a la vez, exponer lo siguiente:</p>
    ${cuerpoHtml}
    <p>Atentamente,</p>
  </div>`;

  // El anexo con la tabla de guías va ANTES de la lista de anexos declarados:
  // ES el anexo, no una promesa de adjuntarlo aparte.
  const tablaGuias = formato.tablaGuias ? tablaGuiasHtml(parseGuiasInforme(datos.guiasJson)) : "";

  const anexos = formato.anexos.length
    ? `<h2>Anexos</h2><ol class="anexos">${formato.anexos.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>`
    : "";

  const legal = `<div class="legal"><h2>Base legal</h2><ul>${formato.baseLegal
    .map((b) => `<li>${esc(b)}</li>`)
    .join("")}</ul></div>`;

  // El lugar sale del formulario, o de la ficha, o del establecimiento. Nunca
  // un guion: un oficio que dice "—, 29 de julio" se ve hecho a las apuradas.
  const lugar =
    (datos.lugar ?? "").trim() ||
    (o.lugar ?? "").trim() ||
    [ficha?.provincia, ficha?.region].map((x) => (x ?? "").trim()).filter(Boolean)[0] ||
    GEO_PLACENAME;

  // "Empresa que emite (membrete)" (ADR-364 ronda 6, Brandon 2026-08-20: "ahí
  // dice Maderera San Martín pero es otra empresa"): antes el membrete —Y la
  // línea bajo la firma— leían SIEMPRE de la Ficha CTP global, sin forma de
  // corregirlo para un documento puntual. `datos.membreteEmpresa`
  // (autollenado con la Ficha, editable) gana si el operador lo cambió; la
  // Ficha sigue siendo el default. Un solo dato, dos lugares — si sólo se
  // corrige el membrete y no la firma, el papel se contradice a sí mismo.
  // Sin NINGÚN dato real, la firma no inventa nombre (igual que antes); el
  // membrete sí necesita algo visible arriba de la hoja, y ahí cae al genérico.
  const empresaReal = (datos.membreteEmpresa ?? "").trim() || ficha?.razonSocial || "";
  const empresaMembrete = empresaReal || ficha?.nombreCtp || "Centro de Transformación Primaria";
  // El nombre bajo la firma comparte `data-campo="membreteEmpresa"` con el del
  // membrete de arriba (ver más abajo): tocar cualquiera de los dos actualiza
  // el mismo dato — así el papel nunca se contradice a sí mismo (el riesgo
  // que ya señalaba el comentario original de la ronda 6).
  const membreteFirmaTexto = editable ? empresaMembrete : empresaReal;
  // Cuando quien firma ES la entidad (una comunidad nativa no tiene un
  // "representante" separado del nombre de la propia comunidad, a diferencia
  // de una empresa con gerente), el nombre queda repetido dos veces seguidas
  // — se lee como un renglón duplicado por error, no como dos datos. En modo
  // edición se muestra igual (es un campo editable más, y ocultarlo
  // confundiría), pero el papel final omite la repetición.
  const firmaRepiteEmpresa =
    !editable && !!firmante && firmante.toLowerCase() === empresaReal.trim().toLowerCase();

  const firma = `<div class="lugar">${campoSpan(editable, "lugar", lugar, false)}, ${esc(hoyLargo())}</div>
  <div class="firma-uno"><div class="linea">${campoSpan(editable, "firmante", firmante || "Firma del titular o representante legal", !firmante)}</div>
  ${dni || editable ? `<div style="color:#666;font-size:11.5px">DNI ${campoSpan(editable, "firmanteDni", dni || "12345678", !dni)}</div>` : ""}
  ${(empresaReal || editable) && !firmaRepiteEmpresa ? `<div style="color:#666;font-size:11.5px">${campoSpan(editable, "membreteEmpresa", membreteFirmaTexto, !empresaReal)}</div>` : ""}</div>`;

  const aviso = formato.advertencia
    ? `<div class="aviso"><strong>Antes de presentar:</strong> ${esc(formato.advertencia)}</div>`
    : "";

  // Membrete del administrado: razón social grande + los datos que la autoridad
  // cruza (RUC, Código de CTP, registro ARFFS, dirección). Los vacíos se omiten:
  // un membrete con "Registro ARFFS: —" declara que no lo tiene.
  //
  // Ronda 8 (Brandon: "que el RUC/código/registro también se puedan editar"):
  // mismo patrón que `membreteEmpresa` — `datos.membreteRuc/CodigoCtp/RegistroArffs/
  // Direccion` ganan si el operador los corrigió PARA ESTE documento; la Ficha
  // CTP sigue siendo el default. La ubicación (distrito/provincia/región) NO
  // se hizo editable a propósito: es un compuesto de tres campos de la Ficha,
  // no un dato suelto que un documento puntual necesite pisar.
  // El resto de la ficha (RUC, código, registro, ubicación) sólo cae de
  // default cuando el membrete SIGUE siendo el nuestro. En cuanto el nombre
  // pasa a ser el de otra parte —tipeado a mano en el papel, o traído del
  // Directorio con "Usar un emisor guardado"— nuestros datos de registro no
  // le pertenecen a ese nombre y dejan de heredarse: mostrar NUESTRO Código
  // de CTP junto al nombre de una comunidad nativa imprime un documento que
  // se contradice a sí mismo (Brandon 2026-08-25: "pone que número de CTP
  // pero es comunidad nativa, no es aserradero"). El único dato que SÍ sigue
  // viajando con un nombre ajeno es el que la propia elección trajo consigo
  // (`membreteCodigoCtp`/`membreteDireccion`, ver `datosDeEmisor`).
  const membreteEsPropio =
    !empresaReal || empresaReal === (ficha?.razonSocial || ficha?.nombreCtp || "");
  const rucValor = (datos.membreteRuc ?? "").trim() || (membreteEsPropio ? ficha?.ruc || "" : "");
  const codigoValor = (datos.membreteCodigoCtp ?? "").trim() || (membreteEsPropio ? ficha?.codigoCtp || "" : "");
  const registroValor = (datos.membreteRegistroArffs ?? "").trim() || (membreteEsPropio ? ficha?.registroArffs || "" : "");
  const direccionValor = (datos.membreteDireccion ?? "").trim() || (membreteEsPropio ? ficha?.direccion || "" : "");
  const ubicacionTexto = membreteEsPropio ? [ficha?.distrito, ficha?.provincia, ficha?.region].filter(Boolean).join(", ") : "";

  const linea2 = [
    rucValor || editable ? `RUC ${campoSpan(editable, "membreteRuc", rucValor, !rucValor)}` : "",
    codigoValor || editable ? `Código de CTP ${campoSpan(editable, "membreteCodigoCtp", codigoValor, !codigoValor)}` : "",
    registroValor || editable ? `Registro ARFFS ${campoSpan(editable, "membreteRegistroArffs", registroValor, !registroValor)}` : "",
  ].filter(Boolean);
  const linea3 = [
    direccionValor || editable ? campoSpan(editable, "membreteDireccion", direccionValor, !direccionValor) : "",
    ubicacionTexto ? esc(ubicacionTexto) : "",
  ].filter(Boolean);

  const logoHtml = o.logo?.src
    ? `<img class="membrete-logo" src="${esc(o.logo.src)}" alt="" />`
    : "";

  const membrete = `<div class="membrete">
    <div class="membrete-top">
      ${logoHtml}
      <div class="membrete-id">
        <div class="razon">${campoSpan(editable, "membreteEmpresa", empresaMembrete, !empresaReal)}</div>
        ${linea2.length ? `<div class="linea2">${linea2.map((x) => `<span>${x}</span>`).join("")}</div>` : ""}
        ${linea3.length ? `<div class="linea2">${linea3.map((x) => `<span>${x}</span>`).join("")}</div>` : ""}
      </div>
    </div>
  </div>
  <div class="doc-tipo">${esc(formato.nombre)}${o.numeroDocumento ? ` N° ${esc(o.numeroDocumento)}` : ""} · ${esc(autoridad.corto)}</div>`;

  const pie = `<div class="doc-pie">Generado el ${esc(hoyLargo())} · sistema Buleje CTP${o.numeroDocumento ? ` · N° ${esc(o.numeroDocumento)}` : ""}</div>`;

  return `${membrete}
  ${destinatario}
  ${meta}
  ${cuerpo}
  ${firma}
  ${tablaGuias}
  ${anexos}
  ${legal}
  ${aviso}
  ${pie}`;
}

/** Abre el documento en una ventana imprimible (guardar como PDF). */
export function imprimirTramite(o: TramitePrintOpts): void {
  openCtpReport({
    title: `${o.formato.nombre} — ${o.ficha?.razonSocial ?? "CTP"}`,
    css: TRAMITE_CSS,
    body: buildTramiteHtml(o),
  });
}

/** El CSS del documento, expuesto para la previsualización embebida en la app. */
export const TRAMITE_PREVIEW_CSS = `${CTP_REPORT_BASE_CSS}${TRAMITE_CSS}`;
