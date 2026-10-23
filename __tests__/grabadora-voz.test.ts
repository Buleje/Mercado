import { describe, expect, it } from "vitest";
import {
  elegirMime,
  extensionDeMime,
  fechaGrabacion,
  formatoDuracion,
  formatoPeso,
  hayAudioSinGuardar,
  limpiarNombre,
  mimeBase,
  nombrePorDefecto,
  transicion,
} from "@/lib/grabadora/formato";
import { encodeWav, mezclarAMono, recortar, recortarAWav, remuestrear } from "@/lib/grabadora/wav";
import {
  CLAVE_NUMEROS,
  elegirEnlaceVigente,
  leerNumerosRecientes,
  mensajeGrabacion,
  numeroParaWhatsapp,
  recordarNumero,
  urlWhatsappGrabacion,
} from "@/lib/grabadora/whatsapp";

describe("nombre y formatos", () => {
  // 23-10-2026 19:05 UTC = 14:05 en Lima
  const fecha = new Date("2026-10-23T19:05:30Z");

  it("nombre por defecto en hora de Lima y sin repetir", () => {
    expect(nombrePorDefecto(fecha)).toBe("Grabación 23-10 14:05");
    expect(nombrePorDefecto(fecha, ["grabación 23-10 14:05"])).toBe("Grabación 23-10 14:05 (2)");
    expect(nombrePorDefecto(fecha, ["Grabación 23-10 14:05", "Grabación 23-10 14:05 (2)"])).toBe("Grabación 23-10 14:05 (3)");
  });

  it("fecha de la lista con día de la semana", () => {
    expect(fechaGrabacion("2026-10-23T19:05:30Z")).toBe("viernes 23/10 · 14:05");
    expect(fechaGrabacion("no-es-fecha")).toBe("");
  });

  it("duración", () => {
    expect(formatoDuracion(3200)).toBe("0:03");
    expect(formatoDuracion(725_000)).toBe("12:05");
    expect(formatoDuracion(3_723_000)).toBe("1:02:03");
    expect(formatoDuracion(-5)).toBe("0:00");
    expect(formatoDuracion(Number.NaN)).toBe("0:00");
    expect(formatoDuracion(Infinity)).toBe("0:00");
  });

  it("peso", () => {
    expect(formatoPeso(12_345)).toBe("12 KB");
    expect(formatoPeso(2_400_000)).toBe("2,3 MB");
    expect(formatoPeso(0)).toBe("0 KB");
  });

  it("limpia el nombre", () => {
    expect(limpiarNombre("  Lote 5 /\ntroza\\grande  ")).toBe("Lote 5 troza grande");
    expect(limpiarNombre("x".repeat(200))).toHaveLength(120);
  });

  it("elige el MIME que sabe grabar el navegador", () => {
    expect(elegirMime((m) => m.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(elegirMime((m) => m === "audio/mp4")).toBe("audio/mp4"); // iPhone
    expect(elegirMime(() => false)).toBe("");
    expect(elegirMime(() => { throw new Error("raro"); })).toBe("");
    expect(mimeBase("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(mimeBase("")).toBe("audio/webm");
    expect(extensionDeMime("audio/mp4")).toBe("m4a");
    expect(extensionDeMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionDeMime("audio/wav")).toBe("wav");
  });
});

describe("máquina de estados", () => {
  it("recorrido completo", () => {
    expect(transicion("inactivo", "pedir")).toBe("pidiendo");
    expect(transicion("pidiendo", "permitido")).toBe("grabando");
    expect(transicion("grabando", "pausar")).toBe("pausado");
    expect(transicion("pausado", "reanudar")).toBe("grabando");
    expect(transicion("grabando", "detener")).toBe("detenido");
    expect(transicion("detenido", "guardado")).toBe("inactivo");
  });

  it("rechaza lo que no vale (doble clic)", () => {
    expect(transicion("inactivo", "pausar")).toBeNull();
    expect(transicion("grabando", "reanudar")).toBeNull();
    expect(transicion("detenido", "pausar")).toBeNull();
    expect(transicion("pidiendo", "negado")).toBe("inactivo");
  });

  it("sabe cuándo hay audio sin guardar", () => {
    expect(hayAudioSinGuardar("grabando")).toBe(true);
    expect(hayAudioSinGuardar("pausado")).toBe(true);
    expect(hayAudioSinGuardar("detenido")).toBe(true);
    expect(hayAudioSinGuardar("inactivo")).toBe(false);
    expect(hayAudioSinGuardar("pidiendo")).toBe(false);
  });
});

describe("wav y recorte", () => {
  it("encabezado WAV PCM 16 bits mono", () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000);
    const v = new DataView(bytes.buffer);
    const txt = (o: number) => String.fromCharCode(...bytes.slice(o, o + 4));
    expect(bytes.length).toBe(44 + 8);
    expect(txt(0)).toBe("RIFF");
    expect(txt(8)).toBe("WAVE");
    expect(txt(36)).toBe("data");
    expect(v.getUint32(4, true)).toBe(36 + 8);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(v.getUint32(28, true)).toBe(32_000);
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
    expect(v.getInt16(50, true)).toBe(32767); // 2 se recorta a 1, no da la vuelta
  });

  it("mezcla a mono y recorta por segundos", () => {
    expect(Array.from(mezclarAMono([new Float32Array([1, 0]), new Float32Array([0, 0])]))).toEqual([0.5, 0]);
    const s = Float32Array.from({ length: 10 }, (_, i) => i);
    expect(Array.from(recortar(s, 2, 1, 3))).toEqual([2, 3, 4, 5]);
    expect(recortar(s, 2, 4, 2).length).toBe(0);
    expect(recortar(s, 2, -1, 99).length).toBe(10);
  });

  it("remuestrea 48 kHz → 16 kHz promediando", () => {
    const s = new Float32Array([0, 3, 6, 3, 3, 3]);
    expect(Array.from(remuestrear(s, 48_000, 16_000))).toEqual([3, 3]);
    expect(Array.from(remuestrear(new Float32Array([0, 2]), 8_000, 16_000))).toEqual([0, 1, 2, 2]);
  });

  it("recortar a WAV: 3 s de 48 kHz estéreo, se queda con 1 s", () => {
    const tasa = 48_000;
    const canal = new Float32Array(tasa * 3).fill(0.5);
    const wav = recortarAWav([canal, canal], tasa, 1, 2);
    expect(wav.length).toBe(44 + 16_000 * 2);
  });
});

describe("whatsapp", () => {
  it("número peruano y de afuera", () => {
    expect(numeroParaWhatsapp("987 654 321")).toBe("51987654321");
    expect(numeroParaWhatsapp("+51 987-654-321")).toBe("51987654321");
    expect(numeroParaWhatsapp("12345678")).toBeNull();
    expect(numeroParaWhatsapp("")).toBeNull();
  });

  it("arma el enlace de wa.me", () => {
    const url = urlWhatsappGrabacion("987654321", "Lote 5", "https://x.pe/d/abc", "Lote LA-005");
    expect(url).toBe(
      `https://wa.me/51987654321?text=${encodeURIComponent("Grabación: Lote 5\nLote LA-005\nEscúchala aquí: https://x.pe/d/abc")}`,
    );
    expect(urlWhatsappGrabacion("123", "x", "y")).toBeNull();
    expect(mensajeGrabacion(" ", "u")).toBe("Grabación: sin nombre\nEscúchala aquí: u");
  });

  it("reusa el enlace que sigue vivo", () => {
    const ahora = new Date("2026-10-23T12:00:00Z");
    const base = { revokedAt: null, hasPassword: false };
    expect(elegirEnlaceVigente([], ahora)).toBeNull();
    expect(elegirEnlaceVigente([{ ...base, token: "a", expiresAt: "2026-10-23T20:00:00Z" }], ahora)).toBeNull(); // vence hoy
    expect(elegirEnlaceVigente([{ ...base, token: "b", expiresAt: "2026-10-29T12:00:00Z" }], ahora)).toBe("b");
    expect(elegirEnlaceVigente([{ ...base, token: "c", expiresAt: "2026-10-29T12:00:00Z", revokedAt: "x" }], ahora)).toBeNull();
    expect(elegirEnlaceVigente([{ ...base, token: "d", expiresAt: null, hasPassword: true }], ahora)).toBeNull();
    expect(elegirEnlaceVigente([
      { ...base, token: "e", expiresAt: "2026-10-26T12:00:00Z" },
      { ...base, token: "f", expiresAt: "2026-10-30T12:00:00Z" },
    ], ahora)).toBe("f");
  });

  it("recuerda los últimos números sin repetir y sin romperse", () => {
    const datos = new Map<string, string>();
    const almacen = { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v) };
    expect(leerNumerosRecientes(almacen)).toEqual([]);
    recordarNumero("987654321", almacen);
    recordarNumero("912345678", almacen);
    expect(recordarNumero("987 654 321", almacen)).toEqual(["51987654321", "51912345678"]);
    for (const n of ["900000001", "900000002", "900000003", "900000004"]) recordarNumero(n, almacen);
    expect(leerNumerosRecientes(almacen)).toHaveLength(5);
    expect(recordarNumero("123", almacen)).toHaveLength(5); // número inválido no entra
    datos.set(CLAVE_NUMEROS, "{roto");
    expect(leerNumerosRecientes(almacen)).toEqual([]);
    const bloqueado = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(leerNumerosRecientes(bloqueado)).toEqual([]);
    expect(recordarNumero("987654321", bloqueado)).toEqual(["51987654321"]); // no se guarda, pero sirve esta vez
    expect(leerNumerosRecientes(null)).toEqual([]);
  });
});
