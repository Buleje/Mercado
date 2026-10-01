/**
 * presentacion — leer el CONTENIDO de un .pptx / .odp sin abrirlo.
 *
 * Una presentación en el drive era un ícono naranja: para saber si era la
 * correcta había que bajarla y abrir PowerPoint. No hace falta renderizar las
 * diapositivas para resolver eso — con el título y las viñetas de cada una
 * alcanza para reconocerla, buscarla y decidir.
 *
 * No se convierte ni se reescribe nada: se LEE el XML de adentro del zip. Es
 * puro (recibe el zip ya abierto), así que se puede probar sin navegador.
 */

/** Lo mínimo de JSZip que se necesita: leer archivos por nombre. */
export interface ZipLeible {
  file(nombre: string): { async(tipo: "string"): Promise<string> } | null;
  files: Record<string, unknown>;
}

export interface Diapositiva {
  /** 1, 2, 3… en el orden real de la presentación. */
  numero: number;
  /** El texto más grande de la diapositiva; suele ser el título. */
  titulo: string;
  /** El resto de los textos, en orden de aparición. */
  lineas: string[];
}

/** Extensiones/MIMEs que este lector entiende. */
export function esPresentacion(mimeType?: string | null, nombre?: string | null): boolean {
  const m = (mimeType ?? "").toLowerCase();
  const n = (nombre ?? "").toLowerCase();
  return /presentationml|opendocument\.presentation|ms-powerpoint/.test(m)
    || /\.(pptx|ppsx|odp)$/.test(n);
}

/** XML → texto plano de los nodos indicados, en orden y sin vacíos. */
function textosDe(xml: string, etiqueta: string): string[] {
  const re = new RegExp(`<${etiqueta}(?:\\s[^>]*)?>([\\s\\S]*?)</${etiqueta}>`, "g");
  const out: string[] = [];
  for (const m of xml.matchAll(re)) {
    const limpio = m[1]
      .replace(/<[^>]+>/g, "")          // los hijos (a:rPr, etc.) no aportan texto
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (limpio) out.push(limpio);
  }
  return out;
}

/** "ppt/slides/slide12.xml" → 12. Sin esto el orden sería 1, 10, 11, 2… */
function numeroDe(ruta: string): number {
  const m = /(\d+)\.xml$/.exec(ruta);
  return m ? Number(m[1]) : 0;
}

/**
 * Las diapositivas de un .pptx: un XML por diapositiva bajo `ppt/slides/`, y el
 * texto en nodos `<a:t>`.
 */
async function leerPptx(zip: ZipLeible): Promise<Diapositiva[]> {
  const rutas = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => numeroDe(a) - numeroDe(b));

  const salida: Diapositiva[] = [];
  for (const [i, ruta] of rutas.entries()) {
    const xml = await zip.file(ruta)?.async("string");
    if (!xml) continue;
    const textos = textosDe(xml, "a:t");
    salida.push({ numero: i + 1, titulo: textos[0] ?? "", lineas: textos.slice(1) });
  }
  return salida;
}

/**
 * Las de un .odp: TODAS viven en `content.xml`, separadas por `<draw:page>`, y
 * el texto va en `<text:p>` / `<text:span>`.
 */
async function leerOdp(zip: ZipLeible): Promise<Diapositiva[]> {
  const xml = await zip.file("content.xml")?.async("string");
  if (!xml) return [];
  const paginas = xml.split(/<draw:page[\s>]/).slice(1);
  return paginas.map((pagina, i) => {
    const textos = textosDe(pagina, "text:p");
    return { numero: i + 1, titulo: textos[0] ?? "", lineas: textos.slice(1) };
  });
}

/** Lee la presentación cualquiera sea su formato. */
export async function leerPresentacion(zip: ZipLeible, nombre: string): Promise<Diapositiva[]> {
  const esOdp = nombre.toLowerCase().endsWith(".odp") || Boolean(zip.files["content.xml"]);
  return esOdp ? leerOdp(zip) : leerPptx(zip);
}

/** Todo el texto junto, para buscar dentro de la presentación. */
export function textoPlano(diapositivas: Diapositiva[]): string {
  return diapositivas
    .map((d) => [d.titulo, ...d.lineas].filter(Boolean).join("\n"))
    .join("\n\n")
    .trim();
}
