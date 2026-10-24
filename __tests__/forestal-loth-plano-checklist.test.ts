import { describe, expect, it } from "vitest";
import { evaluarPlano, verticesFueraDelPredio } from "@/lib/forestal/loth-plano-checklist";
import { emptyCartografia, type LothCartografia } from "@/lib/forestal/loth-cartografia";
import { emptyParcela, type LatLng, type LothParcela } from "@/lib/forestal/loth-geo";

/**
 * Los requisitos del plano del expediente, como chequeo y no como papelito al
 * lado del monitor. Lo que se prueba es que cada faltante se NOMBRE: un
 * checklist que dice "incompleto" sin decir qué falta no ahorra la vuelta a
 * mesa de partes.
 */

/** Un cuadrado de ~1 km de lado cerca de Pucallpa. */
const cuadrado = (lat: number, lng: number, d: number): LatLng[] => [
  [lat, lng],
  [lat, lng + d],
  [lat - d, lng + d],
  [lat - d, lng],
];

const parcelaCon = (vertices: LatLng[]): LothParcela => ({ ...emptyParcela(), vertices });

const cartoCon = (over: Partial<LothCartografia["predio"]> = {}, resto: Partial<LothCartografia> = {}): LothCartografia => ({
  ...emptyCartografia(),
  ...resto,
  predio: { ...emptyCartografia().predio, ...over },
});

const UBIC = { distrito: "Callería", provincia: "Coronel Portillo", departamento: "Ucayali" };

const req = (c: ReturnType<typeof evaluarPlano>, id: string) => c.requisitos.find((r) => r.id === id)!;

describe("evaluarPlano — el plano vacío nombra todo lo que falta", () => {
  it("con el libro en blanco, ningún requisito accionable se da por cumplido", () => {
    const c = evaluarPlano({ parcela: emptyParcela(), cartografia: emptyCartografia(), ubicacion: null, zonaUtm: null });
    expect(req(c, "predio").cumple).toBe(false);
    expect(req(c, "area").cumple).toBe(false);
    expect(req(c, "accesos").cumple).toBe(false);
    expect(req(c, "ubicacion").cumple).toBe(false);
    expect(c.listo).toBe(false);
  });

  it("norte, escala y datum los garantiza el módulo: se listan como no accionables", () => {
    const c = evaluarPlano({ parcela: emptyParcela(), cartografia: emptyCartografia(), ubicacion: null, zonaUtm: null });
    for (const id of ["norte", "escala", "datum"]) {
      expect(req(c, id).cumple).toBe(true);
      expect(req(c, id).accionable).toBe(false);
    }
    // Y por eso no ensucian la lista de pendientes.
    expect(c.pendientes.map((r) => r.id)).not.toContain("norte");
  });

  it("dice QUÉ dato de ubicación falta, no sólo que está incompleta", () => {
    const c = evaluarPlano({
      parcela: emptyParcela(),
      cartografia: cartoCon({ nombre: "Fundo San Miguel" }),
      ubicacion: UBIC,
      zonaUtm: null,
    });
    expect(req(c, "ubicacion").detalle).toContain("sector");
    expect(req(c, "ubicacion").detalle).toContain("comunidad");
    expect(req(c, "ubicacion").detalle).not.toContain("distrito");
  });
});

describe("evaluarPlano — predio y área", () => {
  const area = cuadrado(-8.38, -74.53, 0.005);
  const predio = cuadrado(-8.375, -74.535, 0.02); // envuelve al área

  it("un plano completo queda listo", () => {
    const c = evaluarPlano({
      parcela: parcelaCon(area),
      cartografia: cartoCon(
        { nombre: "Fundo San Miguel", sector: "Km 12", comunidad: "C.N. Unión Siria", vertices: predio },
        { accesos: [{ id: "a1", lugar: "Pucallpa — Km 12", tiempo: "40 min", movilidad: "auto-camioneta" }] },
      ),
      ubicacion: UBIC,
      zonaUtm: "18L",
    });
    expect(c.pendientes).toEqual([]);
    expect(c.listo).toBe(true);
    expect(c.cumplidos).toBe(c.total);
  });

  it("sin predio, la contención no se puede verificar y lo dice", () => {
    const c = evaluarPlano({ parcela: parcelaCon(area), cartografia: emptyCartografia(), ubicacion: UBIC, zonaUtm: "18L" });
    expect(req(c, "contenido").cumple).toBe(false);
    expect(req(c, "contenido").detalle).toMatch(/no se puede verificar/i);
  });

  it("un área que se sale del predio se cuenta por vértices", () => {
    const afuera = cuadrado(-8.30, -74.60, 0.005); // lejos del predio
    const c = evaluarPlano({
      parcela: parcelaCon(afuera),
      cartografia: cartoCon({ vertices: predio }),
      ubicacion: UBIC,
      zonaUtm: "18L",
    });
    expect(req(c, "contenido").cumple).toBe(false);
    expect(req(c, "contenido").detalle).toContain("4 vértice(s)");
  });

  it("la superficie nombra las dos áreas cuando hay predio", () => {
    const c = evaluarPlano({
      parcela: parcelaCon(area),
      cartografia: cartoCon({ vertices: predio }),
      ubicacion: UBIC,
      zonaUtm: "18L",
    });
    expect(req(c, "superficie").detalle).toMatch(/Área .* ha · predio .* ha/);
  });

  it("con área pero sin predio, la superficie avisa que falta la del predio", () => {
    const c = evaluarPlano({ parcela: parcelaCon(area), cartografia: emptyCartografia(), ubicacion: UBIC, zonaUtm: "18L" });
    expect(req(c, "superficie").detalle).toMatch(/falta la del predio/i);
  });
});

describe("verticesFueraDelPredio", () => {
  const predio = cuadrado(-8.375, -74.535, 0.02);

  it("sin predio no acusa a nadie: cero fuera", () => {
    expect(verticesFueraDelPredio(cuadrado(-8.38, -74.53, 0.005), [])).toBe(0);
  });

  it("cuenta sólo los vértices que caen afuera", () => {
    // Un vértice adentro y otro claramente lejos.
    const mixto: LatLng[] = [
      [-8.38, -74.53],
      [-8.0, -74.0],
    ];
    expect(verticesFueraDelPredio(mixto, predio)).toBe(1);
  });
});
