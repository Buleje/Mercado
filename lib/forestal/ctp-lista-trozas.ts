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
 *
 * ── Lo que se agrega y por qué ───────────────────────────────────────────────
 * El detalle no cambió: mismas columnas, mismos casilleros, mismos números. Lo
 * que se sumó es lo que el papel no decía y alguien tenía que contar a mano —
 * cuántas piezas son, cuántas especies, cuánto suma cada una— porque una lista
 * de 60 filas sin subtotales obliga a sumar con calculadora en el control, y ahí
 * es donde aparecen las diferencias que nadie sabe si son error o faltante.
 */

import {
  cabeceraDoc,
  esc,
  firmasDoc,
  notaDoc,
  resumenDoc,
  seccionDoc,
  tituloDoc,
  type FichaResumen,
} from "./ctp-documento-print";

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
  /** N° de la GTF que esta lista ampara, si se conoce. Va en el resumen. */
  guia?: string;
  /** Fecha de expedición de la guía, ya formateada para el papel. */
  fecha?: string;
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

export interface SubtotalEspecie {
  especie: string;
  cientifico: string;
  piezas: number;
  volumenM3: number;
}

/**
 * Cuánto aporta cada especie. Se agrupa por nombre común —que es el que se grita
 * en el patio— y se guarda el científico para la fila. Sirve para cruzar contra
 * el detalle (37) de la guía, que declara por especie y no por pieza: si la
 * lista y la guía no coinciden especie por especie, el faltante tiene nombre.
 */
export function subtotalesPorEspecie(trozas: ReadonlyArray<TrozaListada>): SubtotalEspecie[] {
  const mapa = new Map<string, SubtotalEspecie>();
  for (const t of trozas) {
    const especie = (t.especieComun ?? t.especieCientifica ?? "Sin especie declarada").trim() || "Sin especie declarada";
    const previo = mapa.get(especie) ?? {
      especie,
      cientifico: (t.especieCientifica ?? "").trim(),
      piezas: 0,
      volumenM3: 0,
    };
    previo.piezas += Number(t.cantidad) || 1;
    previo.volumenM3 += Number(t.volumenM3) || 0;
    if (!previo.cientifico && t.especieCientifica) previo.cientifico = t.especieCientifica.trim();
    mapa.set(especie, previo);
  }
  return [...mapa.values()]
    .map((s) => ({ ...s, volumenM3: Number(s.volumenM3.toFixed(3)) }))
    .sort((a, b) => b.volumenM3 - a.volumenM3);
}

/** Piezas listadas: la `cantidad` de cada fila, no la cantidad de filas. */
export function piezasListadas(trozas: ReadonlyArray<TrozaListada>): number {
  return trozas.reduce((a, t) => a + (Number(t.cantidad) || 1), 0);
}

export function htmlListaTrozas(i: ListaTrozasInput): string {
  const filas = i.trozas
    .map(
      (t, n) => `<tr>
      <td class="c n">${n + 1}</td>
      <td class="sci">${esc(t.especieCientifica)}</td>
      <td>${esc(t.especieComun)}</td>
      <td class="prod">${esc(t.producto)}</td>
      <td class="c cod">${esc(t.codificacion)}</td>
      <td class="c">${num(t.d1Cm, 1)}</td>
      <td class="c">${num(t.d2Cm, 1)}</td>
      <td class="c">${num(t.largoM, 2)}</td>
      <td class="c">${t.cantidad ?? 1}</td>
      <td class="r vol">${num(t.volumenM3, 3)}</td>
    </tr>`,
    )
    .join("");

  const total = totalListado(i.trozas);
  const especies = subtotalesPorEspecie(i.trozas);
  const piezas = piezasListadas(i.trozas);

  const fichas: FichaResumen[] = [
    { k: "Piezas listadas", v: i.trozas.length ? String(piezas) : "" },
    { k: "Especies", v: especies.length ? String(especies.length) : "" },
    { k: "Volumen total", v: i.trozas.length ? total.toFixed(3) : "", u: "m³", tono: "ok" },
    { k: "Guía que ampara", v: (i.guia ?? "").trim() },
    { k: "Expedición", v: (i.fecha ?? "").trim() },
  ];

  // El resumen por especie sólo aparece con más de una: con una sola repetiría
  // el total de abajo y agrega una tabla que no informa nada nuevo.
  const porEspecie =
    especies.length > 1
      ? `${seccionDoc("Resumen por especie", "cruza con el (37) de la guía")}
    <table class="lt esp">
      <thead><tr><th>Nombre común</th><th>Nombre científico</th><th class="c">Piezas</th><th class="r">Volumen m³</th><th class="r">%</th></tr></thead>
      <tbody>${especies
        .map(
          (s) => `<tr>
          <td><b>${esc(s.especie)}</b></td>
          <td class="sci">${esc(s.cientifico)}</td>
          <td class="c">${s.piezas}</td>
          <td class="r vol">${s.volumenM3.toFixed(3)}</td>
          <td class="r">${total > 0 ? ((s.volumenM3 / total) * 100).toFixed(1) : ""}</td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>`
      : "";

  return `
  ${cabeceraDoc({
    emisor: i.titular,
    meta: [i.subtitulo, i.ubicacion, i.ruc ? `RUC: ${i.ruc}` : ""],
    tipo: "Lista de trozas",
    numero: i.numero,
    numeroNota: "Anexo del casillero (35)",
  })}

  ${tituloDoc(
    "Lista de trozas o cuartones a movilizar",
    "Anexo de la Guía de Transporte Forestal · Detalle pieza por pieza",
  )}

  ${resumenDoc(fichas)}

  ${seccionDoc("Detalle de las piezas", "casilleros (2) a (6)")}

  <table class="lt">
    <thead>
      <tr>
        <th rowspan="2" class="w-n">N°</th><th rowspan="2">Nombre Científico</th>
        <th rowspan="2" class="w-com">Nombre Común o Comercial</th><th rowspan="2" class="w-p">Producto</th>
        <th rowspan="2" class="w-cod">(2) Codificación</th>
        <th colspan="3">(3) Dimensiones</th>
        <th rowspan="2" class="w-c">Cant.</th><th rowspan="2" class="w-v">Volumen M3</th>
      </tr>
      <tr><th class="sub w-d">(4) D1<i>cm</i></th><th class="sub w-d">(5) D2<i>cm</i></th><th class="sub w-d">(6) L<i>m</i></th></tr>
    </thead>
    <tbody>${filas || `<tr><td colspan="10" class="vacio">Sin trozas listadas</td></tr>`}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" class="lid">LISTA ID: ${esc(i.numero)}</td>
        <td colspan="3" class="r lbl">${i.trozas.length ? `Suma de las ${i.trozas.length} filas` : ""}</td>
        <td class="c tot">${i.trozas.length ? piezas : ""}</td>
        <td class="r tot">${total.toFixed(3)}</td>
      </tr>
      <tr class="rot"><td colspan="9" class="r">T O T A L&nbsp;&nbsp;M O V I L I Z A D O&nbsp;&nbsp;(m³)</td><td class="r">${total.toFixed(3)}</td></tr>
    </tfoot>
  </table>

  ${porEspecie}

  ${seccionDoc("Observaciones y responsables", "casillero (7)")}
  <table class="lt-pie">
    <tr>
      <td class="obs"><span class="n">(7)</span> Observaciones:<div class="obs-v">${esc(i.observaciones ?? "")}</div></td>
      <td class="fir">
        ${firmasDoc(["Firma del despachador", "Nombres y apellidos del despachador"])}
      </td>
    </tr>
  </table>

  ${notaDoc(
    `<b>Cómo se lee.</b> Cada fila es una pieza física con su codificación en el rollo; las medidas (4)(5)(6) son las
     tomadas al medirla y el volumen es el que declaró el Libro de Operaciones — no se recalcula acá para que la lista
     y el libro digan lo mismo de la misma troza. El total debe coincidir con el volumen amparado por la guía.`,
  )}

  <div class="doc-pie">
    <span>Lista N° ${esc(i.numero)}${i.guia ? ` · GTF ${esc(i.guia)}` : ""}</span>
    <span>${i.trozas.length} pieza(s) · ${total.toFixed(3)} m³</span>
  </div>`;
}

export const CSS_LISTA_TROZAS = `
  .lt { width:100%; border-collapse:collapse; margin:0; }
  .lt th, .lt td { border:.6pt solid #9aa5a0; padding:1.1mm 1.4mm; font-size:7.2pt; }
  .lt thead th { background:var(--tinta); color:#fff; font-weight:bold; text-align:center; letter-spacing:.3pt;
                 border-color:#0d3b20; font-size:6.8pt; text-transform:uppercase; }
  .lt thead th.sub i { display:block; font-style:normal; font-weight:normal; opacity:.75; font-size:6pt; }
  /* Anchos fijos para lo que mide siempre igual (números y códigos): así el aire
     sobrante se lo quedan los nombres, que son los que se partían en dos líneas
     y duplicaban el alto de TODAS las filas. */
  .lt .w-n { width:7mm; } .lt .w-c { width:11mm; } .lt .w-v { width:19mm; }
  .lt .w-d { width:11mm; } .lt .w-p { width:26mm; } .lt .w-cod { width:19mm; } .lt .w-com { width:25mm; }
  .lt tbody tr:nth-child(even) td { background:#f4f8f6; }
  .lt td.c { text-align:center; }
  .lt td.r { text-align:right; }
  .lt td.n { color:var(--gris-suave); font-size:6.6pt; }
  /* El producto se imprime como viene de la guía: forzarlo a mayúsculas lo
     partía en dos líneas y estiraba TODAS las filas por una columna que casi
     siempre dice lo mismo. */
  .lt td.prod { color:#374151; }
  .lt tfoot .lbl { font-weight:normal; font-size:6.8pt; letter-spacing:.4pt; text-transform:uppercase; color:var(--gris); }
  .lt td.sci { font-style:italic; color:#374151; }
  .lt td.cod { font-family:"Courier New",Courier,monospace; font-weight:bold; letter-spacing:.2pt; }
  .lt td.vol { font-variant-numeric:tabular-nums; font-weight:bold; }
  .lt .vacio { text-align:center; padding:8mm; color:var(--gris-suave); font-style:italic; background:#fafbfa; }
  .lt tfoot td { background:#e7efea; font-weight:bold; border-color:#7f8f87; }
  .lt tfoot .lid { text-align:left; font-family:"Courier New",Courier,monospace; letter-spacing:.2pt; }
  .lt tfoot .tot { font-variant-numeric:tabular-nums; }
  .lt tfoot tr.rot td { background:var(--tinta); color:#fff; font-size:7.6pt; letter-spacing:.6pt; border-color:#0d3b20; }

  .lt.esp { margin-top:0; }
  .lt.esp td { font-size:7.4pt; }

  .lt-pie { width:100%; border-collapse:collapse; }
  .lt-pie td { vertical-align:top; font-size:7.4pt; padding:0 0 0 6mm; }
  .lt-pie .obs { width:48%; padding:0 6mm 0 0; }
  .lt-pie .obs .n { font-weight:bold; color:var(--tinta); font-size:6.8pt; }
  .lt-pie .obs-v { min-height:16mm; border:.6pt solid #9aa5a0; border-top:none; padding:1.5mm; margin-top:1mm; background:#fafcfb; }
  .lt-pie .fir .doc-firmas { margin-top:1mm; gap:6mm; }
  .lt-pie .fir .doc-firmas .linea { height:14mm; }
`;
