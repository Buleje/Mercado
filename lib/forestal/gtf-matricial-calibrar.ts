/**
 * gtf-matricial-calibrar — «Calibrar con regla» (16-10, Brandon).
 *
 * Antes calibrar era tantear: escribir corrimiento X/Y y escala a mano,
 * imprimir, medir y volver a tantear. Ahora se imprime la hoja de cruces, se
 * mide con regla —desde el borde IZQUIERDO y el de ARRIBA del papel— el centro
 * de dos cruces opuestas (arriba a la izquierda y abajo a la derecha) y esta
 * cuenta despeja el perfil nuevo.
 *
 * El modelo, por eje y en mm desde el borde del papel:
 *   · la hoja MANDA la cruz a  p = c · s + d   (c = dónde va la cruz en el
 *     papel, `CRUZ_MM` del borde; s, d = el perfil con que se imprimió);
 *   · la impresora la PONE en m = a · p + b   (a = cuánto estira, b = cuánto
 *     corre: lo que se mide con la regla).
 * Dos cruces dan dos ecuaciones: a = (m2 − m1) / (p2 − p1), b = m1 − a · p1.
 * Para que la próxima caiga donde va (a · (c · s' + d') + b = c):
 *   s' = 1 / a   y   d' = (c − b) / a − s' · c,
 * con la escala ya redondeada a 0,1 % y d' exacto en el medio de las dos
 * cruces (el error que deja el redondeo se reparte entre las dos). Compone con
 * el perfil actual: si el perfil ya corregía 2 mm, la medida lo incluye.
 *
 * La misma transformación vale para el navegador, el PDF y el ESC/P: los tres
 * dibujan con `aplicarX/aplicarY` del perfil (`gtf-matricial-perfiles.ts`).
 * Funciones puras; las usa el asistente del panel de la impresora.
 */

import { CRUZ_MM } from "./gtf-matricial-disposicion";
import { CORRIMIENTO_MAX_MM, ESCALA_MAX, ESCALA_MIN } from "./gtf-matricial-perfiles";

/** Un perfil en números: X = x · sx + dx, Y = y · sy + dy (mm). */
export interface AjusteImpresora {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
}

export interface PuntoMm {
  x: number;
  y: number;
}

/** Lo que se mide: el centro de cada cruz, desde el borde izquierdo (x) y el de arriba (y). */
export interface MedidasCruces {
  arribaIzq: PuntoMm;
  abajoDer: PuntoMm;
}

/** Cada casillero del asistente, en el orden en que se mide. */
export const CAMPOS_MEDIDA = ["arribaIzq.x", "arribaIzq.y", "abajoDer.x", "abajoDer.y"] as const;
export type CampoMedida = (typeof CAMPOS_MEDIDA)[number];

/** Lo que hace la impresora por su cuenta, para decirlo en palabras. */
export interface ComoImprime {
  /** Cuánto corre la cruz de arriba a la izquierda respecto de donde se la mandó (+ = derecha / abajo). */
  correXmm: number;
  correYmm: number;
  /** 1,008 = estira 0,8 %. */
  estiraX: number;
  estiraY: number;
}

export type ResultadoCalibracion =
  | { ok: true; nuevo: AjusteImpresora; impresora: ComoImprime; sinCambio: boolean }
  | { ok: false; campo: CampoMedida | null; mensaje: string };

const r1 = (v: number): number => Math.round(v * 10) / 10;
/** 0,1 % de escala. */
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
/** Con coma, sin ceros de más: 2,5 · 1 · 0,8. */
export const fmt1 = (v: number): string => String(r1(v) === 0 ? 0 : r1(v)).replace(".", ",");
/** 0,992 → «99,2 %». */
export const pct1 = (v: number): string => `${fmt1(v * 100)} %`;

/** Dónde TIENEN que caer las dos cruces que se miden: a `CRUZ_MM` de su esquina. */
export function crucesEsperadas(hoja: { anchoMm: number; altoMm: number }): MedidasCruces {
  return {
    arribaIzq: { x: CRUZ_MM, y: CRUZ_MM },
    abajoDer: { x: hoja.anchoMm - CRUZ_MM, y: hoja.altoMm - CRUZ_MM },
  };
}

/** Dónde las MANDA la hoja de prueba con el perfil con que se imprime (lo que dibuja `htmlPruebaTalonario`). */
export function crucesMandadas(hoja: { anchoMm: number; altoMm: number }, t: AjusteImpresora): MedidasCruces {
  const c = crucesEsperadas(hoja);
  const a = (p: PuntoMm): PuntoMm => ({ x: p.x * t.sx + t.dx, y: p.y * t.sy + t.dy });
  return { arribaIzq: a(c.arribaIzq), abajoDer: a(c.abajoDer) };
}

const NOMBRE_CRUZ = { arribaIzq: "de arriba a la izquierda", abajoDer: "de abajo a la derecha" } as const;

interface Eje {
  c1: number;
  c2: number;
  s: number;
  d: number;
  m1: number;
  m2: number;
}

function resolverEje({ c1, c2, s, d, m1, m2 }: Eje) {
  const p1 = c1 * s + d;
  const p2 = c2 * s + d;
  const a = (m2 - m1) / (p2 - p1);
  const b = m1 - a * p1;
  const sNueva = r3(1 / a);
  const medio = (c1 + c2) / 2;
  const dNueva = r1((medio - b) / a - sNueva * medio);
  return { a, corre: m1 - p1, sNueva, dNueva };
}

/**
 * Del perfil con que se imprimió la hoja de cruces y las 4 medidas, el perfil
 * nuevo. Medidas absurdas (una cruz fuera del papel, la de abajo a la
 * izquierda de la de arriba, una escala fuera de 90-110 %) → `ok: false` con el
 * casillero que hay que revisar: el asistente avisa y no deja aplicar.
 */
export function calcularCalibracion(hoja: { anchoMm: number; altoMm: number }, actual: AjusteImpresora, m: MedidasCruces): ResultadoCalibracion {
  const W = hoja.anchoMm;
  const H = hoja.altoMm;
  for (const cruz of ["arribaIzq", "abajoDer"] as const) {
    const { x, y } = m[cruz];
    if (!Number.isFinite(x) || x <= 0 || x >= W) {
      return { ok: false, campo: `${cruz}.x`, mensaje: `La cruz ${NOMBRE_CRUZ[cruz]} no puede caer a ${fmt1(x)} mm del borde izquierdo: la hoja mide ${fmt1(W)} mm de ancho.` };
    }
    if (!Number.isFinite(y) || y <= 0 || y >= H) {
      return { ok: false, campo: `${cruz}.y`, mensaje: `La cruz ${NOMBRE_CRUZ[cruz]} no puede caer a ${fmt1(y)} mm del borde de arriba: la hoja mide ${fmt1(H)} mm de alto.` };
    }
  }
  if (m.abajoDer.x <= m.arribaIzq.x) {
    return { ok: false, campo: "abajoDer.x", mensaje: "La cruz de abajo a la derecha tiene que quedar más lejos del borde izquierdo que la de arriba: mide las dos desde el borde IZQUIERDO." };
  }
  if (m.abajoDer.y <= m.arribaIzq.y) {
    return { ok: false, campo: "abajoDer.y", mensaje: "La cruz de abajo a la derecha tiene que quedar más lejos del borde de arriba que la otra: mide las dos desde el borde de ARRIBA." };
  }
  const c = crucesEsperadas(hoja);
  const x = resolverEje({ c1: c.arribaIzq.x, c2: c.abajoDer.x, s: actual.sx, d: actual.dx, m1: m.arribaIzq.x, m2: m.abajoDer.x });
  const y = resolverEje({ c1: c.arribaIzq.y, c2: c.abajoDer.y, s: actual.sy, d: actual.dy, m1: m.arribaIzq.y, m2: m.abajoDer.y });
  for (const [eje, r, campo, sentido] of [["X", x, "abajoDer.x", "a lo ancho"], ["Y", y, "abajoDer.y", "a lo largo"]] as const) {
    if (!(r.a >= ESCALA_MIN && r.a <= ESCALA_MAX) || !(r.sNueva >= ESCALA_MIN && r.sNueva <= ESCALA_MAX)) {
      return {
        ok: false,
        campo,
        mensaje: `Con esas medidas la impresora ${r.a >= 1 ? "estiraría" : "encogería"} ${fmt1(Math.abs(r.a - 1) * 100)} % ${sentido} (escala ${eje} fuera de 90-110 %): revisa que mediste desde el borde izquierdo y el de arriba.`,
      };
    }
    if (Math.abs(r.dNueva) > CORRIMIENTO_MAX_MM) {
      return { ok: false, campo, mensaje: `El corrimiento ${eje} saldría en ${fmt1(r.dNueva)} mm (más de ${CORRIMIENTO_MAX_MM}): revisa la medida.` };
    }
  }
  const nuevo: AjusteImpresora = { dx: x.dNueva, dy: y.dNueva, sx: x.sNueva, sy: y.sNueva };
  const sinCambio =
    Math.abs(nuevo.dx - actual.dx) < 0.05 && Math.abs(nuevo.dy - actual.dy) < 0.05 && Math.abs(nuevo.sx - actual.sx) < 0.0005 && Math.abs(nuevo.sy - actual.sy) < 0.0005;
  return { ok: true, nuevo, impresora: { correXmm: x.corre, correYmm: y.corre, estiraX: x.a, estiraY: y.a }, sinCambio };
}

/** «La impresora corre todo 2,5 mm a la derecha y 1 mm abajo; estira 0,8 % a lo ancho.» */
export function fraseImpresora(i: ComoImprime): string {
  const corre: string[] = [];
  if (r1(i.correXmm) !== 0) corre.push(`${fmt1(Math.abs(i.correXmm))} mm a la ${i.correXmm > 0 ? "derecha" : "izquierda"}`);
  if (r1(i.correYmm) !== 0) corre.push(`${fmt1(Math.abs(i.correYmm))} mm ${i.correYmm > 0 ? "abajo" : "arriba"}`);
  const estira: string[] = [];
  for (const [v, sentido] of [[i.estiraX, "a lo ancho"], [i.estiraY, "a lo largo"]] as const) {
    const p = r1((v - 1) * 100);
    if (p !== 0) estira.push(`${p > 0 ? "estira" : "encoge"} ${fmt1(Math.abs(p))} % ${sentido}`);
  }
  const partes = [corre.length ? `corre todo ${corre.join(" y ")}` : "", estira.join(" y ")].filter(Boolean);
  return partes.length ? `La impresora ${partes.join("; ")}.` : "La impresora imprime justo donde se le manda.";
}

/** «X −2,5 · Y −1 mm · 99,2 % × 100 %»: un perfil en una línea. */
export const rotuloAjuste = (a: AjusteImpresora): string => `X ${fmt1(a.dx)} · Y ${fmt1(a.dy)} mm · ${pct1(a.sx)} × ${pct1(a.sy)}`;
