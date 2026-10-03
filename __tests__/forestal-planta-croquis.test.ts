import { describe, expect, it } from "vitest";
import {
  aplicarAsignaciones,
  areaPlanaM2,
  centroidePlano,
  coincide,
  contenidoPorZona,
  fmtFechaEvento,
  FILTROS_VACIOS,
  flujoAplica,
  opcionesDeFiltro,
  ordenarEventos,
  perimetroPlanoM,
  posicionMaquina,
  puntaDeFlecha,
  resumirZonaCroquis,
  soltarMaquina,
  zonaCoincide,
  SIN_DUENO,
  type Punto,
} from "@/lib/forestal/planta-croquis";
import { claveTroza, type Item, type MaquinaPlanta, type UbicacionPlanta } from "@/lib/forestal/planta-zona-types";

const pila = (over: Partial<Item> = {}): Item => ({
  id: "g1", kind: "troza", label: "GTF 001", sub: "Shihuahuaco", especie: "Shihuahuaco",
  cantidad: 6, unidad: "m³", cites: false, pt: 2400, piezas: 3, dueno: "Juan Pérez", permiso: "PF-01",
  trozas: [
    { id: "t1", codigo: "A-1", m3: 2, pt: 800 },
    { id: "t2", codigo: "A-2", m3: 2, pt: 800 },
    { id: "t3", codigo: null, m3: 2, pt: 800 },
  ],
  ...over,
});

const CROQUIS = { anchoM: 54, altoM: 48 };

describe("geometría plana", () => {
  const rect: Punto[] = [[0, 0], [0, 10], [5, 10], [5, 0]];
  it("área del rectángulo 10×5 = 50 m², sin importar el sentido", () => {
    expect(areaPlanaM2(rect)).toBe(50);
    expect(areaPlanaM2([...rect].reverse())).toBe(50);
    expect(areaPlanaM2(rect.slice(0, 2))).toBe(0);
  });
  it("perímetro cerrado y abierto", () => {
    expect(perimetroPlanoM(rect)).toBe(30);
    expect(perimetroPlanoM(rect, false)).toBe(25);
  });
  it("centroide pesado por área: una L de 36 m² lo tiene en (3.22, 3.22), no en el promedio (4, 4)", () => {
    const L: Punto[] = [[0, 0], [0, 10], [2, 10], [2, 2], [10, 2], [10, 0]];
    const [y, x] = centroidePlano(L);
    expect(y).toBeCloseTo(116 / 36, 6);
    expect(x).toBeCloseTo(116 / 36, 6);
  });
});

describe("ubicación efectiva: la troza separada manda sobre su pila", () => {
  const zonas = new Set(["z1", "z2"]);
  it("la pila ubicada lleva todo; separar una troza la resta de la pila y la suma en la otra zona", () => {
    const ubic: Record<string, UbicacionPlanta> = { g1: { zonaId: "z1" }, [claveTroza("t2")]: { zonaId: "z2", lat: 3, lng: 4 } };
    const c = contenidoPorZona([pila()], ubic, zonas);
    expect(c.z1.pilas[0].medida).toEqual({ pt: 1600, m3: 4, piezas: 2 });
    expect(c.z1.pilas[0].trozas.map((t) => t.id)).toEqual(["t1", "t3"]);
    expect(c.z2.sueltas).toHaveLength(1);
    expect(c.z2.sueltas[0].pos).toEqual([3, 4]);
    expect(resumirZonaCroquis(c.z2)).toMatchObject({ pt: 800, m3: 2, piezas: 1, sueltas: 1, pilas: 0 });
  });
  it("una troza separada aparece aunque su pila no esté ubicada", () => {
    const c = contenidoPorZona([pila()], { [claveTroza("t1")]: { zonaId: "z2" } }, zonas);
    expect(c.z1).toBeUndefined();
    expect(c.z2.sueltas[0].troza.id).toBe("t1");
  });
  it("volver a la pila = quitar su ubicación propia", () => {
    const ubic = aplicarAsignaciones({ g1: { zonaId: "z1" }, [claveTroza("t1")]: { zonaId: "z2" } }, [{ clave: claveTroza("t1"), zonaId: null }]);
    const c = contenidoPorZona([pila()], ubic, zonas);
    expect(c.z1.pilas[0].medida.piezas).toBe(3);
    expect(c.z2).toBeUndefined();
  });
  it("con todas sus trozas separadas la pila queda vacía y no suma", () => {
    const ubic: Record<string, UbicacionPlanta> = { g1: { zonaId: "z1" } };
    for (const t of ["t1", "t2", "t3"]) ubic[claveTroza(t)] = { zonaId: "z2" };
    const c = contenidoPorZona([pila()], ubic, zonas);
    expect(c.z1.pilas[0].vacia).toBe(true);
    expect(resumirZonaCroquis(c.z1)).toMatchObject({ pt: 0, pilas: 0 });
    expect(resumirZonaCroquis(c.z2)).toMatchObject({ pt: 2400, m3: 6, piezas: 3 });
  });
  it("las zonas de otro plano no se cuentan", () => {
    const c = contenidoPorZona([pila()], { g1: { zonaId: "satelite-1" } }, zonas);
    expect(Object.keys(c)).toEqual([]);
  });
});

describe("resumen de zona: PT primero, desgloses por especie, permiso y dueño", () => {
  it("suma PT/m³/piezas y cuenta las líneas sin PT", () => {
    const aserrada: Item = { id: "c1", kind: "producto", label: "C-1", sub: "Tablas", especie: "Tornillo", cantidad: 500, unidad: "pt", cites: false, dueno: null, permiso: "PF-01" };
    const sinPt = pila({ id: "g2", pt: null, trozas: [], piezas: 4, especie: "Tornillo", dueno: null });
    const c = contenidoPorZona([pila(), aserrada, sinPt], { g1: { zonaId: "z" }, c1: { zonaId: "z" }, g2: { zonaId: "z" } }, new Set(["z"]));
    const r = resumirZonaCroquis(c.z);
    expect(r.pt).toBe(2900);
    expect(r.m3).toBe(12);
    expect(r.sinPt).toBe(1);
    expect(r.porEspecie[0]).toMatchObject({ clave: "Shihuahuaco", pt: 2400 });
    expect(r.porPermiso[0]).toMatchObject({ clave: "PF-01", lineas: 3 });
    expect(r.porDueno.at(-1)?.clave).toBe(SIN_DUENO);
  });
});

describe("filtros", () => {
  const items = [pila(), pila({ id: "g2", especie: "Tornillo", dueno: null, permiso: null }), { ...pila({ id: "c1" }), kind: "producto" as const }];
  it("estado, especie, permiso y dueño", () => {
    expect(coincide(items[0], FILTROS_VACIOS)).toBe(true);
    expect(coincide(items[0], { ...FILTROS_VACIOS, estado: "aserrada" })).toBe(false);
    expect(coincide(items[2], { ...FILTROS_VACIOS, estado: "aserrada" })).toBe(true);
    expect(coincide(items[1], { ...FILTROS_VACIOS, dueno: SIN_DUENO })).toBe(true);
    expect(coincide(items[0], { ...FILTROS_VACIOS, especie: "Tornillo" })).toBe(false);
  });
  it("la zona coincide si algo adentro coincide (incluida una troza suelta)", () => {
    const c = contenidoPorZona([pila()], { [claveTroza("t1")]: { zonaId: "z" } }, new Set(["z"]));
    expect(zonaCoincide(c.z, { ...FILTROS_VACIOS, especie: "Shihuahuaco" })).toBe(true);
    expect(zonaCoincide(c.z, { ...FILTROS_VACIOS, especie: "Tornillo" })).toBe(false);
    expect(zonaCoincide(undefined, FILTROS_VACIOS)).toBe(true);
  });
  it("opciones: solo lo que existe, con «sin dato» al final", () => {
    const o = opcionesDeFiltro(items);
    expect(o.especies).toEqual(["Shihuahuaco", "Tornillo"]);
    expect(o.duenos.at(-1)).toBe(SIN_DUENO);
  });
});

describe("máquinas", () => {
  const d1: MaquinaPlanta = { codigo: "D1", nombre: "Cargador frontal", x: 20, y: 30, fuera: false };
  it("soltarla dentro la pone en la planta (a 10 cm); afuera la marca fuera sin perder su punto", () => {
    expect(soltarMaquina({ ...d1, fuera: true }, [10.04, 12.36], CROQUIS)).toEqual({ ...d1, y: 10, x: 12.4, fuera: false });
    expect(soltarMaquina(d1, [10, 60], CROQUIS)).toEqual({ ...d1, fuera: true });
  });
  it("las de afuera se dibujan en la franja derecha, una debajo de otra", () => {
    expect(posicionMaquina(d1, 0, CROQUIS)).toEqual([30, 20]);
    const [y0, x0] = posicionMaquina({ ...d1, fuera: true }, 0, CROQUIS);
    const [y1] = posicionMaquina({ ...d1, fuera: true }, 1, CROQUIS);
    expect(x0).toBeGreaterThan(54);
    expect(y1).toBeLessThan(y0);
  });
});

describe("flujo y fechas", () => {
  it("el dibujo del flujo solo aplica al plano de 54×48", () => {
    expect(flujoAplica(CROQUIS)).toBe(true);
    expect(flujoAplica({ anchoM: 80, altoM: 40 })).toBe(false);
    expect(flujoAplica(null)).toBe(false);
  });
  it("la punta de la flecha nace en el destino", () => {
    const [p] = puntaDeFlecha([0, 0], [0, 10]);
    expect(p).toEqual([0, 10]);
  });
  it("fecha date-only en UTC: 2026-09-10 es jueves aunque Lima esté en UTC−5", () => {
    expect(fmtFechaEvento("2026-09-10T00:00:00.000Z", 2026)).toBe("jueves 10/09");
    expect(fmtFechaEvento("2025-12-31T00:00:00.000Z", 2026)).toBe("miércoles 31/12/2025");
    expect(fmtFechaEvento("no-es-fecha")).toBe("—");
  });
  it("eventos de la más vieja a la más nueva", () => {
    const evs = ordenarEventos([
      { tipo: "consumo", fecha: "2026-09-12", ref: null, detalle: null },
      { tipo: "recepcion", fecha: "2026-09-01", ref: "GTF 1", detalle: null },
    ]);
    expect(evs.map((e) => e.tipo)).toEqual(["recepcion", "consumo"]);
  });
});

describe("código corto de la pastilla", () => {
  it("deja el final, que es lo que distingue a la troza", async () => {
    const { codigoCorto } = await import("@/lib/forestal/planta-croquis");
    expect(codigoCorto("A-12")).toBe("A-12");
    expect(codigoCorto("QA-SEM-003/1")).toBe("…003/1");
  });
});
