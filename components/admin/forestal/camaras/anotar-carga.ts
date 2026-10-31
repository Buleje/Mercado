/**
 * La foto ANOTADA de la carga (16-10, «Medir por foto»): la cara enderezada
 * con la elipse, el N° de la guía y el Ø de cada troza. Es la que va a los
 * papeles de la guía al registrar: con ella cualquiera revisa de dónde salió
 * cada medida sin abrir el sistema.
 *
 * Se dibuja en la pantalla (no en el worker) porque los códigos los decide la
 * guía —`codigosDeLaCarga`— y cambian si el operador quita o agrega una troza.
 * Los colores son los tokens del panel resueltos en ese momento.
 */
import type { TestaPropuesta } from "@/lib/forestal/testas-medicion";

const LADO_MAX = 2560;

function color(nombre: string, siNo: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || siNo;
}

const comaDecimal = (n: number): string => n.toFixed(1).replace(".", ",");

/** JPEG de la cara medida con cada testa marcada; `null` si el navegador no tiene lienzo. */
export async function fotoAnotada(
  enderezada: Blob,
  testas: readonly TestaPropuesta[],
  codigos: readonly string[],
): Promise<Blob | null> {
  const bmp = await createImageBitmap(enderezada);
  const k = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bmp.width * k);
  lienzo.height = Math.round(bmp.height * k);
  const ctx = lienzo.getContext("2d");
  if (!ctx) {
    bmp.close();
    return null;
  }
  ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  bmp.close();
  const borde = color("--data-warning-500", "yellow");
  const fondo = color("--accent-dark", "teal");
  const radios = testas.map((t) => (t.aPx + t.bPx) / 2).sort((p, q) => p - q);
  const rTipico = (radios[Math.floor(radios.length / 2)] ?? 40) * k;
  const letra = Math.max(14, Math.round(rTipico * 0.42));
  ctx.lineWidth = Math.max(2, rTipico * 0.06);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  testas.forEach((t, i) => {
    const [cx, cy] = [t.cx * k, t.cy * k];
    ctx.strokeStyle = borde;
    ctx.beginPath();
    ctx.ellipse(cx, cy, t.aPx * k, t.bPx * k, (t.anguloGrados * Math.PI) / 180, 0, 2 * Math.PI);
    ctx.stroke();
    const lineas = [codigos[i] ?? String(i + 1), `${comaDecimal(t.dCm)} cm`];
    ctx.font = `bold ${letra}px sans-serif`;
    const ancho = Math.max(...lineas.map((l) => ctx.measureText(l).width)) + letra * 0.6;
    const alto = letra * 2.4;
    ctx.fillStyle = fondo;
    ctx.fillRect(cx - ancho / 2, cy - alto / 2, ancho, alto);
    ctx.fillStyle = "white";
    ctx.fillText(lineas[0], cx, cy - letra * 0.55);
    ctx.font = `${Math.round(letra * 0.8)}px sans-serif`;
    ctx.fillText(lineas[1], cx, cy + letra * 0.6);
  });
  return new Promise<Blob | null>((ok) => lienzo.toBlob((b) => ok(b), "image/jpeg", 0.85));
}
