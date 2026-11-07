/**
 * El acta imprimible de una inspección de planta (superadmin, fase 3, 17-10).
 *
 * PURA y sin `server-only`: la arma el navegador y la abre `openCtpReport`
 * (`{ title, css, body }`, igual que `actaDelConteo`). Todo texto que viene de
 * la base o del inspector pasa por `esc()`: el reporte es HTML armado a mano y
 * un hallazgo con `<script>` tiene que salir como texto. Las fotos sólo entran
 * si son las que sube la inspección (`esFotoDeInspeccion`), y aun así escapadas.
 *
 * Compara contra el libro CONGELADO al abrir la inspección (`i.libro`), no
 * contra el de hoy. Las cuentas del conteo salen de `resumirConteo` y los
 * faltantes se agrupan con `agruparFaltan` (por especie y por guía): las
 * mismas funciones que el acta del patio de la propia planta.
 */
import { esc } from "@/lib/forestal/ctp-print-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatDateNumeric } from "@/lib/format";
import {
  agruparFaltan,
  codigoDeTroza,
  motivoDeSorpresa,
  resumirConteo,
  type ConteoPatio,
  type GrupoFaltan,
} from "@/lib/forestal/conteo-patio";
import { fechaHoraDelConteo } from "@/lib/forestal/conteo-patio-acta";
import { diaLegible } from "./incoherencias";
import { esFotoDeInspeccion } from "./schemas";
import type { ConteoAserrada, GravedadIncoherencia, HallazgoInspeccion, InspeccionPlanta } from "./tipos";

/** Lo que el acta necesita: la inspección como la devuelve `GET …/inspecciones/[id]`. */
export type InspeccionParaActa = InspeccionPlanta & {
  notas?: string | null;
  motivoAnulacion?: string | null;
  anuladaAt?: string | null;
  conteoPatio?: ConteoPatio | null;
};

const m3 = (v: number | null | undefined): string => (v == null ? "—" : `${fmtM3(v)} m³`);
const entero = (v: number): string => Math.round(v).toLocaleString("es-PE");
const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

const GRAVEDAD: Record<GravedadIncoherencia, { texto: string; clase: string }> = {
  error: { texto: "Grave", clase: "g-error" },
  warning: { texto: "Aviso", clase: "g-aviso" },
  info: { texto: "Nota", clase: "g-nota" },
};
const ORDEN_GRAVEDAD: Record<GravedadIncoherencia, number> = { error: 0, warning: 1, info: 2 };

const CATEGORIA: Record<HallazgoInspeccion["categoria"], string> = {
  volumen: "Volumen",
  documentos: "Documentos",
  trazabilidad: "Trazabilidad",
  seguridad: "Seguridad",
  otro: "Otro",
};

const REFERENCIA: Record<NonNullable<HallazgoInspeccion["referencia"]>["tipo"], string> = {
  guia: "Guía",
  especie: "Especie",
  corrida: "Corrida",
  lote: "Lote",
  troza: "Troza",
};

const ACTA_CSS = `
  .tot{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0 4px}
  .tot div{border:1px solid #e2e9e5;border-radius:10px;padding:10px 12px}
  .tot b{display:block;font-size:22px;font-variant-numeric:tabular-nums}
  .tot span{color:#5c6864;font-size:12px}
  h3{font-size:13.5px;margin:16px 0 4px}
  .vacio{color:#5c6864;font-style:italic}
  .estado{margin:14px 0;padding:14px 18px;border-radius:10px;border:2px solid}
  .estado b{display:block;font-size:30px;letter-spacing:2px;line-height:1.1}
  .estado p{margin:6px 0 0;font-size:16px;font-weight:600}
  .anulada{border-color:#b91c1c;color:#b91c1c;background:#fef2f2}
  .borrador{border-color:#b45309;color:#92400e;background:#fffbeb}
  .g-error{background:#fee2e2;color:#991b1b}
  .g-aviso{background:#fef3c7;color:#92400e}
  .g-nota{background:#e0f2fe;color:#075985}
  .hallazgo{border:1px solid #e2e9e5;border-radius:10px;padding:10px 14px;margin:10px 0;page-break-inside:avoid}
  .hallazgo .cab{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;color:#5c6864}
  .hallazgo .txt{margin:6px 0 0;white-space:pre-wrap}
  .fotos{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
  .fotos img{width:180px;height:135px;object-fit:cover;border-radius:6px;border:1px solid #e2e9e5}
  .parrafo{white-space:pre-wrap;border:1px solid #e2e9e5;border-radius:10px;padding:10px 14px}
`;

/** Una celda `{ num }` va alineada a la derecha, con cifras tabulares. */
type Celda = string | { num: string; neg?: boolean };
const fila = (celdas: Celda[]): string =>
  `<tr>${celdas
    .map((x) => (typeof x === "string" ? `<td>${x}</td>` : `<td class="num${x.neg ? " neg" : ""}">${x.num}</td>`))
    .join("")}</tr>`;
const cabecera = (cols: (string | { num: string })[]): string =>
  `<thead><tr>${cols.map((c) => (typeof c === "string" ? `<th>${c}</th>` : `<th class="num">${c.num}</th>`)).join("")}</tr></thead>`;

/* ── Libro congelado ─────────────────────────────────────────────────────── */

function libroCongelado(i: InspeccionParaActa): string {
  const { trozas, aserrada, movimiento, incoherencias } = i.libro;
  const noLeida = `<span class="muted">No se pudo leer al abrir la inspección</span>`;
  const filas: string[] = [];
  if (trozas) {
    filas.push(
      fila([
        "Trozas en el patio",
        { num: esc(entero(trozas.enPatio.piezas)) },
        { num: esc(m3(trozas.enPatio.m3)) },
        { num: esc(`≈ ${entero(trozas.enPatio.ptAserrable)} pt`) },
      ]),
      fila(["Por recepcionar", { num: esc(entero(trozas.porRecepcionar.piezas)) }, { num: esc(m3(trozas.porRecepcionar.m3)) }, ""]),
      fila([
        esc(`Varadas (más de ${trozas.varadas.dias} días)`),
        { num: esc(entero(trozas.varadas.piezas)) },
        { num: esc(m3(trozas.varadas.m3)) },
        "",
      ]),
    );
  } else {
    filas.push(fila(["Trozas", noLeida, "", ""]));
  }
  if (aserrada) {
    filas.push(
      fila([
        "Aserrada disponible",
        { num: esc(`${entero(aserrada.paquetes)} paq.`) },
        { num: esc(m3(aserrada.disponibleM3)) },
        { num: esc(`≈ ${entero(aserrada.disponiblePt)} pt`) },
      ]),
    );
  } else {
    filas.push(fila(["Aserrada", noLeida, "", ""]));
  }

  const mov = movimiento
    ? `<h3>Movimiento del ${esc(diaLegible(movimiento.periodo.desde))} al ${esc(diaLegible(movimiento.periodo.hasta))}</h3>
<table>${cabecera(["Concepto", { num: "m³" }])}<tbody>
${fila(["Ingresó (rolliza)", { num: esc(m3(movimiento.ingresoM3)) }])}
${fila(["Consumido en corridas", { num: esc(m3(movimiento.consumidoM3)) }])}
${fila(["Producido (aserrada)", { num: esc(m3(movimiento.producidoM3)) }])}
${fila(["Despachado", { num: esc(m3(movimiento.despachadoM3)) }])}
${fila(["Rendimiento", { num: esc(movimiento.rendimientoPct == null ? "—" : `${movimiento.rendimientoPct} %`) }])}
</tbody></table>`
    : `<p class="vacio">El movimiento no se pudo leer al abrir la inspección.</p>`;

  return `<table>${cabecera(["Qué", { num: "Piezas" }, { num: "Volumen" }, { num: "Pies tablares" }])}<tbody>
${filas.join("\n")}
</tbody></table>
${mov}
<p class="muted">Incoherencias del libro al abrir: ${esc(
    `${plural(incoherencias.error, "grave", "graves")} · ${plural(incoherencias.warning, "aviso", "avisos")} · ${plural(
      incoherencias.info,
      "nota",
      "notas",
    )} · ${m3(incoherencias.m3EnJuego)} en juego`,
  )}. Los pies tablares son derivados (≈).</p>`;
}

/* ── Conteo de trozas ────────────────────────────────────────────────────── */

function tablaDeGrupos(titulo: string, columna: string, grupos: GrupoFaltan[]): string {
  if (grupos.length === 0) return "";
  return `<h3>${esc(titulo)}</h3>
<table>${cabecera([esc(columna), { num: "Piezas" }, { num: "m³" }])}<tbody>
${grupos.map((g) => fila([esc(g.clave), { num: esc(entero(g.trozas.length)) }, { num: esc(fmtM3(g.m3)) }])).join("")}
</tbody></table>`;
}

function conteoDeTrozas(i: InspeccionParaActa): string {
  const c = i.conteoPatio;
  if (!c) {
    if (!i.trozas) return `<p class="vacio">No se contaron trozas en esta inspección.</p>`;
    const t = i.trozas;
    return `<div class="tot">
  <div><b>${t.esperadas}</b><span>Esperadas · ${esc(m3(t.m3Esperado))}</span></div>
  <div><b>${t.contadas}</b><span>Encontradas · ${esc(m3(t.m3Contado))}</span></div>
  <div><b>${t.faltantes}</b><span>Faltan</span></div>
  <div><b>${t.sobrantes}</b><span>Sobran</span></div>
</div>
<p class="muted">El detalle del conteo no se pudo leer: sólo quedan las cuentas guardadas.</p>`;
  }

  const r = resumirConteo(c);
  const porEspecie = agruparFaltan(r.faltan, "especie");
  const porGuia = agruparFaltan(r.faltan, "guia");
  const detalle = porEspecie.flatMap((g) => g.trozas);

  const faltan = r.faltan.length
    ? `${tablaDeGrupos("Faltan por especie", "Especie", porEspecie)}
${tablaDeGrupos("Faltan por guía", "Guía", porGuia)}
<h3>Cada troza que falta</h3>
<table>${cabecera(["Código", "Especie", "Guía", "Cancha", { num: "m³" }])}<tbody>
${detalle
  .map((t) =>
    fila([
      esc(codigoDeTroza(t)),
      esc(t.especieComun ?? "—"),
      esc(t.gtfNumber ?? "—"),
      esc(t.cancha ?? "—"),
      { num: t.volumenM3 == null ? "—" : esc(fmtM3(t.volumenM3)) },
    ]),
  )
  .join("")}
</tbody></table>`
    : `<p class="vacio">No falta ninguna troza.</p>`;

  const sobran = r.sorpresas.length
    ? `<table>${cabecera(["Código", "Especie", "Guía", "Por qué no se esperaba"])}<tbody>
${r.sorpresas
  .map((s) =>
    fila([
      esc(s.troza ? codigoDeTroza(s.troza) : s.codigo),
      esc(s.troza?.especieComun ?? "—"),
      esc(s.troza?.gtfNumber ?? "—"),
      esc(motivoDeSorpresa(s)),
    ]),
  )
  .join("")}
</tbody></table>`
    : `<p class="vacio">Ninguna.</p>`;

  return `<div class="tot">
  <div><b>${r.total}</b><span>Esperadas · ${esc(m3(r.m3.esperado))}</span></div>
  <div><b>${r.contadas}</b><span>Encontradas · ${esc(m3(r.m3.encontrado))}</span></div>
  <div><b>${r.faltan.length}</b><span>Faltan · ${esc(m3(r.m3.faltan))}</span></div>
  <div><b>${r.sorpresas.length}</b><span>Sobran</span></div>
</div>
${c.truncado ? `<p class="muted">El patio era más grande de lo que se congeló: algún sobrante puede ser una troza que sí estaba.</p>` : ""}
${
  /* «Trozas en el patio» del libro cuenta sólo las libres; el conteo espera también las
     apartadas en un lote sin aserrar, que siguen apiladas (main 17-10: 9 libres, 13 esperadas). */
  i.libro.trozas && i.libro.trozas.enPatio.piezas !== r.total
    ? `<p class="muted">Se esperan ${r.total} y no ${esc(entero(i.libro.trozas.enPatio.piezas))}: el conteo incluye las trozas apartadas en lotes sin aserrar, que siguen en el patio; el libro las separa de las libres.</p>`
    : ""
}
<h3>Faltan (${r.faltan.length})</h3>
${faltan}
<h3>Sobran: el libro dice que no están (${r.sorpresas.length})</h3>
${sobran}`;
}

/* ── Aserrada contada ────────────────────────────────────────────────────── */

function aserradaContada(filas: readonly ConteoAserrada[]): string {
  if (filas.length === 0) return `<p class="vacio">No se contó aserrada en esta inspección.</p>`;
  const dif = (contado: number | null, libro: number | null): Celda => {
    if (contado == null || libro == null) return { num: "—" };
    const d = Math.round((contado - libro) * 1000) / 1000;
    return { num: esc(d > 0 ? `+${fmtM3(d)}` : fmtM3(d)), neg: d < 0 };
  };
  return `<table>${cabecera([
    "Producto",
    "Especie",
    { num: "Libro m³" },
    { num: "Contado m³" },
    { num: "Diferencia" },
    { num: "Libro piezas" },
    { num: "Contado piezas" },
  ])}<tbody>
${filas
  .map((a) =>
    fila([
      esc(a.producto),
      esc(a.especie ?? "—"),
      { num: esc(fmtM3(a.libroM3)) },
      { num: a.contadoM3 == null ? "—" : esc(fmtM3(a.contadoM3)) },
      dif(a.contadoM3, a.libroM3),
      { num: a.libroPiezas == null ? "—" : esc(entero(a.libroPiezas)) },
      { num: a.contadoPiezas == null ? "—" : esc(entero(a.contadoPiezas)) },
    ]),
  )
  .join("")}
</tbody></table>
<p class="muted">Diferencia = contado − libro (sin contar = «—»).</p>`;
}

/* ── Hallazgos ───────────────────────────────────────────────────────────── */

function hallazgos(lista: readonly HallazgoInspeccion[]): string {
  if (lista.length === 0) return `<p class="vacio">Sin hallazgos.</p>`;
  return [...lista]
    .sort((a, b) => ORDEN_GRAVEDAD[a.gravedad] - ORDEN_GRAVEDAD[b.gravedad])
    .map((h) => {
      const g = GRAVEDAD[h.gravedad];
      const fotos = h.fotos.filter(esFotoDeInspeccion);
      const ref = h.referencia ? ` · ${esc(REFERENCIA[h.referencia.tipo])} ${esc(h.referencia.valor)}` : "";
      return `<div class="hallazgo">
  <div class="cab"><span class="badge ${g.clase}">${g.texto}</span><span>${esc(CATEGORIA[h.categoria])}${ref}${
        h.m3 == null ? "" : ` · ${esc(m3(h.m3))}`
      }</span></div>
  <p class="txt">${esc(h.texto)}</p>
  ${
    fotos.length
      ? `<div class="fotos">${fotos.map((u, n) => `<img src="${esc(u)}" alt="${esc(`Foto ${n + 1} del hallazgo`)}" loading="eager">`).join("")}</div>`
      : ""
  }
</div>`;
    })
    .join("");
}

/* ── El acta ─────────────────────────────────────────────────────────────── */

export function actaDeInspeccion(
  i: InspeccionParaActa,
  planta: { nombre: string },
): { title: string; css: string; body: string } {
  const estado =
    i.estado === "anulada"
      ? `<div class="estado anulada"><b>ANULADA</b><p>${esc(i.motivoAnulacion?.trim() || "Sin motivo registrado")}</p>${
          i.anuladaAt ? `<span class="muted">${esc(fechaHoraDelConteo(i.anuladaAt))}</span>` : ""
        }</div>`
      : i.estado === "abierta"
        ? `<div class="estado borrador"><b>BORRADOR</b><p>La inspección sigue abierta: lo que dice esta acta todavía puede cambiar.</p></div>`
        : "";

  const graves = i.hallazgosDetalle.filter((h) => h.gravedad === "error").length;
  const body = `
<h1>Acta de inspección de planta</h1>
<p class="sub">${esc(planta.nombre)} · Compara lo que se vio en la planta contra el libro congelado al abrir la inspección. No mueve saldos.</p>
${estado}
<div class="id">
  <div><span class="k">Planta:</span> ${esc(planta.nombre)}</div>
  <div><span class="k">Fecha:</span> ${esc(diaLegible(i.fecha))}</div>
  <div><span class="k">Inspector:</span> ${esc(i.inspector)}</div>
  <div><span class="k">Responsable:</span> ${esc(i.responsablePlanta?.trim() || "—")}</div>
  <div><span class="k">Libro congelado:</span> ${esc(fechaHoraDelConteo(i.libro.tomadaEn))}</div>
  <div><span class="k">Cerrada:</span> ${esc(i.cerradaAt ? fechaHoraDelConteo(i.cerradaAt) : "—")}</div>
</div>
${i.notas?.trim() ? `<p class="muted">Notas al abrir: ${esc(i.notas.trim())}</p>` : ""}
<h2>El libro al abrir la inspección</h2>
${libroCongelado(i)}
<h2>Conteo de trozas</h2>
${conteoDeTrozas(i)}
<h2>Aserrada contada contra el libro</h2>
${aserradaContada(i.aserrada)}
<h2>Hallazgos (${i.hallazgosDetalle.length}${graves ? ` · ${plural(graves, "grave", "graves")}` : ""})</h2>
${hallazgos(i.hallazgosDetalle)}
<h2>Conclusión</h2>
${i.conclusion?.trim() ? `<div class="parrafo">${esc(i.conclusion.trim())}</div>` : `<p class="vacio">Sin conclusión escrita.</p>`}
<div class="firma"><div>${esc(i.inspector)}<br>Inspector</div><div>${esc(i.responsablePlanta?.trim() || "")}<br>Responsable de la planta</div></div>
<p class="foot">Acta generada desde el superadmin (Plantas forestales › Inspecciones). Inspección ${esc(i.id)}.</p>`;

  return {
    title: `Inspección de planta · ${planta.nombre} · ${formatDateNumeric(`${i.fecha}T12:00:00-05:00`)}`,
    css: ACTA_CSS,
    body,
  };
}
