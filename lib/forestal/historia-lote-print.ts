"use client";

/**
 * historia-lote-print — el expediente del lote, en papel.
 *
 * Es lo que se le entrega a un comprador que pregunta de dónde salió su madera,
 * y lo que un fiscalizador cruza contra la pila: las cuatro etapas con las
 * piezas una por una, sus guías de ingreso y —cuando ya salió— con qué GTF se
 * fue y junto a qué otros lotes viajó.
 *
 * ⚠️ **Lo que este papel NO hace es rellenar los huecos.** Si una corrida se
 * compartió entre dos lotes, el reparto de lo despachado no existe como dato y
 * acá se imprime como techo, con su aviso. Un documento que promedia para que
 * la tabla cierre es peor que uno incompleto: el incompleto se corrige, el
 * promediado se firma.
 *
 * No reemplaza el registro en el MC-SNIFFS; es documento de referencia.
 */

import { esc, ctpReportFooter, openCtpReport } from "./ctp-print-shared";
import type { HistoriaLote } from "./historia-lote";

const n4 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(4));
const n2 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));
const nf = (v: number) => v.toLocaleString("es-PE");
const unidad = (u: string | null | undefined) => (!u || u === "m3" ? "m³" : u);
const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

const CSS = `
  h2{margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #ccc;padding-bottom:3px}
  .paso{display:flex;gap:18px;margin:8px 0 14px;flex-wrap:wrap}
  .paso div{min-width:120px}
  .paso b{display:block;font-size:15px}
  .paso span{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.05em}
  .aviso{border:1px solid #b45309;background:#fffbeb;padding:6px 9px;margin:6px 0;font-size:11px}
  .vacio{color:#666;font-style:italic;font-size:11px;margin:4px 0}
  .guia{border:1px solid #ddd;padding:8px;margin:6px 0}
`;

export function imprimirHistoriaLote(h: HistoriaLote): void {
  const filaTroza = (t: HistoriaLote["armado"]["trozas"][number]) => `<tr>
    <td>${esc(t.codigoPlanta ?? "—")}</td><td>${esc(t.codificacion ?? "—")}</td>
    <td>${esc(t.gtfNumber ?? "—")}</td><td>${esc(t.permiso ?? "—")}</td>
    <td class="num">${n2(t.d1Cm)}</td><td class="num">${n2(t.d2Cm)}</td>
    <td class="num">${n2(t.largoM)}</td><td class="num">${n4(t.volumenM3)}</td></tr>`;

  const armado = h.armado.piezas
    ? `<table><thead><tr><th>Cód. planta</th><th>Codificación</th><th>GTF</th><th>Permiso</th>
        <th class="num">D1 (cm)</th><th class="num">D2 (cm)</th><th class="num">Largo (m)</th><th class="num">m³</th></tr></thead>
       <tbody>${h.armado.trozas.map(filaTroza).join("")}</tbody>
       <tfoot><tr><td colspan="7"><b>Total · ${nf(h.armado.piezas)} piezas</b></td><td class="num"><b>${n4(h.armado.m3)}</b></td></tr></tfoot></table>`
    : `<p class="vacio">Sin piezas apartadas: el lote se declaró por volumen, no por troza.</p>`;

  const produccion = h.produccion.corridas
    .map(
      (c) => `<div class="guia"><b>Corrida N° ${esc(String(c.lineNo ?? "—"))} · ${esc(c.producto ?? "sin tipo")}</b>
      — ${c.cantidad == null ? "sin declarar" : `${n4(c.cantidad)} ${unidad(c.unit)}`} · ${esc(fecha(c.fecha))}
      ${
        c.paquetes.length
          ? `<table><thead><tr><th>Código</th><th>Producto</th><th>Presentación</th><th class="num">Piezas</th><th class="num">m³</th></tr></thead><tbody>${c.paquetes
              .map(
                (p) =>
                  `<tr><td>${esc(p.codigo ?? "—")}</td><td>${esc(p.productType ?? "—")}</td><td>${esc(p.presentacion ?? "—")}</td><td class="num">${nf(p.cantidad)}</td><td class="num">${n4(p.volumenM3)}</td></tr>`,
              )
              .join("")}</tbody></table>`
          : `<p class="vacio">Sin detalle de paquetes.</p>`
      }</div>`,
    )
    .join("");

  const salida = h.salida.despachos.length
    ? h.salida.despachos
        .map(
          (d) => `<div class="guia">
        <b>GTF ${esc(d.gtfNumber ?? `(línea N° ${d.lineNo ?? "—"})`)}</b>${d.destino ? ` · ${esc(d.destino)}` : ""} · ${esc(fecha(d.fecha))}<br>
        De este lote: <b>${n4(d.deEsteLote)} ${unidad(d.unit)}</b> · Total de la guía: ${n4(d.totalDeLaGuia)} ${unidad(d.unit)}
        ${
          d.companeros.length
            ? `<br>Viajó junto a: ${d.companeros.map((c) => `${esc(c.loteCode ?? "sin lote de aserrío")} (${n4(c.cantidad)})`).join(" · ")}`
            : ""
        }
        ${d.compartida ? `<div class="aviso">Corrida compartida con otro lote: «de este lote» es un TECHO, no una medición. No se prorratea.</div>` : ""}
      </div>`,
        )
        .join("")
    : `<p class="vacio">Nada de este lote salió todavía: ${n4(h.salida.enStock)} ${unidad(null)} siguen en planta.</p>`;

  openCtpReport({
    title: `Historia del lote ${h.lote.code}`,
    css: CSS,
    body: `
  <h1>Historia del lote ${esc(h.lote.code)}</h1>
  <p class="sub">${esc(h.lote.speciesCommon ?? "sin especie")}${h.lote.speciesScientific ? ` · <i>${esc(h.lote.speciesScientific)}</i>` : ""} · estado: ${esc(h.lote.status)} · armado el ${esc(fecha(h.armado.fecha))}</p>

  ${h.huecos.map((x) => `<div class="aviso">${esc(x)}</div>`).join("")}

  <div class="paso">
    <div><span>Se apartó</span><b>${nf(h.armado.piezas)} pz · ${n4(h.armado.m3)} m³</b></div>
    <div><span>Entró a la sierra</span><b>${n4(h.consumo.m3Total)} m³</b></div>
    <div><span>Salió aserrado</span><b>${h.produccion.total ? `${n4(h.produccion.total.cantidad)} ${unidad(h.produccion.total.unit)}` : "—"}</b></div>
    <div><span>Rendimiento</span><b>${h.produccion.rendimientoPct != null ? `${h.produccion.rendimientoPct.toFixed(2)} %` : "—"}</b></div>
    <div><span>Se despachó</span><b>${n4(h.salida.total)} m³</b></div>
  </div>

  <h2>1 · Armado — qué trozas se apartaron</h2>
  ${h.armado.guias.length ? `<p>Guías de ingreso: <b>${h.armado.guias.map(esc).join(" · ")}</b></p>` : ""}
  ${h.armado.fueraDeJuego.length ? `<div class="aviso">Piezas que no pueden ir a la sierra: ${h.armado.fueraDeJuego.map((f) => `${esc(f.codigo)} (${esc(f.motivo)})`).join(" · ")}</div>` : ""}
  ${armado}

  <h2>2 · Consumo — qué entró a la sierra</h2>
  <table><thead><tr><th>Corrida</th><th>Fecha</th><th class="num">m³ de la corrida</th><th class="num">Piezas de este lote</th><th class="num">m³ de este lote</th></tr></thead>
  <tbody>${
    h.consumo.corridas.length
      ? h.consumo.corridas
          .map(
            (c) =>
              `<tr><td>N° ${esc(String(c.lineNo ?? "—"))}${c.abierta ? " (sin declarar)" : ""}</td><td>${esc(fecha(c.fecha))}</td><td class="num">${n4(c.m3)}</td><td class="num">${nf(c.piezasDelLote)}</td><td class="num">${n4(c.m3DelLote)}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="5">Todavía no entró a la sierra.</td></tr>`
  }</tbody></table>

  <h2>3 · Producción — qué salió</h2>
  ${produccion || `<p class="vacio">Todavía no se declaró producción.</p>`}

  <h2>4 · Salida — con qué guía y junto a quién</h2>
  ${salida}

  ${ctpReportFooter(
    "Documento de referencia generado desde el Libro de Operaciones del CTP. No reemplaza el registro en el MC-SNIFFS. Los volúmenes atribuidos a este lote no se prorratean: cuando una corrida se comparte, se declara como techo.",
  )}`,
  });
}
