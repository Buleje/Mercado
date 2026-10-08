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
import { parseGuiasInforme } from "./tramites-relacion-guias";
import { detalleTrozasHtml, resumenNumeradoHtml, tablaGuiasHtml } from "./tramites-relacion-papel";

/**
 * Formato minimalista (Brandon 08-10, los 29 formatos): negro y grises, UNA
 * raya fina bajo el membrete, sin fondos ni pastillas de color. Pisa el verde
 * del CSS base de los reportes CTP sólo en los trámites (se suma después).
 *
 * Lo que hay que llenar o revisar se resalta en amarillo suave SÓLO en la
 * vista del papel dentro de la app (`editable`): el papel que se imprime y el
 * PDF del Drive salen sin marcas (`@media print` y `editable` apagado).
 */
const TRAMITE_CSS = `
  body{color:#111;border:none;border-radius:0}
  @media screen{body{box-shadow:none}}
  h1,h2{color:#111}
  h2{display:block;font-size:14px;font-weight:700;margin:24px 0 8px;padding:0;border:none}
  h2::before{display:none}
  th,td{border:1px solid #bbb}
  th{background:none;color:#111;font-size:10.5px;font-weight:700;text-transform:none;letter-spacing:0;border-bottom:1px solid #777}
  tbody tr:nth-child(even) td{background:none}
  .membrete{border-bottom:1px solid #111;padding-bottom:12px;margin-bottom:10px}
  .membrete-top{display:flex;align-items:flex-start;gap:14px}
  .membrete-logo{max-height:56px;max-width:150px;object-fit:contain;flex-shrink:0;filter:grayscale(1)}
  .membrete-id{min-width:0;flex:1}
  .membrete .razon{font-size:20px;font-weight:700;color:#111;line-height:1.22}
  .membrete .linea2{margin-top:4px;font-size:11.5px;color:#555}
  .membrete .linea2 span+span:before{content:" · ";color:#999}
  .doc-tipo{margin-top:14px;font-size:12.5px;font-weight:700;color:#111}
  .doc-codigo{margin-top:4px;font-size:10.5px;color:#777;font-variant-numeric:tabular-nums}
  .dest{margin:18px 0 4px;font-size:13.5px;line-height:1.6}
  .dest .cargo{font-weight:700}
  .dest .ent{color:#444}
  .meta{margin:12px 0 18px;font-size:12.5px}
  .meta div{margin:3px 0}
  .meta .k{color:#666;display:inline-block;min-width:82px}
  .cuerpo p{margin:0 0 12px;text-align:justify}
  .cuerpo .lead{font-weight:600}
  .por-guia{margin:0 0 12px;padding-left:20px}
  .por-guia li{margin:2px 0}
  .anulada{font-weight:700;letter-spacing:.3px}
  .legal{margin-top:20px;font-size:11.5px;color:#555}
  .legal li{margin:3px 0}
  .anexos li{margin:4px 0;font-size:12px}
  .firma-uno{margin-top:58px;font-size:12px;text-align:center;width:58%}
  .firma-uno .linea{border-top:1px solid #111;padding-top:7px;font-weight:700;font-size:13px}
  .firma-uno .firma-dato{color:#555;font-size:11.5px}
  .lugar{margin-top:28px;font-size:12.5px;color:#333}
  .aviso{margin-top:18px;padding:8px 12px;border-left:2px solid #999;color:#444;font-size:11.5px}
  .campo-editable{border-bottom:1px dashed #999;padding:0 1px}
  .campo-editable:hover{background:#f2f2f2}
  .campo-editable:focus{outline:none;border-bottom-color:#111}
  .campo-vacio,.campo-falta{color:#777;font-style:italic}
  @media screen{.campo-vacio,.campo-falta,.revisar{background:#fff3bf;border-radius:2px}}
  @media print{.aviso{display:none}.campo-editable{border-bottom:none;background:none!important}.campo-vacio,.campo-falta,.revisar{background:none!important}}
  .anexo-guias{margin-top:24px}
  .anexo-guias h3{margin:14px 0 6px;font-size:12px;font-weight:700}
  .tabla-guias{width:100%;border-collapse:collapse;font-size:11px;page-break-inside:auto}
  .tabla-guias th,.tabla-guias td{padding:5px 7px;vertical-align:top}
  .tabla-guias tfoot td{font-weight:700;border-top:1px solid #111}
  .tabla-guias .sin-dato{color:#777;font-style:italic}
  .tabla-trozas th:first-child,.tabla-trozas td:first-child{width:120px;white-space:nowrap;font-weight:700}
  .tabla-totales{width:auto;min-width:50%}
  .anexo-guias .vacio{font-style:italic;color:#666;font-size:12px;margin:0 0 4px}
  .hoja-aparte{break-before:page;page-break-before:always;margin-top:28px}
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
  /**
   * Código propio del expediente (ADR-364, Brandon 2026-08-26: "que cada
   * documento tenga un código... para identificar y luego buscarlo") — se
   * imprime junto al tipo de documento para que el papel sea buscable en el
   * Expediente aunque se haya separado de su carpeta. NO es el N° oficial
   * ante la autoridad (ese es `numeroDocumento`).
   */
  codigoInterno?: string;
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

/**
 * En el papel de la app, un OBLIGATORIO vacío se ve dentro del cuerpo redactado
 * con el nombre de su casillero, resaltado (Brandon 08-10: «campos vacíos
 * resaltados»). Los marcadores son caracteres de uso privado que `esc()` no
 * toca; `pintarFaltas` los vuelve un `<span>` después de escapar.
 */
const FALTA_INI = "\uE000";
const FALTA_FIN = "\uE001";

function datosConFaltas(formato: FormatoTramite, datos: DatosTramite): DatosTramite {
  const out: DatosTramite = { ...datos };
  for (const c of formato.campos) {
    if (c.requerido && !(datos[c.id] ?? "").trim()) out[c.id] = `${FALTA_INI}${c.label}${FALTA_FIN}`;
  }
  return out;
}

const pintarFaltas = (html: string): string => html.replace(/\uE000([^\uE001]*)\uE001/g, `<span class="campo-falta">$1</span>`);

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
  const parrafos = cuerpoDe(formato, editable ? datosConFaltas(formato, datos) : datos).map((p) => pintarFaltas(esc(p)));
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
  const filasGuias = formato.tablaGuias ? parseGuiasInforme(datos.guiasJson) : [];
  const papelGuias = { marcar: Boolean(editable) };
  const resumenGuiasHtml = formato.tablaGuias ? resumenNumeradoHtml(filasGuias, papelGuias) : "";
  const cuerpoHtml = formato.tablaGuias
    ? `<p>${parrafos[0] ?? ""}</p>${resumenGuiasHtml}${parrafos.slice(1).map((p) => `<p>${p}</p>`).join("")}`
    : parrafos.map((p) => `<p>${p}</p>`).join("");
  const cuerpo = `<div class="cuerpo">
    <p class="lead">Tengo el agrado de dirigirme a usted para saludarlo(a) cordialmente y, a la vez, exponer lo siguiente:</p>
    ${cuerpoHtml}
    <p>Atentamente,</p>
  </div>`;

  // El anexo con la tabla de guías va ANTES de la lista de anexos declarados:
  // ES el anexo, no una promesa de adjuntarlo aparte.
  const tablaGuias = formato.tablaGuias ? tablaGuiasHtml(filasGuias, papelGuias) : "";
  /* «Con detalle de trozas»: cada troza en una hoja aparte, al final. */
  const detalleTrozas = formato.tablaGuias && datos.conDetalleTrozas === "si" ? detalleTrozasHtml(filasGuias) : "";

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
  ${dni || editable ? `<div class="firma-dato">DNI ${campoSpan(editable, "firmanteDni", dni || "12345678", !dni)}</div>` : ""}
  ${(empresaReal || editable) && !firmaRepiteEmpresa ? `<div class="firma-dato">${campoSpan(editable, "membreteEmpresa", membreteFirmaTexto, !empresaReal)}</div>` : ""}</div>`;

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

  // "Código de CTP" y "Registro ARFFS" son de un CTP registrado, no de
  // cualquier razón social: invitar a llenarlos en modo edición cuando el
  // membrete ya es de un tercero (ej. una comunidad nativa del Directorio)
  // pide un dato que esa parte probablemente no tiene (Brandon 2026-08-25:
  // "veo en encabezado sale código de CTP para rellenar y es directorio de
  // CCNN, ese campo no debe estar"). El RUC y la dirección sí se siguen
  // invitando: son datos que cualquier entidad puede tener.
  const linea2 = [
    rucValor || editable ? `RUC ${campoSpan(editable, "membreteRuc", rucValor, !rucValor)}` : "",
    codigoValor || (editable && membreteEsPropio)
      ? `Código de CTP ${campoSpan(editable, "membreteCodigoCtp", codigoValor, !codigoValor)}`
      : "",
    registroValor || (editable && membreteEsPropio)
      ? `Registro ARFFS ${campoSpan(editable, "membreteRegistroArffs", registroValor, !registroValor)}`
      : "",
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
  <div class="doc-tipo">${esc(formato.nombre)}${o.numeroDocumento ? ` N° ${esc(o.numeroDocumento)}` : ""} · ${esc(autoridad.corto)}</div>
  ${o.codigoInterno ? `<div class="doc-codigo">Código ${esc(o.codigoInterno)} <span>— para identificar y buscar este documento, no es el N° oficial</span></div>` : ""}`;

  return `${membrete}
  ${destinatario}
  ${meta}
  ${cuerpo}
  ${firma}
  ${tablaGuias}
  ${anexos}
  ${legal}
  ${aviso}
  ${detalleTrozas}`;
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
