/**
 * El informe de una PLANTACIÓN del Libro TH (ADR-459, ronda 3).
 *
 * Hoy «Informe de ejecución» trataba a la plantación como un plan de manejo:
 * «Autorizado / Movilizado / Saldo», «Pago por área / derecho» y un «Resumen
 * del censo» vacío. Una plantación registrada no lleva plan de manejo ni censo
 * comercial (D.S. 020-2015-MINAGRI art. 16) ni paga derecho por el volumen de
 * su propia plantación: lo que la identifica es su REGISTRO —especie, volumen,
 * superficie, año— y lo que importa es dónde está hoy ese volumen.
 *
 * Arma el HTML; la ventana la abre `loth-plan-informe.ts` con `openCtpReport`
 * (CSP sin scripts). TODO texto que tipeó alguien pasa por `esc`: el papel se
 * abre en una ventana del MISMO origen que el panel, y un `<script>` en el
 * nombre de una especie correría con la sesión de quien imprime.
 *
 * Las cifras de la tabla salen de `cascadaDelPlan` —la MISMA cuenta que la
 * pestaña «Registro y saldo»—, así el papel y la pantalla nunca dicen números
 * distintos. El ≈ pt es una referencia (56 % aserrable), no lo que declara el
 * libro, y se marca con «≈».
 *
 * PURO: sin fetch ni DOM. Client-safe.
 */

import { esc, idRow } from "./ctp-print-shared";
import { claveEspecie } from "./loth-constants";
import { ptAserrableDeRolliza } from "./loth-restante";
import { cascadaDelPlan, type CascadaEspecie, type FilaBalanceCascada } from "./loth-saldo-cascada";
import { formatDateLong, formatDateNumeric, formatNumber } from "@/lib/format";

/** Lo que hace falta del plan (la forma que devuelve `GET /plan?planId=`). */
export interface PlanDelInforme {
  planType: string;
  planNumber: string | null;
  tituloHabilitante: string | null;
  resolucionNumber: string | null;
  resolucionDate: string | null;
  titularName: string;
  representanteLegal?: string | null;
  regenteName?: string | null;
  regenteRegistro?: string | null;
  arffs: string | null;
  region: string | null;
  provincia?: string | null;
  distrito?: string | null;
  sector?: string | null;
  cuenca?: string | null;
  areaHa: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  alias?: string | null;
  propietarioNombre?: string | null;
  propietarioDocTipo?: string | null;
  propietarioDoc?: string | null;
}

/** Una especie del registro. */
export interface EspecieDelInforme {
  speciesCommon: string;
  speciesScientific: string | null;
  cites: boolean;
  volumenAutorizadoM3: string | number | null;
  arbolesAutorizados: number | null;
  anioInstalacion?: number | null;
  superficieHa?: string | number | null;
}

export interface BalanceDelInforme {
  rows: FilaBalanceCascada[];
  sinRegistrar?: { species: string; taladoM3: number; trozadoM3: number; movilizadoM3: number }[];
}

export interface DatosInformePlantacion {
  plan: PlanDelInforme;
  species: readonly EspecieDelInforme[];
  /** `null` = no se pudo leer el libro: el papel lo dice, no inventa ceros. */
  balance: BalanceDelInforme | null;
  /** Árboles marcados (opcional en una plantación): sólo sale si hay. */
  censo: readonly { estado: string; count: number; volumenEstimadoM3: number }[];
  /** Totales por sección del libro, del alcance del plan (`/loth?stats=1&planId=`). */
  movimientos: readonly { section: string; count: number; totalVolumeM3: number }[] | null;
  emitido: Date;
}

const SECCION: Record<string, string> = {
  tala: "Tala",
  trozado: "Trozado",
  despacho_troza: "Despacho de trozas",
  consumo_troza: "Consumo de trozas en el TH",
  producto_terminado: "Producto terminado",
  despacho_producto: "Despacho de producto",
};
const ORDEN_SECCION = Object.keys(SECCION);

const ESTADO_ARBOL: Record<string, string> = { en_pie: "En pie", talado: "Talado", descartado: "Descartado" };

const m3 = (v: number) => formatNumber(v, 3);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fecha = (v: string | null | undefined) => (v ? formatDateNumeric(v, { soloFecha: true }) : "");

/** «≈ 1 234 pt» debajo de un volumen positivo; nada si es 0 o negativo (un ≈pt de un saldo en rojo no significa nada). */
function pt(v: number): string {
  return v > 0 ? `<span class="pt">≈ ${formatNumber(ptAserrableDeRolliza(v), 0)} pt</span>` : "";
}

/** El nombre común sin el científico entre paréntesis («Tornillo (Cedrelinga…)» → «Tornillo»). */
function sinParentesis(nombre: string): string {
  return nombre.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim() || nombre.trim();
}

function celdaEspecie(nombre: string, cientifico: string | null, cites: boolean): string {
  const ci = cientifico?.trim() ? `<span class="sci">${esc(cientifico.trim())}</span>` : "";
  const badge = cites ? ' <span class="badge cites">CITES</span>' : "";
  return `<td><b>${esc(sinParentesis(nombre))}</b>${badge}${ci}</td>`;
}

function fila(e: EspecieDelInforme | null, c: CascadaEspecie, conConsumo: boolean, total = false): string {
  const tag = total ? "th" : "td";
  const anio = e?.anioInstalacion != null ? String(e.anioInstalacion) : total ? "" : "—";
  const sup = e?.superficieHa != null && String(e.superficieHa) !== "" ? formatNumber(num(e.superficieHa), 2) : total ? "" : "—";
  const arb = e?.arbolesAutorizados != null ? formatNumber(e.arbolesAutorizados, 0) : total ? "" : "—";
  const pct = c.pctTalado != null ? `<span class="pt">${formatNumber(c.pctTalado, 1)} %</span>` : "";
  const exc = c.excedido ? " neg" : "";
  return `<tr${c.excedido && !total ? ' class="excedido"' : ""}>
    ${total ? `<th>Total</th>` : celdaEspecie(c.especie, e?.speciesScientific ?? null, c.cites)}
    <${tag} class="num">${anio}</${tag}>
    <${tag} class="num">${sup}</${tag}>
    <${tag} class="num">${arb}</${tag}>
    <${tag} class="num">${m3(c.baseM3)}${pt(c.baseM3)}</${tag}>
    <${tag} class="num${exc}">${m3(c.taladoM3)}${pct}</${tag}>
    <${tag} class="num${c.enPieM3 < 0 ? " neg" : ""}">${m3(c.enPieM3)}${pt(c.enPieM3)}</${tag}>
    <${tag} class="num">${m3(c.taladoSinTrozarM3)}</${tag}>
    <${tag} class="num">${m3(c.enPatioM3)}</${tag}>
    <${tag} class="num${exc}">${m3(c.despachadoM3)}</${tag}>
    ${conConsumo ? `<${tag} class="num">${m3(c.consumidoM3)}</${tag}>` : ""}
  </tr>`;
}

/**
 * Las filas de la cascada. Sin el libro, cada especie sale con lo registrado y
 * el resto en cero: el papel lo avisa arriba de la tabla para que nadie lea
 * «talado 0» como un dato.
 */
function filasDeBalance(species: readonly EspecieDelInforme[], balance: BalanceDelInforme | null): FilaBalanceCascada[] {
  if (balance?.rows?.length) return balance.rows;
  return species.map((s) => ({
    species: s.speciesCommon,
    cites: s.cites,
    autorizado: num(s.volumenAutorizadoM3),
    talado: 0,
    trozado: 0,
    movilizado: 0,
    consumido: 0,
  }));
}

/** La tabla por especie: lo registrado y dónde está hoy ese volumen. */
function tablaPorEspecie(species: readonly EspecieDelInforme[], balance: BalanceDelInforme | null): string {
  if (species.length === 0) {
    return `<p class="flag">El registro no tiene especies cargadas. Agrégalas en Libro TH → Plan de manejo → Registro y saldo: sin ellas el libro no sabe cuánto descuenta.</p>`;
  }
  const cascada = cascadaDelPlan(filasDeBalance(species, balance));
  const porClave = new Map(species.map((s) => [claveEspecie(s.speciesCommon), s]));
  const conConsumo = cascada.total.consumidoM3 > 0;
  const cuerpo = cascada.especies.map((c) => fila(porClave.get(claveEspecie(c.especie)) ?? null, c, conConsumo)).join("");
  const supTotal = species.reduce((a, s) => a + num(s.superficieHa), 0);
  const arbTotal = species.some((s) => s.arbolesAutorizados == null) ? null : species.reduce((a, s) => a + (s.arbolesAutorizados ?? 0), 0);
  const total = fila(
    { speciesCommon: "Total", speciesScientific: null, cites: false, volumenAutorizadoM3: null, arbolesAutorizados: arbTotal, superficieHa: supTotal > 0 ? supTotal : null },
    cascada.total,
    conConsumo,
    true,
  );

  const aviso = !balance
    ? `<p class="flag">No se pudo leer el Libro TH al armar el informe: lo talado, el patio y lo despachado salen en cero. Vuelve a generarlo antes de presentarlo.</p>`
    : "";
  return `${aviso}<table class="cascada">
    <thead><tr>
      <th>Especie</th><th class="num">Año inst.</th><th class="num">Sup. ha</th><th class="num">Árboles</th>
      <th class="num">Registrado m³</th><th class="num">Talado m³</th><th class="num">En pie m³</th>
      <th class="num">Talado sin trozar</th><th class="num">Trozas en patio</th><th class="num">Despachado m³</th>
      ${conConsumo ? '<th class="num">Consumido en el TH</th>' : ""}
    </tr></thead>
    <tbody>${cuerpo}</tbody>
    <tfoot>${total}</tfoot>
  </table>
  <p class="muted">Cada casillero resta del anterior: en pie = registrado − talado; sin trozar = talado − trozado; en patio = trozado − despachado como troza − consumido. La misma madera pasa por la tala, el trozado y el despacho: las columnas no se suman entre sí. «≈ pt» es pie tablar aserrable de referencia (56 % del m³ en rollizo); el libro declara m³.</p>`;
}

function resumen(species: readonly EspecieDelInforme[], balance: BalanceDelInforme | null): string {
  if (species.length === 0) return "";
  const t = cascadaDelPlan(filasDeBalance(species, balance)).total;
  const caja = (k: string, v: number, extra = "") =>
    `<div class="tile"><span class="k">${k}</span><b>${m3(v)} m³</b>${pt(v)}${extra}</div>`;
  const pct = t.pctTalado != null ? `<span class="pt">${formatNumber(t.pctTalado, 1)} % de lo registrado</span>` : "";
  return `<div class="tiles">
    ${caja("Registrado", t.baseM3)}
    ${caja("Talado", t.taladoM3, pct)}
    ${caja("En pie", t.enPieM3)}
    ${caja("Despachado con guía", t.despachadoM3)}
  </div>`;
}

function sinRegistrar(balance: BalanceDelInforme | null): string {
  const lista = (balance?.sinRegistrar ?? []).filter((s) => s.taladoM3 + s.trozadoM3 + s.movilizadoM3 > 0);
  if (lista.length === 0) return "";
  const filas = lista
    .map((s) => `<tr><td>${esc(s.species)}</td><td class="num">${m3(s.taladoM3)}</td><td class="num">${m3(s.trozadoM3)}</td><td class="num">${m3(s.movilizadoM3)}</td></tr>`)
    .join("");
  return `<h2>Movimientos de especies que no están en el registro</h2>
  <p class="flag">El libro tiene madera de ${lista.length === 1 ? "una especie" : `${lista.length} especies`} que el registro de la plantación no tiene. Agrégala al registro (Plan de manejo → Registro y saldo) o corrige la línea del libro.</p>
  <table><thead><tr><th>Especie</th><th class="num">Talado m³</th><th class="num">Trozado m³</th><th class="num">Despachado m³</th></tr></thead><tbody>${filas}</tbody></table>`;
}

function arbolesMarcados(censo: DatosInformePlantacion["censo"]): string {
  const conDatos = censo.filter((c) => c.count > 0);
  if (conDatos.length === 0) return "";
  const filas = conDatos
    .map((c) => `<tr><td>${esc(ESTADO_ARBOL[c.estado] ?? c.estado)}</td><td class="num">${formatNumber(c.count, 0)}</td><td class="num">${m3(c.volumenEstimadoM3)}</td></tr>`)
    .join("");
  return `<h2>Árboles marcados</h2>
  <table><thead><tr><th>Estado del árbol</th><th class="num">N° de árboles</th><th class="num">Volumen estimado m³</th></tr></thead><tbody>${filas}</tbody></table>`;
}

function movimientos(lista: DatosInformePlantacion["movimientos"]): string {
  if (lista == null) return `<h2>Movimientos del libro</h2><p class="muted">No se pudieron leer los movimientos del libro.</p>`;
  const orden = [...lista].sort((a, b) => ORDEN_SECCION.indexOf(a.section) - ORDEN_SECCION.indexOf(b.section));
  const filas = orden
    .map((s) => `<tr><td>${esc(SECCION[s.section] ?? s.section)}</td><td class="num">${formatNumber(s.count, 0)}</td><td class="num">${m3(s.totalVolumeM3)}</td></tr>`)
    .join("");
  return `<h2>Movimientos del libro de esta plantación</h2>
  <table><thead><tr><th>Sección</th><th class="num">N° de líneas</th><th class="num">Volumen m³</th></tr></thead>
  <tbody>${filas || '<tr><td colspan="3">Sin movimientos en el libro.</td></tr>'}</tbody></table>
  <p class="muted">Cuenta las líneas anotadas en esta plantación y las que no tienen permiso elegido.</p>`;
}

function datosDelRegistro(p: PlanDelInforme, emitido: Date): string {
  const ubicacion = [p.region, p.provincia, p.distrito, p.sector, p.cuenca].map((x) => (x ?? "").trim()).filter(Boolean).join(" · ");
  const propietario = [p.propietarioNombre, [p.propietarioDocTipo, p.propietarioDoc].filter(Boolean).join(" ")].map((x) => (x ?? "").trim()).filter(Boolean).join(" — ");
  const regente = [p.regenteName, p.regenteRegistro ? `registro ${p.regenteRegistro}` : ""].map((x) => (x ?? "").trim()).filter(Boolean).join(" — ");
  const periodo = p.vigenciaDesde || p.vigenciaHasta ? `${fecha(p.vigenciaDesde) || "—"} → ${fecha(p.vigenciaHasta) || "—"}` : "";
  const titulo = p.tituloHabilitante?.trim() && p.tituloHabilitante.trim() !== (p.planNumber ?? "").trim() ? p.tituloHabilitante : "";
  return `<div class="id">${[
    idRow("Código del registro:", p.planNumber ?? "sin código"),
    idRow("Constancia:", p.resolucionNumber ?? ""),
    idRow("Inscrito el:", fecha(p.resolucionDate)),
    idRow("Superficie:", p.areaHa ? `${formatNumber(num(p.areaHa), 2)} ha` : ""),
    idRow("Titular:", p.titularName),
    idRow("Representante legal:", p.representanteLegal ?? ""),
    idRow("Propietario del predio:", propietario),
    idRow("Regente forestal:", regente),
    idRow("Autoridad (ARFFS):", p.arffs ?? ""),
    idRow("Ubicación:", ubicacion),
    idRow("Nombre corto:", p.alias ?? ""),
    idRow("Título habilitante:", titulo ?? ""),
    idRow("Aprovechamiento:", periodo),
    idRow("Emitido el:", formatDateLong(emitido)),
  ].join("")}</div>`;
}

const CSS = `
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0 4px}
  .tile{border:1px solid #e2e9e5;border-radius:10px;padding:9px 11px;background:#fbfcfb}
  .tile .k{display:block;color:#5c6864;font-size:11px;font-weight:700}
  .tile b{display:block;font-size:16px;color:#0f5132;font-variant-numeric:tabular-nums}
  .pt{display:block;color:#6b7570;font-size:10px;font-weight:400;white-space:nowrap}
  .sci{display:block;color:#5c6864;font-size:10.5px;font-style:italic;font-weight:400}
  .badge.cites{background:#f8d7da;color:#842029}
  table.cascada{font-size:11px}
  table.cascada th{font-size:9.5px;text-transform:none;letter-spacing:0;padding:6px 5px;vertical-align:bottom}
  table.cascada td{padding:6px 5px}
  table.cascada tfoot th{background:#eef4f0;font-size:11px;color:#1f2421;text-align:right;vertical-align:top}
  table.cascada tfoot th:first-child{text-align:left}
  tr.excedido td{background:#fdecec !important}
  .flag{color:#842029;background:#f8d7da;border:1px solid #f1aeb5;border-radius:8px;padding:10px 12px;font-size:12px}
  .legal{background:#f5f8f6;border:1px solid #e2e9e5;border-radius:8px;padding:9px 12px;font-size:11.5px;color:#3d4a43}
  @media print{.tiles{gap:6px}.tile{padding:7px 9px}}
`;

/** El informe entero: título, CSS propio y cuerpo para `openCtpReport`. */
export function informePlantacionHtml(d: DatosInformePlantacion): { title: string; css: string; body: string } {
  const p = d.plan;
  const codigo = p.planNumber?.trim() || "sin código";
  const body = `
    <h1>Informe del registro de plantación</h1>
    <p class="sub">Lo registrado por especie y dónde está hoy ese volumen según el Libro de Operaciones del título habilitante (LO-TH). Documento interno de gestión.</p>
    ${datosDelRegistro(p, d.emitido)}
    <h2>Volumen por especie</h2>
    ${resumen(d.species, d.balance)}
    ${tablaPorEspecie(d.species, d.balance)}
    ${sinRegistrar(d.balance)}
    ${arbolesMarcados(d.censo)}
    ${movimientos(d.movimientos)}
    <p class="legal">Plantación registrada: no lleva plan de manejo ni censo comercial (D.S. 020-2015-MINAGRI art. 16; en tierra comunal, D.S. 021-2015-MINAGRI art. 88). El saldo se mide contra el volumen registrado por especie.</p>
    <div class="firma"><div>Titular de la plantación</div><div>Regente forestal</div></div>
    <p class="foot">Informe del registro de plantación ${esc(codigo)}, generado desde el Libro de Operaciones de Títulos Habilitantes (Ley 29763, RDE 264-2019). Documento interno de gestión: no reemplaza la constancia del Registro Nacional de Plantaciones Forestales ni el registro en el SNIFFS.</p>
  `;
  return { title: `Informe de la plantación ${codigo}`, css: CSS, body };
}
