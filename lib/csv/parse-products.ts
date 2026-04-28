/**
 * parse-products.ts — Parser CSV / TSV de productos para bulk-import.
 *
 * Convierte un string de CSV (separado por `,` o `\t`) en un array de
 * objetos planos listos para enviar a /api/admin/products/bulk-import.
 *
 * Reglas:
 *   - Primera fila: cabecera. Mapeamos por nombre de columna (case-insensitive,
 *     normalizamos acentos y espacios).
 *   - Soporta valores entrecomillados ("Producto, con coma").
 *   - Filas vacías se ignoran.
 *   - Campos numéricos vienen como string — el endpoint los coacciona con z.coerce.
 *
 * Se usa client-side; el server NO depende de este archivo.
 */

const HEADER_ALIASES: Record<string, string> = {
  "name": "name",
  "nombre": "name",
  "producto": "name",

  "category": "category",
  "categoria": "category",
  "categoría": "category",

  "price": "price",
  "precio": "price",
  "preciodeventa": "price",

  "costprice": "costPrice",
  "costo": "costPrice",
  "preciocosto": "costPrice",
  "preciodecompra": "costPrice",

  "unit": "unit",
  "unidad": "unit",

  "barcode": "barcode",
  "codigodebarra": "barcode",
  "codigobarras": "barcode",
  "ean": "barcode",
  "sku": "barcode",

  "stock": "stock",
  "existencias": "stock",
  "cantidad": "stock",

  "stockmin": "stockMin",
  "minimo": "stockMin",
  "stockminimo": "stockMin",

  "stockmax": "stockMax",
  "maximo": "stockMax",
  "stockmaximo": "stockMax",

  "image": "image",
  "imagen": "image",
  "foto": "image",
  "imageurl": "image",

  "description": "description",
  "descripcion": "description",
  "descripción": "description",

  "badge": "badge",
  "etiqueta": "badge",

  "active": "active",
  "activo": "active",
  "habilitado": "active",
};

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Tokeniza una línea CSV respetando comillas dobles.
 * Soporta `,` y `;` como separadores; auto-detecta el más usado.
 */
function detectSeparator(firstLine: string): "," | ";" | "\t" {
  const counts = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as "," | ";" | "\t";
}

function parseLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cur += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === sep && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export type ParsedProductRow = Record<string, string | undefined>;

export function parseProductsCsv(input: string): {
  rows: ParsedProductRow[];
  headers: string[];
  unknownHeaders: string[];
  totalLines: number;
} {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], headers: [], unknownHeaders: [], totalLines: 0 };
  }

  const sep = detectSeparator(lines[0]!);
  const rawHeaders = parseLine(lines[0]!, sep);
  const mappedHeaders = rawHeaders.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? null);
  const unknownHeaders = rawHeaders.filter((_, i) => mappedHeaders[i] === null);
  const headers = mappedHeaders.filter((h): h is string => h !== null);

  const rows: ParsedProductRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]!, sep);
    const obj: ParsedProductRow = {};
    rawHeaders.forEach((_, j) => {
      const target = mappedHeaders[j];
      if (target) obj[target] = cols[j] ?? "";
    });
    // Skip rows where name is empty
    if (!obj.name || obj.name.length === 0) continue;
    rows.push(obj);
  }

  return { rows, headers, unknownHeaders, totalLines: lines.length };
}

/** Genera un CSV plantilla descargable para que el bodeguero llene. */
export function getTemplateCsv(): string {
  const headers = [
    "name",
    "category",
    "price",
    "costPrice",
    "unit",
    "barcode",
    "stock",
    "stockMin",
    "stockMax",
    "image",
    "description",
    "active",
  ];
  const sample = [
    "Arroz Costeño 5kg",
    "Abarrotes",
    "22.50",
    "18.00",
    "bolsa",
    "7750130000123",
    "30",
    "5",
    "100",
    "https://example.com/arroz.jpg",
    "Arroz extra grano largo",
    "true",
  ];
  return `${headers.join(",")}\n${sample.map((s) => (s.includes(",") ? `"${s}"` : s)).join(",")}\n`;
}
