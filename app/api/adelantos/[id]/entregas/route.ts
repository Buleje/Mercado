import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantosDB, IdempotenciaDistintaError, ReglaDeRecibidoError } from "@/lib/db/adelantos.db";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { esFotoDelNegocio } from "@/lib/adelantos/recibo-firmado";

const EntregaSchema = z
  .object({
    tipo: z.enum(["LIBRE", "PRODUCTO"]),
    descripcion: z.string().max(300).optional(),
    productId: z.number().int().positive().optional(),
    cantidad: z.number().positive().max(9999999).optional(),
    valorManual: z.number().positive().max(9999999999).optional(),
    sumarAStock: z.boolean().optional(),
    pactadaId: z.string().max(40).optional(),
    notas: z.string().max(500).optional(),
    comprobanteUrl: z.string().url().max(500).optional(),
    fecha: z.string().optional(),
    /**
     * Si la persona liquidó con PLATA y esa plata entró al cajón. Sólo aplica a
     * entregas libres: recibir mercadería no mueve efectivo.
     */
    metodoCaja: z.enum(["efectivo", "yape", "plin", "tarjeta", "transferencia"]).nullable().optional(),
    /**
     * (ADR-448) Una por intento: el abono de «Me pagan lo que me deben» y la
     * devolución en plata mueven la caja, y un corte de red + reintento las
     * anotaba dos veces. Mismo cuerpo → la misma entrega (200, `repetido`);
     * otro cuerpo → 422 `idempotencia_distinta`.
     */
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
  })
  .refine((d) => (d.tipo === "PRODUCTO" ? d.productId != null || d.valorManual != null : d.valorManual != null), {
    message: "Entrega LIBRE requiere valorManual; PRODUCTO requiere productId o valorManual",
  });

// POST /api/adelantos/[id]/entregas — registrar liquidación (atómico)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-entrega"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;
  try {
    const parsed = EntregaSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    /* La foto de la entrega se pinta en `<img>`/`<a>` de la ficha: tiene que ser
       la que `/api/upload` subió a la carpeta de ESTE negocio, como en el alta.
       `z.string().url()` dejaba pasar `javascript:`, `priv:` o un sitio ajeno. */
    const foto = parsed.data.comprobanteUrl?.trim();
    if (foto && !esFotoDelNegocio(foto, { tenantId: auth.tenantId, origenStorage: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "" })) {
      return NextResponse.json({ error: "La foto del comprobante tiene que subirse desde el panel de este negocio.", code: "foto_ajena" }, { status: 422 });
    }
    let adelanto;
    try {
      /* ADR-448: devolver en plata un RECIBIDO saca plata de la caja — sólo admin
         o dueño. La DB class lo decide bajo el lock, con la dirección de la fila. */
      adelanto = await AdelantosDB.registrarEntrega(auth.tenantId, id, parsed.data, {
        puedeSacarPlataDeRecibido: soloAdminODueno(auth.role) === null,
      });
    } catch (bizErr) {
      if (bizErr instanceof ReglaDeRecibidoError || bizErr instanceof IdempotenciaDistintaError) {
        return NextResponse.json({ error: bizErr.message, code: bizErr.code }, { status: bizErr.status });
      }
      // Errores de negocio (producto inexistente, valor 0, adelanto cancelado) → 400 claro.
      return NextResponse.json({ error: bizErr instanceof Error ? bizErr.message : "Error de validación" }, { status: 400 });
    }
    if (!adelanto) return NextResponse.json({ error: "Adelanto no encontrado" }, { status: 404 });
    /* Reintento del mismo intento: la entrega ya estaba; no se anota otra ni se mueve la caja. */
    if (adelanto.repetido) return NextResponse.json(adelanto, { status: 200 });
    logActivity("Liquidar", "adelanto", `Entrega registrada en adelanto ${id} — saldo S/${adelanto.saldoPendiente.toFixed(2)}`, id, auth.username, undefined, auth.tenantId).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json(adelanto, { status: 201 });
  } catch (e) {
    logger.error("[adelantos/entregas] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
