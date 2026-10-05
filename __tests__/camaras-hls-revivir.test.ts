import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El stream que se apagó por falta de uso y la cámara que se cayó (05-10).
 *
 * ffmpeg se reemplaza por uno de mentira que escribe la lista y un segmento en
 * la carpeta que le pasan (como el de verdad) o que muere como contra una
 * cámara apagada. Lo que se prueba es la decisión de cuándo levantar otro.
 */
const H = vi.hoisted(() => ({
  lanzados: [] as string[][],
  modo: "escribe" as "escribe" | "muere",
}));

vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events");
  const { writeFileSync } = await import("node:fs");
  const proceso = () =>
    Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      pid: 4242,
      kill: () => true,
    });
  const spawn = (_cmd: string, args: string[]) => {
      const p = proceso();
      if (args[0] === "-version") {
        setTimeout(() => {
          p.stdout.emit("data", Buffer.from("ffmpeg version 6.1.1-3ubuntu5"));
          p.emit("close", 0);
        }, 0);
        return p;
      }
      H.lanzados.push(args);
      const lista = args[args.length - 1]!;
      if (H.modo === "escribe") {
        writeFileSync(lista.replace("vivo.m3u8", "s000.ts"), "segmento");
        writeFileSync(lista, "#EXTM3U\n#EXTINF:2,\ns000.ts\n");
      } else {
        setTimeout(() => {
          p.stderr.emit("data", Buffer.from("Connection to tcp://cam:554 failed: Connection refused"));
          p.emit("close", 1);
        }, 0);
      }
      return p;
  };
  return { spawn, default: { spawn } };
});

import { abrirVivo, detenerStream, estadoDeStream, leerOReabrir } from "@/lib/camaras/hls";

const CLAVE = "t-main:cam-portón";
const RTSP = "rtsp://visor:secreta@192.168.1.64:554/Streaming/Channels/102";

beforeEach(() => {
  H.lanzados = [];
  H.modo = "escribe";
});
afterEach(() => {
  vi.restoreAllMocks();
  detenerStream(CLAVE);
});

describe("la lista revive el stream apagado; el segmento no", () => {
  it("con ffmpeg 6 la línea lleva -timeout (no -stimeout, que no arranca)", async () => {
    expect(await abrirVivo(CLAVE, RTSP)).toEqual({ ok: true });
    expect(H.lanzados[0]).toContain("-timeout");
    expect(H.lanzados[0]).not.toContain("-stimeout");
  });

  it("pestaña de fondo > 30 s: el barrido lo apagó y la lista lo levanta de nuevo", async () => {
    await abrirVivo(CLAVE, RTSP);
    detenerStream(CLAVE); // lo que hace el barrido a los 30 s sin pedidos
    const rtsp = vi.fn(() => RTSP);
    const leido = await leerOReabrir(CLAVE, "vivo.m3u8", rtsp);
    expect(leido.ok).toBe(true);
    expect(leido.ok && leido.datos.toString()).toContain("#EXTM3U");
    expect(rtsp).toHaveBeenCalledTimes(1);
    expect(H.lanzados).toHaveLength(2);
  });

  it("con el stream corriendo no se descifra la clave ni se lanza otro ffmpeg", async () => {
    await abrirVivo(CLAVE, RTSP);
    const rtsp = vi.fn(() => RTSP);
    expect((await leerOReabrir(CLAVE, "vivo.m3u8", rtsp)).ok).toBe(true);
    expect((await leerOReabrir(CLAVE, "s000.ts", rtsp)).ok).toBe(true);
    expect(rtsp).not.toHaveBeenCalled();
    expect(H.lanzados).toHaveLength(1);
  });

  it("un segmento suelto de un stream que no existe es 404, sin levantar nada", async () => {
    const rtsp = vi.fn(() => RTSP);
    expect(await leerOReabrir(CLAVE, "s007.ts", rtsp)).toEqual({ ok: false, motivo: "Ese video no está abierto." });
    expect(rtsp).not.toHaveBeenCalled();
    expect(H.lanzados).toHaveLength(0);
  });

  it("sin clave legible no se lanza ffmpeg y se dice qué hacer", async () => {
    const leido = await leerOReabrir(CLAVE, "vivo.m3u8", () => null);
    expect(leido).toEqual({ ok: false, motivo: expect.stringMatching(/Vuelve a conectarla/) });
    expect(H.lanzados).toHaveLength(0);
  });

  it("un nombre inválido no llega ni a mirar el registro", async () => {
    const rtsp = vi.fn(() => RTSP);
    expect(await leerOReabrir(CLAVE, "../.env", rtsp)).toEqual({ ok: false, motivo: "Archivo no válido." });
    expect(rtsp).not.toHaveBeenCalled();
  });
});

describe("dos pedidos a la vez", () => {
  it("un solo ffmpeg (antes: dos, y el primero quedaba huérfano ocupando la cámara)", async () => {
    const [a, b, c] = await Promise.all([abrirVivo(CLAVE, RTSP), abrirVivo(CLAVE, RTSP), leerOReabrir(CLAVE, "vivo.m3u8", () => RTSP)]);
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, true]);
    expect(H.lanzados).toHaveLength(1);
  });
});

describe("la cámara caída se reintenta, pero no en cada recarga", () => {
  it("caída recién: contesta el motivo sin otro ffmpeg; pasados 5 s, lo reintenta", async () => {
    H.modo = "muere";
    const caida = await abrirVivo(CLAVE, RTSP);
    expect(caida).toEqual({ ok: false, motivo: expect.stringMatching(/no acepta la conexión/) });
    expect(estadoDeStream(CLAVE)?.estado).toBe("caido");

    /* El reproductor recarga la lista cada 2 s: con la cámara apagada, sin la
       pausa, cada recarga era un ffmpeg nuevo. */
    expect((await leerOReabrir(CLAVE, "vivo.m3u8", () => RTSP)).ok).toBe(false);
    expect(H.lanzados).toHaveLength(1);

    H.modo = "escribe"; // la cámara volvió
    const ahora = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(ahora + 6_000);
    const leido = await leerOReabrir(CLAVE, "vivo.m3u8", () => RTSP);
    expect(leido.ok).toBe(true);
    expect(H.lanzados).toHaveLength(2);
    expect(estadoDeStream(CLAVE)?.estado).not.toBe("caido");
  });
});
