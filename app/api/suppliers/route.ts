import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SuppliersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { ProveedorFichaDB } from "@/lib/db/proveedor-ficha.db";
import { errorDeDocumento, hayMismoDocumento, describirCoincidencia } from "@/lib/compras/proveedor-identidad";

const SupplierSchema = z.object({
  name: z.string().min(1, "name required").max(200),
  ruc: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  // New ficha fields
  tipoPersona: z.string().max(20).optional().nullable(),
  tipoDocumento: z.string().max(20).optional().nullable(),
  documento: z.string().max(20).optional().nullable(),
  razonSocial: z.string().max(200).optional().nullable(),
  estado: z.string().max(20).optional().nullable(),
  whatsappSecundario: z.string().max(30).optional().nullable(),
  personaContacto: z.string().max(100).optional().nullable(),
  departamento: z.string().max(100).optional().nullable(),
  provincia: z.string().max(100).optional().nullable(),
  distrito: z.string().max(100).optional().nullable(),
  direccion: z.string().max(500).optional().nullable(),
  categoria: z.string().max(50).optional().nullable(),
  condicionPago: z.string().max(30).optional().nullable(),
  diasCredito: z.number().int().min(0).optional(),
  // ADR-376: días que tarda en entregar. Sin esto, el punto de reorden de
  // Sugerencias cae al default y el formulario perdía el dato al crear.
  leadTimeDias: z.number().int().min(0).max(365).optional().nullable(),
  cuentaBancaria: z.string().max(50).optional().nullable(),
  banco: z.string().max(50).optional().nullable(),
  observaciones: z.string().max(2000).optional().nullable(),
  /** C34: guardar aunque ya haya un proveedor con el mismo documento (lo decidió la persona). */
  confirmarDuplicado: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await withDbRetry(() => SuppliersDB.getAll(auth.tenantId));
    return NextResponse.json(data ?? []);
  } catch (e) {
    // Graceful fallback — si la tabla no está migrada o hay timeout,
    // devolver [] en vez de 503 para no romper UI admin que iterará sobre el array.
    logger.warn("[suppliers] GET fallback empty", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "suppliers"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  // Paridad del bloqueo por plan (ADR-084): dar de alta proveedores es una
  // escritura más del módulo Compras.
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  const raw = await req.json();
  const parsed = SupplierSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const data = parsed.data;

  // C34: formato del documento por su tipo (RUC 11 dígitos, DNI 8) y el mismo
  // documento ya guardado. Una coincidencia no une nada: frena y pregunta.
  const documento = data.documento ?? data.ruc ?? null;
  const errorDoc = errorDeDocumento(data.tipoDocumento, documento);
  if (errorDoc) return NextResponse.json({ error: errorDoc, campo: "documento" }, { status: 400 });
  if (documento && !data.confirmarDuplicado) {
    const coincidencias = await ProveedorFichaDB.coincidencias(auth.tenantId, {
      name: data.name, razonSocial: data.razonSocial, tipoDocumento: data.tipoDocumento, documento, ruc: data.ruc,
    });
    const mismo = hayMismoDocumento(coincidencias);
    if (mismo) {
      return NextResponse.json(
        { error: `Ya tienes un proveedor con ese documento: ${describirCoincidencia(mismo)}. Si es otro, guarda igual.`, coincidencias },
        { status: 409 },
      );
    }
  }
  const id = `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Vía la DB class, no `prisma` directo (regla #1). El comentario que había
  // acá —«create using prisma directly to include all new fields»— ya no era
  // cierto: `SuppliersDB.add` guarda la ficha entera desde que se amplió, y
  // además invalida el caché del admin. Escribiendo por afuera, el proveedor
  // recién creado no aparecía en el POS hasta que venciera el cache.
  const supplier = await SuppliersDB.add({
    id,
    name: data.name,
    ruc: data.ruc || null,
    phone: data.phone || null,
    email: data.email || null,
    address: data.address || null,
    notes: data.notes || null,
    tipoPersona: data.tipoPersona || null,
    tipoDocumento: data.tipoDocumento || null,
    documento: data.documento || null,
    razonSocial: data.razonSocial || null,
    estado: data.estado || "activo",
    whatsappSecundario: data.whatsappSecundario || null,
    personaContacto: data.personaContacto || null,
    departamento: data.departamento || null,
    provincia: data.provincia || null,
    distrito: data.distrito || null,
    direccion: data.direccion || null,
    categoria: data.categoria || null,
    condicionPago: data.condicionPago || null,
    diasCredito: data.diasCredito || 0,
    leadTimeDias: data.leadTimeDias ?? null,
    cuentaBancaria: data.cuentaBancaria || null,
    banco: data.banco || null,
    observaciones: data.observaciones || null,
  } as Parameters<typeof SuppliersDB.add>[0], auth.tenantId);
  return NextResponse.json(supplier, { status: 201 });
}
