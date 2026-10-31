/**
 * lib/tienda-cliente/imagen-pedido.ts — dibuja el pedido como IMAGEN (PNG,
 * 1080 px de ancho) para mandarlo por WhatsApp: negocio, productos con foto,
 * precios, total grande, datos del cliente y fecha en hora de Lima.
 * Sólo navegador (canvas). Contrato en `./contrato.ts`; la disposición pura
 * (alto, cortes, formatos) en `./imagen-pedido-plan.ts`.
 *
 * Uso: generarla ANTES del clic de «Enviar» (ver `useImagenPedido` en
 * `components/store/cliente/use-imagen-pedido.ts`): tarda ~0,2 s con fotos del
 * mismo origen y hasta ~3 s si una foto ajena no responde; `navigator.share`
 * exige que el clic siga «fresco».
 */
import type { DatosImagenPedido } from "./contrato";
import {
  COLORES,
  cssFuente,
  planificarImagenPedido,
  type Medir,
  type OpDibujo,
} from "./imagen-pedido-plan";

export {
  ANCHO_IMAGEN,
  cortarLineas,
  fechaPedidoLima,
  formatoSoles,
  planificarImagenPedido,
} from "./imagen-pedido-plan";

const ESPERA_FOTO_MS = 3_000;

/** Carga una imagen apta para canvas (sin «ensuciarlo»); `null` si no se puede. */
function cargarImagen(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const reloj = setTimeout(() => resolve(null), ESPERA_FOTO_MS);
    img.onload = () => {
      clearTimeout(reloj);
      resolve(img.naturalWidth > 0 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(reloj);
      resolve(null);
    };
    img.src = src;
  });
}

/** La primera imagen que cargue; `null` si fallan todas. */
function primeraQueCargue(intentos: Array<Promise<HTMLImageElement | null>>): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let pendientes = intentos.length;
    for (const intento of intentos) {
      void intento.then((img) => {
        if (img) resolve(img);
        else if (--pendientes === 0) resolve(null);
      });
    }
  });
}

/** Mismo origen, `data:` o `blob:` → directo. Otro dominio → directo (si manda
 *  CORS) y por el optimizador de Next (mismo origen) A LA VEZ: gana el primero.
 *  Medido 11-10: un host sin CORS tardó 10 s en fallar; por eso el tope de 3 s. */
async function cargarFoto(src: string): Promise<HTMLImageElement | null> {
  if (!/^https?:\/\//i.test(src)) return cargarImagen(src);
  let ajeno: boolean;
  try {
    ajeno = new URL(src).origin !== window.location.origin;
  } catch {
    return null;
  }
  if (!ajeno) return cargarImagen(src);
  return primeraQueCargue([
    cargarImagen(src),
    cargarImagen(`/_next/image?url=${encodeURIComponent(src)}&w=256&q=75`),
  ]);
}

/** Resuelve `var(--x)` contra el documento (canvas no entiende variables CSS). */
export function resolverColorCss(color: string, respaldo = "#00a0a0"): string {
  const m = color.trim().match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);
  if (!m) return color.trim() || respaldo;
  if (typeof document === "undefined") return m[2]?.trim() || respaldo;
  const valor = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return valor || m[2]?.trim() || respaldo;
}

function caminoRedondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radio = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + w, y, x + w, y + h, radio);
  ctx.arcTo(x + w, y + h, x, y + h, radio);
  ctx.arcTo(x, y + h, x, y, radio);
  ctx.arcTo(x, y, x + w, y, radio);
  ctx.closePath();
}

function dibujarFoto(ctx: CanvasRenderingContext2D, op: Extract<OpDibujo, { t: "imagen" }>, img: HTMLImageElement | null) {
  ctx.save();
  caminoRedondeado(ctx, op.x, op.y, op.w, op.h, op.radio);
  ctx.clip();
  if (img) {
    // «cover»: llena el cuadrado recortando lo que sobra, sin deformar.
    const escala = Math.max(op.w / img.naturalWidth, op.h / img.naturalHeight);
    const sw = op.w / escala;
    const sh = op.h / escala;
    ctx.fillStyle = COLORES.blanco;
    ctx.fillRect(op.x, op.y, op.w, op.h);
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, op.x, op.y, op.w, op.h);
  } else {
    ctx.fillStyle = COLORES.caja;
    ctx.fillRect(op.x, op.y, op.w, op.h);
    ctx.fillStyle = COLORES.gris;
    ctx.font = cssFuente({ tam: Math.round(op.h * 0.42), peso: 700 });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(op.inicial, op.x + op.w / 2, op.y + op.h / 2 + 2);
  }
  ctx.restore();
  ctx.save();
  caminoRedondeado(ctx, op.x + 1, op.y + 1, op.w - 2, op.h - 2, op.radio);
  ctx.strokeStyle = COLORES.linea;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function aBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob devolvió null"))), "image/png");
  });
}

/** PNG del pedido. Rechaza sólo si el navegador no puede crear el canvas. */
export async function dibujarImagenPedido(datos: DatosImagenPedido): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("dibujarImagenPedido sólo corre en el navegador");
  if (document.fonts?.ready) await document.fonts.ready;

  const fuentes = new Set<string>();
  if (datos.negocio.logo) fuentes.add(datos.negocio.logo);
  for (const l of datos.lineas) if (l.imagen) fuentes.add(l.imagen);
  const cargadas = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...fuentes].map(async (src) => {
      const img = await cargarFoto(src);
      if (img) cargadas.set(src, img);
    }),
  );

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no pudo crear el lienzo de la imagen");
  const medir: Medir = (texto, fuente) => {
    ctx.font = cssFuente(fuente);
    return ctx.measureText(texto).width;
  };
  const datosResueltos: DatosImagenPedido = {
    ...datos,
    negocio: { ...datos.negocio, colorAcento: normalizarColor(ctx, resolverColorCss(datos.negocio.colorAcento)) },
  };
  const plan = planificarImagenPedido(datosResueltos, medir, {
    conLogo: Boolean(datos.negocio.logo && cargadas.has(datos.negocio.logo)),
    fotosOk: new Set(cargadas.keys()),
  });

  canvas.width = plan.ancho;
  canvas.height = plan.alto;
  ctx.fillStyle = COLORES.fondo;
  ctx.fillRect(0, 0, plan.ancho, plan.alto);
  for (const op of plan.ops) {
    if (op.t === "rect") {
      ctx.fillStyle = op.color;
      if (op.radio) {
        caminoRedondeado(ctx, op.x, op.y, op.w, op.h, op.radio);
        ctx.fill();
      } else ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.t === "texto") {
      ctx.fillStyle = op.color;
      ctx.font = cssFuente(op.fuente);
      ctx.textAlign = op.alinear ?? "left";
      ctx.textBaseline = "top";
      ctx.fillText(op.texto, op.x, op.y);
    } else {
      dibujarFoto(ctx, op, op.src ? (cargadas.get(op.src) ?? null) : null);
    }
  }
  return aBlob(canvas);
}

/** El color tal como lo entiende canvas («#rrggbb»/«rgba(…)»); inválido → turquesa. */
function normalizarColor(ctx: CanvasRenderingContext2D, color: string): string {
  ctx.fillStyle = "#00a0a0";
  ctx.fillStyle = color;
  return String(ctx.fillStyle);
}
