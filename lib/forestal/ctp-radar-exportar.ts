/**
 * ctp-radar-exportar — el dibujo de la cadena, en un archivo.
 *
 * El libro ya se imprime como documento, pero el GRAFO —que es lo que se
 * entiende de un vistazo— no salía de la pantalla. Un informe a la ARFFS o un
 * legajo de fiscalización se arma con la imagen, no con la captura de pantalla
 * de alguien.
 *
 * Lo que hace difícil esto: el SVG que está en la página se pinta con tokens
 * (`var(--accent)`, `oklch(...)`) que sólo existen DENTRO del documento. Copiado
 * tal cual a un archivo, sale sin un solo color. Así que antes de serializar se
 * recorre el clon y se le escribe a cada figura el valor ya resuelto que el
 * navegador estaba usando.
 *
 * La tipografía es la excepción honesta: la fuente de la marca es una webfont y
 * un SVG suelto no puede cargarla, así que se fija una pila del sistema. El
 * dibujo sale idéntico en color, tamaño y posición; la letra, con la sans del
 * equipo que lo abra.
 */

/** Propiedades que hay que congelar para que el archivo se vea como la pantalla. */
const PROPIEDADES = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray",
  "stroke-linecap", "opacity", "font-size", "font-weight", "letter-spacing",
] as const;

/** Sans del sistema: la webfont de la marca no viaja dentro de un SVG suelto. */
const PILA_FUENTES = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export interface OpcionesExportar {
  /** Color de fondo del archivo. El SVG de la pantalla es transparente y un
   *  PNG transparente pegado en un informe blanco pierde la mitad del texto. */
  fondo: string;
  /** Multiplicador de resolución del PNG (2 = apto para imprimir). */
  escala?: number;
}

/**
 * Copia del SVG con todos los estilos ya resueltos y listos para vivir fuera
 * del documento. No toca el original.
 */
export function svgAutonomo(svg: SVGSVGElement, { fondo }: OpcionesExportar): SVGSVGElement {
  const clon = svg.cloneNode(true) as SVGSVGElement;
  const origen = svg.querySelectorAll<SVGElement>("*");
  const destino = clon.querySelectorAll<SVGElement>("*");

  for (let i = 0; i < origen.length; i++) {
    const cs = getComputedStyle(origen[i]);
    const d = destino[i];
    if (!d) continue;
    for (const p of PROPIEDADES) {
      const v = cs.getPropertyValue(p);
      // `none` y los vacíos se dejan en manos del atributo original: escribirlos
      // pisaría un `fill` puesto como atributo con el default del CSS.
      if (v && v !== "none" && v !== "normal") d.style.setProperty(p, v);
    }
    if (d.tagName === "text") d.style.setProperty("font-family", PILA_FUENTES);
  }

  const vb = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [0, 0, 0, 0];
  const [, , w, h] = vb;
  clon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clon.setAttribute("width", String(w));
  clon.setAttribute("height", String(h));
  // El fondo va como primer hijo para quedar DEBAJO de todo lo dibujado.
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(vb[0]));
  rect.setAttribute("y", String(vb[1]));
  rect.setAttribute("width", String(w));
  rect.setAttribute("height", String(h));
  rect.setAttribute("fill", fondo);
  clon.insertBefore(rect, clon.firstChild);
  return clon;
}

/** Slug conservador para el nombre del archivo (Windows odia acentos y rayas). */
export function nombreArchivo(base: string, etiqueta: string, ext: string): string {
  const slug = etiqueta
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${slug || "periodo"}.${ext}`;
}

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  // El revoke inmediato le corta la descarga a Firefox: se le da un respiro.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function exportarSvg(svg: SVGSVGElement, nombre: string, opts: OpcionesExportar): void {
  const xml = new XMLSerializer().serializeToString(svgAutonomo(svg, opts));
  descargar(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }), nombre);
}

/**
 * PNG del dibujo. Va por `<img>` + canvas: es la única vía sin dependencias, y
 * como el SVG ya viene con los colores resueltos, no hace falta que el
 * documento aislado sepa nada de los tokens.
 */
export async function exportarPng(svg: SVGSVGElement, nombre: string, opts: OpcionesExportar): Promise<void> {
  const escala = opts.escala ?? 2;
  const clon = svgAutonomo(svg, opts);
  const w = Number(clon.getAttribute("width")) || 1;
  const h = Number(clon.getAttribute("height")) || 1;
  const xml = new XMLSerializer().serializeToString(clon);
  // data: URI y no blob: — un blob de otro origen ensucia el canvas y
  // `toBlob` devolvería un error de seguridad en vez de la imagen.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("El navegador no pudo dibujar el gráfico"));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No hay canvas disponible en este navegador");
  ctx.fillStyle = opts.fondo;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("No se pudo generar el PNG");
  descargar(blob, nombre);
}
