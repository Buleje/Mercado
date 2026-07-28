import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { firmarPorToken, rechazarPorToken } from "@/lib/contratos/firma-contrato";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * El único write del flujo público de firma. Sin sesión ni CSRF: el token del
 * firmante es la credencial (irrepetible, con vencimiento propio) y el endpoint
 * va con rate-limit STRICT.
 */

const FirmarSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("firmar"),
    firma: z.string().min(100).max(1_200_000),
    // El nombre viene del firmante ya cargado; acá sólo confirma que es él.
    confirmaIdentidad: z.literal(true),
  }),
  z.object({
    accion: z.literal("rechazar"),
    motivo: z.string().min(3, "Contanos por qué no lo firmás").max(500),
  }),
]);

const MENSAJES: Record<string, string> = {
  ya_firmo: "Ya firmaste este contrato.",
  rechazado: "Ya habías rechazado este contrato.",
  no_es_su_turno: "Todavía no es tu turno de firmar.",
  link_vencido: "Este link de firma venció. Pedí uno nuevo.",
  contrato_cerrado: "Este contrato ya no está en circulación.",
  no_encontrado: "Este link no existe o fue revocado.",
  firma_invalida: "No pudimos leer tu firma. Volvé a dibujarla.",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "contrato-firmar");
  if (_rl) return _rl;

  const { token } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = FirmarSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    if (parsed.data.accion === "rechazar") {
      const res = await rechazarPorToken(token, parsed.data.motivo);
      if (!res.ok) {
        return NextResponse.json(
          { error: MENSAJES[res.error ?? ""] ?? "No se pudo registrar" },
          { status: res.status ?? 409 },
        );
      }
      return NextResponse.json({ ok: true, rechazado: true });
    }

    const res = await firmarPorToken(token, {
      firmaDataUrl: parsed.data.firma,
      // Se guardan para poder sostener después quién firmó, desde dónde y con qué.
      ip:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        undefined,
      userAgent: req.headers.get("user-agent")?.slice(0, 400) ?? undefined,
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: MENSAJES[res.error ?? ""] ?? "No se pudo firmar" },
        { status: res.status ?? 409 },
      );
    }
    return NextResponse.json({ ok: true, completo: res.completo });
  } catch (e) {
    logger.error("[public/contratos/firmar] POST error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "No se pudo registrar la firma" }, { status: 500 });
  }
}
