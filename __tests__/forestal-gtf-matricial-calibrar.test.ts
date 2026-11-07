// @vitest-environment node
/**
 * «Calibrar con regla» (16-10): de 4 medidas con regla al perfil de la
 * impresora. Lo que se prueba es el papel: una impresora simulada que corre y
 * estira, después de calibrar, pone cada cruz a ±0,1 mm de donde va — en el
 * navegador (HTML), en el PDF y en el ESC/P, que comparten la transformación.
 */
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  calcularCalibracion,
  crucesEsperadas,
  crucesMandadas,
  fraseImpresora,
  rotuloAjuste,
  type AjusteImpresora,
  type MedidasCruces,
} from "@/lib/forestal/gtf-matricial-calibrar";
import { CATALOGO, CRUZ_MM, hojaDeFabrica } from "@/lib/forestal/gtf-matricial-disposicion";
import { cambiarPerfil, normalizarPerfiles, perfilesDeFabrica, PERFIL_MONTE_ID, transformacionDe } from "@/lib/forestal/gtf-matricial-perfiles";
import { htmlPruebaTalonario } from "@/lib/forestal/gtf-matricial-print";
import { renglonesPruebaEscp } from "@/lib/forestal/gtf-salida-escp";
import { pdfPrueba, PT_POR_MM } from "@/lib/forestal/gtf-salida-pdf";

const HOJA = { anchoMm: 210, altoMm: 297 };
const IDENTIDAD: AjusteImpresora = { dx: 0, dy: 0, sx: 1, sy: 1 };
const ACT = { en: "2026-10-16T12:00:00.000Z", por: "qa" };

/** Una matricial de verdad: pone lo que se le manda a `p` en `a · p + b` (por eje). */
interface Impresora {
  ax: number;
  bx: number;
  ay: number;
  by: number;
}
const imprime = (i: Impresora, p: { x: number; y: number }) => ({ x: i.ax * p.x + i.bx, y: i.ay * p.y + i.by });

/** Lo que mide la regla: las dos cruces, mandadas con el perfil `t`, puestas por la impresora. */
function medir(i: Impresora, t: AjusteImpresora, hoja = HOJA): MedidasCruces {
  const m = crucesMandadas(hoja, t);
  return { arribaIzq: imprime(i, m.arribaIzq), abajoDer: imprime(i, m.abajoDer) };
}

/** Dónde cae en el papel lo que la hoja dibuja en (x, y), con el perfil `t` y la impresora `i`. */
const cae = (i: Impresora, t: AjusteImpresora, x: number, y: number) => imprime(i, { x: x * t.sx + t.dx, y: y * t.sy + t.dy });

const corridaYEstirada: Impresora = { ax: 1.008, bx: 2.5, ay: 1, by: 1 };

describe("la cuenta", () => {
  it("lo medido = lo esperado con el perfil en cero: no cambia nada", () => {
    const r = calcularCalibracion(HOJA, IDENTIDAD, crucesEsperadas(HOJA));
    expect(r.ok && r.sinCambio).toBe(true);
    if (!r.ok) return;
    expect(r.nuevo).toEqual(IDENTIDAD);
    expect(fraseImpresora(r.impresora)).toBe("La impresora imprime justo donde se le manda.");
  });

  it("dice en palabras lo que hace la impresora", () => {
    const r = calcularCalibracion(HOJA, IDENTIDAD, medir(corridaYEstirada, IDENTIDAD));
    if (!r.ok) throw new Error(r.mensaje);
    // La cruz de arriba (a 10 mm) cae a 2,5 + 10·0,8 % = 2,58 mm de más: «2,6».
    expect(fraseImpresora(r.impresora)).toBe("La impresora corre todo 2,6 mm a la derecha y 1 mm abajo; estira 0,8 % a lo ancho.");
    expect(r.nuevo.sx).toBe(0.992);
    expect(rotuloAjuste(r.nuevo)).toBe("X -2,5 · Y -1 mm · 99,2 % × 100 %");
  });

  it("compone con el perfil actual: si ya corregía 2 mm, no los vuelve a restar", () => {
    const actual = { dx: 2, dy: -1, sx: 1, sy: 1 };
    const r = calcularCalibracion(HOJA, actual, medir({ ax: 1, bx: 2.5, ay: 1, by: 0 }, actual));
    if (!r.ok) throw new Error(r.mensaje);
    expect(r.nuevo).toEqual({ dx: -2.5, dy: 0, sx: 1, sy: 1 });
    // Ya calibrada: imprimir con lo nuevo y volver a medir no cambia nada.
    const otra = calcularCalibracion(HOJA, r.nuevo, medir({ ax: 1, bx: 2.5, ay: 1, by: 0 }, r.nuevo));
    expect(otra.ok && otra.sinCambio).toBe(true);
  });

  it("redondea a 0,1 mm y 0,1 %", () => {
    const r = calcularCalibracion(HOJA, IDENTIDAD, medir({ ax: 1.00337, bx: 1.234, ay: 0.99612, by: -0.777 }, IDENTIDAD));
    if (!r.ok) throw new Error(r.mensaje);
    for (const v of [r.nuevo.dx, r.nuevo.dy]) expect(Math.round(v * 10) / 10).toBe(v);
    for (const v of [r.nuevo.sx, r.nuevo.sy]) expect(Math.round(v * 1000) / 1000).toBe(v);
  });

  const casos: Array<[string, Impresora, AjusteImpresora]> = [
    ["corrida y estirada, perfil en cero", corridaYEstirada, IDENTIDAD],
    ["encoge a lo largo, perfil ya tocado", { ax: 0.997, bx: -1.8, ay: 0.993, by: 3.2 }, { dx: 1.5, dy: -2, sx: 1.004, sy: 0.998 }],
    ["corre mucho y estira en los dos", { ax: 1.012, bx: 6.4, ay: 1.009, by: -4.7 }, { dx: -0.5, dy: 0.5, sx: 1, sy: 1.002 }],
    ["Carta, casi derecha", { ax: 1.0004, bx: 0.3, ay: 0.9996, by: -0.2 }, IDENTIDAD],
  ];

  it.each(casos)("ida y vuelta (%s): toda la hoja cae a ±0,1 mm de donde va", (_, imp, actual) => {
    const hoja = _.startsWith("Carta") ? { anchoMm: 215.9, altoMm: 279.4 } : HOJA;
    const r = calcularCalibracion(hoja, actual, medir(imp, actual, hoja));
    if (!r.ok) throw new Error(r.mensaje);
    for (let x = CRUZ_MM; x <= hoja.anchoMm - CRUZ_MM; x += 5) {
      for (let y = CRUZ_MM; y <= hoja.altoMm - CRUZ_MM; y += 5) {
        const p = cae(imp, r.nuevo, x, y);
        expect(Math.abs(p.x - x)).toBeLessThanOrEqual(0.1 + 1e-9);
        expect(Math.abs(p.y - y)).toBeLessThanOrEqual(0.1 + 1e-9);
      }
    }
  });
});

describe("medidas absurdas: avisa y no aplica", () => {
  const bien = medir(corridaYEstirada, IDENTIDAD);
  const con = (cambio: Partial<{ ax: number; ay: number; bx: number; by: number }>): MedidasCruces => ({
    arribaIzq: { x: cambio.ax ?? bien.arribaIzq.x, y: cambio.ay ?? bien.arribaIzq.y },
    abajoDer: { x: cambio.bx ?? bien.abajoDer.x, y: cambio.by ?? bien.abajoDer.y },
  });

  it("una cruz fuera de la hoja", () => {
    const r = calcularCalibracion(HOJA, IDENTIDAD, con({ bx: 215 }));
    expect(r).toMatchObject({ ok: false, campo: "abajoDer.x" });
    if (!r.ok) expect(r.mensaje).toMatch(/210 mm de ancho/);
    expect(calcularCalibracion(HOJA, IDENTIDAD, con({ ay: 0 }))).toMatchObject({ ok: false, campo: "arribaIzq.y" });
    expect(calcularCalibracion(HOJA, IDENTIDAD, con({ ax: Number.NaN }))).toMatchObject({ ok: false, campo: "arribaIzq.x" });
  });

  it("la de abajo medida desde el borde derecho (queda a la izquierda de la otra)", () => {
    const r = calcularCalibracion(HOJA, IDENTIDAD, con({ bx: 9 }));
    expect(r).toMatchObject({ ok: false, campo: "abajoDer.x" });
    if (!r.ok) expect(r.mensaje).toMatch(/borde IZQUIERDO/);
  });

  it("una escala fuera de 90-110 %", () => {
    const r = calcularCalibracion(HOJA, IDENTIDAD, con({ by: 250 }));
    expect(r).toMatchObject({ ok: false, campo: "abajoDer.y" });
    if (!r.ok) expect(r.mensaje).toMatch(/fuera de 90-110 %/);
  });

  it("un corrimiento de más de 50 mm (en A4 lo atajan antes la hoja y la escala; en una hoja de 1 m, no)", () => {
    // Encoge 5 % y corre 55 mm: las dos cruces caen dentro del papel.
    const r = calcularCalibracion({ anchoMm: 1000, altoMm: 1000 }, IDENTIDAD, { arribaIzq: { x: 64.5, y: 10 }, abajoDer: { x: 995.5, y: 990 } });
    expect(r).toMatchObject({ ok: false, campo: "abajoDer.x" });
    if (!r.ok) expect(r.mensaje).toMatch(/más de 50/);
  });
});

/** El perfil «Monte» con lo calibrado, guardado y vuelto a leer (como en el KV). */
function monteCalibrado(nuevo: AjusteImpresora) {
  const c = cambiarPerfil(
    perfilesDeFabrica(),
    { id: PERFIL_MONTE_ID, corrimientoXmm: nuevo.dx, corrimientoYmm: nuevo.dy, escalaX: nuevo.sx, escalaY: nuevo.sy },
    ACT,
  );
  if (!c.ok) throw new Error(c.error);
  return normalizarPerfiles(JSON.parse(JSON.stringify(c.perfiles)))[PERFIL_MONTE_ID];
}

describe("la calibración vale igual en el navegador, el PDF y el ESC/P", () => {
  const hoja = hojaDeFabrica("guia");
  const H = { anchoMm: hoja.anchoMm, altoMm: hoja.altoMm };
  const imp: Impresora = { ax: 1.007, bx: 2.2, ay: 0.995, by: -1.4 };
  const actual = transformacionDe(hoja, perfilesDeFabrica()[PERFIL_MONTE_ID]);
  const r = calcularCalibracion(H, actual, medir(imp, actual, H));
  if (!r.ok) throw new Error(r.mensaje);
  const t = transformacionDe(hoja, monteCalibrado(r.nuevo));
  const esquinas = [
    [CRUZ_MM, CRUZ_MM],
    [H.anchoMm - CRUZ_MM, CRUZ_MM],
    [CRUZ_MM, H.altoMm - CRUZ_MM],
    [H.anchoMm - CRUZ_MM, H.altoMm - CRUZ_MM],
  ];
  /** Cada centro mandado (mm del papel), puesto por la impresora, cae en una esquina a ±0,1 mm. */
  const cadaEsquinaEnSuLugar = (centros: { x: number; y: number }[]) => {
    for (const [ex, ey] of esquinas) {
      const p = centros.map((c) => imprime(imp, c)).find((c) => Math.abs(c.x - ex) < 3 && Math.abs(c.y - ey) < 3);
      expect(p, `cruz en ${ex}, ${ey}`).toBeDefined();
      if (!p) continue;
      expect(Math.abs(p.x - ex)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(p.y - ey)).toBeLessThanOrEqual(0.1);
    }
  };

  it("el perfil guardado conserva lo calibrado", () => {
    expect([t.dx, t.dy, t.sx, t.sy]).toEqual([r.nuevo.dx, r.nuevo.dy, r.nuevo.sx, r.nuevo.sy]);
  });

  it("navegador: las cruces de la prueba HTML", () => {
    const html = htmlPruebaTalonario(hoja, CATALOGO.guia, null, "Prueba", t);
    const tr = /transform="translate\(([-\d.]+) ([-\d.]+)\)(?: scale\(([-\d.]+) ([-\d.]+)\))?"/.exec(html);
    if (!tr) throw new Error("sin transform");
    const [dx, dy, sx, sy] = [Number(tr[1]), Number(tr[2]), Number(tr[3] ?? 1), Number(tr[4] ?? 1)];
    const centros = [...html.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="1.5"/g)].map((m) => ({ x: Number(m[1]) * sx + dx, y: Number(m[2]) * sy + dy }));
    expect(centros).toHaveLength(5);
    cadaEsquinaEnSuLugar(centros);
  });

  it("PDF: el centro de cada cruz (raya horizontal de 12 mm)", async () => {
    const bytes = await pdfPrueba(hoja, t, "Prueba");
    const alto = (await PDFDocument.load(bytes)).getPages()[0].getHeight();
    const crudo = Buffer.from(bytes).toString("latin1");
    const centros: { x: number; y: number }[] = [];
    for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
      let s: string;
      try {
        s = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
      } catch {
        continue;
      }
      for (const l of s.matchAll(/(-?[\d.]+) (-?[\d.]+) m\s+(-?[\d.]+) (-?[\d.]+) l/g)) {
        const [x1, y1, x2, y2] = [1, 2, 3, 4].map((k) => Number(l[k]) / PT_POR_MM);
        if (Math.abs(y1 - y2) < 1e-6 && Math.abs(Math.abs(x2 - x1) - 12 * t.sx) < 0.01) centros.push({ x: (x1 + x2) / 2, y: alto / PT_POR_MM - y1 });
      }
    }
    expect(centros).toHaveLength(5);
    cadaEsquinaEnSuLugar(centros);
  });

  it("ESC/P: el centro de cada «+»", () => {
    const renglones = renglonesPruebaEscp(H, t, 9).filter((x) => x.texto === "+");
    expect(renglones).toHaveLength(5);
    cadaEsquinaEnSuLugar(renglones.map((x) => ({ x: (x.izqMm + x.derMm) / 2, y: (x.arribaMm + x.baseMm) / 2 })));
  });
});
