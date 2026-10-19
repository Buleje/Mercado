import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/require-admin";
import { ProductsDB } from "@/lib/db/products.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { parsearCsv } from "@/lib/documentos/hoja-calculo";
import { revisarPisoDePrecios } from "@/lib/precios/piso-servidor";
import { respuestaBajoPiso, textoBajoPisoConfirmado } from "@/lib/precios/piso";

// ── Schemas ───────────────────────────────────────────────────────────────────

const RowSchema = z.object({
  nombre: z.string().min(1, "Nombre vacío").max(150),
  categoria: z.string().max(100).default("General"),
  precio: z.number({ error: "Precio inválido" }).positive("Precio debe ser mayor a 0"),
  precio_costo: z.number().min(0).optional(),
  stock: z.number().int().min(0).default(0),
  stock_minimo: z.number().int().min(0).optional(),
  unidad: z.string().max(20).default("unidad"),
  codigo_barras: z.string().max(100).optional(),
});

type RowInput = z.infer<typeof RowSchema>;

/** «Importar igual» del aviso del piso: el cliente reenvía el archivo con este campo. */
const ConfirmarBajoPisoSchema = z.literal("true");

/** Tope del archivo (el modal dice «hasta 10 MB»): se corta antes de leerlo. */
const TOPE_BYTES = 10_000_000;
const archivoMuyGrande = (bytes: number) =>
  NextResponse.json(
    { error: `El archivo pesa ${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB: el tope es 10 MB` },
    { status: 413 },
  );

// ── Column aliases ─────────────────────────────────────────────────────────────
// Normaliza variantes comunes de nombres de columna al nombre canónico esperado.

const COLUMN_ALIASES: Record<string, string> = {
  // nombre
  name: "nombre",
  producto: "nombre",
  "nombre del producto": "nombre",
  // categoria
  category: "categoria",
  tipo: "categoria",
  grupo: "categoria",
  // precio
  price: "precio",
  valor: "precio",
  "precio venta": "precio",
  "precio de venta": "precio",
  // precio_costo
  costo: "precio_costo",
  "precio costo": "precio_costo",
  "costo unitario": "precio_costo",
  cost: "precio_costo",
  // stock
  cantidad: "stock",
  existencia: "stock",
  qty: "stock",
  // stock_minimo
  "stock min": "stock_minimo",
  "stock minimo": "stock_minimo",
  "minimo": "stock_minimo",
  // unidad
  unit: "unidad",
  um: "unidad",
  medida: "unidad",
  // codigo_barras
  barcode: "codigo_barras",
  ean: "codigo_barras",
  "codigo": "codigo_barras",
  "cod barras": "codigo_barras",
};

function normalizeKey(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return COLUMN_ALIASES[lower] ?? lower.replace(/\s+/g, "_");
}

function normalizeRow(rawRow: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawRow)) {
    out[normalizeKey(k)] = v;
  }
  return out;
}

function toNumber(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = Number(String(val).replace(",", "."));
  return isNaN(n) ? undefined : n;
}

/** Filas de la primera hoja de un .xlsx; null = el libro no tiene hojas. */
async function filasDeExcel(arrayBuffer: ArrayBuffer): Promise<Record<string, unknown>[] | null> {
  const workbook = new ExcelJS.Workbook();
  // exceljs internamente acepta cualquier dato binario (Buffer, ArrayBuffer,
  // Uint8Array) via toBuffer(), pero sus @types exportan la firma vieja
  // `load(buffer: Buffer)` que choca con el `Buffer<ArrayBufferLike>` del
  // @types/node reciente. Cast pragmático para evitar el mismatch estructural.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);
  if (workbook.worksheets.length === 0) return null;
  return workbookToJson(workbook);
}

/**
 * Lee un workbook de exceljs y devuelve filas como objetos {header: value}.
 * Toma la primera hoja, asume que la primera fila son headers.
 */
function workbookToJson(workbook: ExcelJS.Workbook): Record<string, unknown>[] {
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: Record<string, unknown>[] = [];
  let headers: string[] = [];

  sheet.eachRow({ includeEmpty: false }, (row: ExcelJS.Row, rowNumber: number) => {
    const values = row.values as unknown[];
    // exceljs values[] es 1-indexed; index 0 es siempre undefined
    const cells = values.slice(1).map((v) => {
      if (v === null || v === undefined) return "";
      // Si es objeto rich-text de exceljs, sacar el texto plano
      if (typeof v === "object" && "richText" in (v as object)) {
        const rt = (v as { richText: { text: string }[] }).richText;
        return rt.map((r) => r.text).join("");
      }
      // Si es objeto formula, usar el resultado
      if (typeof v === "object" && "result" in (v as object)) {
        return (v as { result: unknown }).result ?? "";
      }
      return v;
    });

    if (rowNumber === 1) {
      headers = cells.map((c) => String(c ?? ""));
    } else {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = cells[i] ?? "";
      }
      rows.push(obj);
    }
  });

  return rows;
}

/**
 * CSV → filas {encabezado: valor}. Hasta el 19-10 la ruta leía todo como
 * .xlsx y un .csv (lo que la ventana ofrece primero) caía en 503 «Error
 * procesando el archivo». Separador `;` (Excel en español), tab o `,`;
 * UTF-8 o Windows-1252 (el CSV que guarda Excel en Windows).
 */
function csvAFilas(buffer: ArrayBuffer): Record<string, unknown>[] {
  let texto = new TextDecoder("utf-8").decode(buffer);
  if (texto.includes("\uFFFD")) texto = new TextDecoder("windows-1252").decode(buffer);
  texto = texto.replace(/^\uFEFF/, "");
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t"].reduce((mejor, s) => (primera.split(s).length > primera.split(mejor).length ? s : mejor), ",");
  const matriz = parsearCsv(texto, sep).filter((f) => f.some((c) => c.trim() !== ""));
  if (matriz.length === 0) return [];
  const headers = matriz[0].map((h) => h.trim());
  return matriz.slice(1).map((f) => Object.fromEntries(headers.map((h, i) => [h, f[i]?.trim() ?? ""])));
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "products-import"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const requestId = req.headers.get("x-request-id") ?? undefined;

  try {
    // Un cuerpo de más de 10 MB ni se parsea (el multipart suma unos bytes de
    // cabecera, de ahí el margen); el tamaño exacto se mira en el archivo.
    const largo = Number(req.headers.get("content-length") ?? 0);
    if (largo > TOPE_BYTES + 64_000) return archivoMuyGrande(largo);
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      logger.warn("[products/import] Sin archivo en FormData", { requestId, user: auth.username });
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    logger.info("[products/import] Iniciando lectura de archivo", {
      requestId,
      user: auth.username,
      fileName: (file as File).name,
      size: (file as File).size,
    });

    if ((file as File).size > TOPE_BYTES) return archivoMuyGrande((file as File).size);

    const confirmarBajoPiso = ConfirmarBajoPisoSchema.safeParse(formData.get("confirmarBajoPiso")).success;
    const arrayBuffer = await file.arrayBuffer();
    const nombreArchivo = (file as File).name.toLowerCase();
    const esCsv = nombreArchivo.endsWith(".csv") || (file as File).type === "text/csv";
    const rawRows = esCsv ? csvAFilas(arrayBuffer) : await filasDeExcel(arrayBuffer);
    if (rawRows === null) {
      return NextResponse.json({ error: "El archivo no contiene hojas" }, { status: 400 });
    }

    if (rawRows.length === 0) {
      logger.warn("[products/import] Archivo vacío", { requestId, user: auth.username });
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    }

    if (rawRows.length > 1000) {
      logger.warn("[products/import] Límite de filas excedido", { requestId, rows: rawRows.length });
      return NextResponse.json(
        { error: `Máximo 1000 filas por importación. El archivo tiene ${rawRows.length}.` },
        { status: 400 }
      );
    }

    logger.info("[products/import] Procesando filas", { requestId, rows: rawRows.length });

    const errors: { row: number; message: string }[] = [];
    const validas: { fila: number; data: RowInput }[] = [];
    let created = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 2; // +2 porque fila 1 son headers, filas empiezan en 2
      const normalized = normalizeRow(rawRows[i]);

      // Coercionar tipos numéricos antes de validar
      const coerced: Partial<RowInput & Record<string, unknown>> = {
        nombre: String(normalized.nombre ?? "").trim(),
        categoria: String(normalized.categoria ?? "").trim() || "General",
        precio: toNumber(normalized.precio),
        precio_costo: toNumber(normalized.precio_costo),
        stock: toNumber(normalized.stock) ?? 0,
        stock_minimo: toNumber(normalized.stock_minimo),
        unidad: String(normalized.unidad ?? "").trim() || "unidad",
        codigo_barras: String(normalized.codigo_barras ?? "").trim() || undefined,
      };

      const parsed = RowSchema.safeParse(coerced);

      if (!parsed.success) {
        const msgs = parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ");
        errors.push({ row: rowNum, message: msgs });
        continue;
      }

      validas.push({ fila: rowNum, data: parsed.data });
    }

    // Código de barras repetido (reviewer 19-10): barcode no es único en la
    // base, así que subir dos veces el mismo archivo duplicaba todo. Una fila
    // cuyo código ya tiene un producto vivo del negocio, o que repite el de
    // una fila anterior del archivo, se salta con su aviso; sin código se crea.
    const codigos = [...new Set(validas.flatMap(({ data }) => (data.codigo_barras ? [data.codigo_barras] : [])))];
    const yaExisten = new Map(
      (await ProductsDB.listByBarcodes(auth.tenantId, codigos)).map((p) => [p.barcode, p.name] as const),
    );
    const vistos = new Map<string, { fila: number; nombre: string }>();
    const aCrear = validas.filter(({ fila, data }) => {
      const codigo = data.codigo_barras;
      if (!codigo) return true;
      const existente = yaExisten.get(codigo);
      if (existente !== undefined) {
        errors.push({ row: fila, message: `Fila ${fila} · ya existe un producto con ese código (${existente})` });
        return false;
      }
      const anterior = vistos.get(codigo);
      if (anterior) {
        errors.push({ row: fila, message: `Fila ${fila} · ese código ya está en la fila ${anterior.fila} del archivo (${anterior.nombre})` });
        return false;
      }
      vistos.set(codigo, { fila, nombre: data.nombre });
      return true;
    });

    // Piso de rebajas (Brandon 19-10, «Piso en lo que falta»): una fila con su
    // costo y un precio bajo costo + piso del negocio no se crea sin el OK del
    // dueño. Sin confirmar = 409 con las filas y NO se crea ninguna.
    const usuario = auth.username ?? "admin";
    const { pisoSobreCosto, avisos } = await revisarPisoDePrecios(
      auth.tenantId,
      aCrear.map(({ fila, data }) => ({
        productId: null,
        fila,
        nombre: data.nombre,
        precioActual: null,
        precioNuevo: data.precio,
        costo: data.precio_costo != null && data.precio_costo > 0 ? data.precio_costo : null,
      })),
    );
    if (avisos.length > 0 && !confirmarBajoPiso) {
      logger.info("[products/import] Filas bajo el piso sin confirmar", { requestId, filas: avisos.length });
      return NextResponse.json({ ...respuestaBajoPiso(avisos, pisoSobreCosto), errors }, { status: 409 });
    }

    // Altas con `create` (id que da la base). Hasta el 19-10 se calculaba
    // max(id de los productos VIVOS del negocio) + 1 y se hacía upsert: el id
    // caía sobre un producto ya borrado del mismo negocio (la fila se «creaba»
    // borrada: «2 productos creados» que no aparecían; medido en main) o sobre
    // el de otro negocio (la fila fallaba con «Error al guardar»).
    const filasCreadas = new Set<number>();

    for (const { fila: rowNum, data } of aCrear) {
      try {
        await ProductsDB.create({
          name: data.nombre,
          category: data.categoria,
          price: data.precio,
          costPrice: data.precio_costo,
          image: "",
          unit: data.unidad,
          stock: data.stock,
          stockMin: data.stock_minimo,
          barcode: data.codigo_barras,
          active: true,
          tenantId: auth.tenantId,
        });
        created++;
        filasCreadas.add(rowNum);
      } catch (dbErr) {
        logger.error("[products/import] Error guardando fila", {
          requestId,
          row: rowNum,
          err: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
        errors.push({ row: rowNum, message: "Error al guardar en base de datos" });
      }
    }

    // `create` revalida con "max" (la 1.ª lectura todavía es la lista vieja):
    // el inventario tiene que mostrar lo subido al cerrar la ventana.
    if (created > 0) revalidateTag(`tenant:${auth.tenantId}:products`, { expire: 0 });

    logger.info("[products/import] Importación completada", {
      requestId,
      user: auth.username,
      created,
      errors: errors.length,
    });

    logActivity(
      "Importar",
      "producto",
      `Importación Excel "${(file as File).name}": ${created} creados, ${errors.length} errores`,
      undefined,
      auth.username ?? "admin",
      requestId,
      auth.tenantId,
    ).catch((err) => {
      logger.error("[products/import] logActivity failed", { requestId, error: String(err) });
    });

    const confirmados = avisos.filter((a) => a.fila != null && filasCreadas.has(a.fila));
    if (confirmados.length > 0) {
      logActivity("Precio bajo piso", "producto", textoBajoPisoConfirmado(confirmados, usuario), undefined, usuario, requestId, auth.tenantId)
        .catch((err) => logger.error("[products/import] log del piso falló", { requestId, error: String(err) }));
    }

    return NextResponse.json({ created, errors }, { status: 201 });
  } catch (err) {
    logger.error("[products/import] Error inesperado", {
      requestId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 503 });
  }
}

// ── Plantilla de descarga ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const template = [
    {
      nombre: "Arroz Extra 5kg",
      categoria: "abarrotes",
      precio: 18.5,
      precio_costo: 14.0,
      stock: 50,
      stock_minimo: 10,
      unidad: "bolsa",
      codigo_barras: "7751234560011",
    },
    {
      nombre: "Aceite Vegetal 1L",
      categoria: "abarrotes",
      precio: 7.9,
      precio_costo: 5.5,
      stock: 30,
      stock_minimo: 5,
      unidad: "botella",
      codigo_barras: "",
    },
  ];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Buleje ERP";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet("Productos");

  worksheet.columns = [
    { header: "nombre", key: "nombre", width: 30 },
    { header: "categoria", key: "categoria", width: 15 },
    { header: "precio", key: "precio", width: 10 },
    { header: "precio_costo", key: "precio_costo", width: 12 },
    { header: "stock", key: "stock", width: 8 },
    { header: "stock_minimo", key: "stock_minimo", width: 12 },
    { header: "unidad", key: "unidad", width: 10 },
    { header: "codigo_barras", key: "codigo_barras", width: 18 },
  ];

  // Estilizar header
  worksheet.getRow(1).font = { bold: true };

  for (const row of template) {
    worksheet.addRow(row);
  }

  const buf = await workbook.xlsx.writeBuffer();

  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-productos.xlsx"',
    },
  });
}
