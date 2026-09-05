"use client";

/**
 * ctp-existencias-print.ts — REPORTE DE EXISTENCIAS imprimible del Libro CTP
 * (la hoja «Existencias» del LO-CTP, pero por-tab y como PDF para inspección).
 *
 * Es el saldo que se declara ante SERFOR: materia prima que entra (validada) vs.
 * volumen consumido en producción, balance por especie, conciliación del período
 * (apertura → cierre) y stock de productos transformados. Misma fuente que el
 * panel Saldos (`ForestCtpDB.saldos()` + conciliación). No reemplaza el registro
 * oficial en el MC-SNIFFS; es un documento de referencia.
 *
 * Primitivos comunes (esc, ventana, identidad, CSS base) en `ctp-print-shared`.
 */

import { esc, ctpIdentityBlock, ctpReportFooter, openCtpReport, type CtpReportFicha } from "./ctp-print-shared";

export interface ExistenciasReportData {
  periodLabel: string;
  materiaPrima: {
    ingresoM3: number;
    ingresosCount: number;
    consumidoM3: number;
    saldoM3: number;
    pendienteM3: number;
    especiesEnNegativo: number;
  };
  porEspecie: {
    especie: string;
    scientific: string | null;
    cites: boolean;
    ingresoM3: number;
    pendienteM3: number;
    consumidoM3: number;
    saldoM3: number;
    ingresosCount: number;
  }[];
  productos: { producto: string; producido: number; despachado: number; stock: number }[];
  concil?: {
    fuenteApertura: "cierre" | "calculada" | "sin_apertura";
    aperturaLabel: string | null;
    materiaPrima: { especie: string; cites: boolean; apertura: number; ingreso: number; consumido: number; despachadoDirecto?: number; final: number; negativa: boolean }[];
    productos: { producto: string; apertura: number; producido: number; despachado: number; final: number; negativo: boolean }[];
  } | null;
  ficha?: CtpReportFicha | null;
}

const n2 = (n: number): string => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CSS = `
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:8px 0 4px}
  .stat{border:1px solid #e0e0e0;border-radius:8px;padding:10px 12px;background:#fbfcfb}
  .stat .l{font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;color:#888} .stat .v{font-size:17px;font-weight:800;margin-top:2px} .stat .s{font-size:10.5px;color:#777}
  .cites{display:inline-block;font-size:9.5px;font-weight:700;color:#664d03;background:#fff3cd;border-radius:5px;padding:1px 5px;margin-left:6px;vertical-align:middle}
  .src{font-size:11.5px;color:#666;margin:2px 0 4px}
`;

/** Badge CITES junto al nombre de especie. */
function especieCell(nombre: string, scientific: string | null, cites: boolean): string {
  const sci = scientific ? `<div class="muted" style="font-style:italic;margin-top:1px">${esc(scientific)}</div>` : "";
  return `<b>${esc(nombre)}</b>${cites ? '<span class="cites">CITES</span>' : ""}${sci}`;
}

/** Celda numérica m³ (rojo/negrita si es negativa = sobreconsumo/sobre-despacho). */
function num(v: number, unit = ""): string {
  const neg = v < 0;
  return `<td class="num${neg ? " neg" : ""}">${n2(v)}${unit}</td>`;
}

export function printExistencias(d: ExistenciasReportData): void {
  const fecha = new Date().toLocaleString("es-PE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const mp = d.materiaPrima;

  const especieRows = d.porEspecie
    .map(
      (s) => `<tr>
      <td>${especieCell(s.especie, s.scientific, s.cites)}</td>
      ${num(s.ingresoM3)}${num(s.pendienteM3)}${num(s.consumidoM3)}${num(s.saldoM3)}
    </tr>`,
    )
    .join("");
  const totalIngreso = d.porEspecie.reduce((a, s) => a + s.ingresoM3, 0);
  const totalPend = d.porEspecie.reduce((a, s) => a + s.pendienteM3, 0);
  const totalCons = d.porEspecie.reduce((a, s) => a + s.consumidoM3, 0);
  const totalSaldo = d.porEspecie.reduce((a, s) => a + s.saldoM3, 0);

  const productoRows = d.productos
    .map(
      (p) => `<tr>
      <td><b>${esc(p.producto)}</b></td>
      ${num(p.producido)}${num(p.despachado)}${num(p.stock)}
    </tr>`,
    )
    .join("");

  /* La madera vendida en rollo (ADR-363) también baja del patio. Si hubo, la
     columna va: sin ella, apertura + ingreso − consumido no da el final que se
     imprime y el fiscalizador ve una tabla que no cierra. Si no hubo, no se
     imprime una columna de ceros. */
  const hayDirecto = (d.concil?.materiaPrima ?? []).some((s) => (s.despachadoDirecto ?? 0) > 0.0001);
  const concilBlock =
    d.concil && d.concil.materiaPrima.length > 0
      ? `<h2>Conciliación del período · apertura → cierre</h2>
    <p class="src">Apertura ${
      d.concil.fuenteApertura === "cierre"
        ? `tomada del cierre anterior${d.concil.aperturaLabel ? ` (${esc(d.concil.aperturaLabel)})` : ""}`
        : d.concil.fuenteApertura === "calculada"
          ? "calculada (sin cierre previo registrado)"
          : "sin apertura previa"
    }.</p>
    <table>
      <thead><tr><th>Especie</th><th class="num">Apertura</th><th class="num">Ingreso</th><th class="num">Consumido</th>${
        hayDirecto ? '<th class="num">Salió sin aserrar</th>' : ""
      }<th class="num">Final</th></tr></thead>
      <tbody>${d.concil.materiaPrima
        .map(
          (s) => `<tr>
        <td>${esc(s.especie)}${s.cites ? '<span class="cites">CITES</span>' : ""}</td>
        ${num(s.apertura)}${num(s.ingreso)}${num(s.consumido)}${hayDirecto ? num(s.despachadoDirecto ?? 0) : ""}${num(s.final)}
      </tr>`,
        )
        .join("")}</tbody>
    </table>`
      : "";

  const body = `
  <h1>Reporte de Existencias — Libro de Operaciones CTP</h1>
  <p class="sub">${esc(d.ficha?.nombreCtp || "Centro de Transformación Primaria")} · Período: ${esc(d.periodLabel)} · Generado: ${esc(fecha)}</p>

  ${ctpIdentityBlock(d.ficha, [
    `<div><span class="k">Especies con movimiento:</span> ${d.porEspecie.length}</div>`,
    `<div><span class="k">Productos transformados:</span> ${d.productos.length}</div>`,
  ])}

  <h2>Resumen de materia prima (m³)</h2>
  <div class="stats">
    <div class="stat"><div class="l">Ingresado (validado)</div><div class="v">${n2(mp.ingresoM3)}</div><div class="s">${mp.ingresosCount} ingresos</div></div>
    <div class="stat"><div class="l">Consumido en producción</div><div class="v">${n2(mp.consumidoM3)}</div><div class="s">&nbsp;</div></div>
    <div class="stat"><div class="l">Saldo de materia prima</div><div class="v"${mp.saldoM3 < 0 ? ' style="color:#b91c1c"' : ""}>${n2(mp.saldoM3)}</div><div class="s">${mp.saldoM3 < 0 ? "sobreconsumo" : "disponible"}</div></div>
    <div class="stat"><div class="l">Pendiente de validar</div><div class="v">${n2(mp.pendienteM3)}</div><div class="s">no computa como saldo</div></div>
  </div>

  <h2>Balance por especie (m³)</h2>
  ${
    d.porEspecie.length > 0
      ? `<table>
    <thead><tr><th>Especie</th><th class="num">Ingresado</th><th class="num">Pendiente</th><th class="num">Consumido</th><th class="num">Saldo</th></tr></thead>
    <tbody>${especieRows}</tbody>
    <tfoot><tr style="font-weight:700;background:#f6f8f7">
      <td>Total (${d.porEspecie.length} especie${d.porEspecie.length === 1 ? "" : "s"})</td>
      ${num(totalIngreso)}${num(totalPend)}${num(totalCons)}${num(totalSaldo)}
    </tr></tfoot>
  </table>`
      : `<p style="color:#777">Sin movimientos de madera en ${esc(d.periodLabel)}.</p>`
  }

  ${concilBlock}

  <h2>Stock de productos transformados (m³)</h2>
  ${
    d.productos.length > 0
      ? `<table>
    <thead><tr><th>Producto</th><th class="num">Producido</th><th class="num">Despachado</th><th class="num">Stock</th></tr></thead>
    <tbody>${productoRows}</tbody>
  </table>`
      : `<p style="color:#777">Sin productos transformados todavía.</p>`
  }

  ${ctpReportFooter(
    "Reporte de existencias generado desde el panel Saldos del Libro de Operaciones del CTP. Corresponde a la hoja «Existencias» del LO-CTP (misma fuente de datos). Documento de referencia para inspección — no reemplaza el registro oficial en el MC-SNIFFS de SERFOR.",
  )}`;

  openCtpReport({ title: "Reporte de existencias CTP", css: CSS, body });
}
