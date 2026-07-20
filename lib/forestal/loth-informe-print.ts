"use client";

/**
 * loth-informe-print — Informe periódico del Libro TH para presentar a la ARFFS /
 * OSINFOR. Documento imprimible (PDF) que resume el aprovechamiento del período:
 * identidad del titular + embudo bosque→producto + balance vs. autorizado por
 * especie + estado de cumplimiento.
 *
 * Self-contained: hace su propio fetch de `/plan?analytics=1` + la carátula.
 * Reusa los primitivos de `ctp-print-shared` (genéricos) + la identidad de la
 * carátula del LO-TH. Misma fuente que la Analítica y el panel Cumplimiento →
 * nunca dicen números distintos ante un fiscalizador.
 */

import { esc, idRow, openCtpReport } from "./ctp-print-shared";

interface BalanceRow {
  species: string;
  cites: boolean;
  autorizado: number;
  talado: number;
  movilizado: number;
  saldo: number;
  pctMovilizado: number;
  exceso: boolean;
}
interface Analytics {
  plan: { planNumber: string | null; titularName: string; estado: string } | null;
  aprovechamiento: {
    funnel: { taladoM3: number; trozadoM3: number; despachoTrozaM3: number; consumidoM3: number; productoCantidad: number; despachoProductoM3: number };
    rendimientoGlobalPct: number;
    bySpecies: { species: string; cites: boolean; taladoM3: number; trozadoM3: number; rendimientoPct: number; mermaM3: number }[];
  };
  balance: { rows: BalanceRow[]; pagoDerechoTotal: number; valorTotal: number } | null;
  anomalias: { level: "error" | "warn"; message: string }[];
}
interface Caratula {
  titularName?: string | null;
  tituloHabilitante?: string | null;
  ruc?: string | null;
  representanteLegal?: string | null;
  resolucionNumber?: string | null;
  docGestionType?: string | null;
  docGestionName?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
}

const n2 = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1 = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export async function printLothInforme(): Promise<void> {
  const [aRes, cRes] = await Promise.all([
    fetch("/api/admin/forestal/plan?analytics=1", { credentials: "include" }).catch(() => null),
    fetch("/api/admin/forestal/loth/caratula", { credentials: "include" }).catch(() => null),
  ]);
  const analytics: Analytics | null = aRes?.ok ? (await aRes.json()).analytics ?? null : null;
  const caratula: Caratula | null = cRes?.ok ? (await cRes.json()).active ?? null : null;

  if (!analytics) throw new Error("No se pudo obtener la analítica del libro para el informe.");

  const c = caratula ?? {};
  const ubic = [c.distrito, c.provincia, c.departamento].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
  const idBlock = `<div class="id">${[
    idRow("Titular:", c.titularName ?? analytics.plan?.titularName ?? ""),
    idRow("Título habilitante:", c.tituloHabilitante ?? ""),
    idRow("RUC:", c.ruc ?? ""),
    idRow("Representante legal:", c.representanteLegal ?? ""),
    idRow("Documento de gestión:", [c.docGestionType, c.docGestionName].filter(Boolean).join(" · ")),
    idRow("Resolución:", c.resolucionNumber ?? ""),
    idRow("Registro / Tomo:", [c.registroNumber, c.tomo].filter(Boolean).join(" / ")),
    idRow("Ubicación:", ubic),
  ]
    .filter(Boolean)
    .join("")}</div>`;

  const f = analytics.aprovechamiento.funnel;
  const movilizado = f.despachoTrozaM3 + f.despachoProductoM3;
  const merma = Math.max(0, f.taladoM3 - f.trozadoM3);
  const funnelTable = `<table>
    <thead><tr><th>Etapa</th><th class="num">Volumen (m³)</th><th>Observación</th></tr></thead>
    <tbody>
      <tr><td>1. Talado (tumba)</td><td class="num">${n2(f.taladoM3)}</td><td class="muted">árboles volteados</td></tr>
      <tr><td>2. Trozado</td><td class="num">${n2(f.trozadoM3)}</td><td class="muted">rendimiento ${n1(analytics.aprovechamiento.rendimientoGlobalPct)}% · merma ${n2(merma)} m³</td></tr>
      <tr><td>3. Movilizado (despacho con GTF)</td><td class="num">${n2(movilizado)}</td><td class="muted">trozas ${n2(f.despachoTrozaM3)} + producto ${n2(f.despachoProductoM3)}</td></tr>
      <tr><td>· Consumo interno</td><td class="num">${n2(f.consumidoM3)}</td><td class="muted">campamento / obras</td></tr>
    </tbody>
  </table>`;

  const balanceTable = analytics.balance && analytics.balance.rows.length > 0
    ? `<table>
        <thead><tr><th>Especie</th><th class="num">Autorizado</th><th class="num">Talado</th><th class="num">Movilizado</th><th class="num">Saldo</th><th class="num">% usado</th></tr></thead>
        <tbody>${analytics.balance.rows
          .map(
            (r) => `<tr>
            <td>${esc(r.species)}${r.cites ? ' <span class="badge" style="background:#f8d7da;color:#842029">CITES</span>' : ""}</td>
            <td class="num">${n2(r.autorizado)}</td>
            <td class="num">${n2(r.talado)}</td>
            <td class="num ${r.exceso ? "neg" : ""}">${n2(r.movilizado)}</td>
            <td class="num ${r.saldo < 0 ? "neg" : ""}">${n2(r.saldo)}</td>
            <td class="num">${n1(r.pctMovilizado)}%${r.exceso ? " ⚠" : ""}</td>
          </tr>`,
          )
          .join("")}</tbody>
      </table>
      <p class="muted">Volúmenes en m³. Pago por derecho de aprovechamiento estimado: S/ ${n2(analytics.balance.pagoDerechoTotal)}.</p>`
    : `<p class="muted">El plan de manejo no declara volúmenes autorizados por especie — sin balance de saldo.</p>`;

  const errores = analytics.anomalias.filter((a) => a.level === "error");
  const warns = analytics.anomalias.filter((a) => a.level === "warn");
  const cumplimiento =
    analytics.anomalias.length === 0
      ? `<p class="ok">✓ Sin anomalías detectadas. El libro es consistente y no registra exceso de aprovechamiento.</p>`
      : `<p class="muted">${errores.length} ${errores.length === 1 ? "bloqueo" : "bloqueos"} · ${warns.length} ${warns.length === 1 ? "advertencia" : "advertencias"}.</p>
         <ul class="anom">${analytics.anomalias
           .map((a) => `<li class="${a.level}"><b>${a.level === "error" ? "BLOQUEO" : "ADVERTENCIA"}:</b> ${esc(a.message)}</li>`)
           .join("")}</ul>`;

  const footer = `<div class="firma">
    <div>Titular / Representante del título habilitante</div>
    <div>Sello y recepción ARFFS / OSINFOR</div>
  </div>
  <p class="foot">Informe periódico del Libro de Operaciones de Títulos Habilitantes (LO-TH), generado desde el
  sistema para la gestión del aprovechamiento forestal maderable (Ley 29763, RDE 264-2019). Documento interno
  de gestión — no reemplaza el registro oficial en el SNIFFS.</p>`;

  const css = `
    .ok{color:#0f5132;font-weight:600;background:#d1e7dd;border-radius:8px;padding:10px 12px}
    ul.anom{margin:6px 0 0;padding-left:18px;font-size:12px}
    ul.anom li{margin:3px 0}
    ul.anom li.error{color:#842029}
    ul.anom li.warn{color:#8a5a00}
  `;

  const body = `
    <h1>Informe de aprovechamiento · Libro de Operaciones TH</h1>
    <p class="sub">Resumen del aprovechamiento forestal maderable en el bosque, para fiscalización ARFFS / OSINFOR.</p>
    ${idBlock}
    <h2>Aprovechamiento (bosque → producto)</h2>
    ${funnelTable}
    <h2>Balance por especie (movilizado vs. autorizado)</h2>
    ${balanceTable}
    <h2>Estado de cumplimiento</h2>
    ${cumplimiento}
    ${footer}
  `;

  openCtpReport({ title: "Informe LO-TH", css, body });
}
