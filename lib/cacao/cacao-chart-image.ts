import "server-only";

/**
 * cacao-chart-image.ts — dibuja el gráfico de precio del cacao (S//kg de
 * compra local, últimos N días) como PNG, para el digest diario por correo
 * (cron `cacao-precio-diario`). No hay navegador en un cron: es la MISMA
 * limitación que ya resolvió `lib/documents/miniatura-doc.ts` para las
 * miniaturas del drive, así que reusa su registro de fuente — sin eso, cada
 * letra sale como un cuadradito vacío en el servidor de Vercel.
 */
import { fuenteParaMiniaturas } from "@/lib/documents/miniatura-doc";

const W = 900;
const H = 480;
const MARGEN = { top: 90, right: 40, bottom: 56, left: 78 };
const VERDE = "#16A34A";
const ROJO = "#DC2626";
const GRIS = "#6B7280";
const GRIS_CLARO = "#9CA3AF";
const REJILLA = "#E5E7EB";
const ACENTO = "#00A0A0";

export interface PuntoCacaoSolKg {
  /** epoch ms (UTC, fin de día). */
  t: number;
  solKg: number;
}

export interface DatosGraficoCacao {
  /** Serie cronológica en S//kg de compra local — el mismo número que ve el
   *  productor, no el ICE crudo. */
  puntos: PuntoCacaoSolKg[];
  /** % de cambio de HOY vs el cierre anterior (mismo signo que en el ICE). */
  changePct: number | null;
  /** Precio ICE de hoy, para el pie del gráfico. */
  usdTon: number | null;
  /** "18 de agosto de 2026". */
  fechaTexto: string;
}

/**
 * Arma el PNG del digest diario. `null` si el servidor no tiene ninguna
 * fuente disponible (evita mandar un gráfico ilegible por correo).
 */
export async function graficoCacaoDiarioPNG(datos: DatosGraficoCacao): Promise<Buffer | null> {
  const familia = await fuenteParaMiniaturas();
  if (!familia) return null;

  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const hoy = datos.puntos.at(-1)?.solKg ?? null;

  // ── Cabecera: título + fecha a la izquierda, precio grande a la derecha ──
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#111827";
  ctx.font = `bold 26px ${familia}`;
  ctx.textAlign = "left";
  ctx.fillText("Cacao — precio de compra local", MARGEN.left, 38);
  ctx.font = `15px ${familia}`;
  ctx.fillStyle = GRIS;
  ctx.fillText(datos.fechaTexto, MARGEN.left, 60);

  ctx.textAlign = "right";
  ctx.font = `bold 42px ${familia}`;
  ctx.fillStyle = ACENTO;
  ctx.fillText(hoy != null ? `S/ ${hoy.toFixed(2)}` : "—", W - MARGEN.right, 46);
  ctx.font = `13px ${familia}`;
  ctx.fillStyle = GRIS;
  ctx.fillText("por kg seco", W - MARGEN.right, 64);

  if (datos.changePct != null) {
    const sube = datos.changePct > 0;
    const baja = datos.changePct < 0;
    const color = sube ? VERDE : baja ? ROJO : GRIS;
    const flecha = sube ? "▲" : baja ? "▼" : "■";
    ctx.font = `bold 16px ${familia}`;
    ctx.fillStyle = color;
    ctx.fillText(`${flecha} ${sube ? "+" : ""}${datos.changePct.toFixed(1)}% vs ayer`, W - MARGEN.right, 84);
  }
  ctx.textAlign = "left";

  // ── Área del gráfico ──
  const x0 = MARGEN.left, x1 = W - MARGEN.right;
  const y0 = MARGEN.top, y1 = H - MARGEN.bottom;
  const plotW = x1 - x0, plotH = y1 - y0;

  const vals = datos.puntos.map((p) => p.solKg).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return canvas.toBuffer("image/png"); // sólo cabecera: no hay serie para trazar

  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;

  const n = datos.puntos.length;
  const xAt = (i: number) => x0 + (n === 1 ? 0 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => y1 - ((v - min) / (max - min)) * plotH;

  // Rejilla horizontal con etiquetas S//kg.
  const NIVELES = 4;
  ctx.strokeStyle = REJILLA;
  ctx.lineWidth = 1;
  ctx.font = `12px ${familia}`;
  ctx.fillStyle = GRIS_CLARO;
  ctx.textAlign = "right";
  for (let i = 0; i <= NIVELES; i++) {
    const v = min + ((max - min) * i) / NIVELES;
    const y = yAt(v);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.fillText(`S/ ${v.toFixed(2)}`, x0 - 10, y + 4);
  }
  ctx.textAlign = "left";

  // Línea de precio: un segmento por día, verde si subió y rojo si bajó
  // sobre el día anterior — así "las subidas" se ven de un vistazo, no hay
  // que leer números.
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = 1; i < n; i++) {
    const a = datos.puntos[i - 1], b = datos.puntos[i];
    ctx.strokeStyle = b.solKg >= a.solKg ? VERDE : ROJO;
    ctx.beginPath();
    ctx.moveTo(xAt(i - 1), yAt(a.solKg));
    ctx.lineTo(xAt(i), yAt(b.solKg));
    ctx.stroke();
  }

  // Punto de hoy, destacado.
  const lx = xAt(n - 1), ly = yAt(datos.puntos[n - 1].solKg);
  ctx.fillStyle = ACENTO;
  ctx.beginPath();
  ctx.arc(lx, ly, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Etiquetas del eje X: hasta 6 fechas repartidas en el rango.
  const nEtiquetas = Math.min(6, n);
  ctx.font = `11px ${familia}`;
  ctx.fillStyle = GRIS_CLARO;
  ctx.textAlign = "center";
  for (let k = 0; k < nEtiquetas; k++) {
    const i = nEtiquetas === 1 ? 0 : Math.round((k / (nEtiquetas - 1)) * (n - 1));
    const d = new Date(datos.puntos[i].t);
    ctx.fillText(d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", timeZone: "UTC" }), xAt(i), y1 + 20);
  }
  ctx.textAlign = "left";

  // Pie: fuente + referencia ICE del día.
  ctx.font = `11px ${familia}`;
  ctx.fillStyle = GRIS_CLARO;
  ctx.textAlign = "left";
  ctx.fillText("Fuente: ICE (Yahoo Finance) · generado automáticamente cada día · Buleje", x0, H - 16);
  if (datos.usdTon != null) {
    ctx.textAlign = "right";
    ctx.fillText(`ICE hoy: USD ${datos.usdTon.toFixed(0)} / tonelada`, x1, H - 16);
    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}
