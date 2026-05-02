#!/usr/bin/env node
// E2E smoke test del WhatsApp Concierge AI.
// Simula 6 conversaciones reales sin necesitar Meta API ni token.
//
// Uso:
//   node scripts/test-whatsapp-concierge.mjs
//   BASE_URL=http://localhost:3000 node scripts/test-whatsapp-concierge.mjs
//
// El endpoint /api/whatsapp/concierge/test es solo dev — invoca al motor
// directamente y devuelve la respuesta. Sin AI key, todo cae al menú welcome.

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PHONE_BASE = "51987654";

const SCENARIOS = [
  {
    name: "Saludo inicial",
    phone: `${PHONE_BASE}001`,
    message: "hola buenas tardes",
    expectIntent: "saludo",
  },
  {
    name: "Búsqueda de producto (cross-tenant)",
    phone: `${PHONE_BASE}002`,
    message: "tienen arroz?",
    expectIntent: "precio",
  },
  {
    name: "Recomendación IA — parrilla",
    phone: `${PHONE_BASE}003`,
    message: "qué me recomiendas para hacer una parrilla este sábado",
    expectIntent: "recomendar",
  },
  {
    name: "Pedido directo (carrito)",
    phone: `${PHONE_BASE}004`,
    message: "quiero 2 kilos de arroz y 1 litro de aceite",
    expectIntent: "pedido",
  },
  {
    name: "Estado de pedido",
    phone: `${PHONE_BASE}005`,
    message: "dónde está mi pedido?",
    expectIntent: "estado",
  },
  {
    name: "Hablar con humano",
    phone: `${PHONE_BASE}006`,
    message: "quiero hablar con una persona real",
    expectIntent: "humano",
  },
];

const ESC = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function color(c, txt) {
  return `${ESC[c] ?? ""}${txt}${ESC.reset}`;
}

async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/api/whatsapp/concierge/test`, {
      method: "GET",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function runScenario(s) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}/api/whatsapp/concierge/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "main",
        phone: s.phone,
        message: s.message,
      }),
    });
    const body = await res.json();
    const ms = Date.now() - start;
    return { ok: res.ok, status: res.status, body, ms };
  } catch (err) {
    return { ok: false, err: err.message ?? String(err) };
  }
}

function previewReply(reply) {
  if (!reply) return "(empty)";
  const lines = reply.split("\n").slice(0, 6);
  const truncated = reply.split("\n").length > 6 ? "\n  …" : "";
  return lines.map((l) => `  ${l}`).join("\n") + truncated;
}

async function main() {
  console.log(color("bold", "\n🤖 WhatsApp Concierge — E2E smoke test\n"));
  console.log(color("dim", `BASE=${BASE}\n`));

  const health = await checkHealth();
  if (!health) {
    console.log(
      color("red", "❌ /api/whatsapp/concierge/test no responde."),
      "\n   ¿Está corriendo `npm run dev`?",
    );
    process.exit(1);
  }

  console.log(
    color("cyan", "── Health ──────────────────────────────────────────"),
  );
  console.log(`  Active provider:  ${color("bold", health.activeProvider)}`);
  console.log(
    `  AI key present:   ${health.aiKeySet ? color("green", "yes") : color("yellow", "NO (todo caerá al menú welcome)")}`,
  );
  console.log("");

  let pass = 0;
  let fail = 0;

  for (const s of SCENARIOS) {
    console.log(
      color("magenta", `── ${s.name} ─────────────────────────────────────`),
    );
    console.log(color("dim", `  📱 phone: ${s.phone}`));
    console.log(color("dim", `  💬 msg:   "${s.message}"`));

    const r = await runScenario(s);

    if (!r.ok) {
      fail++;
      console.log(color("red", `  ❌ FAIL  ${r.err ?? r.status}`));
      console.log("");
      continue;
    }

    pass++;
    const reply = r.body?.response?.reply ?? "";
    const state = r.body?.response?.state ?? "?";
    const escalated = r.body?.response?.escalated ?? false;

    console.log(
      color("green", `  ✅ ${r.status}`) +
        color("dim", `  ${r.ms}ms · state=${state}${escalated ? " · ESCALATED" : ""}`),
    );
    console.log(color("dim", `  reply preview:`));
    console.log(previewReply(reply));
    console.log("");
  }

  console.log(color("bold", "── Resumen ──────────────────────────────────────"));
  console.log(`  ✅ pass: ${pass}`);
  console.log(`  ❌ fail: ${fail}`);
  console.log("");

  if (!health.aiKeySet) {
    console.log(
      color(
        "yellow",
        "⚠ Sin API key, todos los mensajes caen al menú welcome (intent=desconocido).\n" +
          "   Configurá ANTHROPIC_API_KEY (recomendado) o GROQ_API_KEY (free) en .env.local\n" +
          "   y reiniciá el dev server para activar el clasificador IA.",
      ),
    );
  }

  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(color("red", "Fatal:"), err);
  process.exit(2);
});
