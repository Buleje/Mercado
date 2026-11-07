import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  abrirVivo,
  argumentos,
  detenerStream,
  motivoDeSalida,
  nombreDeArchivoValido,
  versionMayorDeFfmpeg,
} from "@/lib/camaras/hls";

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

describe("la línea de ffmpeg según su versión (05-10: con el 6.1 el video no salía nunca)", () => {
  it("lee la versión mayor de las compilaciones con número y deja en null las nocturnas", () => {
    expect(versionMayorDeFfmpeg("ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023")).toBe(6);
    expect(versionMayorDeFfmpeg("ffmpeg version n7.1-12-gabc")).toBe(7);
    expect(versionMayorDeFfmpeg("ffmpeg version 4.4.2-0ubuntu0.22.04.1")).toBe(4);
    expect(versionMayorDeFfmpeg("ffmpeg version 2025-09-28-git-f43916e217-full_build-www.gyan.dev")).toBeNull();
    expect(versionMayorDeFfmpeg("ffmpeg version N-112345-g0123abc")).toBeNull();
  });

  it("ffmpeg 5+ (y las nocturnas) usan -timeout; el 4.x, -stimeout (su -timeout es modo servidor)", () => {
    for (const v of [5, 6, 7, null]) {
      const a = argumentos("rtsp://u:c@cam/x", "/tmp/x", v);
      expect(a[a.indexOf("-timeout") + 1]).toBe("8000000");
      expect(a).not.toContain("-stimeout");
    }
    const viejo = argumentos("rtsp://u:c@cam/x", "/tmp/x", 4);
    expect(viejo).toContain("-stimeout");
    expect(viejo).not.toContain("-timeout");
  });

  it("«Option not found» es de la máquina, no «esa ruta no existe en la cámara»", () => {
    const m = motivoDeSalida("Unrecognized option 'stimeout'.\nError splitting the argument list: Option not found");
    expect(m).toMatch(/ffmpeg de esta máquina/);
    expect(motivoDeSalida("method DESCRIBE failed: 404 Not Found")).toMatch(/ruta de video no existe/);
    expect(motivoDeSalida("Connection refused")).toMatch(/no acepta la conexión/);
  });
});

/* Con el ffmpeg de verdad (si la máquina lo tiene): una cámara que no atiende
   tiene que decir «no acepta la conexión». Con `-stimeout` en un ffmpeg ≥5 el
   proceso moría antes de llamar y el motivo era «esa ruta no existe». */
const hayFfmpegReal = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

describe.skipIf(!hayFfmpegReal)("ffmpeg real contra un puerto cerrado", () => {
  const clave = "t-test:cam-cerrada";
  afterEach(() => detenerStream(clave));

  it("el motivo es la conexión, no las opciones ni la ruta", async () => {
    const puerto = await new Promise<number>((r) => {
      const srv = createServer().listen(0, "127.0.0.1", () => {
        const p = (srv.address() as { port: number }).port;
        srv.close(() => r(p));
      });
    });
    const abierto = await abrirVivo(clave, `rtsp://qa:x@127.0.0.1:${puerto}/Streaming/Channels/102`);
    expect(abierto).toEqual({ ok: false, motivo: expect.stringMatching(/no acepta la conexión/) });
  });
});
