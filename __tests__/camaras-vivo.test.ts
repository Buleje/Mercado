/**
 * Puente de pantalla (ADR-466) — la decisión pura: huella/umbral, intervalo,
 * tope del día (por día de Lima), recorte en fracciones y la configuración.
 */
import { describe, expect, it } from "vitest";
import type { Camara } from "@/lib/camaras/camaras";
import {
  VIVO_POR_DEFECTO,
  ajustesVivo,
  configurarPuente,
  cuentaDelDia,
  decidirPaso,
  diaDeLima,
  diferenciaPct,
  estadoDe,
  estadoTrasGuardar,
  recorteEnPixeles,
  validarRecorte,
} from "@/lib/camaras/vivo";

const huella = (gris: number) => new Uint8Array(1024).fill(gris);
/** 2026-10-03 12:00 en Lima (UTC-5). */
const MEDIODIA = Date.parse("2026-10-03T17:00:00Z");
const ajustes = { ...VIVO_POR_DEFECTO };

const camara = (extra: Partial<Camara> = {}): Camara => ({
  id: "cam_1",
  nombre: "Oficina",
  lugar: "",
  token: "t".repeat(32),
  activa: true,
  creadaEn: "2026-10-01T00:00:00Z",
  ...extra,
});

describe("diferenciaPct", () => {
  it("igual = 0, negro contra blanco = 100, largos distintos = 100", () => {
    expect(diferenciaPct(huella(40), huella(40))).toBe(0);
    expect(diferenciaPct(huella(0), huella(255))).toBe(100);
    expect(diferenciaPct(huella(0), new Uint8Array(10))).toBe(100);
  });

  it("es la diferencia MEDIA: un cuarto de la imagen cambiado del todo = 25 %", () => {
    const b = huella(0);
    b.fill(255, 0, 256);
    expect(diferenciaPct(huella(0), b)).toBe(25);
  });
});

describe("decidirPaso", () => {
  const anterior = { huella: huella(100), guardadaEn: MEDIODIA - 60_000 };

  it("la primera (sin anterior) entra como cambio", () => {
    expect(decidirPaso({ huella: huella(100), anterior: null, cuentaHoy: 0, ahora: MEDIODIA, ajustes })).toMatchObject({
      guardar: true,
      motivo: "cambio",
    });
  });

  it("bajo el umbral y antes del intervalo = sin_cambio; sobre el umbral = cambio", () => {
    /* 10 grises de 255 = 3,9 % < 8 % */
    expect(decidirPaso({ huella: huella(110), anterior, cuentaHoy: 3, ahora: MEDIODIA, ajustes })).toMatchObject({
      guardar: false,
      motivo: "sin_cambio",
    });
    /* 30 grises = 11,8 % > 8 % */
    expect(decidirPaso({ huella: huella(130), anterior, cuentaHoy: 3, ahora: MEDIODIA, ajustes })).toMatchObject({
      guardar: true,
      motivo: "cambio",
    });
  });

  it("el umbral es por cámara", () => {
    const r = decidirPaso({ huella: huella(110), anterior, cuentaHoy: 0, ahora: MEDIODIA, ajustes: { ...ajustes, umbralPct: 2 } });
    expect(r.motivo).toBe("cambio");
  });

  it("sin cambio pero pasaron los minutos = intervalo", () => {
    const viejo = { huella: huella(100), guardadaEn: MEDIODIA - 15 * 60_000 };
    expect(decidirPaso({ huella: huella(100), anterior: viejo, cuentaHoy: 3, ahora: MEDIODIA, ajustes })).toMatchObject({
      guardar: true,
      motivo: "intervalo",
    });
    const casi = { huella: huella(100), guardadaEn: MEDIODIA - 14 * 60_000 };
    expect(decidirPaso({ huella: huella(100), anterior: casi, cuentaHoy: 3, ahora: MEDIODIA, ajustes }).motivo).toBe("sin_cambio");
  });

  it("con el tope del día alcanzado nada pasa, ni con cambio ni con intervalo", () => {
    expect(decidirPaso({ huella: huella(255), anterior, cuentaHoy: 60, ahora: MEDIODIA, ajustes })).toMatchObject({
      guardar: false,
      motivo: "tope_del_dia",
    });
    /* sin cambio sigue siendo sin_cambio (no se gasta el tope en decir «tope») */
    expect(decidirPaso({ huella: huella(100), anterior, cuentaHoy: 60, ahora: MEDIODIA, ajustes }).motivo).toBe("sin_cambio");
  });
});

describe("el día es el de Lima", () => {
  it("las 23:30 de Lima siguen siendo hoy aunque en UTC ya sea mañana", () => {
    expect(diaDeLima(Date.parse("2026-10-04T04:30:00Z"))).toBe("2026-10-03");
    expect(diaDeLima(Date.parse("2026-10-04T05:30:00Z"))).toBe("2026-10-04");
  });

  it("la cuenta de ayer no frena hoy; guardar suma uno y reinicia al cambiar de día", () => {
    const ayer = { huella: "", guardadaEn: 0, dia: "2026-10-02", cuenta: 60 };
    expect(cuentaDelDia(ayer, MEDIODIA)).toBe(0);
    expect(estadoTrasGuardar(ayer, "aGVsbG8=", MEDIODIA)).toEqual({
      huella: "aGVsbG8=",
      guardadaEn: MEDIODIA,
      dia: "2026-10-03",
      cuenta: 1,
    });
    const hoy = { ...ayer, dia: "2026-10-03", cuenta: 7 };
    expect(estadoTrasGuardar(hoy, "x", MEDIODIA).cuenta).toBe(8);
  });

  it("lo que venga roto de Redis es como si no hubiera nada", () => {
    expect(estadoDe(null)).toBeNull();
    expect(estadoDe("texto")).toBeNull();
    expect(estadoDe({ huella: "x", dia: "2026-10-03", guardadaEn: "ayer", cuenta: 1 })).toBeNull();
    expect(estadoDe({ huella: "x", dia: "2026-10-03", guardadaEn: 5, cuenta: 2.7 })).toEqual({
      huella: "x",
      dia: "2026-10-03",
      guardadaEn: 5,
      cuenta: 2,
    });
  });
});

describe("recorte", () => {
  it("fracciones → píxeles, dentro de la imagen", () => {
    expect(recorteEnPixeles({ x: 0.5, y: 0, w: 0.5, h: 0.5 }, 1920, 1080)).toEqual({ left: 960, top: 0, width: 960, height: 540 });
    /* el redondeo nunca se sale del borde */
    expect(recorteEnPixeles({ x: 0.3333, y: 0.3333, w: 0.6667, h: 0.6667 }, 101, 101)).toEqual({
      left: 34,
      top: 34,
      width: 67,
      height: 67,
    });
  });

  it("sin recorte o la imagen entera = no recortar", () => {
    expect(recorteEnPixeles(null, 100, 100)).toBeNull();
    expect(recorteEnPixeles({ x: 0, y: 0, w: 1, h: 1 }, 100, 100)).toBeNull();
  });

  it("valida: fuera de la imagen, demasiado chico, se sale", () => {
    expect(validarRecorte({ x: 0, y: 0, w: 1, h: 1 }).ok).toBe(true);
    expect(validarRecorte({ x: -0.1, y: 0, w: 0.5, h: 0.5 }).ok).toBe(false);
    expect(validarRecorte({ x: 0, y: 0, w: 0.01, h: 0.5 }).ok).toBe(false);
    expect(validarRecorte({ x: 0.6, y: 0, w: 0.5, h: 0.5 }).ok).toBe(false);
    expect(validarRecorte({ x: 0.5, y: 0, w: 0.50001, h: 0.5 })).toEqual({ ok: true, recorte: { x: 0.5, y: 0, w: 0.5, h: 0.5 } });
  });
});

describe("configurarPuente", () => {
  it("guarda fuente, recorte y ajustes; los ajustes se mezclan con lo guardado", () => {
    const antes = [camara({ vivo: { cadaMin: 30 } })];
    const r = configurarPuente(antes, "cam_1", { fuente: "puente_pc", recorte: { x: 0, y: 0.1, w: 1, h: 0.8 }, vivo: { umbralPct: 5 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.camaras[0]).toMatchObject({ fuente: "puente_pc", recorte: { x: 0, y: 0.1, w: 1, h: 0.8 }, vivo: { cadaMin: 30, umbralPct: 5 } });
    expect(ajustesVivo(r.camaras[0]!)).toEqual({ umbralPct: 5, cadaMin: 30, maxDia: 60 });
    expect(r.mensaje).toContain("5 %");
  });

  it("null quita (vuelve a lo de siempre); undefined no toca", () => {
    const antes = [camara({ fuente: "puente_pc", recorte: { x: 0, y: 0, w: 0.5, h: 0.5 }, vivo: { maxDia: 10 } })];
    const r = configurarPuente(antes, "cam_1", { recorte: null, vivo: null });
    expect(r.ok && r.camaras[0]).toEqual(camara({ fuente: "puente_pc" }));
  });

  it("rechaza recorte inválido, ajustes fuera de rango y cámara ajena", () => {
    const antes = [camara()];
    expect(configurarPuente(antes, "cam_1", { recorte: { x: 0.9, y: 0, w: 0.5, h: 0.5 } }).ok).toBe(false);
    expect(configurarPuente(antes, "cam_1", { vivo: { maxDia: 0 } }).ok).toBe(false);
    expect(configurarPuente(antes, "cam_1", { vivo: { cadaMin: 2.5 } }).ok).toBe(false);
    expect(configurarPuente(antes, "otra", { fuente: "isapi" })).toEqual({ ok: false, motivo: "Esa cámara no está en la lista." });
  });
});
