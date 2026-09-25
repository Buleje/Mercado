"use client";

/**
 * loth-eudr-print — Informe de Diligencia Debida (DDS) EUDR imprimible del Libro
 * TH. El documento que un exportador adjunta para acreditar ante la UE que la
 * madera (1) proviene de una parcela geolocalizada y (2) está libre de
 * deforestación posterior al corte (31-dic-2020).
 *
 * Self-contained: hace su propio fetch de la parcela + las operaciones + el plan
 * activo. Reusa los primitivos genéricos de `ctp-print-shared` y la matemática
 * pura de `loth-geo` (misma fuente que el mapa → nunca dice números distintos).
 */

import { esc, idRow, openCtpReport } from "./ctp-print-shared";
import { buildEudrMapFigure, eudrMapFigureCss, eudrSignatureBlock } from "./eudr-map-figure";
import {
  computeEudrReadiness,
  polygonAreaHa,
  normalizeParcela,
  EUDR_CUTOFF_DATE,
  type LothParcela,
  type OpForEudr,
  type EudrPoint,
  pointInPolygon,
  hasParcela,
} from "./loth-geo";

interface LothEntry {
  section: string;
  status?: string | null;
  treeCode?: string | null;
  trozaCode?: string | null;
  productType?: string | null;
  speciesCommon?: string | null;
  cites?: boolean;
  volumeM3?: string | null;
  gpsLat?: string | null;
  gpsLng?: string | null;
  entryDate: string;
}
interface ActivePlan {
  titularName?: string | null;
  planNumber?: string | null;
  parcelaCorta?: string | null;
  areaHa?: number | string | null;
}

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
};

const SECTION_LABEL: Record<string, string> = {
  tala: "Tala",
  trozado: "Trozado",
  despacho_troza: "Despacho de troza",
  consumo_troza: "Consumo de troza",
  producto_terminado: "Producto terminado",
  despacho_producto: "Despacho de producto",
};

async function getJson(url: string): Promise<Record<string, unknown>> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
  return r.json();
}

export async function printLothEudrDds(): Promise<void> {
  const [entriesRes, parcelaRes, planRes] = await Promise.all([
    getJson("/api/admin/forestal/loth?limit=500&includeAnnulled=1"),
    getJson("/api/admin/forestal/loth/parcela"),
    getJson("/api/admin/forestal/plan?active=1"),
  ]);

  const entries = (entriesRes.entries ?? []) as LothEntry[];
  const parcela: LothParcela = normalizeParcela(parcelaRes.parcela);
  const plan = (planRes.active ?? null) as ActivePlan | null;

  const ops: OpForEudr[] = entries.map((e) => ({
    section: e.section,
    lat: e.gpsLat != null ? Number(e.gpsLat) : null,
    lng: e.gpsLng != null ? Number(e.gpsLng) : null,
    cites: !!e.cites,
    status: e.status ?? null,
  }));
  const readiness = computeEudrReadiness(ops, parcela);

  const geoPoints: (EudrPoint & { dentro: boolean })[] = entries
    .filter((e) => e.status !== "anulado" && e.gpsLat != null && e.gpsLng != null)
    .map((e) => {
      const lat = Number(e.gpsLat);
      const lng = Number(e.gpsLng);
      return {
        lat,
        lng,
        section: e.section,
        code: e.trozaCode || e.treeCode || e.productType || "—",
        species: e.speciesCommon ?? null,
        cites: !!e.cites,
        volumeM3: e.volumeM3 != null ? Number(e.volumeM3) : null,
        date: e.entryDate,
        dentro: hasParcela(parcela) ? pointInPolygon([lat, lng], parcela.vertices) : true,
      };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0));

  const areaHa = hasParcela(parcela) ? polygonAreaHa(parcela.vertices) : 0;
  const planArea = plan?.areaHa != null ? Number(plan.areaHa) : null;

  const figura = buildEudrMapFigure({
    polygons: hasParcela(parcela) ? [{ code: "Parcela", ring: parcela.vertices, color: "#0d9488" }] : [],
    points: geoPoints.map((p) => ({ lat: p.lat, lng: p.lng, color: p.dentro ? "#16a34a" : "#e11d48" })),
    caption: "Parcela de aprovechamiento (teal) y operaciones geolocalizadas · verde dentro / rojo fuera · satélite Esri",
  });

  const identity = [
    idRow("Operador / titular", plan?.titularName ?? "—"),
    idRow("Título habilitante", plan?.planNumber ?? "—"),
    idRow("Parcela de corta", plan?.parcelaCorta ?? "—"),
    idRow("Corte EUDR", EUDR_CUTOFF_DATE),
  ].join("");

  const verdictColor = readiness.listo ? "#15803d" : readiness.score >= 50 ? "#b45309" : "#b91c1c";
  const verdictText = readiness.listo
    ? "La documentación geoespacial cumple los requisitos del Reglamento UE 2023/1115."
    : "Documentación incompleta: revisar el checklist antes de presentar la DDS.";

  const checklist = readiness.checks
    .map(
      (c) =>
        `<tr><td style="padding:5px 8px">${c.ok ? "✓" : "✗"}</td><td style="padding:5px 8px"><b>${esc(c.label)}</b><br><span style="color:#64748b">${esc(c.detail)}</span></td></tr>`,
    )
    .join("");

  const verticesRows = parcela.vertices
    .map((v, i) => `<tr><td style="padding:4px 8px">${i + 1}</td><td style="padding:4px 8px;font-family:monospace">${v[0].toFixed(6)}</td><td style="padding:4px 8px;font-family:monospace">${v[1].toFixed(6)}</td></tr>`)
    .join("");

  const opsRows = geoPoints
    .map(
      (p) =>
        `<tr${p.dentro ? "" : ' style="background:#fef2f2"'}>
          <td style="padding:4px 8px"><b>${esc(p.code)}</b>${p.cites ? ' <span style="color:#b91c1c;font-size:10px">CITES</span>' : ""}</td>
          <td style="padding:4px 8px">${esc(SECTION_LABEL[p.section] ?? p.section)}</td>
          <td style="padding:4px 8px">${esc(p.species ?? "—")}</td>
          <td style="padding:4px 8px;font-family:monospace">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</td>
          <td style="padding:4px 8px">${esc(fmtDate(p.date))}</td>
          <td style="padding:4px 8px;font-weight:700;color:${p.dentro ? "#15803d" : "#b91c1c"}">${p.dentro ? "dentro" : "FUERA"}</td>
        </tr>`,
    )
    .join("");

  const body = `
    <div class="report-head">
      <h1>Declaración de Diligencia Debida (DDS)</h1>
      <p class="sub">Cumplimiento geoespacial · Reglamento UE 2023/1115 (EUDR · Antideforestación)</p>
    </div>

    <table class="id-table">${identity}</table>

    <div style="margin:16px 0;padding:12px 16px;border:2px solid ${verdictColor};border-radius:10px">
      <div style="font-size:13px;font-weight:800;color:${verdictColor}">Readiness EUDR: ${readiness.score}/100 ${readiness.listo ? "· LISTO" : "· INCOMPLETO"}</div>
      <div style="font-size:12px;color:#334155;margin-top:4px">${esc(verdictText)}</div>
    </div>

    <h2>Checklist</h2>
    <table class="grid"><tbody>${checklist}</tbody></table>

    <h2>Parcela de aprovechamiento</h2>
    ${figura}
    <p style="font-size:12px;color:#334155">Área geolocalizada: <b>${areaHa.toFixed(2)} ha</b>${planArea != null ? ` · autorizada por el POA: <b>${planArea.toFixed(2)} ha</b>` : ""} · vértices: <b>${parcela.vertices.length}</b> · deforestación cero: <b>${parcela.deforestacionCero ? "declarada" : "NO declarada"}</b></p>
    ${verticesRows ? `<table class="grid"><thead><tr><th>#</th><th>Latitud</th><th>Longitud</th></tr></thead><tbody>${verticesRows}</tbody></table>` : '<p style="color:#b91c1c">Sin polígono declarado.</p>'}

    <h2>Operaciones geolocalizadas (${geoPoints.length})</h2>
    ${opsRows ? `<table class="grid"><thead><tr><th>Código</th><th>Sección</th><th>Especie</th><th>Coordenadas</th><th>Fecha</th><th>Parcela</th></tr></thead><tbody>${opsRows}</tbody></table>` : '<p style="color:#64748b">Ninguna operación tiene GPS todavía.</p>'}

    ${eudrSignatureBlock(plan?.titularName ? `${plan.titularName} (titular)` : "Titular / representante legal", "Sello y recepción · ARFFS / autoridad UE")}
  `;

  openCtpReport({
    title: "DDS EUDR — Libro TH",
    css: `
      .report-head h1 { font-size: 20px; margin: 0; }
      .report-head .sub { color: #64748b; font-size: 12px; margin: 2px 0 12px; }
      h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
      table.grid { width: 100%; border-collapse: collapse; font-size: 11px; }
      table.grid th { text-align: left; background: #f1f5f9; padding: 5px 8px; border-bottom: 1px solid #cbd5e1; }
      table.grid td { border-bottom: 1px solid #eef2f7; }
      ${eudrMapFigureCss()}
    `,
    body,
  });
}
