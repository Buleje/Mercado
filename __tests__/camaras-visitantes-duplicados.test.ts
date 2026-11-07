/**
 * Visitantes repetidos (Brandon 10-10: «está repitiendo los visitantes»).
 * Casos sacados de las fotos REALES del detector de Blas del 10-10 (cajas y
 * firmas tal cual quedaron guardadas; ids y cámaras anonimizados). A ojo:
 *   - 07:57:28 y 07:57:39, Entrada: 3 personas (camisa blanca, polo oscuro,
 *     camisa celeste). Antes salían 8 visitantes: 3 cajas repetidas (la misma
 *     persona detectada dos veces, una caja dentro de la otra) y el polo
 *     oscuro partido en dos por la etiqueta «63 %» pintada sobre su ropa.
 *   - 09:53, Patio: el operario de la máquina (3 fotos) y el de camisa blanca
 *     parado a la derecha. El que pasa cargando madera al lado NO es él.
 */
import { describe, expect, it } from "vitest";
import type { CajaGuardada } from "@/lib/camaras/apariencia";
import {
  agruparPersonasDelDia,
  contencion,
  separacionCajas,
  type FotoConCajas,
} from "@/lib/camaras/visitantes";

type Fila = [x: number, y: number, ancho: number, alto: number, confianza: number, firma: string];
const cajas = (filas: Fila[]): CajaGuardada[] =>
  filas.map(([x, y, ancho, alto, confianza, firma]) => ({ x, y, ancho, alto, confianza, firma, chaleco: false }));
const foto = (docId: string, at: string, camara: "entrada" | "patio", filas: Fila[]): FotoConCajas => ({
  docId,
  at,
  camaraId: `cam-${camara}`,
  camaraNombre: camara === "entrada" ? "Entrada" : "Patio de trozas",
  cajas: cajas(filas),
});

const ENTRADA_0757: FotoConCajas[] = [
  foto("e1", "2026-10-10T12:57:28.047Z", "entrada", [
    [0.8673, 0.4186, 0.0759, 0.2774, 0.8, "23004f000134020004309f00"], // celeste
    [0.8211, 0.3407, 0.0436, 0.1949, 0.71, "0000000026f1ef00000017dd"], // polo oscuro
    [0.744, 0.291, 0.0494, 0.1324, 0.69, "14000000001f5f0000001369"], // camisa blanca
    [0.7409, 0.3107, 0.0217, 0.1134, 0.53, "22000000011f13000000022f"], // camisa blanca, repetida
  ]),
  foto("e2", "2026-10-10T12:57:39.163Z", "entrada", [
    [0.5721, 0.27, 0.0435, 0.1725, 0.7, "00000000000fbf000000018f"], // camisa blanca (caminó)
    [0.7771, 0.3994, 0.0634, 0.2568, 0.68, "5f0002003765670011007fba"], // polo oscuro
    [0.6923, 0.4611, 0.0592, 0.2961, 0.64, "01000000112ffe000001bf7d"], // celeste
    [0.803, 0.4013, 0.0333, 0.1324, 0.63, "3400151015fa73001301afb3"], // polo oscuro, repetida
    [0.6974, 0.4333, 0.0512, 0.1348, 0.62, "4c001810223f01000000002f"], // celeste, repetida
  ]),
];

const PATIO_0953: FotoConCajas[] = [
  foto("p1", "2026-10-10T14:53:09.757Z", "patio", [
    [0.9247, 0.3399, 0.0426, 0.1449, 0.55, "10005f2001330200170001ff"], // camisa blanca, parado
    [0.66, 0.2448, 0.0285, 0.1057, 0.53, "01000f301221260019209fcd"], // operario
  ]),
  foto("p2", "2026-10-10T14:53:30.160Z", "patio", [
    [0.8725, 0.4145, 0.0669, 0.2494, 0.67, "210004116f9502007f1017ad"], // pasa cargando madera
    [0.9267, 0.328, 0.0374, 0.0729, 0.64, "00005f41024313006f200121"],
    [0.6587, 0.2436, 0.0239, 0.1036, 0.63, "00002f10000115102f003674"], // operario
  ]),
  foto("p3", "2026-10-10T14:53:42.248Z", "patio", [
    [0.9519, 0.332, 0.0373, 0.101, 0.7, "00004f00002f02004f000006"], // camisa blanca
    [0.5614, 0.5033, 0.0695, 0.3483, 0.66, "00003f00045101006f0007c2"],
    [0.8406, 0.3035, 0.0349, 0.1315, 0.62, "00006d105c8f02002f100252"],
    [0.6552, 0.2463, 0.0274, 0.1166, 0.59, "03002f0001101a1028015af5"], // operario
    [0.6766, 0.272, 0.019, 0.061, 0.54, "1f003300026e1f2000000440"],
  ]),
];

const grupoCon = (r: ReturnType<typeof agruparPersonasDelDia>, docId: string, caja: number) =>
  r.grupos.find((g) => g.fotos.some((f) => f.docId === docId && f.caja === caja));

describe("visitantes repetidos con las fotos reales de Blas (10-10)", () => {
  it("Entrada 07:57: de 8 visitantes a 4 (3 personas reales; la celeste se ve muy distinta de frente y de costado)", () => {
    const r = agruparPersonasDelDia("2026-10-10", ENTRADA_0757);
    expect(r.visitantes).toBe(4);
    expect(r.repetidasEnFoto).toBe(3);
    // Camisa blanca: la misma en las dos fotos (por la ropa).
    expect(grupoCon(r, "e1", 2)).toBe(grupoCon(r, "e2", 0));
    // Polo oscuro: la misma (seguimiento: misma cámara, 11 s, casi el mismo lugar).
    expect(grupoCon(r, "e1", 1)).toBe(grupoCon(r, "e2", 1));
    // La caja repetida no es una persona aparte ni una foto de más.
    expect(grupoCon(r, "e2", 3)).toBeUndefined();
    expect(grupoCon(r, "e2", 1)?.fotos.map((f) => f.docId)).toEqual(["e1", "e2"]);
  });

  it("dos personas en el mismo cuadro siguen separadas", () => {
    const r = agruparPersonasDelDia("2026-10-10", [ENTRADA_0757[0]]);
    expect(r.visitantes).toBe(3);
    expect(new Set([0, 1, 2].map((i) => grupoCon(r, "e1", i)?.clave)).size).toBe(3);
  });

  it("Patio 09:53: el operario queda uno solo y el que pasa cargando madera no se pega al de camisa blanca", () => {
    const r = agruparPersonasDelDia("2026-10-10", PATIO_0953);
    const operario = grupoCon(r, "p1", 1);
    expect(operario?.fotos.map((f) => f.docId)).toEqual(["p1", "p2", "p3"]);
    expect(grupoCon(r, "p1", 0)).toBe(grupoCon(r, "p3", 0));
    expect(grupoCon(r, "p2", 0)).not.toBe(grupoCon(r, "p1", 0));
  });

  it("las 5 fotos de las dos cámaras: antes 15 visitantes, ahora 10 (a ojo, 6-7 personas)", () => {
    const r = agruparPersonasDelDia("2026-10-10", [...ENTRADA_0757, ...PATIO_0953]);
    expect(r.visitantes).toBe(10);
  });

  it("medidas: la caja repetida está ≥ 60 % dentro; el de la madera es otro tamaño", () => {
    const [celeste, , , ] = ENTRADA_0757[1].cajas!.slice(2);
    expect(contencion(celeste, ENTRADA_0757[1].cajas![4])).toBeGreaterThanOrEqual(0.6);
    expect(separacionCajas(PATIO_0953[0].cajas![0], PATIO_0953[1].cajas![0])).toBe(Infinity);
  });
});
