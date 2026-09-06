import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ContractsDB } from "@/lib/db/contracts.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { generarContratoPdf } from "@/lib/contratos/contrato-pdf";
import { archivarContrato } from "@/lib/contratos/archivar-contrato";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET  → devuelve el PDF del contrato, armado al vuelo (inline o descarga).
 * POST → genera el PDF y lo archiva en Documentación como documento vivo.
 *
 * El GET no usa CSRF a propósito: así el visor del panel puede pedirlo dentro
 * de un iframe same-origin, igual que el `/raw` del drive.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const contrato = await ContractsDB.getById(auth.tenantId, id);
    if (!contrato) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });

    const cuerpo = (contrato.contenido?.trim() || contrato.clausulas.join("\n\n")).trim();
    if (!cuerpo) {
      return NextResponse.json({ error: "El contrato no tiene texto todavía" }, { status: 422 });
    }

    const settings = await SettingsDB.get(auth.tenantId).catch(() => null);
    const razonSocial = settings?.razonSocial?.trim() || settings?.businessName?.trim();
    const firmasDb = await ContractsDB.getSignatureImages(auth.tenantId, id);

    const pdf = await generarContratoPdf({
      contrato,
      emisor: razonSocial
        ? { razonSocial, ruc: settings?.ruc ?? undefined, direccion: settings?.businessAddress ?? undefined }
        : undefined,
      firmas: firmasDb,
      borrador:
        contrato.estado === "BORRADOR" ||
        (contrato.firmantes.length > 0 && firmasDb.length < contrato.firmantes.length),
    });

    const descarga = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(pdf.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${descarga ? "attachment" : "inline"}; filename="${contrato.numero}.pdf"`,
        // Se rearma en cada request (las firmas pueden cambiar en cualquier momento).
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    logger.error("[contratos/pdf] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo generar el PDF" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "contratos-pdf");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const res = await archivarContrato(auth.tenantId, id, auth.username);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status ?? 500 });
    }

    logAudit({
      req,
      action: "EXPORT",
      entity: "Order",
      entityId: id,
      detail: `Contrato archivado en Documentación (doc ${res.documentId})`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({
      ok: true,
      documentId: res.documentId,
      hash: res.hash,
      paginas: res.paginas,
    });
  } catch (e) {
    logger.error("[contratos/pdf] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo archivar el contrato" }, { status: 500 });
  }
}
