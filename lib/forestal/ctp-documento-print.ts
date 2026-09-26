"use client";

/**
 * ctp-documento-print.ts — el ARMAZÓN de papel de los documentos del libro.
 *
 * La GTF y su lista de trozas son dos hojas del mismo trámite: si cada una trae
 * su propia cabecera, su propio tipo de letra y su propio criterio de márgenes,
 * el que las recibe no las lee como un juego. Acá vive lo que comparten —la
 * geometría A4, la cabecera con el número, los cintillos de sección, las fichas
 * de resumen, los sellos y el pie— para que cualquier hoja nueva del expediente
 * nazca ya con la misma identidad.
 *
 * ── Por qué el papel se SIMULA en pantalla ───────────────────────────────────
 * Antes el visor mostraba el HTML estirado al ancho del modal: se veía otra cosa
 * que lo que salía impreso, y el ancho de línea cambiaba dónde caían los cortes
 * de página. Ahora el documento se dibuja como una hoja A4 real sobre un fondo
 * gris —como un lector de PDF—, con una línea tenue cada 273 mm marcando dónde
 * corta la impresora. Lo que se ve ES lo que sale.
 *
 * ── Y por qué en impresión todo eso desaparece ───────────────────────────────
 * En `@media print` la hoja pierde ancho fijo, sombra, márgenes propios y las
 * guías de corte: el margen real lo pone `@page`. Si la hoja conservara su
 * padding, se sumaría al margen de la impresora y el documento quedaría chico y
 * corrido.
 */

export const esc = (v: unknown): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Margen de `@page`. 10 mm y no 15: los formatos oficiales aprovechan la hoja, y
 * cada milímetro de margen son dos milímetros menos de papel útil — lo que
 * decide si una guía entra en una hoja o se va a dos.
 */
export const MARGEN_MM = 10;
/** Alto útil de una A4 con ese margen — donde cae el corte de hoja. */
export const ALTO_UTIL_MM = 297 - MARGEN_MM * 2;
/** Ancho de la hoja en pantalla, con su aire alrededor. Lo usa el visor. */
export const ANCHO_HOJA_MM = 210;
export const AIRE_HOJA_MM = 8;

/** Marca del documento: la sección de un tronco. Sin assets externos. */
const MONOGRAMA = `<svg class="doc-mono" viewBox="0 0 40 40" aria-hidden="true">
  <circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="1" opacity=".72"/>
  <circle cx="20" cy="20" r="8" fill="none" stroke="currentColor" stroke-width=".9" opacity=".5"/>
  <circle cx="20" cy="20" r="3.4" fill="none" stroke="currentColor" stroke-width=".8" opacity=".4"/>
  <circle cx="20" cy="20" r="1.2" fill="currentColor"/>
</svg>`;

export interface CabeceraDoc {
  /** Quién emite o de quién es el documento — la línea más grande de la hoja. */
  emisor: string;
  /**
   * Logo del emisor como data URL. Sin él va el monograma del libro.
   *
   * Data URL y no una URL remota: el PDF se arma fotografiando la hoja, y una
   * imagen de otro origen sin CORS ensucia el canvas — el logo saldría en
   * blanco justo en el papel que se presenta.
   */
  logo?: string | null;
  /** Hasta tres líneas chicas: razón social, RUC, dirección, código de CTP… */
  meta?: Array<string | null | undefined>;
  /** Rótulo del recuadro de identidad: "GUÍA DE TRANSPORTE FORESTAL". */
  tipo: string;
  /** El número que identifica el documento — se lee de lejos. */
  numero: string;
  /** Línea chica bajo el número: "N° de registro", "Anexo del (35)"… */
  numeroNota?: string;
}

/**
 * La cabecera: identidad a la izquierda, número a la derecha. Es lo primero que
 * mira quien recibe el papel, así que el número va grande y en monoespaciada
 * —los ceros y los unos de un correlativo no se confunden—, sin caja: lo
 * destaca el tamaño, no un recuadro de color.
 */
export function cabeceraDoc(i: CabeceraDoc): string {
  const metas = (i.meta ?? [])
    .map((m) => (m ?? "").trim())
    .filter(Boolean)
    .map((m) => `<div class="doc-meta">${esc(m)}</div>`)
    .join("");
  const marca = (i.logo ?? "").startsWith("data:")
    ? `<img class="doc-logo" src="${esc(i.logo)}" alt="" />`
    : MONOGRAMA;
  return `<header class="doc-cab">
    <div class="doc-marca">
      ${marca}
      <div>
        <div class="doc-emisor">${esc(i.emisor)}</div>
        ${metas}
      </div>
    </div>
    <div class="doc-id">
      <div class="tipo">${esc(i.tipo)}</div>
      <div class="nro">${esc(i.numero) || "&nbsp;"}</div>
      ${i.numeroNota ? `<div class="pie">${esc(i.numeroNota)}</div>` : ""}
    </div>
  </header>`;
}

/** El título del documento, sobrio y alineado al eje de la cabecera. */
export function tituloDoc(titulo: string, subtitulo?: string): string {
  // El subtítulo va pegado abajo y chico: como línea aparte costaba 4 mm de
  // papel para decir algo que se lee de corrido con el título.
  return `<h1 class="doc-titulo">${esc(titulo)}${
    subtitulo ? `<span class="doc-sub">${esc(subtitulo)}</span>` : ""
  }</h1>`;
}

export interface FichaResumen {
  k: string;
  v: string;
  /** Unidad o aclaración chica al lado del valor ("m³", "piezas"). */
  u?: string;
  /**
   * `mal` rojo y `aviso` ámbar (texto + borde, sin fondo). `ok` y sin tono van
   * en tinta normal: lo que está bien no necesita color para leerse.
   */
  tono?: "ok" | "mal" | "aviso";
}

/**
 * La franja de "lo que hay que saber sin leer el documento": volumen, piezas,
 * estado, vencimiento. Un fiscalizador cruza esos cuatro números primero y
 * recién después baja al detalle.
 */
export function resumenDoc(items: ReadonlyArray<FichaResumen>): string {
  const vivas = items.filter((x) => (x.v ?? "").toString().trim() !== "");
  if (vivas.length === 0) return "";
  return `<div class="doc-res">${vivas
    .map(
      (x) => `<div class="t${x.tono ? ` ${x.tono}` : ""}">
      <div class="k">${esc(x.k)}</div>
      <div class="v">${esc(x.v)}${x.u ? `<span class="u"> ${esc(x.u)}</span>` : ""}</div>
    </div>`,
    )
    .join("")}</div>`;
}

/** Cintillo de sección: dice qué se lee abajo y con qué casilleros del formato. */
export function seccionDoc(titulo: string, casilleros?: string): string {
  return `<p class="doc-sec">${esc(titulo)}${casilleros ? `<span>${esc(casilleros)}</span>` : ""}</p>`;
}

/**
 * La marca de lo que el papel ES: una línea con borde fino («REPRODUCCIÓN | No
 * sustituye el original»). Existe para DECIR lo que el papel no es: una
 * reproducción no sustituye al original, y un documento que no lo aclara se
 * termina presentando como si lo hiciera.
 *
 * `rojo` tiñe texto y borde cuando hay un problema real (guía anulada,
 * reconstrucción sin el SNIFFS). `verde` se conserva por compatibilidad de la
 * firma y hoy sale en tinta normal: el documento es monocromo.
 */
export function selloDoc(texto: string, detalle?: string, tono: "rojo" | "verde" = "rojo"): string {
  return `<div class="doc-sello ${tono}">${esc(texto)}${detalle ? `<i>${esc(detalle)}</i>` : ""}</div>`;
}

/** Bloques de firma con su línea. Vacíos a propósito: se firman a mano. */
export function firmasDoc(rotulos: ReadonlyArray<string>): string {
  return `<div class="doc-firmas">${rotulos
    .map((r) => `<div><div class="linea"></div><div class="rot">${esc(r)}</div></div>`)
    .join("")}</div>`;
}

/** Nota al pie del documento — advertencias legales, alcance, procedencia. */
export function notaDoc(html: string): string {
  return `<div class="doc-nota">${html}</div>`;
}

export interface HojaDocumento {
  /** Va en el `<title>`: es el nombre que propone el diálogo de impresión. */
  titulo: string;
  /** CSS propio de esta hoja, encima del armazón compartido. */
  css?: string;
  /**
   * El contenido, ya armado con los helpers de arriba. Un arreglo arma un
   * LEGAJO: cada parte empieza en hoja nueva, como cuando se juntan las guías
   * del mes para una fiscalización.
   */
  cuerpo: string | string[];
  /**
   * Línea que se repite abajo de CADA página impresa. Sin esto, la hoja 3 de un
   * anexo largo es un papel anónimo: no dice de qué guía salió.
   */
  pieCorrido?: string;
  /** Margen de `@page` en mm. Por defecto `MARGEN_MM` (el que asume `ALTO_UTIL_MM`). */
  margenMm?: number;
}

/** El documento completo y autocontenido, listo para el visor o para imprimir. */
export function documentoHtml(h: HojaDocumento): string {
  const margen = h.margenMm ?? MARGEN_MM;
  const cuerpo = Array.isArray(h.cuerpo)
    ? h.cuerpo.map((c) => `<section class="doc-parte">${c}</section>`).join("")
    : h.cuerpo;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(h.titulo)}</title>
<style>@page{size:A4;margin:${margen}mm}${CSS_DOCUMENTO}${h.css ?? ""}</style>
</head><body>
<div class="doc-hoja">${cuerpo}</div>
${h.pieCorrido ? `<div class="doc-corrido">${esc(h.pieCorrido)}</div>` : ""}
</body></html>`;
}

/** Milímetros a píxeles CSS (96 dpi), que es como mide el navegador. */
const px = (mm: number) => (mm / 25.4) * 96;

/** Qué pasa cuando el papel se corta: cuántas hojas salen y dónde cae cada corte. */
export interface Paginado {
  hojas: number;
  /** Posición de cada corte, en píxeles de la vista continua de pantalla. */
  cortes: number[];
}

/** Un bloque indivisible y si arranca hoja nueva sí o sí. */
interface Atomo {
  el: HTMLElement;
  salto: boolean;
}

/**
 * Los bloques que la impresora NO parte al medio (`break-inside:avoid`): las
 * filas de las tablas y cada bloque suelto de la hoja. Es la unidad con la que
 * se reparte el contenido entre páginas.
 *
 * Un `.doc-parte` (cada documento de un legajo) es transparente: se entra a sus
 * hijos y se marca el primero como salto de hoja, porque en el papel cada guía
 * empieza en una hoja nueva.
 */
function atomos(hoja: HTMLElement): Atomo[] {
  const desdeHijo = (el: HTMLElement, salto: boolean): Atomo[] => {
    if (el.tagName === "TABLE") {
      const filas = Array.from(el.querySelectorAll<HTMLElement>("tr"));
      return filas.map((f, i) => ({ el: f, salto: salto && i === 0 }));
    }
    return [{ el, salto }];
  };

  return Array.from(hoja.children).flatMap((hijo, i) => {
    const el = hijo as HTMLElement;
    if (el.classList.contains("doc-parte")) {
      // La primera parte no fuerza salto: ya está al principio de la hoja.
      return Array.from(el.children).flatMap((n, j) =>
        desdeHijo(n as HTMLElement, i > 0 && j === 0),
      );
    }
    return desdeHijo(el, false);
  });
}

/** El thead que la impresora repite arriba de cada página, si la fila es de tabla. */
function altoCabeceraRepetida(fila: HTMLElement): number {
  const thead = fila.closest("table")?.querySelector<HTMLElement>("thead");
  return thead && fila.parentElement?.tagName !== "THEAD" ? thead.getBoundingClientRect().height : 0;
}

/**
 * Cuántas hojas A4 salen de verdad y dónde cae cada corte.
 *
 * ── Por qué no alcanza con dividir el alto entre 273 mm ──────────────────────
 * Porque la impresora no parte una fila al medio: la baja entera a la página
 * siguiente y deja el hueco. Una lista de 34 trozas medía "2 hojas" por división
 * y salían 3 del papel — un preview que promete una cosa y entrega otra es peor
 * que no tener preview. Acá se recorre el contenido bloque por bloque
 * arrastrando el desplazamiento que cada salto provoca, que es lo que hace el
 * motor de impresión, y se descuenta el thead que se repite arriba de cada
 * página y el pie corrido que se reserva abajo.
 */
export function paginar(d: Document): Paginado {
  const hoja = d.querySelector<HTMLElement>(".doc-hoja");
  if (!hoja) return { hojas: 1, cortes: [] };

  // Alto aprovechable por página: la caja de `@page` menos lo que se reserva
  // abajo para el pie corrido (`body { padding-bottom }` de la vista impresa).
  const util = px(ALTO_UTIL_MM - 7);
  const cero = hoja.getBoundingClientRect().top + px(MARGEN_MM);

  const cortes: number[] = [];
  let finDePagina = util; // en coordenadas del flujo impreso
  let desplazado = 0; // cuánto empujaron hacia abajo los saltos acumulados
  const cortar = (enFlujo: number) => cortes.push(Math.round(enFlujo - desplazado));

  for (const a of atomos(hoja)) {
    const caja = a.el.getBoundingClientRect();
    if (caja.height === 0) continue;
    const top = caja.top - cero + desplazado;

    // Páginas que se completaron sin que ningún bloque las forzara.
    while (top >= finDePagina) {
      cortar(finDePagina);
      finDePagina += util;
    }

    // Documento nuevo del legajo: hoja nueva, aunque sobre lugar abajo.
    if (a.salto && top > 0.5) {
      desplazado += finDePagina - top;
      cortes.push(Math.round(caja.top - cero));
      finDePagina += util;
      continue;
    }

    if (caja.height > util) {
      // Más alto que una página entera: se parte solo, no hay nada que empujar.
      const fin = top + caja.height;
      while (fin > finDePagina) {
        cortar(finDePagina);
        finDePagina += util;
      }
      continue;
    }

    if (top + caja.height > finDePagina) {
      // No entra: baja entero. El corte visible va justo antes del bloque.
      desplazado += finDePagina - top;
      cortes.push(Math.round(caja.top - cero));
      finDePagina += util - altoCabeceraRepetida(a.el);
    }
  }

  return { hojas: cortes.length + 1, cortes };
}

/**
 * Dibuja las guías de corte dentro del documento. Son `position:absolute`, así
 * que no mueven una sola línea del contenido —si movieran, cambiarían los cortes
 * que acaban de calcularse— y `@media print` las esconde.
 */
export function marcarCortes(d: Document, cortes: ReadonlyArray<number>): void {
  const hoja = d.querySelector<HTMLElement>(".doc-hoja");
  if (!hoja) return;
  hoja.querySelectorAll(".doc-corte").forEach((n) => n.remove());
  const arriba = px(MARGEN_MM);
  cortes.forEach((y, i) => {
    const linea = d.createElement("div");
    linea.className = "doc-corte";
    linea.style.top = `${y + arriba}px`;
    linea.innerHTML = `<span>Hoja ${i + 2}</span>`;
    hoja.appendChild(linea);
  });
}

/**
 * El armazón. Medidas en milímetros y tipografías en puntos porque el destino es
 * papel: en píxeles, el mismo documento cambia de tamaño según el zoom con el
 * que se abrió, y los casilleros dejan de coincidir con el talonario.
 *
 * ── Monocromo, a propósito (rediseño 2026-09-25) ─────────────────────────────
 * La hoja era verde: barras rellenas, recuadro del número relleno, título en
 * versalitas verdes. Se veía genérica y, peor, gastaba tinta de color en lo que
 * no informa nada. Ahora la jerarquía la ponen la tipografía y el aire:
 * · tinta casi negra para los datos, gris para los rótulos, hilos grises finos
 *   para la grilla — se lee igual impresa en blanco y negro que en PDF;
 * · UNA regla negra bajo la cabecera y una fina bajo cada título de sección;
 *   nada de cajas rellenas;
 * · el color sólo aparece cuando hay un problema real (`.mal` rojo, `.aviso`
 *   ámbar), en texto y borde, sin fondo.
 * Contrastes sobre blanco (AA ≥ 4,5:1): tinta #111 18,9:1 · rótulo #4d4d4d
 * 8,5:1 · tenue #6e6e6e 5,1:1 · rojo #b3261e 6,6:1 · ámbar #8a5300 6,2:1.
 *
 * Los nombres de las variables (`--tinta`, `--linea-suave`…) no cambian: otras
 * hojas del libro (legajo, GTF de salida) las usan en su propio CSS.
 */
export const CSS_DOCUMENTO = `
  :root {
    --tinta:#111111; --tinta-clara:#333333; --gris:#4d4d4d; --gris-suave:#6e6e6e;
    --linea:#111111; --linea-suave:#cfcfcf; --tenue:#f5f5f5;
    --mal:#b3261e; --aviso:#8a5300;
  }
  * { box-sizing:border-box; }
  /* Transparente a propósito: el visor pone el fondo con sus tokens y así la
     mesa de trabajo sigue el tema claro/oscuro del panel. La hoja es lo único
     que siempre es blanco, porque es papel. */
  html { background:transparent; }
  body {
    margin:0; padding:0; background:transparent;
    font-family:Arial,Helvetica,sans-serif; color:var(--tinta);
    font-size:8pt; line-height:1.28;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
    -webkit-font-smoothing:antialiased;
  }
  .doc-hoja {
    position:relative; width:${ANCHO_HOJA_MM}mm; min-height:297mm;
    margin:${AIRE_HOJA_MM}mm auto; padding:${MARGEN_MM}mm;
    background:#fff; border:.3mm solid rgba(0,0,0,.14); box-shadow:0 1mm 4mm rgba(0,0,0,.22);
  }
  /* Dónde corta la impresora — lo calcula el visor y lo inyecta acá.
     Sólo en pantalla: en papel el corte lo hace la impresora de verdad. */
  .doc-corte { position:absolute; left:0; right:0; height:0; pointer-events:none;
               border-top:.4mm dashed rgba(0,0,0,.28); }
  .doc-corte span { position:absolute; right:0; top:.8mm; background:#fff; padding:0 1.5mm;
                    font-size:6.2pt; letter-spacing:.6pt; text-transform:uppercase; color:var(--gris-suave); }

  /* ── Cabecera: quién emite a la izquierda, qué papel y qué número a la derecha ── */
  .doc-cab { display:flex; justify-content:space-between; align-items:flex-end; gap:8mm;
             padding-bottom:2mm; border-bottom:1.2pt solid var(--linea); }
  .doc-marca { display:flex; align-items:center; gap:3mm; min-width:0; }
  .doc-mono { width:8.5mm; height:8.5mm; color:var(--tinta); flex:none; }
  /* El logo manda sobre el monograma, pero no sobre el papel: se le da alto y
     se deja crecer a lo ancho hasta un tope, para que un logo apaisado no
     empuje el número de la guía fuera de la hoja. */
  .doc-logo { height:12mm; max-width:34mm; object-fit:contain; flex:none; }
  .doc-emisor { font-size:10pt; font-weight:bold; letter-spacing:.15pt; text-transform:uppercase; line-height:1.15; }
  .doc-meta { font-size:6.6pt; color:var(--gris); margin-top:.25mm; line-height:1.22; }
  /* Sin caja: el número se lee por tamaño y por la monoespaciada —los ceros y
     los unos de un correlativo no se confunden—, no por un recuadro de color. */
  .doc-id { flex:none; text-align:right; }
  .doc-id .tipo { font-size:6.4pt; letter-spacing:1.3pt; text-transform:uppercase; color:var(--gris-suave); }
  .doc-id .nro { font-family:"Courier New",Courier,monospace; font-size:15pt; font-weight:bold;
                 letter-spacing:.2pt; line-height:1.1; margin-top:.5mm; white-space:nowrap; }
  .doc-id .pie { font-size:6.4pt; letter-spacing:.2pt; color:var(--gris-suave); margin-top:.5mm; }

  /* ── Título: sobrio, alineado al eje de la cabecera ── */
  .doc-titulo { font-size:13pt; font-weight:bold; letter-spacing:-.1pt; line-height:1.15; margin:2.6mm 0 0; }
  .doc-sub { display:block; font-size:7pt; font-weight:normal; letter-spacing:0; color:var(--gris); margin-top:.4mm; }

  /* ── Resumen: una fila de pares rótulo/valor entre hilos, sin tarjetas ── */
  .doc-res { display:flex; margin:2.2mm 0 1.8mm; border-top:.5pt solid var(--linea-suave); border-bottom:.5pt solid var(--linea-suave); }
  .doc-res .t { flex:1 1 0; min-width:0; padding:.9mm 2.6mm; border-left:.5pt solid var(--linea-suave); }
  .doc-res .t:first-child { border-left:none; padding-left:0; }
  .doc-res .k { font-size:6pt; letter-spacing:.7pt; text-transform:uppercase; color:var(--gris-suave); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .doc-res .v { font-size:9.5pt; font-weight:bold; font-variant-numeric:tabular-nums; line-height:1.25; margin-top:.3mm; }
  .doc-res .v .u { font-size:6.6pt; font-weight:normal; color:var(--gris); }
  /* «Está bien» no lleva color: es lo normal. Lo que avisa, sí — texto y borde. */
  .doc-res .mal .k { color:var(--mal); }
  .doc-res .mal .v { display:inline-block; color:var(--mal); border:.8pt solid var(--mal); padding:0 1.2mm; }
  .doc-res .aviso .k { color:var(--aviso); }
  .doc-res .aviso .v { display:inline-block; color:var(--aviso); border:.8pt solid var(--aviso); padding:0 1.2mm; }

  /* ── Secciones: título chico en negro, casilleros a la derecha, regla fina ──
     La regla hace de borde superior de la tabla que sigue: sin margen abajo. */
  .doc-sec { display:flex; justify-content:space-between; align-items:baseline; gap:4mm;
             margin:2.3mm 0 0; padding:0 0 .5mm; border-bottom:.6pt solid var(--linea);
             font-size:6.8pt; font-weight:bold; letter-spacing:.9pt; text-transform:uppercase; }
  .doc-sec span { font-weight:normal; font-size:6.4pt; letter-spacing:.2pt; text-transform:none; color:var(--gris-suave); white-space:nowrap; }

  /* ── Sellos y chips: una línea con borde fino, sin goma ni rotación ── */
  .doc-sello { display:inline-block; border:.7pt solid var(--tinta); color:var(--tinta); padding:.5mm 1.8mm;
               font-size:6.4pt; font-weight:bold; letter-spacing:.9pt; text-transform:uppercase;
               line-height:1.3; white-space:nowrap; }
  .doc-sello i { font-style:normal; font-weight:normal; font-size:6.4pt; letter-spacing:.1pt; text-transform:none;
                 color:var(--gris); margin-left:1.6mm; padding-left:1.6mm; border-left:.5pt solid var(--linea-suave); }
  .doc-sello.rojo { border-color:var(--mal); color:var(--mal); }
  /* «verde» queda por compatibilidad de la firma: ya no tiñe, es la tinta normal. */
  .doc-sello.verde { border-color:var(--tinta); color:var(--tinta); }
  .doc-chip { display:inline-block; border:.7pt solid; padding:.4mm 1.6mm; font-size:6.8pt; font-weight:bold; letter-spacing:.6pt; text-transform:uppercase; }
  .doc-chip.ok { color:var(--tinta); border-color:var(--tinta); }
  .doc-chip.mal { color:var(--mal); border-color:var(--mal); }
  .doc-chip.neutro { color:var(--gris); border-color:var(--linea-suave); }

  /* ── Firmas, notas y pies ── */
  .doc-firmas { display:flex; gap:8mm; margin-top:6mm; }
  .doc-firmas > div { flex:1 1 0; }
  .doc-firmas .linea { border-bottom:.6pt solid var(--linea); height:7mm; }
  .doc-firmas .rot { padding-top:1.2mm; font-size:6.4pt; letter-spacing:.5pt; text-transform:uppercase; color:var(--gris); text-align:center; }
  .doc-nota { margin-top:1.6mm; font-size:6.4pt; line-height:1.3; color:var(--gris); }
  .doc-nota b { color:var(--tinta); }
  .doc-pie { display:flex; justify-content:space-between; gap:4mm; margin-top:1.4mm; padding-top:.9mm;
             border-top:.5pt solid var(--linea-suave); font-size:6.2pt; letter-spacing:.2pt; color:var(--gris-suave); }
  .doc-corrido { display:none; }

  @media print {
    html { background:none; }
    .doc-hoja { width:auto; min-height:0; margin:0; padding:0; border:none; box-shadow:none; }
    .doc-corte { display:none; }
    body { padding-bottom:7mm; }
    /* Chrome repinta lo fijo en cada página: así la hoja 3 sigue diciendo de qué guía salió. */
    .doc-corrido { display:block; position:fixed; left:0; right:0; bottom:0;
                   border-top:.5pt solid var(--linea-suave); padding-top:1mm;
                   font-size:6.2pt; color:var(--gris-suave); letter-spacing:.2pt; text-align:center; }
    thead { display:table-header-group; }
    tfoot { display:table-footer-group; }
    tr, .doc-res, .doc-firmas { break-inside:avoid; }
    .doc-sec { break-after:avoid; }
    /* Cada documento del legajo, en su hoja. */
    .doc-parte + .doc-parte { break-before:page; }
  }
  /* En pantalla el legajo se lee corrido; el aire dice dónde empieza el otro. */
  .doc-parte + .doc-parte { margin-top:14mm; }
`;

/**
 * Espera a que las imágenes de la hoja terminen de cargar (o fallen) antes de
 * imprimir o fotografiar el PDF. Las fotos de la carga (ADR-434) pasan por una
 * redirección firmada y pueden tardar: imprimir antes deja el recuadro en
 * blanco en el papel, mientras la pantalla ya las mostraba. Nunca rechaza; con
 * `ms` de tope, una foto que no llega no congela el botón.
 */
export async function esperarImagenes(d: Document, ms = 8000): Promise<void> {
  const pendientes = Array.from(d.images).filter((img) => !img.complete);
  if (pendientes.length === 0) return;
  const cargas = pendientes.map(
    (img) =>
      new Promise<void>((res) => {
        img.addEventListener("load", () => res(), { once: true });
        img.addEventListener("error", () => res(), { once: true });
      }),
  );
  await Promise.race([Promise.all(cargas), new Promise<void>((res) => setTimeout(res, ms))]);
}
