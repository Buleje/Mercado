import { NextRequest, NextResponse } from "next/server";
import { ContractsDB } from "@/lib/db/contracts.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { generarContratoPdf } from "@/lib/contratos/contrato-pdf";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * El PDF que lee quien va a firmar, servido same-origin.
 *
 * Same-origin y no una URL firmada de Supabase porque el visor va dentro de un
 * iframe, y Supabase manda `X-Frame-Options` — el mismo tropiezo que ya se
 * arregló en el visor del drive.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "contrato-firma-pdf");
  if (_rl) return _rl;

  const { token } = await params;

  try {
    const encontrado = await ContractsDB.findBySignerToken(token);
    if (!encontrado) return NextResponse.json({ error: "link_invalido" }, { status: 404 });

    const { contract } = encontrado;
    const cuerpo = (contract.contenido?.trim() || contract.clausulas.join("\n\n")).trim();
    if (!cuerpo) return NextResponse.json({ error: "sin_texto" }, { status: 422 });

    const settings = await SettingsDB.get(contract.tenantId).catch(() => null);
    const razonSocial = settings?.razonSocial?.trim() || settings?.businessName?.trim();
    const firmas = await ContractsDB.getSignatureImages(contract.tenantId, contract.id);

    const pdf = await generarContratoPdf({
      contrato: contract,
      emisor: razonSocial
        ? { razonSocial, ruc: settings?.ruc ?? undefined, direccion: settings?.businessAddress ?? undefined }
        : undefined,
      firmas,
      borrador: firmas.length < contract.firmantes.length,
    });

    return new NextResponse(Buffer.from(pdf.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${contract.numero}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    logger.error("[public/contratos/pdf] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
}
