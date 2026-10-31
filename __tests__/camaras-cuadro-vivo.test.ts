/**
 * @vitest-environment node
 *
 * Puente de pantalla (ADR-466) — `recibirCuadro` / `ultimoCuadro` con sharp de
 * verdad y el respaldo en memoria (sin variables de Upstash): huella, intervalo,
 * tope del día, recorte, cuadro que vence a los 60 s y que la clave es por
 * negocio.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Camara } from "@/lib/camaras/camaras";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import {
  CuadroIlegible,
  _reiniciarCuadroVivoParaTests,
  recibirCuadro,
  ultimoCuadro,
} from "@/lib/camaras/cuadro-vivo.server";

const T0 = Date.parse("2026-10-03T17:00:00Z"); // mediodía en Lima
const MIN = 60_000;

const lisa = (gris: number, ancho = 640, alto = 360) =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: { r: gris, g: gris, b: gris } } })
    .jpeg()
    .toBuffer();

/** Mitad izquierda negra, mitad derecha blanca. */
const partida = async () =>
  sharp({ create: { width: 640, height: 360, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      {
        input: await sharp({ create: { width: 320, height: 360, channels: 3, background: { r: 255, g: 255, b: 255 } } })
          .png()
          .toBuffer(),
        left: 320,
        top: 0,
      },
    ])
    .jpeg()
    .toBuffer();

const camara = (extra: Partial<Camara> = {}): Camara => ({
  id: "cam_1",
  nombre: "Oficina",
  lugar: "",
  token: "t".repeat(32),
  activa: true,
  creadaEn: "2026-10-01T00:00:00Z",
  ...extra,
});

let guardadas: { foto: Buffer; motivo: string }[] = [];
const guardar = async (foto: Buffer, motivo: string) => {
  guardadas.push({ foto, motivo });
};

beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  _reiniciarCuadroVivoParaTests();
  guardadas = [];
});

describe("recibirCuadro", () => {
  it("dos iguales y uno distinto: cambio → sin_cambio → cambio", async () => {
    const gris = await lisa(60);
    expect(await recibirCuadro("t-main", camara(), gris, guardar, T0)).toEqual({ guardada: true, motivo: "cambio" });
    expect(await recibirCuadro("t-main", camara(), gris, guardar, T0 + 1000)).toEqual({ guardada: false, motivo: "sin_cambio" });
    expect(await recibirCuadro("t-main", camara(), await lisa(220), guardar, T0 + 2000)).toEqual({
      guardada: true,
      motivo: "cambio",
    });
    expect(guardadas.map((g) => g.motivo)).toEqual(["cambio", "cambio"]);
    /* lo guardado es un webp nuestro */
    expect((await sharp(guardadas[0]!.foto).metadata()).format).toBe("webp");
  });

  it("sin cambio pero pasaron los minutos de la cámara = intervalo", async () => {
    const cam = camara({ vivo: { cadaMin: 5 } });
    const gris = await lisa(60);
    await recibirCuadro("t-main", cam, gris, guardar, T0);
    expect((await recibirCuadro("t-main", cam, gris, guardar, T0 + 4 * MIN)).motivo).toBe("sin_cambio");
    expect(await recibirCuadro("t-main", cam, gris, guardar, T0 + 5 * MIN)).toEqual({ guardada: true, motivo: "intervalo" });
  });

  it("el tope del día corta, y al otro día de Lima vuelve a entrar", async () => {
    const cam = camara({ vivo: { maxDia: 2, umbralPct: 5 } });
    expect((await recibirCuadro("t-main", cam, await lisa(0), guardar, T0)).guardada).toBe(true);
    expect((await recibirCuadro("t-main", cam, await lisa(120), guardar, T0 + 1000)).guardada).toBe(true);
    expect(await recibirCuadro("t-main", cam, await lisa(250), guardar, T0 + 2000)).toEqual({
      guardada: false,
      motivo: "tope_del_dia",
    });
    /* 24 h después: día nuevo en Lima */
    expect(await recibirCuadro("t-main", cam, await lisa(0), guardar, T0 + 24 * 60 * MIN)).toEqual({
      guardada: true,
      motivo: "cambio",
    });
    expect(guardadas).toHaveLength(3);
  });

  it("si guardar falla, la huella no se mueve y el siguiente cuadro vuelve a intentarlo", async () => {
    const gris = await lisa(60);
    await expect(
      recibirCuadro("t-main", camara(), gris, async () => {
        throw new Error("storage");
      }, T0),
    ).rejects.toThrow("storage");
    /* el candado se soltó y el estado quedó como estaba */
    expect(await recibirCuadro("t-main", camara(), gris, guardar, T0 + 1000)).toEqual({ guardada: true, motivo: "cambio" });
  });

  it("lo que no es imagen es CuadroIlegible (la ruta contesta 415)", async () => {
    await expect(recibirCuadro("t-main", camara(), Buffer.from("no soy un jpeg"), guardar, T0)).rejects.toBeInstanceOf(
      CuadroIlegible,
    );
  });

  it("sin tenant no hay cuadro", async () => {
    await expect(recibirCuadro("", camara(), await lisa(60), guardar, T0)).rejects.toThrow("tenantId");
  });
});

describe("recorte", () => {
  it("se aplica en el servidor al cuadro y a la foto: la mitad derecha de una imagen partida es blanca", async () => {
    const cam = camara({ recorte: { x: 0.5, y: 0, w: 0.5, h: 1 } });
    await recibirCuadro("t-main", cam, await partida(), guardar, Date.now());
    const cuadro = await ultimoCuadro("t-main", "cam_1");
    expect(cuadro).not.toBeNull();
    const meta = await sharp(cuadro!.imagen).metadata();
    expect([meta.width, meta.height]).toEqual([320, 360]);
    const stats = await sharp(cuadro!.imagen).stats();
    expect(stats.channels[0]!.mean).toBeGreaterThan(240);
    const foto = await sharp(guardadas[0]!.foto).metadata();
    expect([foto.width, foto.height]).toEqual([320, 360]);
  });

  it("sin recorte el cuadro es la imagen entera (y más de 1280 px se achica)", async () => {
    await recibirCuadro("t-main", camara(), await lisa(60, 1920, 1080), guardar, Date.now());
    const meta = await sharp((await ultimoCuadro("t-main", "cam_1"))!.imagen).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 1280, 720]);
  });
});

describe("ultimoCuadro", () => {
  it("vence a los 60 s y es por negocio: la misma cámara en otro tenant no tiene nada", async () => {
    const ahora = Date.now();
    await recibirCuadro("t-main", camara(), await lisa(60), guardar, ahora);
    const c = await ultimoCuadro("t-main", "cam_1", ahora + 1000);
    expect(c?.ts).toBe(ahora);
    expect(await ultimoCuadro("t-otro", "cam_1", ahora + 1000)).toBeNull();
    expect(await ultimoCuadro("t-main", "cam_2", ahora + 1000)).toBeNull();
    expect(await ultimoCuadro("t-main", "cam_1", ahora + 61_000)).toBeNull();
  });
});
