import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { ContractsDB } from "@/lib/db/contracts.db";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * Quiénes firman el contrato y en qué orden.
 *
 * El POST devuelve el LINK de cada firmante una sola vez, al definirlos: ese
 * link es la credencial con la que un tercero sin cuenta entra a firmar, así
 * que no se expone en el listado general de contratos.
 */

const FirmanteSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido").max(200),
  documento: z.string().max(20).default(""),
  telefono: z.string().max(20).default(""),
  email: z.string().email().max(200).nullish(),
  rol: z.enum(["EMISOR", "CONTRAPARTE", "TESTIGO"]).default("CONTRAPARTE"),
});

const SetFirmantesSchema = z.object({
  firmantes: z.array(FirmanteSchema).min(1, "Hace falta al menos un firmante").max(6),
});

function baseUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || req.nextUrl.origin;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const contrato = await ContractsDB.getById(auth.tenantId, id);
    if (!contrato) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });

    // Los links se re-entregan a pedido para poder reenviar por WhatsApp.
    const conLinks = await Promise.all(
      contrato.firmantes.map(async (f) => {
        const token = f.estado === "FIRMADO" ? null : await ContractsDB.getSignerToken(auth.tenantId, f.id);
        return { ...f, link: token ? `${baseUrl(req)}/firmar-contrato/${token}` : null };
      }),
    );
    return NextResponse.json({ firmantes: conLinks });
  } catch (e) {
    logger.error("[contratos/firmantes] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "contratos-firmantes");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SetFirmantesSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const contrato = await ContractsDB.getById(auth.tenantId, id);
    if (!contrato) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    if (contrato.estado === "ANULADO") {
      return NextResponse.json({ error: "El contrato está anulado" }, { status: 409 });
    }
    if (!contrato.contenido?.trim() && contrato.clausulas.length === 0) {
      return NextResponse.json({ error: "El contrato no tiene texto para firmar" }, { status: 422 });
    }

    const firmantes = await ContractsDB.setSigners(
      auth.tenantId,
      id,
      parsed.data.firmantes.map((f, i) => ({ ...f, orden: i + 1 })),
    );

    // Desde acá el contrato está esperando firmas, no simplemente "vigente".
    await ContractsDB.update(auth.tenantId, id, { estado: "PENDIENTE_FIRMA" });
    await ContractsDB.addEvent(
      auth.tenantId,
      id,
      "ENVIADO_FIRMA",
      `Enviado a firmar a ${firmantes.map((f) => f.nombre).join(", ")}`,
      auth.username,
    );

    const conLinks = await Promise.all(
      firmantes.map(async (f) => {
        const token = await ContractsDB.getSignerToken(auth.tenantId, f.id);
        return { ...f, link: token ? `${baseUrl(req)}/firmar-contrato/${token}` : null };
      }),
    );

    logAudit({
      req,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      detail: `Contrato ${contrato.numero} enviado a firmar (${firmantes.length} firmante/s)`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({ ok: true, firmantes: conLinks }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("no_se_puede_cambiar_firmantes_con_firmas")) {
      return NextResponse.json(
        { error: "Ya hay firmas registradas: no se puede cambiar la lista de firmantes." },
        { status: 409 },
      );
    }
    logger.error("[contratos/firmantes] POST error", { err: msg });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
