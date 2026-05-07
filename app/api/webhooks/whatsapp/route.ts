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
  // SECURITY 2026-05-05 (audit webhooks #6): firma X-Hub-Signature-256.
  // Antes este endpoint legacy aceptaba cualquier POST JSON respondiendo
  // con datos del catálogo y links internos — vector de exfiltración +
  // suplantación de Meta.
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json(
      { error: "WHATSAPP_APP_SECRET no configurado" },
      { status: 503 },
    );
  }
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const crypto = await import("crypto");
  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const message = (body as { entry?: { changes?: { value?: { messages?: { from: string; text?: { body?: string } }[] } }[] }[] })?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
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
