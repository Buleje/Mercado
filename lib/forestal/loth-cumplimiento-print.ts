"use client";

/**
 * loth-cumplimiento-print — reporte imprimible (PDF) del cumplimiento del Libro
 * TH, para presentar en una fiscalización de OSINFOR/ARFFS.
 *
 * Reusa los primitivos de `ctp-print-shared` (escape, ventana de print, CSS
 * base) — genéricos, no CTP-específicos — y arma el bloque de identidad desde la
 * carátula del LO-TH (no la ficha del CTP) + un pie propio del titular/regente.
 * Los colores van en HEX porque los tokens `--data-*` no resuelven en la ventana
 * de print. Misma data que el panel (`computeLothCompliance`) → nunca divergen.
 */

import { esc, idRow, openCtpReport } from "./ctp-print-shared";
import type { LothComplianceResult } from "./loth-compliance";
import { normaDe } from "./loth-chequeo-secciones";

/** Cuántos casos de cada problema entran al PDF (el resto, «y N más»). */
const CASOS_EN_EL_PDF = 10;

interface LothCaratulaLike {
  titularName?: string | null;
  tituloHabilitante?: string | null;
  ruc?: string | null;
  representanteLegal?: string | null;
  resolucionNumber?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
}

const VERDICT: Record<LothComplianceResult["readiness"], { label: string; color: string; bg: string }> = {
  ready: { label: "El libro está al día", color: "#0f5132", bg: "#d1e7dd" },
  warning: { label: "Con advertencias por revisar", color: "#8a5a00", bg: "#fff3cd" },
  error: { label: "Requiere atención antes de una fiscalización", color: "#842029", bg: "#f8d7da" },
};

/** Con algo sin revisar, el veredicto no dice «al día» (reviewer 26-10). */
const VERDICT_A_MEDIAS = { label: "Sin problemas en lo revisado — falta revisar una parte", color: "#8a5a00", bg: "#fff3cd" };

/**
 * Lo que este PDF NO revisó: lo que el servidor no pudo leer y, si la ruta de
 * los chequeos avanzados no contestó, esos chequeos enteros.
 */
export function loNoRevisado(o: { sinLeer?: readonly string[]; errorAvanzado?: string | null; avanzadoLeido?: boolean }): string[] {
  const out = [...(o.sinLeer ?? [])];
  if (o.errorAvanzado && !o.avanzadoLeido) out.unshift(`los chequeos avanzados (guías, árboles y bloques, plan y papeles, plazos): ${o.errorAvanzado}`);
  return out;
}

export function printLothCumplimiento(opts: {
  result: LothComplianceResult;
  caratula: LothCaratulaLike | null;
  totalLineas: number;
  /** Lo que el servidor no pudo leer (`ChequeoAvanzado.sinLeer`). */
  sinLeer?: readonly string[];
  /** La ruta de los chequeos avanzados falló. */
  errorAvanzado?: string | null;
  /** Hay un cálculo anterior de los avanzados (del mismo plan y ajustes): el error es de una recarga. */
  avanzadoLeido?: boolean;
}): void {
  const { result, caratula, totalLineas } = opts;
  const c = caratula ?? {};
  const noRevisado = loNoRevisado(opts);
  const v = noRevisado.length > 0 && result.readiness === "ready" ? VERDICT_A_MEDIAS : VERDICT[result.readiness];
  const ubic = [c.distrito, c.provincia, c.departamento].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");

  const idBlock = `<div class="id">${[
    idRow("Titular:", c.titularName ?? ""),
    idRow("Título habilitante:", c.tituloHabilitante ?? ""),
    idRow("RUC:", c.ruc ?? ""),
    idRow("Representante legal:", c.representanteLegal ?? ""),
    idRow("Resolución:", c.resolucionNumber ?? ""),
    idRow("Registro / Tomo:", [c.registroNumber, c.tomo].filter(Boolean).join(" / ")),
    idRow("Ubicación:", ubic),
    idRow("Líneas evaluadas:", String(totalLineas)),
  ]
    .filter(Boolean)
    .join("")}</div>`;

  const verdictBox = `<div class="verdict" style="background:${v.bg};color:${v.color}">
    <div class="vt">${esc(v.label)}</div>
    <div class="vs">Índice de cumplimiento${noRevisado.length > 0 ? " (sobre lo revisado)" : ""}: <b>${result.score}/100</b> ·
      ${result.bloqueos} ${result.bloqueos === 1 ? "bloqueo" : "bloqueos"} ·
      ${result.advertencias} ${result.advertencias === 1 ? "advertencia" : "advertencias"} ·
      ${result.enOrden.length} en orden</div>
  </div>${
    noRevisado.length > 0
      ? `<div class="norev"><b>No se revisó:</b> ${noRevisado.map((x) => esc(x)).join(" · ")}.
    <div class="muted">Esos chequeos no entran al índice ni a «en orden»: sin ellos, el veredicto queda abierto.</div></div>`
      : ""
  }`;

  /* Los casos y la norma de cada problema (26-10): el fiscalizador ve CUÁLES guías o árboles, no sólo cuántos. */
  const casosDe = (p: LothComplianceResult["problemas"][number]) => {
    const norma = normaDe(p);
    const casos = (p.casos ?? []).slice(0, CASOS_EN_EL_PDF);
    const resto = p.count - casos.length;
    return `${norma ? `<div class="muted">Norma: ${esc(norma)}</div>` : ""}${
      casos.length ? `<ul>${casos.map((c) => `<li>${esc(c)}</li>`).join("")}${resto > 0 ? `<li class="muted">y ${resto} más</li>` : ""}</ul>` : ""
    }`;
  };

  const problemasRows =
    result.problemas.length === 0
      ? `<tr><td colspan="3" class="muted">${
          noRevisado.length > 0 ? "Sin observaciones en lo revisado (ver «No se revisó»)." : "Sin observaciones — el libro no tiene problemas detectados."
        }</td></tr>`
      : result.problemas
          .map(
            (p) => `<tr>
        <td><span class="badge" style="background:${p.severity === "error" ? "#f8d7da" : "#fff3cd"};color:${p.severity === "error" ? "#842029" : "#8a5a00"}">${p.severity === "error" ? "BLOQUEO" : "ADVERTENCIA"}</span></td>
        <td><b>${esc(p.title)}</b><div class="muted">${esc(p.description)}</div>${casosDe(p)}</td>
        <td>${esc(p.action)}</td>
      </tr>`,
          )
          .join("");

  const breakdownRows = result.breakdown
    .map(
      (b) => `<tr>
      <td>${esc(b.label)}</td>
      <td class="num">${b.casos}</td>
      <td class="num ${b.puntos > 0 ? "neg" : ""}">${b.puntos > 0 ? `−${b.puntos}` : "0"}</td>
    </tr>`,
    )
    .join("");

  const enOrdenList =
    result.enOrden.length === 0
      ? ""
      : `<h2>Verificaciones en orden</h2><ul class="ok">${result.enOrden
          .map((c2) => `<li>${esc(c2.okTitle)}</li>`)
          .join("")}</ul>`;

  const footer = `<div class="firma">
    <div>Titular / Representante del título habilitante</div>
    <div>Sello y recepción OSINFOR / ARFFS</div>
  </div>
  <p class="foot">Reporte de cumplimiento del Libro de Operaciones de Títulos Habilitantes (LO-TH),
  generado desde el sistema para acreditar la cadena de custodia del aprovechamiento ante OSINFOR/ARFFS
  (Ley 29763, RDE 264-2019). Documento interno de gestión — no reemplaza el registro oficial en el SNIFFS.</p>`;

  const css = `
    .verdict{border-radius:8px;padding:14px 16px;margin:14px 0}
    .verdict .vt{font-size:15px;font-weight:800}
    .verdict .vs{font-size:12px;margin-top:3px;opacity:.9}
    .norev{border:1px solid #e0b252;background:#fffaf0;color:#5c3d00;border-radius:8px;padding:10px 14px;margin:0 0 14px;font-size:12px}
    ul.ok{margin:6px 0 0;padding-left:18px;columns:2;font-size:12px;color:#333}
    ul.ok li{margin:2px 0;break-inside:avoid}
  `;

  const body = `
    <h1>Reporte de cumplimiento · Libro de Operaciones TH</h1>
    <p class="sub">Cadena de custodia del aprovechamiento en el bosque — tala → trozado → salida.</p>
    ${idBlock}
    ${verdictBox}
    <h2>Requiere atención</h2>
    <table><thead><tr><th>Nivel</th><th>Observación</th><th>Cómo se corrige</th></tr></thead>
      <tbody>${problemasRows}</tbody></table>
    <h2>Cómo se compone el índice</h2>
    <table><thead><tr><th>Verificación</th><th class="num">Casos</th><th class="num">Puntos</th></tr></thead>
      <tbody>${breakdownRows}</tbody></table>
    ${enOrdenList}
    ${footer}
  `;

  openCtpReport({ title: "Cumplimiento LO-TH", css, body });
}
