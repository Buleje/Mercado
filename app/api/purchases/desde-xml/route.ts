/**
 * POST /api/purchases/desde-xml — vista previa de una compra armada desde la
 * factura electrónica (XML UBL 2.1) que mandó el proveedor. NO escribe nada:
 * lee el XML, busca al proveedor por RUC y sugiere el producto de cada línea.
 * La compra se guarda después por `POST /api/purchases` (el dueño confirma).
 *
 * 200 → `{ ok: true, vista }` · 400/413/422 → `{ ok: false, error, message }`
 * (tipo `RespuestaDesdeXml` de `lib/compras/factura-xml-cruce`).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { PurchasesDB, SuppliersDB } from "@/lib/db/purchases.db";
import { ProductsDB } from "@/lib/db/products.db";
import { coincidenciasDeProveedor } from "@/lib/compras/proveedor-identidad";
import { leerFacturaXml, TOPE_BYTES_XML } from "@/lib/compras/factura-xml";
import {
  codigosDeLineas,
  indexarCatalogo,
  sugerirProducto,
  type RespuestaDesdeXml,
  type VistaPreviaFacturaXml,
} from "@/lib/compras/factura-xml-cruce";

const CuerpoSchema = z.object({
  xml: z.string().min(1, "Falta el XML de la factura.").max(TOPE_BYTES_XML, "El XML pesa más de 2 MB."),
});

function rechazo(status: number, error: "xml_invalido" | "datos_invalidos" | "muy_grande", message: string) {
  const cuerpo: RespuestaDesdeXml = { ok: false, error, message };
  return NextResponse.json(cuerpo, { status });
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "purchases-xml"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  // El JSON escapa comillas y saltos: el cuerpo puede pasar un poco los 2 MB del XML.
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > TOPE_BYTES_XML * 2) return rechazo(413, "muy_grande", "El archivo pesa más de 2 MB; una factura electrónica pesa mucho menos.");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return rechazo(400, "datos_invalidos", "No llegó el XML. Vuelve a elegir el archivo.");
  }
  const parsed = CuerpoSchema.safeParse(raw);
  if (!parsed.success) {
    return rechazo(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "No llegó el XML. Vuelve a elegir el archivo.");
  }

  const lectura = leerFacturaXml(parsed.data.xml);
  if (!lectura.ok) return rechazo(422, "xml_invalido", lectura.error);
  const factura = lectura.factura;

  try {
    const [proveedores, productos, yaCargada] = await Promise.all([
      withDbRetry(() => SuppliersDB.getAll(auth.tenantId)),
      withDbRetry(() => ProductsDB.paraCruceDeFactura(auth.tenantId, codigosDeLineas(factura.lineas))),
      withDbRetry(() => PurchasesDB.findByInvoiceNumber(auth.tenantId, factura.serieNumero)),
    ]);

    const coincidencias = coincidenciasDeProveedor(
      { name: factura.emisor.razonSocial, razonSocial: factura.emisor.razonSocial, tipoDocumento: "RUC", documento: factura.emisor.ruc, ruc: factura.emisor.ruc },
      proveedores,
    );
    const mismo = coincidencias.find((c) => c.motivos.includes("documento"));
    const fichaMismo = mismo ? proveedores.find((p) => p.id === mismo.id) : undefined;

    const catalogo = indexarCatalogo(productos.catalogo);
    const vista: VistaPreviaFacturaXml = {
      factura,
      proveedor: {
        existente: mismo ? { id: mismo.id, nombre: mismo.nombre, ruc: fichaMismo?.ruc ?? fichaMismo?.documento ?? null } : null,
        parecidos: coincidencias.filter((c) => c.id !== mismo?.id).slice(0, 5),
      },
      lineas: factura.lineas.map((l) => sugerirProducto(l, productos.porCodigo, catalogo)),
      yaCargada: yaCargada
        ? { id: yaCargada.id, total: yaCargada.total, createdAt: String(yaCargada.createdAt), supplierName: yaCargada.supplierName ?? "" }
        : null,
      catalogoRecortado: productos.recortado,
    };
    const cuerpo: RespuestaDesdeXml = { ok: true, vista };
    return NextResponse.json(cuerpo);
  } catch (err) {
    logger.error("[purchases/desde-xml] vista previa falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ ok: false, error: "datos_invalidos", message: "No se pudo armar la vista previa. Intenta de nuevo." }, { status: 500 });
  }
}
