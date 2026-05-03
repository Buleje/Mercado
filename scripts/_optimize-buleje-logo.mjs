// Optimiza el logo de marca:
//  1. Quita fondo blanco (chroma-key con tolerancia)
//  2. Trimea bordes vacíos
//  3. Genera 3 variantes:
//     - buleje-logo.png      (full: b + swoosh + "Buleje" wordmark)
//     - buleje-logo-mark.png (solo b + swoosh, recortado top portion)
//     - buleje-logo.webp     (full, formato moderno, 1/3 del peso)
//
// Output: public/brand/*
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "public/brand/_source.png");
const OUT = path.join(ROOT, "public/brand");

// Tolerancia para considerar un pixel "blanco" — 240..255 todos los canales.
// Esto preserva el antialiasing de los bordes negros y teal.
const WHITE_THRESHOLD = 240;

async function removeWhiteBackground(inputPath) {
  const pipeline = sharp(inputPath).ensureAlpha();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // 4
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      // Pixel blanco → totalmente transparente
      data[i + 3] = 0;
    } else if (r >= 200 && g >= 200 && b >= 200) {
      // Casi blanco → semi-transparente proporcional (suaviza bordes)
      const avg = (r + g + b) / 3;
      const alpha = Math.round(255 * (1 - (avg - 200) / 55));
      data[i + 3] = Math.min(data[i + 3], alpha);
    }
  }
  return { data, width, height, channels };
}

async function main() {
  console.log("[1/4] Removing white background...");
  const { data, width, height, channels } = await removeWhiteBackground(SRC);

  const transparent = sharp(data, { raw: { width, height, channels } });

  // --- Variant 1: full logo trimmed + resized 512x512 ---
  console.log("[2/4] Writing buleje-logo.png (512x512 transparent)...");
  await transparent
    .clone()
    .trim() // recorta bordes transparentes
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(path.join(OUT, "buleje-logo.png"));

  // --- Variant 2: WebP (moderno, ~70% smaller) ---
  console.log("[3/4] Writing buleje-logo.webp (512x512 transparent)...");
  await transparent
    .clone()
    .trim()
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92, lossless: false, alphaQuality: 100 })
    .toFile(path.join(OUT, "buleje-logo.webp"));

  // --- Variant 3: mark-only (cropped top portion, sin "Buleje" text) ---
  // Source es 1254x1254. La "b"+swoosh ocupa aproximadamente top 65%.
  // Estrategia: extraer top 65% del SOURCE original (con bg blanco), luego
  // re-aplicar chroma-key en el subset crop.
  console.log("[4/4] Writing buleje-logo-mark.png (mark-only 256x256)...");
  const srcMeta = await sharp(SRC).metadata();
  const sw = srcMeta.width;
  const sh = srcMeta.height;
  const cropHeight = Math.floor(sh * 0.58);

  const croppedRaw = await sharp(SRC)
    .extract({ left: 0, top: 0, width: sw, height: cropHeight })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Aplica chroma-key sobre el crop
  const cd = croppedRaw.data;
  for (let i = 0; i < cd.length; i += 4) {
    const r = cd[i], g = cd[i + 1], b = cd[i + 2];
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      cd[i + 3] = 0;
    } else if (r >= 200 && g >= 200 && b >= 200) {
      const avg = (r + g + b) / 3;
      cd[i + 3] = Math.min(cd[i + 3], Math.round(255 * (1 - (avg - 200) / 55)));
    }
  }

  const markBase = sharp(cd, {
    raw: { width: croppedRaw.info.width, height: croppedRaw.info.height, channels: croppedRaw.info.channels },
  });

  await markBase
    .clone()
    .trim()
    .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, "buleje-logo-mark.png"));

  await markBase
    .clone()
    .trim()
    .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(path.join(OUT, "buleje-logo-mark.webp"));

  console.log("\n✅ Logos generados:");
  console.log("   /brand/buleje-logo.png       (full, 512x512, transparent)");
  console.log("   /brand/buleje-logo.webp      (full, 512x512, transparent, smaller)");
  console.log("   /brand/buleje-logo-mark.png  (mark-only, 256x256, transparent)");
  console.log("   /brand/buleje-logo-mark.webp (mark-only, 256x256, transparent, smaller)");
}

main().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
