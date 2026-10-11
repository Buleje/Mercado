import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { WhatsAppFueraDeHorarioDB } from "@/lib/db/whatsapp-fuera-de-horario.db";
import {
  AjusteSchema,
  abiertoEnLima,
  proximaApertura,
  resumenHorario,
  textoDelAviso,
  type AjusteFueraDeHorario,
} from "@/lib/whatsapp/fuera-de-horario";

/**
 * GET/PUT /api/admin/whatsapp/fuera-de-horario — el aviso de «estamos cerrados»
 * del bot de WhatsApp (Mensajes › Números y bot). Mismos roles que los números
 * del bot (`/api/admin/whatsapp-config`). El horario NO se edita acá: es el de
 * la tienda (Marketplace › Tienda › Horario); se devuelve para mostrarlo.
 */

const ROLES = ["admin", "owner", "tienda_owner"] as const;

async function armar(tenantId: string, ajuste: AjusteFueraDeHorario) {
  const horario = await WhatsAppFueraDeHorarioDB.horario(tenantId);
  const now = new Date();
  return {
    ajuste,
    horario: {
      resumen: resumenHorario(horario),
      abiertoAhora: abiertoEnLima(horario, now),
      proximaApertura: proximaApertura(horario, now),
    },
    /** El texto tal como le llegaría al cliente ahora mismo. */
    vistaPrevia: textoDelAviso(ajuste, horario, now),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    const ajuste = await WhatsAppFueraDeHorarioDB.ajuste(auth.tenantId);
    return NextResponse.json(await armar(auth.tenantId, ajuste));
  } catch (err) {
    logger.error("[whatsapp/fuera-de-horario] GET", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo leer el aviso." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "whatsapp-fuera-de-horario");
  if (rl) return rl;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const parsed = AjusteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Escribe el texto del aviso (hasta 600 letras)." }, { status: 400 });
  }
  try {
    await WhatsAppFueraDeHorarioDB.guardar(auth.tenantId, parsed.data);
    return NextResponse.json(await armar(auth.tenantId, parsed.data));
  } catch (err) {
    logger.error("[whatsapp/fuera-de-horario] PUT", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo guardar el aviso." }, { status: 500 });
  }
}
