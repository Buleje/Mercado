"use client";

/**
 * plantacion-print — el FORMATO Nº 01 oficial, maquetado.
 *
 * Estructura y numeración verificadas contra un ejemplar real del "FORMATO
 * ÚNICO PARA LA INSCRIPCIÓN/ACTUALIZACIÓN DE PLANTACIONES EN EL REGISTRO
 * NACIONAL DE PLANTACIONES FORESTALES" (Anexo N°01, Lineamientos RNPF-SERFOR,
 * verificado 2026-08-21): 1. Información del solicitante (titular + repr.
 * legal) · 2. Del área (predio + titularidad + título habilitante) · 3. De la
 * plantación (bloques × vértices UTM × especies) · 4. Declaración jurada ·
 * 5. Información adjunta · 6. Tratamiento de datos personales.
 *
 * El texto de la Declaración Jurada reproduce el artículo 34 del TUO de la
 * Ley N°27444 (D.S. N°004-2019-JUS) tal como lo cita el formato oficial — NO
 * se parafrasea: es una declaración con efectos legales.
 *
 * Reusa el motor de impresión de `ctp-print-shared.ts` (mismo look que el
 * resto de los reportes CTP) — ADR-380.
 */

import { CTP_REPORT_BASE_CSS, esc, openCtpReport } from "./ctp-print-shared";
import { FINALIDADES_PLANTACION, TIPOS_TITULO_HABILITANTE, TIPOS_TITULARIDAD_PREDIO } from "./plantacion-catalogo";
import { tablaVertices } from "./plantacion-cartografia";
import { calcularResumen, nombreTitular, type PlantacionInput } from "./plantacion-tramite";

const PLANTACION_CSS = `
  .rpf-header{text-align:center;border:2px solid #0f5132;border-radius:10px;padding:14px 18px;margin-bottom:16px}
  .rpf-header h1{margin:0 0 6px;font-size:14px;font-weight:800;letter-spacing:.2px;color:#0f5132;text-transform:uppercase}
  .rpf-tipo{display:flex;justify-content:center;gap:18px;margin-top:8px;font-size:12px}
  .rpf-tipo span{padding:3px 12px;border-radius:14px;border:1px solid #cfe0d6;color:#5c6864}
  .rpf-tipo span.on{background:#0f5132;border-color:#0f5132;color:#fff;font-weight:700}
  .rpf-codigo{margin-top:8px;font-size:11.5px;color:#5c6864}
  .rpf-codigo b{color:#26332c}
  h2.rpf{margin:22px 0 8px;font-size:12.5px;font-weight:800;color:#0f5132;text-transform:uppercase;border-bottom:2px solid #eaf3ee;padding-bottom:5px}
  h3.rpf{margin:14px 0 6px;font-size:11.5px;font-weight:700;color:#3d4a43}
  .rpf-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border:1px solid #e2e9e5;border-radius:8px;overflow:hidden}
  .rpf-grid .rpf-cell{padding:7px 10px;border-right:1px solid #eef2f0;border-bottom:1px solid #eef2f0;font-size:11.5px}
  .rpf-grid .rpf-cell:nth-child(3n){border-right:none}
  .rpf-cell .k{display:block;font-size:9.5px;color:#8b968f;text-transform:uppercase;letter-spacing:.2px;margin-bottom:2px}
  .rpf-cell .v{color:#26332c;font-weight:600}
  .rpf-cell .v.empty{color:#aab3ad;font-style:italic;font-weight:400}
  table.rpf-tabla{width:100%;border-collapse:collapse;font-size:11px;margin-top:6px}
  table.rpf-tabla th{background:#eef4f0;text-align:left;padding:5px 7px;border:1px solid #e2e9e5;font-size:9.5px;text-transform:uppercase;color:#3d4a43}
  table.rpf-tabla td{padding:5px 7px;border:1px solid #e2e9e5}
  .rpf-bloque{margin-top:14px;padding:10px 12px;border:1px solid #e2e9e5;border-radius:8px;background:#fafcfb}
  .rpf-bloque-titulo{font-weight:700;font-size:12px;color:#26332c;margin-bottom:6px}
  .rpf-cites{margin-top:6px;padding:6px 9px;border-left:3px solid #b45309;background:#fffbeb;color:#7c2d12;font-size:10.5px;border-radius:0 6px 6px 0}
  .rpf-dj{margin-top:8px;font-size:11px;line-height:1.6;text-align:justify;color:#3d4a43}
  .rpf-checklist{list-style:none;padding:0;margin:6px 0 0;font-size:11px}
  .rpf-checklist li{padding:3px 0;border-bottom:1px dashed #eef2f0}
  .rpf-checklist .estado{float:right;font-weight:700;font-size:10px}
  .rpf-checklist .estado.ok{color:#0f5132}
  .rpf-checklist .estado.falta{color:#b45309}
  .rpf-checklist .estado.na{color:#aab3ad}
  .rpf-firma{margin-top:34px;display:flex;justify-content:space-between;gap:24px}
  .rpf-firma .linea{border-top:1.5px solid #9aa39e;padding-top:6px;font-size:11px;text-align:center;flex:1}
`;

const cell = (label: string, value: string | number | null | undefined): string => {
  const v = value === null || value === undefined || value === "" ? "" : String(value);
  return `<div class="rpf-cell"><span class="k">${esc(label)}</span><span class="v${v ? "" : " empty"}">${v ? esc(v) : "—"}</span></div>`;
};

const MESES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function labelFinalidad(value: string | null | undefined): string {
  return FINALIDADES_PLANTACION.find((f) => f.value === value)?.label ?? (value ?? "—");
}

function labelTitularidad(value: string | null | undefined): string {
  return TIPOS_TITULARIDAD_PREDIO.find((t) => t.value === value)?.label ?? (value ?? "—");
}

function labelTituloHabilitante(value: string | null | undefined): string {
  return TIPOS_TITULO_HABILITANTE.find((t) => t.value === value)?.label ?? (value ?? "—");
}

export interface PlantacionPrintOpts {
  datos: PlantacionInput;
  codigoInterno: string;
  logo?: { src: string } | null;
}

/** El HTML del documento — separado del `open` para poder testear el contenido. */
export function buildPlantacionHtml(o: PlantacionPrintOpts): string {
  const { datos: d } = o;
  const resumen = calcularResumen(d);

  const header = `<div class="rpf-header">
    <h1>Formato único para la inscripción/actualización de plantaciones<br/>en el Registro Nacional de Plantaciones Forestales</h1>
    <div class="rpf-tipo">
      <span class="${d.tipoTramite === "inscripcion" ? "on" : ""}">Inscripción</span>
      <span class="${d.tipoTramite === "actualizacion" ? "on" : ""}">Actualización</span>
    </div>
    <div class="rpf-codigo">
      Código interno: <b>${esc(o.codigoInterno)}</b> (uso administrativo, NO es el código SERFOR)
      ${d.codigoPlantacionSerfor ? ` · Código de Plantación SERFOR: <b>${esc(d.codigoPlantacionSerfor)}</b>` : ""}
    </div>
  </div>`;

  const titular = `<h2 class="rpf">1. Información del solicitante</h2>
  <h3 class="rpf">1.1 Del titular de la plantación</h3>
  <div class="rpf-grid">
    ${cell("Tipo de persona", d.titularTipoPersona === "juridica" ? "Persona jurídica" : d.titularTipoPersona === "natural" ? "Persona natural" : "")}
    ${cell("Documento", d.titularNumeroDocumento)}
    ${cell(d.titularTipoPersona === "juridica" ? "Razón social" : "Nombres y apellidos", nombreTitular(d))}
    ${cell("Celular", d.titularCelular)}
    ${cell("Teléfono fijo", d.titularTelefonoFijo)}
    ${cell("Correo electrónico", d.titularEmail)}
    ${cell("Departamento", d.titularDepartamento)}
    ${cell("Provincia", d.titularProvincia)}
    ${cell("Distrito", d.titularDistrito)}
    ${cell("Dirección", [d.titularTipoVia, d.titularDireccion, d.titularNumero].filter(Boolean).join(" "))}
    ${cell("Documento que autoriza el uso del área", d.titularDocumentoAutorizaUso)}
  </div>
  ${d.repTiene ? `<h3 class="rpf">1.2 Del representante legal</h3>
  <div class="rpf-grid">
    ${cell("Documento", `${d.repTipoDocumento ?? ""} ${d.repNumeroDocumento ?? ""}`.trim())}
    ${cell("Nombres y apellidos", [d.repNombres, d.repApellidoPaterno, d.repApellidoMaterno].filter(Boolean).join(" "))}
    ${cell("Celular", d.repCelular)}
    ${cell("Correo electrónico", d.repEmail)}
    ${cell("Departamento", d.repDepartamento)}
    ${cell("Provincia", d.repProvincia)}
    ${cell("Distrito", d.repDistrito)}
    ${cell("Dirección", [d.repTipoVia, d.repDireccion, d.repNumero].filter(Boolean).join(" "))}
  </div>` : ""}`;

  const predio = `<h2 class="rpf">2. Del área</h2>
  <h3 class="rpf">2.1 Predio</h3>
  <div class="rpf-grid">
    ${cell("Nombre del predio", d.predioNombre)}
    ${cell("Área total (ha)", d.predioAreaTotalHa)}
    ${cell("Departamento", d.predioDepartamento)}
    ${cell("Provincia", d.predioProvincia)}
    ${cell("Distrito", d.predioDistrito)}
    ${cell("Sector/Anexo/Caserío/Comunidad", d.predioSectorAnexo)}
    ${cell("Coordenada UTM (centroide)", d.predioEste && d.predioNorte ? `E ${d.predioEste} · N ${d.predioNorte}` : "")}
    ${cell("Datum · Zona UTM", `${d.predioDatum ?? "WGS84"} · ${d.predioZonaUtm ?? ""}`)}
  </div>
  <h3 class="rpf">Titularidad del predio</h3>
  <div class="rpf-grid">
    ${cell("Titularidad", labelTitularidad(d.titularidadTipo))}
    ${cell("Documento que acredita", d.titularidadDocAcreditaTipo)}
    ${cell("N° del documento", d.titularidadDocAcreditaNumero)}
    ${cell("N° de inscripción registral SUNARP", d.titularidadInscripcionSunarp)}
    ${d.titularidadTipo === "posesionario" ? cell("Nombre del posesionario", d.posesionarioNombre) : ""}
    ${d.titularidadTipo === "posesionario" ? cell("Documento que acredita la posesión", d.posesionarioDocumentoAcredita) : ""}
    ${d.titularidadTipo === "posesionario" ? cell("Años que conduce la parcela", d.posesionarioAniosConduccion) : ""}
  </div>
  ${d.tituloHabilitanteTiene ? `<h3 class="rpf">Título habilitante / contrato</h3>
  <div class="rpf-grid">
    ${cell("Tipo", labelTituloHabilitante(d.tituloHabilitanteTipo))}
    ${cell("Código del título habilitante", d.tituloHabilitanteCodigo)}
  </div>` : `<p style="font-size:11px;color:#8b968f;margin-top:6px">No corresponde título habilitante o contrato.</p>`}`;

  const bloquesHtml = d.bloques
    .map((b, i) => {
      const vertices = tablaVertices(b.vertices);
      const verticesHtml = vertices.length
        ? `<table class="rpf-tabla"><thead><tr><th>Punto</th><th>Zona UTM</th><th>Este</th><th>Norte</th></tr></thead><tbody>
            ${vertices.map((v) => `<tr><td>${esc(v.codigo)}</td><td>${esc(v.zonaUtm)}</td><td>${esc(v.este)}</td><td>${esc(v.norte)}</td></tr>`).join("")}
          </tbody></table>`
        : `<p style="font-size:11px;color:#8b968f">Sin vértices declarados.</p>`;

      const especiesHtml = b.especies.length
        ? `<table class="rpf-tabla"><thead><tr><th>Nombre común</th><th>Nombre científico</th><th>Tipo vegetativo</th><th>Cant.</th><th>Finalidad</th><th>Instalación</th></tr></thead><tbody>
            ${b.especies
              .map(
                (e) =>
                  `<tr><td>${esc(e.nombreComun)}${e.cites ? ' <span style="color:#b45309;font-weight:700">CITES</span>' : ""}</td><td>${esc(e.nombreCientifico ?? "—")}</td><td>${esc(e.tipoVegetativo ?? "—")}</td><td>${esc(e.cantidad ?? "—")}</td><td>${esc(labelFinalidad(e.finalidad))}</td><td>${esc(e.mesInstalacion ? `${MESES[e.mesInstalacion]} ${e.anioInstalacion ?? ""}` : "—")}</td></tr>`,
              )
              .join("")}
          </tbody></table>`
        : `<p style="font-size:11px;color:#8b968f">Sin especies declaradas.</p>`;

      const citesAviso = b.especies.some((e) => e.cites)
        ? `<div class="rpf-cites">Este bloque incluye especies bajo CITES: ${b.especies
            .filter((e) => e.cites && e.citesProcedencia?.trim())
            .map((e) => `${esc(e.nombreComun)} — procedencia de semillas/material: ${esc(e.citesProcedencia)}`)
            .join("; ") || "verificar permiso CITES archivado."}</div>`
        : "";

      return `<div class="rpf-bloque">
        <div class="rpf-bloque-titulo">Bloque ${esc(b.numero || i + 1)}${b.nombre ? ` — ${esc(b.nombre)}` : ""} · ${esc(b.superficieHa ?? "—")} ha</div>
        ${verticesHtml}
        ${especiesHtml}
        ${citesAviso}
      </div>`;
    })
    .join("");

  const plantacion = `<h2 class="rpf">3. De la plantación${d.bloques.some((b) => b.especies.some((e) => e.finalidad === "sistema_agroforestal")) ? " o sistema agroforestal" : ""}</h2>
  <p style="font-size:11px;color:#5c6864;margin:0 0 4px">${resumen.areaBloquesHa} ha declaradas en bloques · ${resumen.numBloques} bloque(s) · ${resumen.numEspecies} especie(s) · ${resumen.totalPlantas.toLocaleString("es-PE")} plantas</p>
  ${bloquesHtml || `<p style="font-size:11px;color:#8b968f">Sin bloques declarados.</p>`}`;

  const declaracion = `<h2 class="rpf">4. Declaración jurada</h2>
  <p class="rpf-dj">Declaro bajo juramento que toda la información antes consignada en la presente solicitud es veraz y ha sido debidamente verificada. En caso que se compruebe fraude o falsedad en la declaración, información o documentación presentada, me someto a las consecuencias y responsabilidades administrativas y penales que correspondan, conforme a lo previsto en el artículo 34 del TUO de la Ley N° 27444, Ley del Procedimiento Administrativo General, aprobado por Decreto Supremo N° 004-2019-JUS, y el Código Penal respecto a los delitos contra la fe pública. Asimismo, declaro que no existe otro derecho de propiedad, registrado o no, sobre el área correspondiente a la plantación forestal.</p>
  <p class="rpf-dj">Adicionalmente, me comprometo a: a) permitir a la autoridad encargada de la inscripción de la plantación, o a quien esta designe, en el ejercicio de sus facultades de seguimiento y control, realizar visitas inspectivas con el objetivo de verificar la información señalada en la presente solicitud; b) actualizar la información contenida en el presente formato previo a los trabajos de aprovechamiento forestal y brindar las facilidades del caso a la ARFFS para que verifique los volúmenes existentes en campo, salvo las excepciones establecidas en la legislación forestal; y c) informar a la ARFFS el cambio de la titularidad de la plantación en caso esta sea vendida o transferida.</p>
  <div class="rpf-firma">
    <div class="linea">${esc(d.djLugar ?? "—")}, ${esc(d.djFecha ?? "—")}<br/>Lugar y fecha</div>
    <div class="linea">${esc(d.djTitularNombre ?? nombreTitular(d))}${d.djDni ? ` — DNI ${esc(d.djDni)}` : ""}<br/>Nombres y apellidos / Firma</div>
  </div>`;

  const documentos = `<h2 class="rpf">5. Información adjunta</h2>
  <ul class="rpf-checklist">
    ${(d.documentos ?? [])
      .filter((doc) => doc.clasificacion !== "no_corresponde")
      .map((doc) => {
        const estado = doc.documentId ? '<span class="estado ok">Adjuntado</span>' : `<span class="estado falta">${doc.clasificacion === "requerido" ? "Requerido — falta" : "Opcional — falta"}</span>`;
        return `<li>${esc(doc.rotulo ?? doc.categoria)}${estado}</li>`;
      })
      .join("") || '<li style="color:#8b968f">Sin documentos declarados.</li>'}
  </ul>`;

  const tratamientoDatos = `<h2 class="rpf">6. Tratamiento de datos personales</h2>
  <p class="rpf-dj">Los datos personales consignados en el presente formato serán tratados por la Autoridad Regional Forestal y de Fauna Silvestre (ARFFS) y el SERFOR conforme a la Ley N°29733, Ley de Protección de Datos Personales, y su Reglamento, con la finalidad exclusiva de gestionar el procedimiento de inscripción o actualización en el Registro Nacional de Plantaciones Forestales.</p>`;

  return `${header}${titular}${predio}${plantacion}${declaracion}${documentos}${tratamientoDatos}`;
}

/** Abre el documento en una ventana imprimible (guardar como PDF). */
export function imprimirPlantacion(o: PlantacionPrintOpts): void {
  openCtpReport({
    title: `Formato RNPF — ${nombreTitular(o.datos)} — ${o.codigoInterno}`,
    css: `${CTP_REPORT_BASE_CSS}${PLANTACION_CSS}`,
    body: buildPlantacionHtml(o),
  });
}

export const PLANTACION_PREVIEW_CSS = `${CTP_REPORT_BASE_CSS}${PLANTACION_CSS}`;
