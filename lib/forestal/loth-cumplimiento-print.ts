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

export function printLothCumplimiento(opts: {
  result: LothComplianceResult;
  caratula: LothCaratulaLike | null;
  totalLineas: number;
}): void {
  const { result, caratula, totalLineas } = opts;
  const c = caratula ?? {};
  const v = VERDICT[result.readiness];
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
    <div class="vs">Índice de cumplimiento: <b>${result.score}/100</b> ·
      ${result.bloqueos} ${result.bloqueos === 1 ? "bloqueo" : "bloqueos"} ·
      ${result.advertencias} ${result.advertencias === 1 ? "advertencia" : "advertencias"} ·
      ${result.enOrden.length} en orden</div>
  </div>`;

  const problemasRows =
    result.problemas.length === 0
      ? `<tr><td colspan="3" class="muted">Sin observaciones — el libro no tiene problemas detectados.</td></tr>`
      : result.problemas
          .map(
            (p) => `<tr>
        <td><span class="badge" style="background:${p.severity === "error" ? "#f8d7da" : "#fff3cd"};color:${p.severity === "error" ? "#842029" : "#8a5a00"}">${p.severity === "error" ? "BLOQUEO" : "ADVERTENCIA"}</span></td>
        <td><b>${esc(p.title)}</b><div class="muted">${esc(p.description)}</div></td>
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
