"use client";

/**
 * loth-informe-permiso-print — «Informe del permiso»: el PDF de lo que «Control
 * del permiso» muestra en pantalla, para entregarlo a la ARFFS / OSINFOR.
 *
 * Por qué es un informe APARTE y no una sección de `loth-informe-print`:
 *  · ese es el informe del LIBRO (embudo bosque→producto y balance por guía,
 *    sobre `/plan?analytics=1`, con su propio fetch); éste es el del PERMISO
 *    (ficha + saldo + cuadre + trozas), y se arma con lo que la pantalla ya
 *    calculó. Sin fetch propio: lo impreso y lo visto salen de las MISMAS
 *    funciones puras (`construirFichaPermiso`, `saldoPorEspecie`,
 *    `cuadrarGuias`, `construirTablero`) y no pueden decir cifras distintas.
 *  · Meterlo en el otro lo obligaría a pedir el tablero, las guías y los planes
 *    que el informe del libro no necesita, y mezclaría dos preguntas.
 *  Sí se comparten `ctp-print-shared` (esc, ventana, CSS base) y el CSS
 *  (`INFORME_LOTH_CSS`).
 *
 * Reglas del papel: todo dato pasa por `esc()`; sin dato, «—» — nunca «0»; los
 * m³ con tres decimales como el libro (cuatro en el cuadre, donde la guía
 * declara 6,6102 y las trozas suman 6,610).
 */

import { esc, openCtpReport } from "./ctp-print-shared";
import { INFORME_LOTH_CSS } from "./loth-informe-print";
import {
  construirFichaPermiso,
  fechaDelPermiso,
  nombreDelPlan,
  type CaratulaFicha,
  type PlanFicha,
  type PlanFichaApi,
} from "./loth-ficha-permiso";
import { VEREDICTOS_META, VEREDICTOS_ROJOS, contarVeredictos, type CuadreGuia } from "./loth-cuadre-guias";
import { ordenarSaldo, type SaldoDelPlan } from "./loth-saldo-especie";
import { ESTADOS_META, resumirTablero, type TrozaTablero } from "./loth-tablero-trozas";
import { hoyDelLibro } from "./vigencia-avisos";

export interface DatosInformePermiso {
  caratula: CaratulaFicha | null;
  /** El plan contra el que se mide la ficha grande (el del libro, o el primero vivo). */
  plan: PlanFicha | null;
  /** Planes vivos, el del libro primero. */
  planes: readonly PlanFichaApi[];
  saldo: SaldoDelPlan;
  /** `null` = no se pudieron leer las guías: el cuadre no se hizo. */
  cuadre: readonly CuadreGuia[] | null;
  trozas: readonly TrozaTablero[];
  ahora?: Date | number;
}

const SIN = "—";

/** `null`/vacío → «—». Nunca «0» para un dato que falta. */
const t = (v: string | null | undefined): string => {
  const s = (v ?? "").trim();
  return s ? esc(s) : SIN;
};
const fmt = (v: number | null | undefined, min: number, max: number): string =>
  v == null || !Number.isFinite(v) ? SIN : v.toLocaleString("es-PE", { minimumFractionDigits: min, maximumFractionDigits: max });
const m3 = (v: number | null | undefined) => fmt(v, 3, 3);
/** Cuadre: la guía declara hasta 4 decimales; no se redondea lo que se compara. */
const m3c = (v: number | null | undefined) => fmt(v, 3, 4);
const pct = (v: number | null | undefined) => (v == null ? SIN : `${fmt(v, 1, 1)} %`);
const fecha = (v: string | null | undefined) => fechaDelPermiso(v) ?? SIN;
const plural = (n: number, s: string, p: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? s : p}`;

/** Días hasta el fin de la vigencia, redactados; sin fecha, «—». */
function diasTexto(dias: number | null): string {
  if (dias == null) return SIN;
  if (dias < 0) return `venció hace ${plural(Math.abs(dias), "día", "días")}`;
  return plural(dias, "día", "días");
}

/** «PO · Tornillo»: el tipo solo no distingue dos planes sin número. */
const nombrePlan = (p: PlanFichaApi): string => {
  const n = nombreDelPlan(p);
  return p.alias && !n.includes(p.alias) ? `${n} · ${p.alias}` : n;
};

const fila = (k: string, v: string | null | undefined) => `<div><span class="k">${esc(k)}</span> ${t(v)}</div>`;
const celda = (v: string | null | undefined, clase = "") => `<td${clase ? ` class="${clase}"` : ""}>${t(v)}</td>`;
const celdaNum = (texto: string, neg = false) => `<td class="num${neg ? " neg" : ""}">${texto}</td>`;

const CSS = `
    ${INFORME_LOTH_CSS}
    thead{display:table-header-group}
    table.denso{font-size:11.5px}
    table.denso th,table.denso td{padding:5px 7px}
    tr.total td{font-weight:800;background:#eef4f0;border-top:2px solid #cfe0d7}
    .v-rojo{color:#842029;font-weight:700}
    .v-ok{color:#0f5132;font-weight:700}
    .v-aviso{color:#8a5a00;font-weight:700}
    ul.falta{margin:6px 0 0;padding-left:18px;font-size:12.5px}
    ul.falta li{margin:3px 0}
    .firma{page-break-inside:avoid}
  `;

/* ── 1 · Ficha y planes vivos ───────────────────────────────────────────── */

function seccionFicha(d: DatosInformePermiso, ahora: Date | number): string {
  const f = construirFichaPermiso(d.caratula, d.plan, ahora);
  const res = f.resolucion ? `${f.resolucion}${f.resolucionFecha ? ` · ${f.resolucionFecha}` : ""}` : null;
  const vigencia =
    f.vigenciaDesde || f.vigenciaHasta ? `${f.vigenciaDesde ?? SIN} → ${f.vigenciaHasta ?? SIN}` : null;
  const ficha = `<div class="id">
    ${fila("Titular:", f.titular)}
    ${fila("Título habilitante:", f.titulo)}
    ${fila("RUC:", f.ruc)}
    ${fila("Representante legal:", f.representante)}
    ${fila("Documento de gestión:", f.documentoGestion)}
    ${fila("Resolución:", res)}
    ${fila("Registro / Tomo:", f.registro || f.tomo ? [f.registro, f.tomo].filter(Boolean).join(" / ") : null)}
    ${fila("Parcela de corta:", f.parcelaCorta)}
    ${fila("Vigencia:", vigencia)}
    ${fila("Estado:", `${f.estadoTexto}${f.diasQuedan != null ? ` (${diasTexto(f.diasQuedan)})` : ""}`)}
  </div>`;

  const planes =
    d.planes.length === 0
      ? `<p class="muted">No hay planes de manejo vivos cargados.</p>`
      : `<table class="denso">
      <thead><tr><th>Plan</th><th>Parcela</th><th>Vigencia desde</th><th>Vigencia hasta</th><th class="num">Días</th><th>Estado</th></tr></thead>
      <tbody>${d.planes
        .map((p) => {
          const pf = construirFichaPermiso(d.caratula, p, ahora);
          const rojo = pf.estado === "vencido" || pf.estado === "suspendido";
          return `<tr>${celda(nombrePlan(p))}${celda(pf.parcelaCorta)}${celda(pf.vigenciaDesde)}${celda(pf.vigenciaHasta)}${celdaNum(
            diasTexto(pf.diasQuedan),
            pf.diasQuedan != null && pf.diasQuedan < 0,
          )}<td class="${rojo ? "v-rojo" : pf.estado === "vigente" ? "v-ok" : "v-aviso"}">${esc(pf.estadoTexto)}</td></tr>`;
        })
        .join("")}</tbody></table>`;

  return `<h2>1. Ficha del permiso y planes vivos</h2>${ficha}${planes}`;
}

/* ── 2 · Saldo por especie ──────────────────────────────────────────────── */

function seccionSaldo(s: SaldoDelPlan): string {
  if (s.filas.length === 0) {
    return `<h2>2. Saldo por especie</h2><p class="muted">Sin censo ni especies autorizadas en el plan del libro.</p>`;
  }
  const tot = s.totales;
  const cuerpo = ordenarSaldo(s.filas)
    .map((f) => {
      const exc = f.veredicto === "excedido";
      return `<tr>
        <td>${esc(f.especie)}${exc ? ' <span class="v-rojo">excedido</span>' : ""}${f.cupoM3 == null && !f.sinTalar ? ' <span class="v-aviso">sin cupo</span>' : ""}</td>
        ${celdaNum(m3(f.cupoM3))}${celdaNum(m3(f.taladoM3))}${celdaNum(m3(f.saldoPorTalarM3), f.saldoPorTalarM3 != null && f.saldoPorTalarM3 < 0)}
        ${celdaNum(pct(f.pctUsado))}${celdaNum(m3(f.trozadoM3))}${celdaNum(m3(f.despachadoM3))}${celdaNum(m3(f.consumidoM3))}${celdaNum(m3(f.enPatioM3))}
      </tr>`;
    })
    .join("");
  const notas = [
    s.fuera.n > 0 ? `${plural(s.fuera.n, "troza", "trozas")} (${m3(s.fuera.m3)} m³) no pertenece(n) a ninguna especie de este plan.` : "",
    s.sinTrozado > 0 ? `${plural(s.sinTrozado, "troza", "trozas")} sin línea de Trozado: no suman.` : "",
    tot.excesoM3 > 0 ? `Excedido +${m3(tot.excesoM3)} m³ (el exceso de una especie no le presta a otra).` : "",
  ].filter(Boolean);
  return `<h2>2. Saldo por especie</h2>
    <table class="denso">
      <thead><tr><th>Especie</th><th class="num">Autorizado</th><th class="num">Talado</th><th class="num">Saldo por talar</th><th class="num">% usado</th><th class="num">Trozado</th><th class="num">Despachado</th><th class="num">Consumido</th><th class="num">En patio</th></tr></thead>
      <tbody>${cuerpo}
      <tr class="total"><td>Total (${plural(tot.especies, "especie", "especies")})</td>${celdaNum(tot.cupoM3 > 0 ? m3(tot.cupoM3) : SIN)}${celdaNum(m3(tot.taladoM3))}${celdaNum(m3(tot.saldoPorTalarM3))}<td class="num">${SIN}</td>${celdaNum(m3(tot.trozadoM3))}${celdaNum(m3(tot.despachadoM3))}${celdaNum(m3(tot.consumidoM3))}${celdaNum(m3(tot.enPatioM3))}</tr>
      </tbody>
    </table>
    <p class="muted">Volúmenes en m³. Saldo por talar = autorizado − talado; en patio = trozado que no salió ni se consumió.${notas.length ? ` ${notas.map(esc).join(" ")}` : ""}</p>`;
}

/* ── 3 · Cuadre por guía ────────────────────────────────────────────────── */

function seccionCuadre(cuadre: readonly CuadreGuia[] | null): string {
  if (!cuadre) {
    return `<h2>3. Cuadre por guía</h2><p class="flag">No se pudieron leer las guías emitidas: el cuadre no se hizo. Vuelve a generar el informe.</p>`;
  }
  if (cuadre.length === 0) return `<h2>3. Cuadre por guía</h2><p class="muted">Sin guías todavía.</p>`;
  const cont = contarVeredictos(cuadre);
  const resumen = (Object.keys(VEREDICTOS_META) as (keyof typeof cont)[])
    .filter((v) => cont[v] > 0)
    .sort((a, b) => VEREDICTOS_META[a].orden - VEREDICTOS_META[b].orden)
    .map((v) => `${esc(VEREDICTOS_META[v].label)} ${cont[v]}`)
    .join(" · ");
  const cuerpo = cuadre
    .map((g) => {
      const meta = VEREDICTOS_META[g.veredicto];
      const clase = VEREDICTOS_ROJOS.includes(g.veredicto) ? "v-rojo" : g.veredicto === "cuadra" ? "v-ok" : "v-aviso";
      const dif = g.diferenciaM3 == null ? SIN : `${g.diferenciaM3 > 0 ? "+" : ""}${m3c(g.diferenciaM3)}`;
      const piezas =
        g.declaradoPiezas == null && g.libroTrozas === 0
          ? SIN
          : `${g.declaradoPiezas ?? SIN} / ${g.libroTrozas}`;
      return `<tr>
        <td><b>${esc(g.gtf)}</b></td>${celda(g.fecha ? fecha(g.fecha) : null)}${celda(g.placa)}
        ${celdaNum(m3c(g.declaradoM3))}${celdaNum(g.libroTrozas > 0 ? m3c(g.libroM3) : SIN)}${celdaNum(dif, g.veredicto === "no_cuadra")}
        <td class="num">${piezas}</td>
        <td class="${clase}">${esc(meta.label)}</td>
      </tr>`;
    })
    .join("");
  return `<h2>3. Cuadre por guía</h2>
    <p class="muted">${plural(cuadre.length, "guía", "guías")} · ${resumen}</p>
    <table class="denso">
      <thead><tr><th>Guía (GTF)</th><th>Fecha</th><th>Placa</th><th class="num">Declara (m³)</th><th class="num">Libro (m³)</th><th class="num">Diferencia</th><th class="num">Piezas guía / libro</th><th>Veredicto</th></tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>
    <p class="muted">Libro = suma de las trozas de «Despacho de trozas» que citan la guía. Tolerancia de 0,010 m³ (medida con cinta).</p>`;
}

/* ── 4 · Trozas ─────────────────────────────────────────────────────────── */

function seccionTrozas(trozas: readonly TrozaTablero[]): string {
  if (trozas.length === 0) return `<h2>4. Trozas por estado</h2><p class="muted">El libro no tiene trozas todavía.</p>`;
  const resumen = resumirTablero(trozas)
    .filter((r) => r.n > 0)
    .map(
      (r) => `<tr><td>${esc(r.label)}</td>${celdaNum(r.n.toLocaleString("es-PE"))}${celdaNum(r.m3 > 0 ? m3(r.m3) : SIN)}${celda(
        r.sinVolumen > 0 ? `${plural(r.sinVolumen, "troza", "trozas")} sin volumen` : null,
        "muted",
      )}</tr>`,
    )
    .join("");
  const lista = trozas
    .map(
      (z) => `<tr>
        <td><b>${esc(z.code)}</b></td>${celda(z.treeCode)}
        <td>${t(z.especie)}${z.cites ? ' <span class="badge" style="background:#f8d7da;color:#842029">CITES</span>' : ""}</td>
        ${celdaNum(z.volumenM3 != null && z.volumenM3 > 0 ? m3(z.volumenM3) : SIN)}
        <td>${esc(ESTADOS_META[z.estado].label)}</td>${celda(z.gtf)}${celda(z.fechaSalida ? fecha(z.fechaSalida) : null)}${celda(z.placa)}
      </tr>`,
    )
    .join("");
  return `<h2>4. Trozas por estado</h2>
    <table class="denso">
      <thead><tr><th>Estado</th><th class="num">Trozas</th><th class="num">m³</th><th>Observación</th></tr></thead>
      <tbody>${resumen}</tbody>
    </table>
    <h2>Lista completa de trozas (${trozas.length.toLocaleString("es-PE")})</h2>
    <table class="denso">
      <thead><tr><th>Troza</th><th>Árbol</th><th>Especie</th><th class="num">Vol. (m³)</th><th>Estado</th><th>GTF</th><th>Salida</th><th>Placa</th></tr></thead>
      <tbody>${lista}</tbody>
    </table>`;
}

/* ── 5 · Faltantes ──────────────────────────────────────────────────────── */

/** Lo que el permiso todavía no tiene o no cuadra, en frases que un regente lee y sabe qué hacer. */
export function faltantesDelPermiso(d: DatosInformePermiso, ahora: Date | number = Date.now()): string[] {
  const out: string[] = [];
  const f = construirFichaPermiso(d.caratula, d.plan, ahora);
  if (!d.caratula) out.push("No hay carátula del libro.");
  else if (!f.titulo) out.push("La carátula no tiene el título habilitante.");
  if (!d.plan && d.planes.length === 0) out.push("No hay plan de manejo.");
  for (const p of d.planes) {
    const pf = construirFichaPermiso(d.caratula, p, ahora);
    const nombre = nombrePlan(p);
    if (pf.faltantes.some((x) => x.clave === "plan-vigencia")) out.push(`Plan «${nombre}» sin vigencia.`);
    if (pf.faltantes.some((x) => x.clave === "plan-parcela")) out.push(`Plan «${nombre}» sin parcela de corta.`);
    if (pf.estado === "vencido") out.push(`Plan «${nombre}» vencido.`);
  }
  if (d.cuadre == null) out.push("No se pudieron leer las guías: el cuadre no se hizo.");
  else {
    for (const g of d.cuadre) {
      if (g.veredicto === "citada_sin_registrar") out.push(`Guía ${g.gtf} citada en el libro, sin registrar.`);
      else if (g.veredicto === "anulada_citada") out.push(`Guía ${g.gtf} anulada y citada por el libro.`);
      else if (g.veredicto === "no_cuadra") out.push(`Guía ${g.gtf} no cuadra con las trozas del libro.`);
      else if (g.veredicto === "sin_volumen") out.push(`Guía ${g.gtf}: falta volumen, no se puede cuadrar.`);
    }
  }
  const sinTrozado = d.trozas.filter((z) => z.estado === "fantasma").length;
  if (sinTrozado > 0) out.push(`${plural(sinTrozado, "troza", "trozas")} sin línea de Trozado que la respalde.`);
  const sinVol = d.trozas.filter((z) => z.estado !== "fantasma" && !(z.volumenM3 != null && z.volumenM3 > 0)).length;
  if (sinVol > 0) out.push(`${plural(sinVol, "troza", "trozas")} sin volumen registrado.`);
  for (const e of d.saldo.filas) if (e.veredicto === "excedido") out.push(`Especie ${e.especie} excedida sobre lo autorizado.`);
  return out;
}

function seccionFaltantes(d: DatosInformePermiso, ahora: Date | number): string {
  const l = faltantesDelPermiso(d, ahora);
  return `<h2>5. Faltantes</h2>${
    l.length === 0
      ? `<p class="ok">✓ Sin faltantes: carátula, plan, vigencia y guías están completos.</p>`
      : `<ul class="falta">${l.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
  }`;
}

/* ── Documento ──────────────────────────────────────────────────────────── */

/** El HTML del cuerpo y su CSS, sin abrir nada: lo que se testea. */
export function construirInformePermiso(d: DatosInformePermiso): { css: string; body: string } {
  const ahora = d.ahora ?? Date.now();
  const f = construirFichaPermiso(d.caratula, d.plan, ahora);
  const hoy = fechaDelPermiso(hoyDelLibro(ahora)) ?? SIN;

  const body = `
    <h1>Informe del permiso · Libro de Operaciones TH</h1>
    <p class="sub">Ficha, saldo por especie, cuadre de guías y trozas del permiso, para fiscalización ARFFS / OSINFOR. Emitido el ${esc(hoy)}.</p>
    ${seccionFicha(d, ahora)}
    ${seccionSaldo(d.saldo)}
    ${seccionCuadre(d.cuadre)}
    ${seccionTrozas(d.trozas)}
    ${seccionFaltantes(d, ahora)}
    <div class="firma">
      <div>Regente forestal<br><span class="muted">Nombre, CIP y firma</span></div>
      <div>Titular${f.titular ? `: ${esc(f.titular)}` : ""}<br><span class="muted">${f.representante ? esc(f.representante) : "Representante legal"}</span></div>
    </div>
    <p class="foot">Informe del permiso generado el ${esc(hoy)} desde el Libro de Operaciones de Títulos Habilitantes (LO-TH),
    con las mismas cifras que «Control del permiso» (Ley 29763, RDE 264-2019). Documento interno de gestión — no
    reemplaza el registro oficial en el SNIFFS.</p>
  `;
  return { css: CSS, body };
}

/**
 * Abre el informe en la ventana de impresión (guardar como PDF). Síncrono: se
 * llama dentro del clic, así el navegador no trata la ventana como pop-up.
 * Lanza si el navegador la bloqueó.
 */
export function imprimirInformePermiso(d: DatosInformePermiso): void {
  const { css, body } = construirInformePermiso(d);
  openCtpReport({ title: "Informe del permiso", css, body });
}
