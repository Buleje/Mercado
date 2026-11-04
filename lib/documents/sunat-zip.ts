/**
 * Lee el XML de un archivo de SUNAT (comprobante o CDR) con TOPES, para que un .zip inflado
 * ("zip bomb": 4 MB que al abrirse pesan gigas) no tumbe el servidor. Antes la ruta usaba
 * `JSZip.loadAsync` sin límites. Mismo criterio que `leerArchivoPropuesta` del cruce SIRE
 * (`lib/contabilidad/libros/sire-cruce.ts`): tope del archivo que entra y tope de lo que sale.
 *
 * `fflate` deja decidir por entrada ANTES de descomprimirla (`filter` con `originalSize`) y, si el
 * .zip miente en el tamaño que declara, corta la salida a lo declarado: medido 04-11 con un zip
 * que declaraba 100 bytes y traía 60 MB → salida de 100 bytes. Por eso el tamaño declarado es una
 * cota segura de memoria. Función PURA: bytes → XML; la ruta decide el código HTTP.
 */
import { unzipSync } from "fflate";

/** Lo que se acepta como archivo (un CDR o un XML firmado pesa unos KB; 4 MB es de sobra). */
export const TOPE_ARCHIVO_SUNAT_BYTES = 4 * 1024 * 1024;
/** El XML ya descomprimido: más que esto no es un comprobante (un CDR pesa ~3 KB). */
export const TOPE_XML_SUNAT_BYTES = 10 * 1024 * 1024;
/** Entradas que se aceptan dentro del .zip (un CDR trae 1 o 2). */
export const TOPE_ENTRADAS_ZIP = 100;

export type XmlSunat =
  | { ok: true; xml: string | null }
  /** `demasiado_grande`: el archivo o lo que hay adentro pasa el tope (413). `zip_invalido`: no se pudo abrir (422). */
  | { ok: false; motivo: "demasiado_grande" | "zip_invalido" };

const esZip = (b: Uint8Array): boolean => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/**
 * El XML de lo que subió el usuario: el .zip del CDR (el primer .xml adentro) o el XML suelto.
 * `null` en `xml` = el .zip no trae ningún .xml.
 */
export function xmlDeArchivoSunat(bytes: Uint8Array, nombre: string): XmlSunat {
  if (bytes.length > TOPE_ARCHIVO_SUNAT_BYTES) return { ok: false, motivo: "demasiado_grande" };
  if (!nombre.toLowerCase().endsWith(".zip") && !esZip(bytes)) return { ok: true, xml: new TextDecoder("utf-8").decode(bytes) };

  // Objeto y no `let`: TypeScript no ve que el `filter` los cambia y estrecharía `elegida` a `null`.
  const visto: { entradas: number; elegida: string | null; pesado: boolean } = { entradas: 0, elegida: null, pesado: false };
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(bytes, {
      filter: (f) => {
        visto.entradas += 1;
        if (visto.entradas > TOPE_ENTRADAS_ZIP) {
          visto.pesado = true;
          return false;
        }
        // Solo el primer .xml; lo demás ni se descomprime.
        if (visto.elegida !== null || !f.name.toLowerCase().endsWith(".xml")) return false;
        if (f.originalSize > TOPE_XML_SUNAT_BYTES) {
          visto.pesado = true;
          return false;
        }
        visto.elegida = f.name;
        return true;
      },
    });
  } catch {
    return { ok: false, motivo: "zip_invalido" };
  }
  if (visto.pesado) return { ok: false, motivo: "demasiado_grande" };
  const bytesXml = visto.elegida !== null ? archivos[visto.elegida] : undefined;
  return { ok: true, xml: bytesXml ? new TextDecoder("utf-8").decode(bytesXml) : null };
}
