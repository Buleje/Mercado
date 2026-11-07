import { describe, expect, it } from "vitest";
import {
  compararConFondo,
  crearFondo,
  elegirRecortes,
  iou,
  recorteParaMancha,
  unirRecortes,
} from "@/lib/camaras/movimiento";
import { crearSeguimiento, seguir } from "@/lib/camaras/seguimiento";

const W = 40;
const H = 20;

/** Un cuadro gris parejo con un rectángulo más claro (la «persona»). */
function cuadro(base = 100, persona?: { x: number; y: number; w: number; h: number; v?: number }) {
  const g = new Uint8Array(W * H).fill(base);
  if (persona)
    for (let y = persona.y; y < persona.y + persona.h; y++)
      for (let x = persona.x; x < persona.x + persona.w; x++) g[y * W + x] = persona.v ?? 200;
  return g;
}

describe("compararConFondo", () => {
  it("el primer cuadro arma el fondo y no marca nada", () => {
    const f = crearFondo(W, H);
    const r = compararConFondo(f, cuadro());
    expect(r).toMatchObject({ manchas: [], reiniciado: true });
  });

  it("marca la mancha que se movió, en fracciones del cuadro", () => {
    const f = crearFondo(W, H);
    compararConFondo(f, cuadro());
    const r = compararConFondo(f, cuadro(100, { x: 10, y: 5, w: 2, h: 4 }));
    expect(r.reiniciado).toBe(false);
    expect(r.manchas).toHaveLength(1);
    expect(r.manchas[0]).toEqual({ x: 10 / W, y: 5 / H, ancho: 2 / W, alto: 4 / H });
  });

  it("ruido chico (menos de 3 puntos) no es movimiento", () => {
    const f = crearFondo(W, H);
    compararConFondo(f, cuadro());
    expect(compararConFondo(f, cuadro(100, { x: 3, y: 3, w: 1, h: 2 })).manchas).toEqual([]);
  });

  it("un cambio de luz en todo el cuadro reinicia el fondo en vez de marcar todo", () => {
    const f = crearFondo(W, H);
    compararConFondo(f, cuadro(100));
    const r = compararConFondo(f, cuadro(160));
    expect(r).toMatchObject({ manchas: [], reiniciado: true });
    expect(compararConFondo(f, cuadro(160)).manchas).toEqual([]);
  });

  it("lo que se queda quieto se funde en el fondo con el tiempo", () => {
    const f = crearFondo(W, H);
    compararConFondo(f, cuadro());
    const quieto = cuadro(100, { x: 10, y: 5, w: 3, h: 4 });
    let ultimo = compararConFondo(f, quieto);
    for (let i = 0; i < 200 && ultimo.manchas.length; i++) ultimo = compararConFondo(f, quieto);
    expect(ultimo.manchas).toEqual([]);
  });
});

describe("recortes", () => {
  it("el recorte es cuadrado en píxeles, centrado y adentro del cuadro", () => {
    const r = recorteParaMancha({ x: 0.9, y: 0.05, ancho: 0.02, alto: 0.06 }, 16 / 9);
    expect(r.alto).toBeCloseTo(0.3);
    expect(r.ancho).toBeCloseTo(0.3 / (16 / 9));
    expect(r.x + r.ancho).toBeLessThanOrEqual(1);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });

  it("une los que se pisan y se queda con los más grandes", () => {
    const a = { x: 0.1, y: 0.1, ancho: 0.2, alto: 0.3 };
    const b = { x: 0.12, y: 0.1, ancho: 0.2, alto: 0.3 };
    const c = { x: 0.7, y: 0.6, ancho: 0.1, alto: 0.1 };
    const u = unirRecortes([a, b, c], 5);
    expect(u).toHaveLength(2);
    expect(u[0].x).toBeCloseTo(0.1);
    expect(u[0].ancho).toBeCloseTo(0.22);
    expect(unirRecortes([a, c], 1)).toHaveLength(1);
    expect(iou(a, a)).toBeCloseTo(1);
  });
});

describe("seguir", () => {
  const caja = (x: number, confianza = 0.6) => ({ x, y: 0.2, ancho: 0.02, alto: 0.05, confianza });

  it("mantiene el número de la persona aunque la caja salte unos píxeles", () => {
    const s = crearSeguimiento();
    expect(seguir(s, [caja(0.3)], 0).map((p) => p.id)).toEqual([1]);
    const r = seguir(s, [caja(0.31)], 1_000);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 1, estimada: false, nueva: true });
  });

  it("una segunda persona lejos recibe el número 2", () => {
    const s = crearSeguimiento();
    seguir(s, [caja(0.3)], 0);
    expect(seguir(s, [caja(0.3), caja(0.8)], 1_000).map((p) => p.id)).toEqual([1, 2]);
  });

  it("sin verla queda «estimada» y a los 8 s se olvida; la numeración vuelve a 1", () => {
    const s = crearSeguimiento();
    seguir(s, [caja(0.3)], 0);
    expect(seguir(s, [], 3_000)[0]).toMatchObject({ id: 1, estimada: true });
    expect(seguir(s, [], 8_000)).toEqual([]);
    expect(seguir(s, [caja(0.7)], 9_000)[0].id).toBe(1);
  });

  it("deja de ser «nueva» a los 6 s", () => {
    const s = crearSeguimiento();
    seguir(s, [caja(0.3)], 0);
    expect(seguir(s, [caja(0.3)], 6_500)[0].nueva).toBe(false);
  });
});

describe("elegirRecortes (revisión 08-10)", () => {
  const o = { aspecto: 16 / 9, max: 4, zonas: [], quietaMaxMs: 45_000 };
  const mancha = (x: number) => ({ x, y: 0.5, ancho: 0.02, alto: 0.05 });
  const seguida = (x: number, movidaHaceMs = 0) => ({ ...mancha(x), movidaHaceMs });

  it("una mancha dentro de una zona ignorada no gasta recortes", () => {
    const zonas = [{ x: 0, y: 0, w: 0.3, h: 1 }];
    expect(elegirRecortes([mancha(0.1)], [], { ...o, zonas })).toEqual([]);
    expect(elegirRecortes([mancha(0.6)], [], { ...o, zonas })).toHaveLength(1);
  });

  it("con 4 personas seguidas queda un cupo para alguien nuevo", () => {
    const seguidas = [0.05, 0.3, 0.55, 0.8].map((x) => seguida(x));
    const r = elegirRecortes([{ x: 0.42, y: 0.05, ancho: 0.02, alto: 0.05 }], seguidas, o);
    expect(r).toHaveLength(4);
    expect(r.some((c) => c.y < 0.1)).toBe(true);
  });

  it("una seguida quieta hace más de 45 s deja de mirarse (un poste no queda seguido para siempre)", () => {
    expect(elegirRecortes([], [seguida(0.5, 46_000)], o)).toEqual([]);
    expect(elegirRecortes([], [seguida(0.5, 10_000)], o)).toHaveLength(1);
  });
});
