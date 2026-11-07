/**
 * __tests__/foto-heic-del-celular.test.ts
 *
 * Al subir la foto del fotocheck desde el celular (ADR-417) apareció un borde
 * que dejaba la función inservible en iPhone: `/api/upload` sólo acepta
 * jpeg/png/webp (`ALLOWED_TYPES`), y un iPhone entrega **HEIC**. Como
 * `compressIfLarge` sólo pasaba por el canvas los archivos de más de 1,5 MB,
 * una HEIC chica salía intacta y el servidor la rechazaba con «Tipo no
 * permitido» — el usuario veía un error y no tenía forma de arreglarlo.
 *
 * Lo que se cuida acá: el motivo para convertir no es sólo el peso, también el
 * TIPO. Y si el navegador no sabe decodificar el formato, se devuelve el
 * original en vez de romper (que hable el error del servidor).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { compressIfLarge } from "@/lib/image-upload-utils";

/** Un archivo con el peso que se quiera, sin gastar memoria de verdad. */
function archivo(nombre: string, tipo: string, bytes: number): File {
  const f = new File([new Uint8Array(8)], nombre, { type: tipo });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

/** Simula el navegador: decodifica (o no) y exporta WebP por canvas. */
function prepararCanvas({ decodifica, tamanoSalida }: { decodifica: boolean; tamanoSalida: number }) {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => {
    if (!decodifica) throw new Error("formato no soportado");
    return { width: 1200, height: 1600, close: () => {} };
  }));
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return Object.create(HTMLElement.prototype) as HTMLElement;
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (cb: (b: Blob | null) => void) => {
        const b = new Blob([new Uint8Array(4)], { type: "image/webp" });
        Object.defineProperty(b, "size", { value: tamanoSalida });
        cb(b);
      },
    } as unknown as HTMLElement;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("compressIfLarge — la foto que llega del celular", () => {
  it("convierte una HEIC chica, que antes se subía tal cual y el servidor rechazaba", async () => {
    prepararCanvas({ decodifica: true, tamanoSalida: 300_000 });
    const salida = await compressIfLarge(archivo("IMG_0042.heic", "image/heic", 900_000));
    expect(salida.type).toBe("image/webp");
    expect(salida.name).toBe("IMG_0042.webp");
  });

  it("manda la convertida aunque pese más: el original ni entra por la puerta del servidor", async () => {
    prepararCanvas({ decodifica: true, tamanoSalida: 1_200_000 });
    const salida = await compressIfLarge(archivo("IMG_0043.heic", "image/heic", 800_000));
    expect(salida.type).toBe("image/webp");
  });

  it("si el navegador no sabe decodificar el formato, devuelve el original y habla el servidor", async () => {
    prepararCanvas({ decodifica: false, tamanoSalida: 10 });
    const original = archivo("IMG_0044.heic", "image/heic", 900_000);
    expect(await compressIfLarge(original)).toBe(original);
  });

  it("una JPEG chica sigue subiéndose sin tocar: el servidor ya la acepta", async () => {
    prepararCanvas({ decodifica: true, tamanoSalida: 10 });
    const original = archivo("foto.jpg", "image/jpeg", 400_000);
    expect(await compressIfLarge(original)).toBe(original);
  });

  it("una JPEG grande se comprime, como antes", async () => {
    prepararCanvas({ decodifica: true, tamanoSalida: 500_000 });
    const salida = await compressIfLarge(archivo("foto.jpg", "image/jpeg", 4_000_000));
    expect(salida.type).toBe("image/webp");
  });

  it("un SVG no pasa por el canvas", async () => {
    prepararCanvas({ decodifica: true, tamanoSalida: 10 });
    const original = archivo("logo.svg", "image/svg+xml", 2_000_000);
    expect(await compressIfLarge(original)).toBe(original);
  });
});
