/**
 * probar-vision — ¿qué modelo puede LEER una foto con las claves que tenés hoy?
 *
 * Los proveedores dan de baja modelos multimodales seguido (a Groq se le cayó
 * llama-4-scout y el escáner de cámara del drive dejó de funcionar sin avisar).
 * Este script arma una imagen de prueba con texto adentro, se la manda a cada
 * candidato y dice cuál la leyó bien — para no adivinar qué poner en
 * `DOC_VISION_MODEL`.
 *
 * Uso:
 *   node -r dotenv/config scripts/probar-vision.mjs                (usa .env.local)
 *   node scripts/probar-vision.mjs --url http://localhost:11434/v1 --modelo llava
 *
 * Al terminar imprime las líneas de .env.local que hay que pegar.
 */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import fs from "node:fs";

// ── Imagen de prueba: una boleta con una clave que el modelo tiene que leer ──
const CLAVE = "RUC 20512345678";
function imagenDePrueba() {
  const fuente = "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf";
  if (fs.existsSync(fuente)) GlobalFonts.registerFromPath(fuente, "Prueba");
  const c = createCanvas(640, 420);
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, 640, 420);
  x.fillStyle = "#111"; x.font = "26px Prueba";
  ["DISTRIBUIDORA EL ROBLE S.A.C.", CLAVE, "FACTURA F001-00004321", "Fecha: 12/03/2026", "TOTAL: S/ 2,680.00"]
    .forEach((linea, i) => x.fillText(linea, 30, 70 + i * 60));
  return c.toBuffer("image/png");
}

// ── Candidatos: los endpoints OpenAI-compatibles que tengan credencial ───────
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const urlManual = arg("--url");
const modeloManual = arg("--modelo");

const candidatos = [];
if (urlManual) {
  candidatos.push({ nombre: "manual", url: urlManual, key: arg("--key") ?? "no-key", modelos: [modeloManual ?? "llava"] });
} else {
  if (process.env.GROQ_API_KEY) candidatos.push({
    nombre: "Groq", url: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY,
    modelos: ["meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct", "llama-3.2-90b-vision-preview"],
  });
  if (process.env.AI_GATEWAY_API_KEY) candidatos.push({
    nombre: "Vercel AI Gateway", url: "https://ai-gateway.vercel.sh/v1", key: process.env.AI_GATEWAY_API_KEY,
    modelos: ["openai/gpt-4o-mini", "anthropic/claude-haiku-4.5", "google/gemini-2.0-flash"],
  });
  if (process.env.OPENAI_API_KEY) candidatos.push({
    nombre: "OpenAI", url: "https://api.openai.com/v1", key: process.env.OPENAI_API_KEY,
    modelos: ["gpt-4o-mini", "gpt-4o"],
  });
  if (process.env.XAI_API_KEY) candidatos.push({
    nombre: "xAI", url: "https://api.x.ai/v1", key: process.env.XAI_API_KEY,
    modelos: ["grok-2-vision-1212", "grok-4"],
  });
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) candidatos.push({
    nombre: "Gemini (compat OpenAI)", url: "https://generativelanguage.googleapis.com/v1beta/openai",
    key: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    modelos: ["gemini-2.0-flash", "gemini-1.5-flash"],
  });
  // Ollama local: gratis y sin cuenta. Sólo si está levantado.
  candidatos.push({ nombre: "Ollama local", url: "http://localhost:11434/v1", key: "ollama", modelos: null });
}

const dataUrl = `data:image/png;base64,${imagenDePrueba().toString("base64")}`;

async function modelosDeOllama() {
  try {
    const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return [];
    const { models = [] } = await r.json();
    return models.map((m) => m.name);
  } catch {
    return [];
  }
}

async function probar(url, key, modelo) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${url.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: modelo,
        messages: [{ role: "user", content: [
          { type: "text", text: "Transcribí TODO el texto que se ve en esta imagen. Sólo el texto." },
          { type: "image_url", image_url: { url: dataUrl } },
        ] }],
        max_tokens: 300,
        temperature: 0,
      }),
    });
    const cuerpo = await r.text();
    if (!r.ok) return { ok: false, detalle: `HTTP ${r.status} ${cuerpo.slice(0, 120).replace(/\s+/g, " ")}` };
    const texto = JSON.parse(cuerpo)?.choices?.[0]?.message?.content ?? "";
    const leyo = texto.replace(/[^\dA-Za-z]/g, "").includes(CLAVE.replace(/[^\dA-Za-z]/g, ""));
    return { ok: leyo, detalle: leyo ? `leyó "${CLAVE}" en ${((Date.now() - t0) / 1000).toFixed(1)}s` : `contestó pero NO leyó el RUC: ${texto.slice(0, 80).replace(/\s+/g, " ")}` };
  } catch (e) {
    return { ok: false, detalle: String(e.message ?? e).slice(0, 120) };
  }
}

console.log("Probando quién puede leer una foto de documento…\n");
const sirven = [];
for (const c of candidatos) {
  const modelos = c.modelos ?? (await modelosDeOllama());
  if (modelos.length === 0) {
    console.log(`— ${c.nombre}: no disponible (sin modelos o sin servidor)`);
    continue;
  }
  for (const m of modelos) {
    const r = await probar(c.url, c.key, m);
    console.log(`${r.ok ? "✅" : "❌"} ${c.nombre} · ${m} → ${r.detalle}`);
    if (r.ok) sirven.push({ ...c, modelo: m });
  }
}

console.log("");
if (sirven.length === 0) {
  console.log("Ninguno pudo. Opciones:");
  console.log("  · Ollama local y gratis:  ollama pull llava:7b   (después: node scripts/probar-vision.mjs)");
  console.log("  · Una API key de OpenAI/Gemini en .env.local y volvé a correr esto.");
  process.exit(1);
}
const g = sirven[0];
console.log("Pegá esto en .env.local:\n");
console.log(`DOC_VISION_MODEL="${g.modelo}"`);
if (g.nombre !== "Groq") {
  console.log(`DOC_VISION_BASE_URL="${g.url}"`);
  if (g.key && g.key !== "ollama" && g.key !== "no-key") console.log(`DOC_VISION_API_KEY="${g.key.slice(0, 8)}…"  (la clave completa)`);
}
console.log("\nDespués reiniciá el dev server: las variables se leen al arrancar.");
