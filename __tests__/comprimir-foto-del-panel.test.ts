/**
 * __tests__/comprimir-foto-del-panel.test.ts
 *
 * Fotos livianas en el panel (Brandon 05-11): cada foto que se sube se achica en
 * el navegador SIN perder lo legible de un papel. Se cuida la DECISIÓN:
 *  - solo imágenes de >= 1 MB (PDF, Excel, GIF, SVG y fotos chicas, intactos);
 *  - el lado largo llega a 3264 px y NUNCA se agranda (una foto de 2448×3264
 *    conserva su resolución: ahí se leen sellos y letra chica);
 *  - si el resultado no baja al menos 25 %, se sube el original;
 *  - si el servidor tiene tope de peso y la foto lo pasa, se reintenta a 2200 px.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PARA_ARCHIVO,
  PARA_LEER,
  alcanzaElAhorro,
  comprimirImagen,
  comprimirParaArchivo,
  debeIntentarse,
  medidasFinales,
} from "@/lib/documents/compress-image";

const MB = 1024 * 1024;

/** Un archivo con el peso que se quiera, sin gastar memoria de verdad. */
function archivo(nombre: string, tipo: string, bytes: number): File {
  const f = new File([new Uint8Array(8)], nombre, { type: tipo });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

describe("decisión de achicar", () => {
  it("solo imágenes de 1 MB o más (PARA_ARCHIVO)", () => {
    expect(debeIntentarse("image/jpeg", 2.49 * MB, PARA_ARCHIVO)).toBe(true);
    expect(debeIntentarse("image/jpeg", 0.9 * MB, PARA_ARCHIVO)).toBe(false);
    expect(debeIntentarse("image/png", 1 * MB, PARA_ARCHIVO)).toBe(true);
  });

  it("PDF, Excel, GIF y SVG no se tocan aunque pesen mucho", () => {
    for (const tipo of ["application/pdf", "application/vnd.ms-excel", "image/gif", "image/svg+xml"]) {
      expect(debeIntentarse(tipo, 20 * MB, PARA_ARCHIVO)).toBe(false);
    }
  });

  it("la medida de siempre (PARA_LEER) sigue empezando en 1,5 MB y 2200 px", () => {
    expect(debeIntentarse("image/jpeg", 1.2 * MB, PARA_LEER)).toBe(false);
    expect(debeIntentarse("image/jpeg", 1.5 * MB, PARA_LEER)).toBe(true);
    expect(medidasFinales(4000, 6000, PARA_LEER.maxLado)).toEqual({ w: 1467, h: 2200 });
  });

  it("conserva 2448×3264 (no achica de más) y nunca agranda", () => {
    expect(medidasFinales(2448, 3264, PARA_ARCHIVO.maxLado)).toEqual({ w: 2448, h: 3264 });
    expect(medidasFinales(640, 480, PARA_ARCHIVO.maxLado)).toEqual({ w: 640, h: 480 });
    expect(medidasFinales(4000, 6000, PARA_ARCHIVO.maxLado)).toEqual({ w: 2176, h: 3264 });
  });

  it("exige bajar 25 %: 2,49 → 1,20 MB vale; 2,49 → 2,00 MB no", () => {
    expect(alcanzaElAhorro(2.49 * MB, 1.2 * MB, 0.25)).toBe(true);
    expect(alcanzaElAhorro(2.49 * MB, 2.0 * MB, 0.25)).toBe(false);
    expect(alcanzaElAhorro(2.49 * MB, 2.6 * MB, 0)).toBe(false); // nunca engorda
    expect(alcanzaElAhorro(2 * MB, 1.9 * MB, 0)).toBe(true); // la medida de siempre: cualquier baja
  });
});

describe("comprimirImagen / comprimirParaArchivo (canvas simulado)", () => {
  let tamanos: number[];
  let dibujos: Array<[number, number]>;

  beforeEach(() => {
    tamanos = [];
    dibujos = [];
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 2448, height: 3264, close: vi.fn() }),
    );
    const contextoFalso = {
      drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => dibujos.push([w, h]),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => contextoFalso) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => {
      const bytes = tamanos.shift() ?? 0;
      cb(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("foto de celular de 2,49 MB: sale ~1,2 MB, misma resolución, JPEG", async () => {
    tamanos = [Math.round(1.2 * MB)];
    const r = await comprimirParaArchivo(archivo("guia.JPG", "image/jpeg", Math.round(2.49 * MB)));
    expect(r.type).toBe("image/jpeg");
    expect(r.name).toBe("guia.jpg");
    expect(r.size).toBeLessThan(1.3 * MB);
    expect(dibujos).toEqual([[2448, 3264]]);
  });

  it("si no baja 25 %, se sube el original", async () => {
    tamanos = [Math.round(2.0 * MB)];
    const original = archivo("guia.jpg", "image/jpeg", Math.round(2.49 * MB));
    expect(await comprimirParaArchivo(original)).toBe(original);
  });

  it("foto chica (< 1 MB) y PDF: ni se abren", async () => {
    const chica = archivo("a.jpg", "image/jpeg", 0.8 * MB);
    const pdf = archivo("a.pdf", "application/pdf", 6 * MB);
    expect(await comprimirParaArchivo(chica)).toBe(chica);
    expect(await comprimirParaArchivo(pdf)).toBe(pdf);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("PNG pasa a WebP con nombre .webp", async () => {
    tamanos = [Math.round(0.4 * MB)];
    const r = await comprimirImagen(archivo("yape.png", "image/png", 2 * MB), PARA_ARCHIVO);
    expect(r.type).toBe("image/webp");
    expect(r.name).toBe("yape.webp");
  });

  it("con tope del servidor: si 3264 px lo pasa, reintenta a 2200 px", async () => {
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 3000, height: 4000, close: vi.fn() } as unknown as ImageBitmap);
    tamanos = [Math.round(4.5 * MB), Math.round(2.4 * MB)];
    const r = await comprimirParaArchivo(archivo("foto.jpg", "image/jpeg", 9 * MB), 4 * MB);
    expect(r.size).toBeLessThan(4 * MB);
    expect(dibujos).toEqual([
      [2448, 3264],
      [1650, 2200],
    ]);
  });

  it("si el navegador no decodifica (HEIC en Chrome), devuelve el original", async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new Error("no decodifica"));
    const heic = archivo("foto.heic", "image/heic", 3 * MB);
    expect(await comprimirParaArchivo(heic)).toBe(heic);
  });
});
