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
 *
 * Por permiso (ADR-462, 02-10-2026): con un permiso elegido, sus líneas contra
 * SU área (o la del negocio si todavía no tiene); con «Todos», cada operación
 * contra el área de SU plan —antes todas contra una sola, y una tala de otro
 * permiso salía «FUERA» aunque estuviera en el suyo—.
 */

import { esc, idRow, openCtpReport } from "./ctp-print-shared";
import { buildEudrMapFigure, eudrMapFigureCss, eudrSignatureBlock } from "./eudr-map-figure";
import {
  computeEudrReadiness,
  emptyParcela,
  polygonAreaHa,
  normalizeParcela,
  EUDR_CUTOFF_DATE,
  type EudrReadiness,
  type LothParcela,
  type OpForEudr,
  type EudrPoint,
  pointInPolygon,
  hasParcela,
} from "./loth-geo";
import { filtroDeSeleccion, PERMISO_SIN_PLAN, queryDelPermiso } from "./loth-filtro-permiso";

interface LothEntry {
  planId?: string | null;
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

/** Un área con nombre: con «Todos», la de cada permiso y la del negocio (`planId: null`). */
export interface AreaEudr {
  planId: string | null;
  nombre: string;
  parcela: LothParcela;
}

/**
 * Contra qué área se mide una operación: la de SU plan; si su plan no tiene
 * área propia (o la línea no tiene plan), la del negocio. Es la misma regla
 * con la que el mapa hereda el área (ADR-462 §2). `null` = no hay contra qué.
 */
export function areaDeSuPlan(planId: string | null | undefined, areas: readonly AreaEudr[]): AreaEudr | null {
  const propia = planId ? areas.find((a) => a.planId === planId && hasParcela(a.parcela)) : undefined;
  return propia ?? areas.find((a) => a.planId === null && hasParcela(a.parcela)) ?? null;
}

const coordValida = (lat: number | null, lng: number | null): lat is number =>
  lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

/**
 * El readiness con «Todos»: la cobertura es la de siempre, pero «dentro»
 * cuenta cada operación contra el área de su plan, «parcela» pide al menos un
 * área y «deforestación cero» la pide en todas. `sinArea` = operaciones cuyo
 * plan no tiene área ni hay una del negocio: no se pueden verificar.
 */
export function readinessPorPermiso(
  ops: readonly (OpForEudr & { planId?: string | null })[],
  areas: readonly AreaEudr[],
): EudrReadiness & { sinArea: number } {
  const conArea = areas.filter((a) => hasParcela(a.parcela));
  const base = computeEudrReadiness([...ops], emptyParcela());
  let dentro = 0;
  let fuera = 0;
  let sinArea = 0;
  for (const o of ops) {
    if (o.status === "anulado" || !coordValida(o.lat, o.lng)) continue;
    const a = areaDeSuPlan(o.planId, conArea);
    if (!a) sinArea++;
    else if (pointInPolygon([o.lat, o.lng as number], a.parcela.vertices)) dentro++;
    else fuera++;
  }
  const declarada = conArea.length > 0;
  const areaHa = conArea.reduce((t, a) => t + polygonAreaHa(a.parcela.vertices), 0);
  const sinDeclarar = conArea.filter((a) => !a.parcela.deforestacionCero).length;
  const deforestacionCero = declarada && sinDeclarar === 0;
  const checks = base.checks.map((c) => {
    if (c.key === "parcela") {
      return { ...c, ok: declarada, detail: declarada ? `${conArea.length} área(s) · ${areaHa.toFixed(2)} ha` : c.detail };
    }
    if (c.key === "dentro") {
      const ok = declarada && fuera === 0 && sinArea === 0 && dentro > 0;
      const detail = !declarada
        ? "Requiere al menos un área declarada"
        : fuera > 0
          ? `${fuera} operación(es) fuera del área de su permiso — bandera roja de fiscalización`
          : sinArea > 0
            ? `${sinArea} operación(es) de un permiso sin área: no se pueden verificar`
            : dentro > 0
              ? `Las ${dentro} operaciones geolocalizadas caen dentro del área de su permiso`
              : "Sin operaciones geolocalizadas para verificar";
      return { ...c, ok, detail };
    }
    if (c.key === "deforestacion") {
      return {
        ...c,
        ok: deforestacionCero,
        detail: deforestacionCero ? "Declarado por el titular en cada área" : declarada ? `Falta la declaración en ${sinDeclarar} área(s)` : c.detail,
      };
    }
    return c;
  });
  const total = checks.reduce((t, c) => t + c.weight, 0);
  const score = Math.round((checks.filter((c) => c.ok).reduce((t, c) => t + c.weight, 0) / total) * 100);
  return { ...base, parcelaDeclarada: declarada, areaHa, dentro, fuera, deforestacionCero, checks, score, listo: checks.every((c) => c.ok), sinArea };
}

/**
 * Con qué permiso sale la DDS. `permiso` es el de la banda: `undefined` = como
 * siempre (todo el libro contra el área del negocio); `null` = «Todos»;
 * `PERMISO_SIN_PLAN` = las líneas sin permiso; un id = ese permiso.
 * `nombres` = cómo se llama cada permiso (para rotular sus áreas).
 */
export interface OpcionesDds {
  permiso?: string | null;
  nombres?: Readonly<Record<string, string>>;
}

const COLORES_AREA = ["#0d9488", "#7c3aed", "#b45309", "#1d4ed8", "#be185d"];

export async function printLothEudrDds(opts: OpcionesDds = {}): Promise<void> {
  const { permiso, nombres = {} } = opts;
  const todos = permiso === null;
  const plan1 = permiso && permiso !== PERMISO_SIN_PLAN ? permiso : null;
  const q = permiso === undefined ? "" : queryDelPermiso(filtroDeSeleccion(permiso));
  const qParcela = todos ? "?todos=1" : plan1 ? `?planId=${encodeURIComponent(plan1)}` : "";
  const [entriesRes, parcelaRes, planRes] = await Promise.all([
    getJson(`/api/admin/forestal/loth?limit=500&includeAnnulled=1${q ? `&${q}` : ""}`),
    getJson(`/api/admin/forestal/loth/parcela${qParcela}`),
    permiso === PERMISO_SIN_PLAN
      ? Promise.resolve({} as Record<string, unknown>)
      : getJson(plan1 ? `/api/admin/forestal/plan?planId=${encodeURIComponent(plan1)}` : "/api/admin/forestal/plan?active=1"),
  ]);

  const entries = (entriesRes.entries ?? []) as LothEntry[];
  const plan = ((plan1 ? planRes.plan : planRes.active) ?? null) as ActivePlan | null;

  /* Las áreas contra las que se mide. Con «Todos», la del negocio + la de cada permiso. */
  const porPermiso = Array.isArray(parcelaRes.porPermiso) ? (parcelaRes.porPermiso as { planId?: unknown; parcela?: unknown }[]) : [];
  const delNegocio = porPermiso.find((x) => !x.planId);
  const areas: AreaEudr[] = todos
    ? [
        { planId: null, nombre: "Del negocio (sin permiso)", parcela: normalizeParcela(delNegocio ? delNegocio.parcela : parcelaRes.parcela) },
        ...porPermiso
          .filter((x): x is { planId: string; parcela?: unknown } => typeof x.planId === "string" && x.planId !== "")
          .map((x) => ({ planId: x.planId, nombre: nombres[x.planId] ?? "Permiso", parcela: normalizeParcela(x.parcela) })),
      ].filter((a) => hasParcela(a.parcela))
    : [{ planId: plan1, nombre: plan?.planNumber ?? "Parcela", parcela: normalizeParcela(parcelaRes.parcela) }];
  const heredada = !!plan1 && parcelaRes.heredada === true;
  /** La de un solo permiso (o la del negocio): la de siempre. */
  const parcela: LothParcela = todos ? (areas.find((a) => a.planId === null)?.parcela ?? emptyParcela()) : areas[0].parcela;

  const ops: (OpForEudr & { planId?: string | null })[] = entries.map((e) => ({
    planId: e.planId ?? null,
    section: e.section,
    lat: e.gpsLat != null ? Number(e.gpsLat) : null,
    lng: e.gpsLng != null ? Number(e.gpsLng) : null,
    cites: !!e.cites,
    status: e.status ?? null,
  }));
  const readiness = todos ? readinessPorPermiso(ops, areas) : computeEudrReadiness(ops, parcela);

  const geoPoints: (EudrPoint & { dentro: boolean | null; area: string | null })[] = entries
    .filter((e) => e.status !== "anulado" && e.gpsLat != null && e.gpsLng != null)
    .map((e) => {
      const lat = Number(e.gpsLat);
      const lng = Number(e.gpsLng);
      const suya = todos ? areaDeSuPlan(e.planId, areas) : hasParcela(parcela) ? areas[0] : null;
      return {
        lat,
        lng,
        section: e.section,
        code: e.trozaCode || e.treeCode || e.productType || "—",
        species: e.speciesCommon ?? null,
        cites: !!e.cites,
        volumeM3: e.volumeM3 != null ? Number(e.volumeM3) : null,
        date: e.entryDate,
        /* Sin área contra la cual medir: antes contaba «dentro»; con «Todos» se dice «sin área». */
        dentro: suya ? pointInPolygon([lat, lng], suya.parcela.vertices) : todos ? null : true,
        area: todos ? (suya?.nombre ?? null) : null,
      };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0));

  const areaHa = todos ? readiness.areaHa : hasParcela(parcela) ? polygonAreaHa(parcela.vertices) : 0;
  const planArea = !todos && plan?.areaHa != null ? Number(plan.areaHa) : null;

  const figura = buildEudrMapFigure({
    polygons: areas.filter((a) => hasParcela(a.parcela)).map((a, i) => ({ code: todos ? a.nombre : "Parcela", ring: a.parcela.vertices, color: COLORES_AREA[i % COLORES_AREA.length] })),
    points: geoPoints.map((p) => ({ lat: p.lat, lng: p.lng, color: p.dentro === false ? "#e11d48" : p.dentro ? "#16a34a" : "#64748b" })),
    caption: todos
      ? "Áreas de cada permiso y operaciones geolocalizadas · verde dentro del área de su permiso / rojo fuera / gris sin área · satélite Esri"
      : "Parcela de aprovechamiento (teal) y operaciones geolocalizadas · verde dentro / rojo fuera · satélite Esri",
  });

  const identity = [
    idRow("Operador / titular", plan?.titularName ?? "—"),
    idRow("Título habilitante", plan?.planNumber ?? "—"),
    idRow("Parcela de corta", plan?.parcelaCorta ?? "—"),
    idRow("Corte EUDR", EUDR_CUTOFF_DATE),
    ...(permiso === undefined
      ? []
      : [idRow("Permiso", todos ? "Todos los permisos" : plan1 ? (nombres[plan1] ?? plan?.planNumber ?? "—") : "Líneas sin permiso")]),
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

  /** Con «Todos»: cada área con su nombre, sus hectáreas y su declaración. */
  const areasHtml = areas.length
    ? `<table class="grid"><thead><tr><th>Permiso</th><th>Área</th><th>Vértices</th><th>Deforestación cero</th></tr></thead><tbody>${areas
        .map(
          (a) =>
            `<tr><td style="padding:4px 8px"><b>${esc(a.nombre)}</b></td><td style="padding:4px 8px">${polygonAreaHa(a.parcela.vertices).toFixed(2)} ha</td><td style="padding:4px 8px">${a.parcela.vertices.length}</td><td style="padding:4px 8px">${a.parcela.deforestacionCero ? "declarada" : "NO declarada"}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : '<p style="color:#b91c1c">Ningún permiso tiene área declarada.</p>';

  const opsRows = geoPoints
    .map(
      (p) =>
        `<tr${p.dentro === false ? ' style="background:#fef2f2"' : ""}>
          <td style="padding:4px 8px"><b>${esc(p.code)}</b>${p.cites ? ' <span style="color:#b91c1c;font-size:10px">CITES</span>' : ""}</td>
          <td style="padding:4px 8px">${esc(SECTION_LABEL[p.section] ?? p.section)}</td>
          <td style="padding:4px 8px">${esc(p.species ?? "—")}</td>
          <td style="padding:4px 8px;font-family:monospace">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</td>
          <td style="padding:4px 8px">${esc(fmtDate(p.date))}</td>
          <td style="padding:4px 8px;font-weight:700;color:${p.dentro === null ? "#64748b" : p.dentro ? "#15803d" : "#b91c1c"}">${p.dentro === null ? "sin área" : p.dentro ? "dentro" : "FUERA"}${p.area ? `<br><span style="font-weight:400;color:#64748b">${esc(p.area)}</span>` : ""}</td>
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

    <h2>${todos ? `Áreas de aprovechamiento por permiso (${areas.length})` : "Parcela de aprovechamiento"}</h2>
    ${figura}
    ${heredada ? '<p style="font-size:12px;color:#b45309">Este permiso todavía no tiene su área: se mide contra la del negocio.</p>' : ""}
    ${
      todos
        ? areasHtml
        : `<p style="font-size:12px;color:#334155">Área geolocalizada: <b>${areaHa.toFixed(2)} ha</b>${planArea != null ? ` · autorizada por el POA: <b>${planArea.toFixed(2)} ha</b>` : ""} · vértices: <b>${parcela.vertices.length}</b> · deforestación cero: <b>${parcela.deforestacionCero ? "declarada" : "NO declarada"}</b></p>
    ${verticesRows ? `<table class="grid"><thead><tr><th>#</th><th>Latitud</th><th>Longitud</th></tr></thead><tbody>${verticesRows}</tbody></table>` : '<p style="color:#b91c1c">Sin polígono declarado.</p>'}`
    }

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
