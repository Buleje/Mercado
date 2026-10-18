#!/usr/bin/env node
/**
 * QA del superadmin en 1 llamada: entra como superadmin (token atado al UA del
 * navegador, memoria superadmin-visual-qa-auth) y por cada ruta mide el scroll
 * lateral y, si se pide, guarda una captura.
 *
 *   node scripts/qa-superadmin.mjs /superadmin/tenants=/ruta/captura.png /superadmin/billing
 *   ANCHO=400 OSCURO=1 node scripts/qa-superadmin.mjs /superadmin/tenants=x.png
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const env = fs.readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").replace(/^"|"$/g, "");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: Number(process.env.ANCHO ?? 1280), height: 900 }, colorScheme: process.env.OSCURO ? "dark" : "light" });
const page = await ctx.newPage();
const ua = await page.evaluate(() => navigator.userAgent);
const out = execFileSync("curl", ["-s", "-i", "-A", ua, "-H", "Content-Type: application/json", "-d", JSON.stringify({ username: get("SUPERADMIN_USERNAME"), password: get("SUPERADMIN_PASSWORD"), honeypot: "" }), "http://localhost:3000/api/superadmin/auth"]).toString();
const val = out.match(/buleje-platform-sess=([^;]+)/)?.[1];
await ctx.addCookies([{ name: "buleje-platform-sess", value: val, domain: "localhost", path: "/", httpOnly: true, sameSite: "Strict" }]);
for (const [ruta, archivo] of process.argv.slice(2).map((a) => a.split("="))) {
  await page.goto("http://localhost:3000" + ruta, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const sw = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, ancho: innerWidth }));
  console.log(ruta, JSON.stringify(sw));
  if (archivo) await page.screenshot({ path: archivo });
}
await b.close();
