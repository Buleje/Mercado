import { describe, expect, it } from "vitest";
import { nombreDeArchivoValido } from "@/lib/camaras/hls";

/**
 * Lo que se puede testear sin una cámara ni ffmpeg corriendo: la puerta.
 *
 * El resto del módulo levanta procesos y lee archivos temporales — eso se
 * prueba con el aparato delante, y hoy no hay ninguna cámara en la red. Pero
 * el nombre del archivo SÍ se puede probar acá, y es lo único de este módulo
 * que decide qué se lee del disco: si esa lista se abre, se lee cualquier cosa.
 */
describe("qué archivos del stream se pueden pedir", () => {
  it("deja pasar la lista y los segmentos que escribe ffmpeg", () => {
    expect(nombreDeArchivoValido("vivo.m3u8")).toBe(true);
    expect(nombreDeArchivoValido("s000.ts")).toBe(true);
    expect(nombreDeArchivoValido("s001.ts")).toBe(true);
    /* `hls_list_size` recicla, pero una tanda larga llega a cuatro cifras. */
    expect(nombreDeArchivoValido("s1234.ts")).toBe(true);
  });

  it("no deja salir de la carpeta", () => {
    for (const intento of [
      "../../../etc/passwd",
      "..%2F..%2Fetc%2Fpasswd",
      "/etc/passwd",
      "vivo.m3u8/../../.env",
      "..\\..\\windows\\system32\\config\\sam",
      "./s001.ts",
      "s001.ts/../vivo.m3u8",
    ]) {
      expect(nombreDeArchivoValido(intento), intento).toBe(false);
    }
  });

  it("no sirve nada que no sea la lista o un segmento", () => {
    for (const intento of [
      "",
      "vivo.m3u",
      "vivo.M3U8",
      "s1.ts",
      "sabc.ts",
      "s001.mp4",
      "otra.m3u8",
      "s001.ts.bak",
      ".env",
    ]) {
      expect(nombreDeArchivoValido(intento), intento).toBe(false);
    }
  });

  it("un nombre con salto de línea no cuela (la regex ancla de punta a punta)", () => {
    expect(nombreDeArchivoValido("vivo.m3u8\n../../.env")).toBe(false);
    expect(nombreDeArchivoValido("s001.ts\n")).toBe(false);
  });
});
