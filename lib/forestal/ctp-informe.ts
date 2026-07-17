"use client";

/**
 * ctp-informe.ts — Informe de Operaciones del período, imprimible para
 * presentar a la ARFFS (la RDE D000025-2023 fija un plazo de ~30 días para la
 * presentación de informes a la autoridad forestal regional).
 *
 * Resume el período con la identidad legal del CTP (Ficha) como encabezado:
 * movimientos, existencias por especie, stock de productos y estado de
 * cumplimiento. Se arma con los mismos agregados que el panel y el Excel
 * (WoodEntriesDB.stats + ForestCtpDB.saldos + trazabilidad), así los tres
 * documentos nunca se contradicen. Mismo patrón de impresión que
 * `ctp-certificado.ts` (window.open + print).
 */

import { applyCtpPeriodParams, type CtpPeriod } from "./ctp-period";
import { estadoVencimiento, type CtpFicha } from "./ctp-ficha-types";
import { evaluarRendimiento } from "./ctp-rendimiento";

const TITULO_LABEL_INF: Record<string, string> = {
  concesion: "Concesión forestal", permiso: "Permiso forestal", autorizacion: "Autorización",
  plantacion: "Plantación registrada", dema: "DEMA", predio: "Predio privado", otro: "Otro",
};
/** Sufijo HTML de vigencia para una fecha de vencimiento (vencido/por vencer). */
function vigenciaHtml(vencimiento: string): string {
  if (!vencimiento) return "—";
  const est = estadoVencimiento(vencimiento);
  const tag = est === "vencido" ? ' <span class="neg">vencido</span>' : est === "por_vencer" ? ' <span class="warn">por vencer</span>' : "";
  return `${vencimiento}${tag}`;
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n4 = (v: number) => v.toFixed(4);

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(url, { credentials: "include" });
    return r.ok ? await r.json() : fallback;
  } catch {
    return fallback;
  }
}
const withPeriod = (path: string, base: Record<string, string>, period: CtpPeriod) =>
  `${path}?${applyCtpPeriodParams(new URLSearchParams(base), period)}`;

interface Stats {
  totalCount: number; totalVolumeM3: number; citesCount: number; lateCount: number;
  byStatus: Record<string, number>;
}
interface SpeciesBalance {
  especie: string; scientific: string | null; cites: boolean;
  ingresoM3: number; consumidoM3: number; saldoM3: number;
}
interface Saldos {
  materiaPrima: { especiesEnNegativo: number; ingresoM3: number; consumidoM3: number };
  porEspecie: SpeciesBalance[];
  productos: { producto: string; producido: number; despachado: number; stock: number }[];
}
interface CtpRow { lineNo: number; productType: string | null; rendimientoPct: string | null; status: string }

export async function printInformePeriodo(period: CtpPeriod): Promise<void> {
  const [fic, wood, sal, trz, prod, desp] = await Promise.all([
    getJson<{ ficha?: CtpFicha }>("/api/admin/forestal/ctp-ficha", {}),
    getJson<{ stats?: Stats }>(withPeriod("/api/admin/forestal/wood-entries", { stats: "1", limit: "1" }, period), {}),
    getJson<{ saldos?: Saldos }>(withPeriod("/api/admin/forestal/ctp", { saldos: "1" }, period), {}),
    getJson<{ traza?: { incompletos: number } }>(withPeriod("/api/admin/forestal/ctp", { traza: "1" }, period), {}),
    getJson<{ entries?: CtpRow[] }>(withPeriod("/api/admin/forestal/ctp", { section: "produccion" }, period), {}),
    getJson<{ entries?: CtpRow[] }>(withPeriod("/api/admin/forestal/ctp", { section: "despacho" }, period), {}),
  ]);
  const ficha = fic.ficha ?? null;
  const stats = wood.stats ?? null;
  const saldos = sal.saldos ?? null;
  const traza = trz.traza ?? null;
  const produccion = (prod.entries ?? []).filter((e) => e.status === "registrado");
  const despachos = (desp.entries ?? []).filter((e) => e.status === "registrado");
  const rendAlto = produccion.filter(
    (e) => evaluarRendimiento(e.productType, e.rendimientoPct != null ? Number(e.rendimientoPct) : null).estado === "alto",
  ).length;

  const emitido = new Date();
  const fecha = emitido.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const nroInf = `INF-CTP-${emitido.getFullYear()}${String(emitido.getMonth() + 1).padStart(2, "0")}${String(emitido.getDate()).padStart(2, "0")}`;
  const direccion = ficha ? [ficha.direccion, ficha.distrito, ficha.provincia, ficha.region].filter(Boolean).map(esc).join(", ") : "";

  const filasEsp = (saldos?.porEspecie ?? [])
    .map(
      (s) => `<tr>
        <td>${esc(s.especie)}${s.cites ? ' <span class="cites">CITES</span>' : ""}${s.scientific ? `<br/><i class="sci">${esc(s.scientific)}</i>` : ""}</td>
        <td class="mono right">${n4(s.ingresoM3)}</td>
        <td class="mono right">${n4(s.consumidoM3)}</td>
        <td class="mono right ${s.saldoM3 < 0 ? "neg" : ""}">${n4(s.saldoM3)}</td>
      </tr>`,
    )
    .join("") || `<tr><td colspan="4" class="empty">Sin movimientos de materia prima en el período.</td></tr>`;

  const filasProd = (saldos?.productos ?? [])
    .map(
      (p) => `<tr>
        <td>${esc(p.producto)}</td>
        <td class="mono right">${n4(p.producido)}</td>
        <td class="mono right">${n4(p.despachado)}</td>
        <td class="mono right ${p.stock < 0 ? "neg" : ""}">${n4(p.stock)}</td>
      </tr>`,
    )
    .join("") || `<tr><td colspan="4" class="empty">Sin productos transformados en el período.</td></tr>`;

  const filasTit = (ficha?.titulos ?? [])
    .filter((t) => t.codigo || t.tipo)
    .map((t) => `<tr><td>${esc(TITULO_LABEL_INF[t.tipo] ?? t.tipo)}</td><td class="mono">${esc(t.codigo || "—")}</td><td>${vigenciaHtml(t.vencimiento)}</td></tr>`)
    .join("") || `<tr><td colspan="3" class="empty">Sin títulos habilitantes cargados.</td></tr>`;
  const filasCites = (ficha?.citesPermisos ?? [])
    .filter((p) => p.especie || p.numero)
    .map((p) => `<tr><td>${esc(p.especie || "—")}</td><td class="mono">${esc(p.numero || "—")}</td><td>${vigenciaHtml(p.vencimiento)}</td></tr>`)
    .join("");

  const alerta = (label: string, n: number) =>
    `<div class="al"><span>${esc(label)}</span><b class="${n > 0 ? "neg" : "ok"}">${n}</b></div>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe CTP ${esc(nroInf)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; color: #1f2937; font-size: 12px; line-height: 1.5; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px double #14532d; padding-bottom: 10px; }
    .emp { font-size: 16px; font-weight: 700; }
    .meta { font-size: 10px; color: #4b5563; }
    .nro { text-align: right; font-size: 10px; color: #4b5563; }
    .nro b { display: block; font-size: 14px; color: #14532d; font-family: monospace; }
    h1 { text-align: center; font-size: 17px; letter-spacing: 1.5px; color: #14532d; margin: 20px 0 2px; }
    .sub { text-align: center; font-size: 10px; color: #6b7280; margin: 0 0 18px; text-transform: uppercase; letter-spacing: 1px; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
    .kpi { border: 1.5px solid #14532d; border-radius: 8px; padding: 8px 12px; }
    .kpi .l { font-size: 9px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
    .kpi .v { font-size: 17px; font-weight: 700; color: #14532d; font-family: monospace; }
    .box { border: 1.5px solid #14532d; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; }
    .box h2 { font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px; color: #14532d; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #14532d; border-bottom: 1.5px solid #14532d; padding: 4px 6px; }
    td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .mono { font-family: monospace; font-variant-numeric: tabular-nums; }
    .right { text-align: right; }
    .neg { color: #b91c1c; font-weight: 700; }
    .warn { color: #b45309; font-weight: 700; }
    .ok { color: #14532d; }
    .cites { color: #b91c1c; font-weight: 700; font-size: 9px; }
    .sci { color: #6b7280; font-size: 9.5px; }
    .empty { color: #9ca3af; text-align: center; padding: 12px; }
    .al { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #e5e7eb; }
    .al b { font-family: monospace; }
    .firma { margin-top: 40px; display: flex; justify-content: space-between; gap: 40px; }
    .firma div { flex: 1; text-align: center; border-top: 1px solid #374151; padding-top: 6px; font-size: 10px; color: #4b5563; }
    .foot { margin-top: 16px; font-size: 9px; color: #9ca3af; border-top: 1px dashed #d1d5db; padding-top: 8px; }
  </style></head><body>
    <div class="head">
      <div>
        <div class="emp">${esc(ficha?.nombreCtp || ficha?.razonSocial || "Centro de Transformación Primaria")}</div>
        <div class="meta">${ficha?.razonSocial ? `${esc(ficha.razonSocial)} · ` : ""}${ficha?.ruc ? `RUC ${esc(ficha.ruc)}` : ""}</div>
        <div class="meta">Código de CTP: <b>${esc(ficha?.codigoCtp || "—")}</b>${ficha?.arffs ? ` · ${esc(ficha.arffs)}` : ""}</div>
        ${direccion ? `<div class="meta">${direccion}</div>` : ""}
      </div>
      <div class="nro">Informe N°<b>${esc(nroInf)}</b>Emitido ${esc(fecha)}</div>
    </div>

    <h1>INFORME DE OPERACIONES · LIBRO CTP</h1>
    <p class="sub">Período: ${esc(period.label)}</p>

    <div class="kpis">
      <div class="kpi"><div class="l">Ingresos de materia prima</div><div class="v">${stats?.totalCount ?? 0}</div></div>
      <div class="kpi"><div class="l">Volumen ingresado (m³)</div><div class="v">${n4(stats?.totalVolumeM3 ?? 0)}</div></div>
      <div class="kpi"><div class="l">Especies CITES</div><div class="v">${stats?.citesCount ?? 0}</div></div>
      <div class="kpi"><div class="l">Corridas de producción</div><div class="v">${produccion.length}</div></div>
      <div class="kpi"><div class="l">Despachos</div><div class="v">${despachos.length}</div></div>
      <div class="kpi"><div class="l">Materia prima consumida (m³)</div><div class="v">${n4(saldos?.materiaPrima.consumidoM3 ?? 0)}</div></div>
    </div>

    <div class="box">
      <h2>Habilitación legal</h2>
      <table>
        <thead><tr><th>Título habilitante</th><th>N°</th><th>Vencimiento</th></tr></thead>
        <tbody>${filasTit}</tbody>
      </table>
      ${filasCites ? `<table style="margin-top:8px"><thead><tr><th>Permiso CITES · especie</th><th>N°</th><th>Vencimiento</th></tr></thead><tbody>${filasCites}</tbody></table>` : ""}
    </div>

    <div class="box">
      <h2>Existencias de materia prima (por especie)</h2>
      <table>
        <thead><tr><th>Especie</th><th class="right">Ingresado m³</th><th class="right">Consumido m³</th><th class="right">Saldo m³</th></tr></thead>
        <tbody>${filasEsp}</tbody>
      </table>
    </div>

    <div class="box">
      <h2>Stock de productos transformados</h2>
      <table>
        <thead><tr><th>Producto</th><th class="right">Producido</th><th class="right">Despachado</th><th class="right">Stock</th></tr></thead>
        <tbody>${filasProd}</tbody>
      </table>
    </div>

    <div class="box">
      <h2>Estado de cumplimiento del período</h2>
      ${alerta("Ingresos fuera de plazo (>2 días hábiles)", stats?.lateCount ?? 0)}
      ${alerta("Ingresos pendientes de validar", stats?.byStatus?.pendiente ?? 0)}
      ${alerta("Especies con saldo negativo (sobre-consumo)", saldos?.materiaPrima.especiesEnNegativo ?? 0)}
      ${alerta("Productos con stock negativo (sobre-despacho)", (saldos?.productos ?? []).filter((p) => p.stock < 0).length)}
      ${alerta("Despachos sin cadena de custodia completa", traza?.incompletos ?? 0)}
      ${alerta("Corridas con rendimiento sobre referencial SERFOR", rendAlto)}
    </div>

    <div class="firma">
      <div>Responsable del CTP</div>
      <div>Sello y recepción ARFFS</div>
    </div>

    <p class="foot">Informe generado desde el Libro de Operaciones del CTP. Los agregados coinciden con el panel de Cumplimiento y el export del período. No reemplaza el registro en el MC-SNIFFS de SERFOR.</p>
    <script>setTimeout(function(){ window.print(); }, 400);</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití pop-ups para imprimir el informe.");
  w.document.write(html);
  w.document.close();
  w.focus();
}
