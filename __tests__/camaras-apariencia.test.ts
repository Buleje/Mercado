/**
 * Firma de la ropa sin biometría (ADR-479): píxeles sintéticos de una caja de
 * persona = cabeza (0-18 %), torso (18-55 %) y piernas (55-100 %), con fondo a
 * los costados (fuera de la franja central que se mira).
 */
import { describe, expect, it } from "vitest";
import {
  ALTO_MIN_FIRMA_PX,
  UMBRAL_MISMA_ROPA,
  altoBandaRotulo,
  distanciaFirmas,
  esFluorescente,
  firmaDePixeles,
  CUERPO_MAX_ANCHO,
  CUERPO_MAX_FILAS,
  SIN_CHALECOS_REGISTRADOS,
  firmaDelCuerpo,
  leerCajasDelFormulario,
  leerCajasGuardadas,
  marcadorDeChaleco,
  muestrearRecorte,
} from "@/lib/camaras/apariencia";

type Rgb = [number, number, number];

function caja(
  ancho: number,
  alto: number,
  partes: { cabeza: Rgb; torso: Rgb | ((x: number, y: number) => Rgb); piernas: Rgb; fondo?: Rgb },
): Uint8ClampedArray {
  const px = new Uint8ClampedArray(ancho * alto * 4);
  const fondo = partes.fondo ?? [140, 110, 70];
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const lado = x < ancho * 0.2 || x >= ancho * 0.8;
      const f = y / alto;
      const c: Rgb = lado
        ? fondo
        : f < 0.18
          ? partes.cabeza
          : f < 0.55
            ? typeof partes.torso === "function"
              ? partes.torso(x, y)
              : partes.torso
            : partes.piernas;
      px.set([c[0], c[1], c[2], 255], (y * ancho + x) * 4);
    }
  }
  return px;
}

const luz = (c: Rgb, k: number): Rgb => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
const ROJO: Rgb = [200, 30, 30];
const AZUL: Rgb = [30, 60, 190];
const BLANCO: Rgb = [240, 240, 240];
const JEAN: Rgb = [50, 60, 90];
const PIEL: Rgb = [190, 140, 110];

function firma(px: Uint8ClampedArray, ancho = 40, alto = 120) {
  const f = firmaDePixeles(px, ancho, alto);
  if (!f) throw new Error("sin firma");
  return f;
}

describe("firma de la ropa", () => {
  it("camisa roja vs azul con el mismo pantalón: distintas (> umbral)", () => {
    const a = firma(caja(40, 120, { cabeza: PIEL, torso: ROJO, piernas: JEAN }));
    const b = firma(caja(40, 120, { cabeza: PIEL, torso: AZUL, piernas: JEAN }));
    expect(a.firma).toMatch(/^[0-9a-f]{24}$/);
    expect(distanciaFirmas(a.firma, b.firma)).toBeGreaterThan(UMBRAL_MISMA_ROPA);
  });

  it("la misma ropa con otra luz (80 % y 120 %) sigue siendo la misma (< umbral)", () => {
    for (const torso of [ROJO, BLANCO]) {
      const base = firma(caja(40, 120, { cabeza: PIEL, torso, piernas: JEAN }));
      for (const k of [0.8, 1.05]) {
        const otra = firma(caja(40, 120, { cabeza: luz(PIEL, k), torso: luz(torso, k), piernas: luz(JEAN, k), fondo: luz([140, 110, 70], k) }));
        expect(distanciaFirmas(base.firma, otra.firma)).toBeLessThan(UMBRAL_MISMA_ROPA);
      }
    }
  });

  it("cambiar la franja de la cabeza NO cambia la firma (la cabeza nunca se lee)", () => {
    const a = firma(caja(40, 120, { cabeza: PIEL, torso: ROJO, piernas: JEAN }));
    const b = firma(caja(40, 120, { cabeza: [0, 255, 0], torso: ROJO, piernas: JEAN }));
    const c = firma(caja(40, 120, { cabeza: [255, 255, 255], torso: ROJO, piernas: JEAN }));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("caja de menos de 40 px de alto → sin firma", () => {
    expect(firmaDePixeles(caja(15, ALTO_MIN_FIRMA_PX - 1, { cabeza: PIEL, torso: ROJO, piernas: JEAN }), 15, ALTO_MIN_FIRMA_PX - 1)).toBeNull();
    expect(firmaDePixeles(caja(15, ALTO_MIN_FIRMA_PX, { cabeza: PIEL, torso: ROJO, piernas: JEAN }), 15, ALTO_MIN_FIRMA_PX)).not.toBeNull();
  });

  it("chaleco amarillo o naranja fluorescente en el torso → chaleco; ropa común y madera, no", () => {
    expect(firma(caja(40, 120, { cabeza: PIEL, torso: [200, 255, 0], piernas: JEAN })).chaleco).toBe(true);
    expect(firma(caja(40, 120, { cabeza: PIEL, torso: [255, 100, 0], piernas: JEAN })).chaleco).toBe(true);
    // Mitad chaleco (franjas verticales sobre polo azul) también: ≥25 % del torso.
    const franjas = (x: number): Rgb => (x % 4 < 2 ? [210, 255, 20] : AZUL);
    expect(firma(caja(40, 120, { cabeza: PIEL, torso: franjas, piernas: JEAN })).chaleco).toBe(true);
    expect(firma(caja(40, 120, { cabeza: PIEL, torso: ROJO, piernas: JEAN })).chaleco).toBe(false);
    expect(firma(caja(40, 120, { cabeza: PIEL, torso: [200, 150, 100], piernas: JEAN })).chaleco).toBe(false);
  });

  it("el ámbar con que se dibujan las cajas sobre la foto no cuenta como chaleco", () => {
    expect(esFluorescente(225, 172, 30)).toBe(false);
    expect(esFluorescente(245, 158, 11)).toBe(false);
    expect(esFluorescente(255, 100, 0)).toBe(true);
  });

  it("distancia: idéntica = 0, firma rota = 1, sin piernas compara sólo el torso", () => {
    const a = firma(caja(40, 120, { cabeza: PIEL, torso: ROJO, piernas: JEAN })).firma;
    expect(distanciaFirmas(a, a)).toBe(0);
    expect(distanciaFirmas(a, "zz")).toBe(1);
    const sinPiernas = `${a.slice(0, 12)}000000000000`;
    expect(distanciaFirmas(a, sinPiernas)).toBe(0);
  });

  it("banda del rótulo como la pinta componerFoto", () => {
    expect(altoBandaRotulo(856)).toBe(28);
    expect(altoBandaRotulo(1280)).toBe(35);
  });
});

describe("cajas del formulario", () => {
  const una = { x: 0.1, y: 0.2, ancho: 0.05, alto: 0.2, confianza: 0.62 };

  it("sin el campo = cliente viejo: se acepta, sin cajas", () => {
    expect(leerCajasDelFormulario(null)).toEqual({ ok: true, cajas: null });
    expect(leerCajasDelFormulario(undefined)).toEqual({ ok: true, cajas: null });
    expect(leerCajasDelFormulario("")).toEqual({ ok: true, cajas: null });
  });

  it("JSON válido → cajas; roto, fuera de rango, de más o no-texto → error", () => {
    expect(leerCajasDelFormulario(JSON.stringify([una]))).toEqual({ ok: true, cajas: [una] });
    expect(leerCajasDelFormulario("[{x:1")).toEqual({ ok: false });
    expect(leerCajasDelFormulario(JSON.stringify([{ ...una, x: 1.5 }]))).toEqual({ ok: false });
    expect(leerCajasDelFormulario(JSON.stringify([{ ...una, ancho: 0 }]))).toEqual({ ok: false });
    expect(leerCajasDelFormulario(JSON.stringify(Array(10).fill(una)))).toMatchObject({ ok: true });
    expect(leerCajasDelFormulario(JSON.stringify(Array(11).fill(una)))).toEqual({ ok: false });
    expect(leerCajasDelFormulario(JSON.stringify([{ ...una, marcador: 12 }]))).toEqual({ ok: false });
    // 245-249 es la hoja de PRUEBA de distancia: nunca una persona.
    expect(leerCajasDelFormulario(JSON.stringify([{ ...una, marcador: 247 }]))).toEqual({ ok: false });
    expect(leerCajasDelFormulario(JSON.stringify([{ ...una, marcador: 203 }]))).toMatchObject({ ok: true });
    expect(leerCajasDelFormulario(new Blob(["[]"]))).toEqual({ ok: false });
  });

  it("cajas guardadas: las de antes (sin campo) o rotas → null", () => {
    expect(leerCajasGuardadas({ personas: 2 })).toBeNull();
    expect(leerCajasGuardadas({ cajas: [{ ...una, firma: "nada", chaleco: false }] })).toBeNull();
    const buena = { ...una, firma: "0".repeat(23) + "f", chaleco: false };
    expect(leerCajasGuardadas({ cajas: [buena] })).toEqual([buena]);
  });
});

describe("muestreo del cuerpo y marcador del chaleco", () => {
  /** La caja de `caja()` como foto cruda RGB (3 canales), pegada en (dx, dy) de una foto de `W`×`H` gris. */
  function enFoto(px: Uint8ClampedArray, ancho: number, alto: number, W: number, H: number, dx: number, dy: number) {
    const foto = new Uint8Array(W * H * 3).fill(120);
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const o = (y * ancho + x) * 4;
        foto.set([px[o], px[o + 1], px[o + 2]], ((dy + y) * W + dx + x) * 3);
      }
    }
    return foto;
  }

  it("un recorte que ya entra queda idéntico al de antes (misma firma)", () => {
    const px = caja(40, 120, { cabeza: PIEL, torso: ROJO, piernas: JEAN });
    const foto = enFoto(px, 40, 120, 200, 200, 30, 20);
    const filaCuerpo = Math.ceil(120 * 0.18);
    const m = muestrearRecorte(foto, 200, 3, { x0: 30, y0: 20 + filaCuerpo, x1: 70, y1: 140 });
    expect([m.ancho, m.filas, m.escalaFilas]).toEqual([40, 120 - filaCuerpo, 1]);
    expect(firmaDelCuerpo(m.rgba, m.ancho, m.filas, 120 * m.escalaFilas)).toEqual(firma(px));
  });

  it("una persona grande se achica a ≤ 64 × 128 y da la misma ropa", () => {
    const [ancho, alto] = [300, 900];
    const px = caja(ancho, alto, { cabeza: PIEL, torso: (x) => (x % 6 < 3 ? ROJO : BLANCO), piernas: JEAN });
    const foto = enFoto(px, ancho, alto, 400, 1000, 50, 40);
    const filaCuerpo = Math.ceil(alto * 0.18);
    const m = muestrearRecorte(foto, 400, 3, { x0: 50, y0: 40 + filaCuerpo, x1: 50 + ancho, y1: 40 + alto });
    expect(m.ancho).toBe(CUERPO_MAX_ANCHO);
    expect(m.filas).toBe(CUERPO_MAX_FILAS);
    const chica = firmaDelCuerpo(m.rgba, m.ancho, m.filas, alto * m.escalaFilas);
    const grande = firmaDePixeles(px, ancho, alto);
    expect(chica && grande && distanciaFirmas(chica.firma, grande.firma)).toBeLessThan(0.1);
  });

  it("el marcador sólo vale si el chaleco está registrado (hoy ninguno)", () => {
    expect(marcadorDeChaleco(203, SIN_CHALECOS_REGISTRADOS)).toBeNull();
    expect(marcadorDeChaleco(203, new Set([203]))).toBe(203);
    expect(marcadorDeChaleco(204, new Set([203]))).toBeNull();
    expect(marcadorDeChaleco(undefined, new Set([203]))).toBeNull();
  });
});
