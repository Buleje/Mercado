/**
 * carpeta-local/rutas — el nombre de un documento del panel, escrito en un disco.
 *
 * El panel acepta nombres que un sistema de archivos no: dos puntos, barras,
 * comillas. Al bajar hay que sanearlos, y al escanear hay que poder volver
 * (por eso el estado guarda la ruta lógica Y la real; ver `decidir.ts`).
 */

/**
 * Caracteres que Windows prohíbe en un nombre de archivo.
 *
 * Se arma con `String.fromCharCode` en vez de una clase de regex a propósito:
 * escribir `/[<>:"|?*]/` en este archivo ya corrompió el código una vez
 * (bytes NUL en disco, ADR-307). Con una lista y `includes` no hay forma.
 */
const PROHIBIDOS = [
  "<", ">", ":", String.fromCharCode(34), "|", "?", "*", "/", "\\",
];

/** Nombres reservados de Windows: un archivo `CON.txt` no se puede crear. */
const RESERVADOS = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

/** Un nombre de archivo o carpeta que cualquier sistema operativo acepta. */
export function nombreSeguro(nombre: string): string {
  let salida = "";
  for (const ch of nombre) {
    const codigo = ch.charCodeAt(0);
    // Los de control (incluido \n y el NUL) rompen el path; los prohibidos, también.
    salida += codigo < 32 || PROHIBIDOS.includes(ch) ? "_" : ch;
  }
  // Windows recorta el punto y el espacio final al crear, y después el archivo
  // "no existe" con el nombre que pediste.
  salida = salida.replace(/[. ]+$/, "").trim();
  const base = salida.split(".")[0]?.toUpperCase() ?? "";
  if (RESERVADOS.has(base)) salida = `_${salida}`;
  return salida.slice(0, 180) || "archivo";
}

/** La misma cuenta para una ruta completa: cada segmento por su lado. */
export function rutaSegura(ruta: string): string {
  return ruta.split("/").filter(Boolean).map(nombreSeguro).join("/");
}

/**
 * Ruta lógica de un documento: la cadena de carpetas del panel + su nombre.
 *
 * `folderPathDe` devuelve los nombres desde la raíz. La ruta es lo que ata el
 * archivo del disco con el documento del panel, así que se arma igual en las
 * dos direcciones.
 */
export function rutaLogica(carpetas: string[], nombre: string): string {
  return [...carpetas, nombre].filter(Boolean).join("/");
}

/** Parte una ruta lógica en carpetas + nombre de archivo. */
export function partirRutaLogica(ruta: string): { carpetas: string[]; nombre: string } {
  const partes = ruta.split("/").filter(Boolean);
  return { carpetas: partes.slice(0, -1), nombre: partes[partes.length - 1] ?? "archivo" };
}

/**
 * Desambigua rutas repetidas.
 *
 * En el panel pueden convivir dos documentos con el mismo nombre en la misma
 * carpeta; en un disco, no. El segundo pasa a `factura (2).pdf` para que los
 * dos existan y ninguno pise al otro.
 */
export function rutaUnica(ruta: string, tomadas: Set<string>): string {
  if (!tomadas.has(ruta)) return ruta;
  const { carpetas, nombre } = partirRutaLogica(ruta);
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const ext = punto > 0 ? nombre.slice(punto) : "";
  for (let n = 2; n < 1000; n++) {
    const intento = rutaLogica(carpetas, `${base} (${n})${ext}`);
    if (!tomadas.has(intento)) return intento;
  }
  return rutaLogica(carpetas, `${base} (${Date.now()})${ext}`);
}
