import "server-only";
import { DOCX_MIME, XLS_MIME, XLSX_MIME } from "./analyzable-mime";
import { extractXlsText } from "./extraer-xls";

/**
 * extraer-texto — el texto que un archivo trae adentro, sin pedirle nada a la IA.
 *
 * Vivía dentro de `analyze-document.ts` como función privada, y desde ADR-372 lo
 * necesita también la clasificación de papeles del despacho: el mismo PDF tiene
 * que leerse igual desde los dos lados o el buscador y el clasificador dirían
 * cosas distintas del mismo documento.
 *
 * Es **extracción, no OCR**: devuelve la capa de texto que el archivo ya tiene.
 * Un PDF escaneado o una foto devuelven vacío — para eso está la visión, que
 * cuesta y por eso se decide aparte.
 */

/** Entidades XML básicas → texto (el document.xml viene escapado). */
const desescapar = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/**
 * Texto de un .docx sin DOMParser (no existe en Node): los `<w:t>` de cada
 * párrafo, con salto por párrafo. Suficiente para describir y buscar.
 */
export async function extractDocxText(buf: Uint8Array): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  return xml
    .split("</w:p>")
    .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
      .map((t) => desescapar(t.replace(/<[^>]+>/g, "")))
      .join(""))
    .filter((linea) => linea.trim() !== "")
    .join("\n");
}

/** Texto de un .xlsx: nombre de hoja + celdas fila por fila (con tope). */
export async function extractXlsxText(buf: Uint8Array): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  const celda = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") {
      const o = v as { richText?: { text?: string }[]; result?: unknown; text?: unknown };
      if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? "").join("");
      if (o.result !== null && o.result !== undefined) return String(o.result);
      if (o.text !== null && o.text !== undefined) return String(o.text);
      return "";
    }
    return String(v);
  };
  const out: string[] = [];
  let filas = 0;
  wb.eachSheet((ws) => {
    if (filas >= 400) return;
    out.push(`— Hoja: ${ws.name} —`);
    ws.eachRow((row) => {
      if (filas >= 400) return; // tope: para describir alcanza el arranque
      const vals = (Array.isArray(row.values) ? row.values : []).map(celda).filter((s) => s.trim() !== "");
      if (vals.length > 0) { out.push(vals.join(" | ")); filas++; }
    });
  });
  return out.join("\n");
}

/** La capa de texto del archivo, por tipo. Vacío = hay que mirarlo con visión. */
export async function extractDocText(buf: Uint8Array, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    /**
     * Una COPIA, siempre.
     *
     * pdf.js se **apropia** del buffer que recibe: lo transfiere al worker y el
     * original queda *detached*. Quien nos llamó se quedaba con cero bytes, y el
     * paso siguiente —dibujar la página para MIRARLA cuando no hay capa de
     * texto— moría con «Cannot perform Construct on a detached ArrayBuffer».
     *
     * O sea: todo PDF escaneado fallaba justo en el camino que existe para los
     * PDF escaneados. Los tipos y los tests no lo ven; se destapa al pasar un
     * archivo real.
     */
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  if (mimeType === DOCX_MIME) return extractDocxText(buf);
  if (mimeType === XLSX_MIME) return extractXlsxText(buf);
  // Excel viejo (BIFF8). Son 28 archivos del aserradero — KARDEX y planillas de
  // trozado — que hasta ahora no los leía nadie.
  if (mimeType === XLS_MIME) return extractXlsText(buf);
  if (mimeType.startsWith("text/")) return new TextDecoder().decode(buf);
  return "";
}
