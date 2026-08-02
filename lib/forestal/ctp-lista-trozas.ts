"use client";

/**
 * LISTA DE TROZAS O CUARTONES A MOVILIZAR — el anexo que acompaña a la GTF.
 *
 * La guía declara el volumen por especie; esta lista dice QUÉ PIEZAS son, con su
 * codificación y sus tres medidas. Es el documento que un puesto de control usa
 * para contar la pila contra el papel, y el casillero (35) de la GTF apunta
 * justamente a su número.
 *
 * ── El volumen NO se recalcula ───────────────────────────────────────────────
 * Sale de `volumenM3` de la troza, que es lo que el libro ya declaró. Si acá se
 * volviera a aplicar Huber, un redondeo distinto haría que la lista y el Libro
 * de Operaciones dijeran volúmenes distintos de la misma pieza — y es
 * exactamente el cruce que hace un fiscalizador. Las dimensiones se imprimen
 * como referencia de lo medido, no como fuente del total.
 */

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface TrozaListada {
  codificacion: string | null;
  especieComun: string | null;
  especieCientifica: string | null;
  producto: string | null;
  /** Diámetros en CENTÍMETROS, como los publica SERFOR en la guía. */
  d1Cm: number | null;
  d2Cm: number | null;
  /** Largo en METROS. */
  largoM: number | null;
  cantidad: number | null;
  volumenM3: number | null;
}

export interface ListaTrozasInput {
  /** Identidad del emisor, del encabezado. */
  titular: string;
  subtitulo?: string;
  ubicacion?: string;
  ruc?: string;
  /** N° de la lista — el mismo que referencia el casillero (35) de la GTF. */
  numero: string;
  trozas: TrozaListada[];
  observaciones?: string;
}

const num = (v: number | null | undefined, dec: number): string =>
  v == null || !Number.isFinite(Number(v)) ? "" : Number(v).toFixed(dec);

/**
 * El total es la suma de lo LISTADO, no del ingreso entero: esta lista ampara
 * las piezas que se están movilizando, y un total que no cierra con las filas
 * es lo primero que un control marca.
 */
export function totalListado(trozas: ReadonlyArray<TrozaListada>): number {
  return Number(trozas.reduce((a, t) => a + (Number(t.volumenM3) || 0), 0).toFixed(3));
}

export function htmlListaTrozas(i: ListaTrozasInput): string {
  const filas = i.trozas
    .map(
      (t, n) => `<tr>
      <td class="c">${n + 1}</td>
      <td class="sci">${esc(t.especieCientifica)}</td>
      <td>${esc(t.especieComun)}</td>
      <td class="up">${esc(t.producto)}</td>
      <td class="c cod">${esc(t.codificacion)}</td>
      <td class="c">${num(t.d1Cm, 1)}</td>
      <td class="c">${num(t.d2Cm, 1)}</td>
      <td class="c">${num(t.largoM, 2)}</td>
      <td class="c">${t.cantidad ?? 1}</td>
      <td class="r">${num(t.volumenM3, 3)}</td>
    </tr>`,
    )
    .join("");

  return `
  <div class="lt-head">
    <div>
      <div class="lt-emp">${esc(i.titular)}</div>
      ${i.subtitulo ? `<div class="lt-meta">${esc(i.subtitulo)}</div>` : ""}
      ${i.ubicacion ? `<div class="lt-meta">${esc(i.ubicacion)}</div>` : ""}
      ${i.ruc ? `<div class="lt-meta">RUC: ${esc(i.ruc)}</div>` : ""}
    </div>
    <div class="lt-nro"><b>LISTA DE TROZAS</b><span>N° ${esc(i.numero)}</span></div>
  </div>

  <h2 class="lt-titulo">LISTA DE TROZAS O CUARTONES A MOVILIZAR</h2>

  <table class="lt">
    <thead>
      <tr>
        <th rowspan="2">N°</th><th rowspan="2">Nombre Científico</th>
        <th rowspan="2">Nombre Común o Comercial</th><th rowspan="2">Producto</th>
        <th rowspan="2">(2) Codificación</th>
        <th colspan="3">(3) Dimensiones</th>
        <th rowspan="2">Cant.</th><th rowspan="2">Volumen M3</th>
      </tr>
      <tr><th>(4) D1</th><th>(5) D2</th><th>(6) L</th></tr>
    </thead>
    <tbody>${filas || `<tr><td colspan="10" class="vacio">Sin trozas listadas</td></tr>`}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" class="lid">LISTA ID: ${esc(i.numero)}</td>
        <td colspan="4" class="r tot">T O T A L :</td>
        <td class="r tot">${totalListado(i.trozas).toFixed(3)}</td>
      </tr>
    </tfoot>
  </table>

  <table class="lt-pie">
    <tr>
      <td class="obs"><span class="n">(7)</span> Observaciones:<div class="obs-v">${esc(i.observaciones ?? "")}</div></td>
      <td class="fir">
        <div class="fl"><span>Firma del Despachador</span><i></i></div>
        <div class="fl"><span>Nombres y Apellidos<br>del Despachador</span><i></i></div>
      </td>
    </tr>
  </table>`;
}

export const CSS_LISTA_TROZAS = `
  .lt-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; border:1px solid #000; padding:6px 8px; }
  .lt-emp { font-size:9pt; font-weight:bold; }
  .lt-meta { font-size:7pt; }
  .lt-nro { background:#f0f0f0; border:1px solid #000; padding:6px 12px; text-align:center; font-size:9pt; }
  .lt-nro span { display:block; font-size:8.5pt; margin-top:2px; }
  .lt-titulo { text-align:center; font-size:10pt; margin:8px 0; }
  .lt { width:100%; border-collapse:collapse; }
  .lt th, .lt td { border:1px solid #000; padding:2px 4px; font-size:7.5pt; }
  .lt th { background:#f0f0f0; font-weight:bold; text-align:center; }
  .lt td.c { text-align:center; }
  .lt td.r { text-align:right; }
  .lt td.up { text-transform:uppercase; }
  .lt td.sci { font-style:italic; }
  .lt td.cod { font-weight:bold; }
  .lt .vacio { text-align:center; padding:14px; color:#555; }
  .lt tfoot td { background:#f0f0f0; font-weight:bold; }
  .lt .lid { text-align:left; }
  .lt-pie { width:100%; border-collapse:collapse; margin-top:6px; }
  .lt-pie td { vertical-align:top; font-size:8pt; padding:4px; }
  .lt-pie .obs { width:45%; }
  .lt-pie .obs-v { min-height:26px; }
  .lt-pie .fl { display:flex; align-items:flex-end; gap:8px; margin-bottom:10px; }
  .lt-pie .fl span { font-size:7.5pt; white-space:nowrap; }
  .lt-pie .fl i { flex:1; border-bottom:1px solid #000; height:14px; display:block; }
`;
