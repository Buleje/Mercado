// Grupo «documentos»: doc_mirar (31-10). Baja el archivo REAL del drive a una carpeta privada de esta PC y devuelve la ruta
// para abrirla con Read (imagen o PDF), junto con la descripción de la IA y el texto leído (OCR). Solo lectura.
// Archivo aparte de documentos.mjs a propósito (ese lo edita otra sesión); el servidor carga cada src/herramientas/*.mjs.
import { unlinkSync } from "node:fs";
import { CARPETA_MIRAR, TOPE_BYTES_MIRAR } from "../mirar.mjs";
import { taparTexto } from "../tapar.mjs";
import { z, negocio, idRuta, numero } from "../util-herramientas.mjs";

const MAX_OCR = 1500;
const mb = (b) => `${numero(b / 1024 / 1024, b < 1024 * 1024 ? 2 : 1)} MB`;
const una = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Carpeta de las bajadas; los tests la cambian. */
export const ajustes = /** @type {{ carpeta?: string }} */ ({});

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "doc_mirar",
    grupo: "documentos",
    tipo: "lectura",
    descripcion: "MIRAR un documento del drive: baja el archivo real (foto, escaneo o PDF) a una carpeta privada de esta PC y devuelve su RUTA para abrirla con Read (lee imágenes y PDF), más la descripción de la IA y el texto leído (OCR, recortado a 1.500 caracteres). HEIC/TIFF se convierten a PNG. Hasta 30 MB; si pasa, solo devuelve los datos. Los archivos locales se borran a las 2 horas. Usar cuando Brandon pide «ve mis papeles» / «mira este documento»; para solo datos usá doc_ver.",
    entrada: { negocio, id: idRuta },
    pedido: (a) => {
      const carpeta = ajustes.carpeta;
      const extra = carpeta ? { carpeta } : {};
      return [
        { metodo: "GET", ruta: `/api/admin/documents/${a.id}`, sinRecorte: true },
        { metodo: "GET", ruta: `/api/admin/documents/${a.id}/preview-image`, guardarEn: { base: `${a.id}-png`, opcional: true, ...extra } },
        { metodo: "GET", ruta: `/api/admin/documents/${a.id}/raw`, guardarEn: { base: a.id, ...extra } },
      ];
    },
    formatear: (d) => {
      const [det, vista, crudo] = Array.isArray(d) ? d : [d];
      const doc = det?.document ?? det ?? {};
      const meta = doc.ocrMetadata && typeof doc.ocrMetadata === "object" ? doc.ocrMetadata : {};
      const lineas = [`Documento: ${una(doc.name) || "(sin nombre)"}`];
      const tipoYTam = [doc.mimeType, typeof doc.size === "number" ? mb(doc.size) : null, doc.category].filter(Boolean).join(" · ");
      if (tipoYTam) lineas.push(`Tipo: ${tipoYTam}`);

      // Si hubo versión PNG (HEIC/TIFF…), esa es la que se abre; el original sobra.
      if (vista?.guardado) {
        if (crudo?.guardado) { try { unlinkSync(crudo.ruta); } catch { /* ya no está */ } }
        lineas.push(`Archivo local: ${vista.ruta} (convertido a PNG; ábrelo con Read)`);
      } else if (crudo?.guardado) {
        lineas.push(`Archivo local: ${crudo.ruta} (ábrelo con Read; PDF de más de 10 páginas: Read con pages)`);
      } else if (crudo?.motivo === "tamano") {
        lineas.push(`Archivo NO bajado: pesa ${mb(crudo.bytes)} y el tope es ${mb(TOPE_BYTES_MIRAR)}. Solo hay datos y texto.`);
      } else {
        lineas.push("Archivo NO bajado (no se pudo guardar). Solo hay datos y texto.");
      }

      const descripcion = una(meta.descripcionUsuario) || una(meta.description) || una(meta.summary);
      const ia = una(meta.description) || una(meta.summary);
      if (meta.descripcionUsuario && una(meta.descripcionUsuario)) lineas.push(`Descripción (escrita por una persona): ${taparTexto(una(meta.descripcionUsuario))}`);
      if (ia) lineas.push(`Descripción de la IA: ${taparTexto(ia)}`);
      else if (!descripcion) lineas.push("Sin descripción de la IA.");
      const ocr = una(doc.ocrText);
      if (ocr) lineas.push(`Texto leído (OCR${ocr.length > MAX_OCR ? `, primeros ${MAX_OCR} de ${ocr.length}` : ""}): ${taparTexto(ocr.slice(0, MAX_OCR))}`);
      return lineas.join("\n");
    },
  },
];

export { CARPETA_MIRAR };
