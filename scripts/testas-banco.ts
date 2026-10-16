/* Banco de testas-cv.ts sobre las escenas de scripts/testas-escena-sintetica.cjs: error por troza contra la verdad.
   Uso: npx tsx scripts/testas-banco.ts reports/testas-banco/escena-*.jpg (16-10: 87 trozas, error medio 0,01-0,03 cm). */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { medirCara, crearDetectorHojas, type OpenCvTestas } from "@/components/admin/forestal/camaras/testas-cv";

const req = createRequire(import.meta.url);
const RAIZ = process.cwd();
const sharp = req(path.join(RAIZ, "node_modules/sharp"));

async function cargarCv(): Promise<OpenCvTestas> {
  let cv = req(path.join(RAIZ, "node_modules/@techstark/opencv-js"));
  if (cv instanceof Promise || typeof cv.then === "function") cv = await cv;
  else if (!cv.Mat) await new Promise<void>((r) => (cv.onRuntimeInitialized = r));
  return cv as OpenCvTestas;
}

(async () => {
  const cv = await cargarCv();
  const det = crearDetectorHojas(cv);
  const resumen: Record<string, unknown>[] = [];
  for (const jpg of process.argv.slice(2)) {
    const verdad = JSON.parse(fs.readFileSync(jpg.replace(/\.jpg$/, ".json"), "utf8")).trozas as { x: number; y: number; dCm: number; dExactoCm: number; aMm: number }[];
    const { data, info } = await sharp(jpg).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
    const gris = new cv.Mat(info.height, info.width, cv.CV_8UC1);
    gris.data.set(data);
    const r = medirCara(cv, gris, det);
    gris.delete();
    if (!r.ok) { console.log(jpg, "SIN HOJA", r.otrosIds); continue; }
    const { cara, marco } = r;
    const usados = new Set<number>();
    const filas: string[] = [];
    const errs: number[] = [];
    verdad.forEach((v, i) => {
      let bi = -1, bd = 1e9;
      cara.testas.forEach((t, j) => {
        const x = t.cx * marco.mmPorPx + marco.origenMm[0], y = t.cy * marco.mmPorPx + marco.origenMm[1];
        const d = Math.hypot(x - v.x, y - v.y);
        if (d < bd && !usados.has(j)) { bd = d; bi = j; }
      });
      if (bi >= 0 && bd < 0.4 * v.aMm) {
        usados.add(bi);
        const t = cara.testas[bi]!;
        const e = Math.round((t.dCm - v.dCm) * 10) / 10;
        errs.push(e);
        filas.push(`${t.id}: ${t.dCm} vs ${v.dCm} (${e >= 0 ? "+" : ""}${e})`);
      } else filas.push(`troza ${i}: NO VISTA (${v.dCm})`);
    });
    const abs = errs.map(Math.abs);
    const media = abs.reduce((a, b) => a + b, 0) / (abs.length || 1);
    const sesgo = errs.reduce((a, b) => a + b, 0) / (errs.length || 1);
    resumen.push({ escena: path.basename(jpg), trozas: verdad.length, vistas: errs.length, falsas: cara.testas.length - errs.length, errAbsMedio: +media.toFixed(2), sesgo: +sesgo.toFixed(2), max: Math.max(...abs), hojaPx: cara.ladoHojaPx.join("/"), mmPorPx: +marco.mmPorPx.toFixed(2), ms: r.ms });
    console.log(path.basename(jpg), "→", filas.join(" · "));
    r.enderezada.delete();
    r.suave.delete();
  }
  console.table(resumen);
})().catch((e) => { console.error("FALLO", e); process.exit(1); });
