/**
 * especies-fotos.ts — la biblioteca de fotos de referencia de las especies.
 *
 * En el patio la confusión no es teórica: cumala y moena se parecen, y quien
 * recibe la troza a las 6 de la mañana no tiene el manual del SERFOR a mano. Una
 * foto al lado del nombre evita que una guía entre con la especie equivocada —
 * que es exactamente lo que un fiscalizador cruza contra el POA.
 *
 * Viene del ERP forestal de referencia (AppForestal, módulo `baseimg`), pero
 * acotado a lo que sirve: **una foto por especie**, cargada por el propio CTP.
 * Ellos además buscaban imágenes en internet y las aprobaban con un flujo de
 * sugerencias; una foto de origen desconocido pegada al lado de un nombre
 * científico en un libro oficial es peor que no tener foto.
 *
 * PURO y client-safe: la persistencia es un KV (ver `forest-especies-fotos.db`).
 */

/** Una especie con su foto de referencia. */
export interface FotoEspecie {
  /** Clave normalizada — con la que se busca. */
  clave: string;
  /** El nombre tal como lo escribió el operador ("Cumala blanca"). */
  nombre: string;
  /** Nombre científico, si se declaró. Sólo informativo. */
  cientifico: string;
  /** URL de la imagen en el storage propio. */
  url: string;
  /** Qué se ve / de dónde salió la foto. Es la procedencia del dato. */
  nota: string;
  actualizado: string;
  actualizadoPor: string;
}

/** Lo que manda el cliente al guardar. */
export interface FotoEspecieInput {
  nombre: string;
  cientifico?: string | null;
  url: string;
  nota?: string | null;
}

/** Tope por tenant: el KV es un JSON y cada entrada guarda sólo una URL. */
export const MAX_FOTOS_ESPECIE = 300;

/**
 * La clave de búsqueda de una especie.
 *
 * Sin tildes, sin dobles espacios y en minúsculas: "Cumala Blanca", "cumala
 * blanca" y "CUMALA  BLANCA" son la misma especie. Comparar tal cual dejaba la
 * foto invisible para la mitad de los ingresos.
 */
export function claveEspecie(nombre: string | null | undefined): string {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Sólo imágenes del storage propio o rutas del sitio: nada de hotlinks. */
export function urlDeFotoValida(url: string | null | undefined): boolean {
  const u = (url ?? "").trim();
  if (!u) return false;
  if (u.startsWith("/")) return true;
  return /^https:\/\/[\w.-]+\.supabase\.co\//i.test(u);
}

/**
 * Normaliza una entrada del cliente. Devuelve `null` cuando falta lo esencial
 * —el nombre o una URL aceptable— en vez de guardar una fila que no se va a
 * poder mostrar.
 */
export function construirFoto(
  input: FotoEspecieInput,
  usuario: string,
  ahora: string,
): FotoEspecie | null {
  const nombre = (input.nombre ?? "").trim();
  const url = (input.url ?? "").trim();
  if (!nombre || !urlDeFotoValida(url)) return null;
  return {
    clave: claveEspecie(nombre),
    nombre,
    cientifico: (input.cientifico ?? "").trim(),
    url,
    nota: (input.nota ?? "").trim().slice(0, 300),
    actualizado: ahora,
    actualizadoPor: usuario,
  };
}

/** Índice clave → foto, para que la tabla resuelva en O(1) por fila. */
export function indexarFotos(fotos: readonly FotoEspecie[]): Map<string, FotoEspecie> {
  const m = new Map<string, FotoEspecie>();
  for (const f of fotos) if (f?.clave) m.set(f.clave, f);
  return m;
}

/**
 * La foto de una especie, tolerando cómo la escribió cada guía.
 *
 * Prueba el nombre completo y después la primera palabra: SERFOR publica
 * "Cumala blanca" y el operador a veces anota sólo "Cumala". Devolver la del
 * género es mejor que no mostrar nada — es una referencia, no una prueba.
 */
export function fotoDe(
  indice: Map<string, FotoEspecie>,
  nombre: string | null | undefined,
): FotoEspecie | null {
  const clave = claveEspecie(nombre);
  if (!clave) return null;
  const exacta = indice.get(clave);
  if (exacta) return exacta;
  const genero = clave.split(" ")[0];
  if (genero && genero !== clave) return indice.get(genero) ?? null;
  return null;
}

/**
 * Las especies que aparecen en el libro y todavía no tienen foto — para que la
 * biblioteca proponga qué cargar en vez de pedir que uno se acuerde.
 */
export function especiesSinFoto(
  indice: Map<string, FotoEspecie>,
  especiesDelLibro: readonly (string | null | undefined)[],
): string[] {
  const vistas = new Set<string>();
  const faltan: string[] = [];
  for (const e of especiesDelLibro) {
    const nombre = (e ?? "").trim();
    const clave = claveEspecie(nombre);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    if (!fotoDe(indice, nombre)) faltan.push(nombre);
  }
  return faltan.sort((a, b) => a.localeCompare(b, "es"));
}
