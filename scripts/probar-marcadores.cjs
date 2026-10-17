#!/usr/bin/env node
/**
 * Prueba de los marcadores ArUco de troza (ADR-480, 2026-10-08), en Node y
 * con el MISMO motor que el navegador (OpenCV.js 5.0.0-release.1).
 *
 *   node scripts/probar-marcadores.cjs --autoprueba
 *       Dibuja marcadores con la tabla de `lib/camaras/aruco-4x4-250.ts`
 *       (la que imprime el panel) a 12-48 px de lado, con y sin desenfoque +
 *       JPEG 50 (como el video H.265), y los lee: tiene que salir el MISMO id
 *       y ningún otro. Sale con código 1 si la tabla y OpenCV no coinciden.
 *
 *   node scripts/probar-marcadores.cjs <carpeta|archivo.jpg …>
 *       Lee cuadros REALES (jpg/png/webp: una foto de «Contar ahora», una
 *       captura del mosaico en HD) y dice qué marcadores vio, con su lado en
 *       px y px por celda (≥4 holgado · 3 justo · <3 al límite).
 *
 * El gemelo de `probar-detector-camaras.cjs`. Sólo lee archivos: no toca la
 * base ni la red.
 */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const RAIZ = path.join(__dirname, "..");
const CELDAS = 6;

function tabla() {
  const txt = fs.readFileSync(path.join(RAIZ, "lib/camaras/aruco-4x4-250.ts"), "utf8");
  const cuerpo = txt.slice(txt.indexOf("= [") + 3, txt.lastIndexOf("]"));
  const nums = cuerpo.split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  if (nums.length !== 250 || nums.some((n) => !Number.isInteger(n))) throw new Error(`tabla rara: ${nums.length} números`);
  return nums;
}

/** 8×8 celdas (borde blanco de 1 + negro de 1 + 4×4), 1 byte por celda: 0 negro, 255 blanco. */
function celdas(bits) {
  const out = Buffer.alloc(64, 255);
  for (let f = 0; f < CELDAS; f++)
    for (let c = 0; c < CELDAS; c++) {
      const borde = f === 0 || c === 0 || f === CELDAS - 1 || c === CELDAS - 1;
      const blanca = !borde && ((bits >> (15 - ((f - 1) * 4 + (c - 1)))) & 1) === 1;
      out[(f + 1) * 8 + (c + 1)] = blanca ? 255 : 0;
    }
  return out;
}

async function cargarCv() {
  let cv = require(path.join(RAIZ, "node_modules/@techstark/opencv-js"));
  if (cv instanceof Promise || typeof cv.then === "function") cv = await cv;
  else if (!cv.Mat) await new Promise((r) => (cv.onRuntimeInitialized = r));
  return cv;
}

function detector(cv, correccion) {
  const dict = cv.getPredefinedDictionary(cv.DICT_4X4_250);
  const params = new cv.aruco_DetectorParameters();
  if (correccion != null) params.errorCorrectionRate = correccion;
  return new cv.aruco_ArucoDetector(dict, params, new cv.aruco_RefineParameters(10, 3, true));
}

function leer(cv, det, gris, ancho, alto) {
  const img = cv.matFromArray(alto, ancho, cv.CV_8UC1, gris);
  const esquinas = new cv.MatVector();
  const ids = new cv.Mat();
  const rech = new cv.MatVector();
  const t = performance.now();
  det.detectMarkers(img, esquinas, ids, rech);
  const ms = performance.now() - t;
  const out = [];
  for (let i = 0; i < ids.data32S.length; i++) {
    const p = esquinas.get(i).data32F;
    let lado = 0;
    for (let k = 0; k < 4; k++) lado += Math.hypot(p[((k + 1) % 4) * 2] - p[k * 2], p[((k + 1) % 4) * 2 + 1] - p[k * 2 + 1]) / 4;
    out.push({ id: ids.data32S[i], ladoPx: Math.round(lado * 10) / 10 });
  }
  img.delete();
  esquinas.delete();
  ids.delete();
  rech.delete();
  return { lecturas: out, ms };
}

const veredicto = (lado) => (lado / CELDAS >= 4 ? "holgado" : lado / CELDAS >= 3 ? "justo" : "al límite");

async function autoprueba() {
  const cv = await cargarCv();
  const t = tabla();
  const W = 1280;
  const H = 720;
  const ids = [0, 7, 37, 120, 199, 245, 249];
  let malos = 0;
  for (const correccion of [0, null]) {
    const det = detector(cv, correccion);
    console.log(`\n— errorCorrectionRate ${correccion ?? "por defecto (0,6)"} —`);
    for (const sigma of [0, 0.8, 1.2])
      for (const lado of [12, 16, 20, 24, 32, 48]) {
        /* `lado` = el cuadrado NEGRO (6 celdas); con el margen blanco son 8 celdas. */
        const total = Math.round((lado * 8) / CELDAS);
        const comps = [];
        let x = 40;
        for (const id of ids) {
          const png = await sharp(celdas(t[id]), { raw: { width: 8, height: 8, channels: 1 } })
            .resize(total, total, { kernel: "nearest" })
            .png()
            .toBuffer();
          comps.push({ input: png, left: x, top: 300 });
          x += total + 60;
        }
        let img = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 140, g: 120, b: 100 } } })
          .composite(comps)
          .png()
          .toBuffer();
        if (sigma) img = await sharp(img).blur(sigma).jpeg({ quality: 50 }).toBuffer();
        const { data } = await sharp(img).greyscale().raw().toBuffer({ resolveWithObject: true });
        const { lecturas, ms } = leer(cv, det, data, W, H);
        const vistos = lecturas.map((l) => l.id);
        const bien = ids.filter((id) => vistos.includes(id)).length;
        const falsos = vistos.filter((v) => !ids.includes(v)).length;
        if (falsos) malos++;
        if (correccion === 0 && lado >= 24 && sigma <= 0.8 && bien < ids.length) malos++;
        console.log(
          `blur ${sigma} · ${String(lado).padStart(2)} px (${(lado / CELDAS).toFixed(1)} px/celda) → ${bien}/${ids.length} · falsos ${falsos} · ${ms.toFixed(0)} ms`,
        );
      }
  }
  console.log(malos ? `\n✗ ${malos} casos fuera de lo esperado` : "\n✓ la tabla del panel y OpenCV dicen lo mismo");
  return malos ? 1 : 0;
}

async function reales(rutas) {
  const cv = await cargarCv();
  const det = detector(cv, 0);
  const archivos = rutas.flatMap((r) =>
    fs.statSync(r).isDirectory()
      ? fs.readdirSync(r).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => path.join(r, f))
      : [r],
  );
  if (!archivos.length) {
    console.error("No hay imágenes (jpg/png/webp) en lo que pasaste.");
    return 1;
  }
  for (const a of archivos) {
    const { data, info } = await sharp(a).greyscale().raw().toBuffer({ resolveWithObject: true });
    const { lecturas, ms } = leer(cv, det, data, info.width, info.height);
    const txt = lecturas.length
      ? lecturas.map((l) => `#${l.id} ${l.ladoPx} px (${(l.ladoPx / CELDAS).toFixed(1)} px/celda, ${veredicto(l.ladoPx)})`).join(" · ")
      : "ningún marcador";
    console.log(`${path.basename(a)} ${info.width}×${info.height} · ${ms.toFixed(0)} ms → ${txt}`);
  }
  return 0;
}

(async () => {
  const args = process.argv.slice(2);
  const codigo = args.includes("--autoprueba") || !args.length ? await autoprueba() : await reales(args);
  process.exit(codigo);
})().catch((e) => {
  console.error(String((e && e.message) || e));
  process.exit(1);
});
