/**
 * «Tocar la troza que no ve» (F4, 16-10): desde el toque, el círculo de la
 * MADERA (la corteza se suma después) aunque la testa tenga barro en el borde,
 * media cara en sombra dura, un 30 % tapado por otra o poco contraste. Y nada
 * donde no hay una testa. Imagen sintética de 400×300 a 3 mm por px: madera de
 * radio 60 px (Ø 36 cm) y corteza hasta 70.
 */
import { describe, expect, it } from "vitest";
import { circuloDelToque, rayosDesdeElToque } from "@/components/admin/forestal/camaras/segmentar-toque";
import { radiosBuscados } from "@/lib/forestal/testas-medicion";

const [W, H, MM_POR_PX] = [400, 300, 3];
const [CX, CY, R_MADERA, R_CORTEZA] = [200, 150, 60, 70];

interface Opciones {
  barro?: boolean;
  sombra?: boolean;
  tapada?: boolean;
  contraste?: boolean;
  sinTroza?: boolean;
}

/** El gris de una testa en (x, y) o `null` si está fuera de ella. */
function testa(x: number, y: number, cx: number, cy: number, madera: number, corteza: number): number | null {
  const d = Math.hypot(x - cx, y - cy);
  if (d <= R_MADERA) return madera + 4 * Math.sin(d / 5);
  return d <= R_CORTEZA ? corteza : null;
}

function escena(o: Opciones = {}) {
  const data = new Uint8Array(W * H);
  let semilla = 7;
  const ruido = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 6;
  const [fondo, madera, corteza] = o.contraste ? [50, 70, 58] : [45, 125, 75];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let g: number = fondo;
      if (!o.sinTroza) g = testa(x, y, CX, CY, madera, corteza) ?? g;
      /* El barro cruza el borde de la derecha; otra mancha adentro. */
      if (o.barro && (Math.hypot(x - 258, y - 150) < 16 || Math.hypot(x - 180, y - 165) < 12)) g = 70;
      /* La que tapa va encima: cubre ~30 % de la tocada por abajo. */
      if (o.tapada) g = testa(x, y, CX, CY + 108, 130, 72) ?? g;
      if (o.sombra && x > CX + 5) g *= 0.42;
      data[y * W + x] = Math.max(0, Math.min(255, Math.round(g + ruido())));
    }
  return { data: suavizar(data), cols: W, rows: H };
}

/** Como la `suave` del worker (gaussiana 5×5): dos pasadas de caja 3×3. */
function suavizar(d: Uint8Array): Uint8Array {
  let a = d;
  for (let pasada = 0; pasada < 2; pasada++) {
    const b = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let [s, n] = [0, 0];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const [xx, yy] = [x + dx, y + dy];
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) [s, n] = [s + a[yy * W + xx]!, n + 1];
          }
        b[y * W + x] = Math.round(s / n);
      }
    a = b;
  }
  return a;
}

/** Lo mismo que `testaEn` antes de ajustar la elipse: rayos desde el toque y el círculo con más puntaje. */
function circuloDesde(img: ReturnType<typeof escena>, x: number, y: number) {
  const rb = radiosBuscados(MM_POR_PX);
  const rMin = 0.8 * rb.min;
  const rMax = 1.2 * rb.max;
  return circuloDelToque(rayosDesdeElToque(img, x, y, 0.15 * rMin, 1.8 * rMax), x, y, rMin, rMax);
}

describe("segmentar desde el toque", () => {
  const casos: [string, Opciones, [number, number]][] = [
    ["limpia, tocada fuera del centro", {}, [212, 140]],
    ["con barro en el borde", { barro: true }, [205, 145]],
    ["con media cara en sombra dura", { sombra: true }, [195, 150]],
    ["con poco contraste", { contraste: true }, [190, 155]],
  ];
  it.each(casos)("%s: el borde de la madera, no el de la corteza", (_, o, [x, y]) => {
    const h = circuloDesde(escena(o), x, y);
    expect(h).not.toBeNull();
    expect(Math.hypot(h!.c.x - CX, h!.c.y - CY)).toBeLessThan(4);
    expect(Math.abs(h!.c.r - R_MADERA)).toBeLessThan(4);
    expect(h!.apoyo).toBeGreaterThan(0.2 * 144);
  });

  it("tapada un 30 % por otra: el círculo sigue por debajo de la que tapa", () => {
    const h = circuloDesde(escena({ tapada: true }), CX, CY - 15);
    expect(h).not.toBeNull();
    expect(Math.hypot(h!.c.x - CX, h!.c.y - CY)).toBeLessThan(6);
    expect(Math.abs(h!.c.r - R_MADERA)).toBeLessThan(6);
  });

  it("donde no hay una testa no inventa una", () => {
    const h = circuloDesde(escena({ sinTroza: true }), CX, CY);
    expect(h == null || h.apoyo < 0.2 * 144).toBe(true);
  });

  it("el rayo se corta antes de la orilla de la foto: afuera no hay un escalón", () => {
    const rayos = rayosDesdeElToque(escena({ sinTroza: true }), 20, 150, 2, 400);
    const izquierda = rayos.find((r) => r.co < -0.999)!;
    expect(izquierda.ts.every((t) => t < 20)).toBe(true);
  });
});
