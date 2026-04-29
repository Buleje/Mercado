import { NextRequest, NextResponse } from "next/server";

// SECURITY: NO fallback hardcodeado. Si la env var falta, el endpoint
// rechaza cualquier verificación — un fallback predecible permite a un
// atacante registrar un webhook propio en Meta y suplantar el de Buleje.
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

export async function GET(req: NextRequest) {
  if (!VERIFY_TOKEN) {
    return NextResponse.json(
      { error: "WHATSAPP_VERIFY_TOKEN no configurado" },
      { status: 503 },
    );
  }
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return NextResponse.json({ status: "no_message" });

  const from = message.from;
  const text = (message.text?.body || "").toLowerCase().trim();

  let reply = "Gracias por escribirnos! Responderemos pronto.";
  if (text.includes("catalogo") || text.includes("productos")) {
    reply = "Ve nuestro catalogo en: https://buleje.pe/tienda";
  } else if (text.includes("pedido")) {
    reply = "Consulta tu pedido en: https://buleje.pe/mis-pedidos";
  } else if (text.includes("ayuda")) {
    reply = "Escribe: catalogo, pedido, o fiado";
  } else if (text.includes("fiado")) {
    reply = "Consulta tu fiado en: https://buleje.pe/mis-pedidos";
  }

  const { sendTextMessage } = await import("@/lib/integrations/whatsapp");
  const { logger } = await import("@/lib/logger");
  sendTextMessage(from, reply).catch((err) => { logger.warn("[whatsapp webhook] reply send failed", { from, error: String(err) }); });
  return NextResponse.json({ status: "ok" });
}
