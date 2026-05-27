#!/usr/bin/env node
/**
 * browse — Control del browser en vivo desde Claude Code.
 *
 * Mientras el MCP de Playwright se reconecta tras cambio de config,
 * este helper expone navegación + click + type + screenshot + evaluate
 * con sesión persistente vía /tmp/bsm-browser-state.json.
 *
 * Uso:
 *   node scripts/dev-helpers/browse.mjs navigate /marketplace/main
 *   node scripts/dev-helpers/browse.mjs screenshot /tmp/out.png
 *   node scripts/dev-helpers/browse.mjs click "text=Comprar"
 *   node scripts/dev-helpers/browse.mjs type "[name=email]" "test@x.com"
 *   node scripts/dev-helpers/browse.mjs eval "document.title"
 *   node scripts/dev-helpers/browse.mjs html              # devuelve HTML actual
 *   node scripts/dev-helpers/browse.mjs console           # logs últimos 50
 *   node scripts/dev-helpers/browse.mjs close             # cierra sesión
 *
 * Auth admin (qaadmin) automático con --auth.
 * Tema dark con --dark.
 *
 * El navegador queda abierto en background hasta que llames `close` o
 * pase 10min de inactividad.
 */
import { chromium } from "playwright";
import { existsSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const BASE = "http://localhost:3000";
const TENANT = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");
const STATE_FILE = "/tmp/bsm-browser-state.json";
const WS_LOG = "/tmp/bsm-browser-ws.txt";

async function startServer() {
  // Lanzar browser en server mode (chromium con --remote-debugging-port o usando server pattern)
  // Para simplificar: cada invocación abre+cierra. Si hay state cookies/auth/url los persiste.
  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
  return browser;
}

async function withSession(fn) {
  const browser = await startServer();
  try {
    const state = existsSync(STATE_FILE)
      ? (() => { try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return null; } })()
      : null;
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      extraHTTPHeaders: { "x-tenant-id": TENANT },
      ...(state?.storageState ? { storageState: state.storageState } : {}),
    });
    const page = await ctx.newPage();
    if (state?.url) {
      try { await page.goto(state.url, { waitUntil: "domcontentloaded", timeout: 15000 }); } catch {}
    }
    const consoleMessages = [];
    page.on("console", (m) => consoleMessages.push(`[${m.type()}] ${m.text()}`.slice(0, 300)));
    const result = await fn(page, ctx, consoleMessages);
    // Guardar storageState para próximo invocación
    try {
      const storageState = await ctx.storageState();
      writeFileSync(STATE_FILE, JSON.stringify({ storageState, url: page.url() }));
    } catch {}
    await browser.close();
    return result;
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

async function authIfNeeded(page) {
  const res = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
    data: { username: USER, password: PASS },
  });
  if (res.status() !== 200) throw new Error(`auth failed: ${res.status()}`);
  return true;
}

async function applyDark(page) {
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    try { localStorage.setItem("theme", "dark"); } catch {}
  });
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];
  const opts = {
    auth: args.includes("--auth"),
    dark: args.includes("--dark"),
    full: args.includes("--full"),
  };
  const positional = args.filter((a) => !a.startsWith("--") && a !== action);

  if (!action || action === "help") {
    console.log("Acciones: navigate, screenshot, click, type, eval, html, console, close");
    process.exit(0);
  }

  if (action === "close") {
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    console.log("session closed");
    return;
  }

  await withSession(async (page, ctx, consoleMessages) => {
    if (opts.auth) await authIfNeeded(page);

    switch (action) {
      case "navigate": {
        const url = positional[0];
        if (!url) throw new Error("navigate requires url");
        const fullUrl = url.startsWith("http") ? url : `${BASE}${url}`;
        await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        if (opts.dark) await applyDark(page);
        await page.waitForTimeout(500);
        try { await page.waitForLoadState("networkidle", { timeout: 4000 }); } catch {}
        console.log(JSON.stringify({ ok: true, url: page.url(), title: await page.title() }));
        break;
      }
      case "screenshot": {
        const out = positional[0] ?? "/tmp/bsm-screenshot.png";
        if (opts.dark) await applyDark(page);
        await page.screenshot({ path: out, fullPage: opts.full });
        console.log(JSON.stringify({ ok: true, path: out, theme: opts.dark ? "dark" : "light" }));
        break;
      }
      case "click": {
        const selector = positional[0];
        if (!selector) throw new Error("click requires selector");
        await page.click(selector, { timeout: 5000 });
        await page.waitForTimeout(300);
        console.log(JSON.stringify({ ok: true, clicked: selector, url: page.url() }));
        break;
      }
      case "type": {
        const [selector, text] = positional;
        if (!selector || text == null) throw new Error("type requires selector and text");
        await page.fill(selector, text, { timeout: 5000 });
        console.log(JSON.stringify({ ok: true, typed: selector }));
        break;
      }
      case "eval": {
        const expr = positional.join(" ");
        const res = await page.evaluate((e) => {
           
          return new Function("return (" + e + ")")();
        }, expr);
        console.log(JSON.stringify({ ok: true, result: res }));
        break;
      }
      case "html": {
        const html = await page.content();
        const max = 4000;
        console.log(html.length > max ? html.slice(0, max) + "\n... (" + html.length + " chars truncated)" : html);
        break;
      }
      case "console": {
        await page.waitForTimeout(300);
        for (const m of consoleMessages.slice(-50)) console.log(m);
        break;
      }
      case "snapshot": {
        // Snapshot ARIA accessibility (similar al MCP browser_snapshot)
        const snap = await page.accessibility.snapshot({ interestingOnly: true });
        console.log(JSON.stringify(snap, null, 2).slice(0, 4000));
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  });
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message?.slice(0, 200) }));
  process.exit(1);
});
