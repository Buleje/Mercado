/**
 * Marcadores de troza (ADR-480): reglas puras de `lib/camaras/marcadores.ts`.
 * La tabla del diccionario se comprueba contra OpenCV en
 * `node scripts/probar-marcadores.cjs --autoprueba` (acá sólo su forma).
 */
import { describe, expect, it } from "vitest";
import { ARUCO_4X4_250 } from "@/lib/camaras/aruco-4x4-250";
import {
  accionMarcadoresSchema,
  armarALaVista,
  celdasMarcador,
  confirmarMarcadores,
  enlaceConsumirDesdeCamara,
  fusionarPasada,
  idsDeParam,
  idsLibresMasBajos,
  MAX_PASADAS_DIA,
  pasadaSchema,
  queryALaVistaSchema,
  RANGO_TROZAS,
  svgMarcador,
  veredictoLectura,
  type EstadoDeTroza,
  type LecturaMarcador,
  type PasadaMarcadores,
} from "@/lib/camaras/marcadores";

const l = (id: number, at: number, ladoPx = 30): LecturaMarcador => ({ id, at, ladoPx, esquinas: [] });

describe("confirmarMarcadores", () => {
  it("≥3 cuadros en ≥2 s confirma; un cuadro suelto no cuenta", () => {
    const h = [l(7, 1000), l(7, 2000), l(7, 3100), l(9, 3000)];
    const r = confirmarMarcadores(h, 4000);
    expect(r.map((x) => x.id)).toEqual([7]);
    expect(r[0]).toMatchObject({ cuadros: 3, primera: 1000, ultima: 3100 });
  });
  it("3 cuadros en menos de 2 s todavía no", () => {
    expect(confirmarMarcadores([l(7, 1000), l(7, 1500), l(7, 2000)], 2500)).toEqual([]);
  });
  it("el mismo id dos veces en un cuadro cuenta como un cuadro", () => {
    expect(confirmarMarcadores([l(7, 1000), l(7, 1000), l(7, 3500)], 4000)).toEqual([]);
  });
  it("«Contar ahora»: 2 de 3 fotos sin tope de tiempo", () => {
    const r = confirmarMarcadores([l(4, 1000), l(4, 5000), l(5, 9000)], 9000, { cuadros: 2, ms: 0 });
    expect(r.map((x) => x.id)).toEqual([4]);
  });
  it("lo que quedó fuera de la ventana no suma", () => {
    expect(confirmarMarcadores([l(7, 0), l(7, 1000), l(7, 70_000)], 70_500)).toEqual([]);
  });
});

describe("rangos y esquemas", () => {
  it("asignar nunca da ids de chaleco ni de prueba", () => {
    const todo = Object.fromEntries(
      Array.from({ length: RANGO_TROZAS.hasta + 1 }, (_, i) => [String(i), { trozaId: `t${i}`, asignadoEn: "", por: "" }]),
    );
    expect(idsLibresMasBajos(todo, new Set(), 5)).toEqual([]);
    expect(idsLibresMasBajos(todo, new Set(["t3", "t1"]), 5)).toEqual([1, 3]);
    expect(idsLibresMasBajos({}, new Set(), 3)).toEqual([0, 1, 2]);
  });
  it("`m` con 200 ids pasa; con 201 o un id de 4 cifras no", () => {
    const m200 = Array.from({ length: 200 }, (_, i) => i).join(",");
    expect(queryALaVistaSchema.safeParse({ dia: "2026-10-08", m: m200 }).success).toBe(true);
    expect(queryALaVistaSchema.safeParse({ dia: "2026-10-08", m: `${m200},1` }).success).toBe(false);
    expect(queryALaVistaSchema.safeParse({ dia: "2026-10-08", m: "1000" }).success).toBe(false);
  });
  it("id 250 se rechaza; vincular sólo acepta ids de troza", () => {
    const base = { en: "2026-10-08T13:00:00.000Z", origen: "pasada", calidad: "hd" };
    expect(pasadaSchema.safeParse({ ...base, marcadores: [{ id: 249, cuadros: 3, ladoPx: 20 }] }).success).toBe(true);
    expect(pasadaSchema.safeParse({ ...base, marcadores: [{ id: 250, cuadros: 3, ladoPx: 20 }] }).success).toBe(false);
    expect(accionMarcadoresSchema.safeParse({ accion: "vincular", marcador: 200, trozaId: "x" }).success).toBe(false);
    expect(accionMarcadoresSchema.safeParse({ accion: "vincular", marcador: 199, trozaId: "x" }).success).toBe(true);
  });
  it("idsDeParam descarta lo que no es un id y no repite", () => {
    expect(idsDeParam("3,7,7,abc,300,12")).toEqual([3, 7, 12]);
    expect(idsDeParam(null)).toEqual([]);
  });
});

describe("dibujo", () => {
  it("la tabla tiene 250 códigos distintos de 16 bits", () => {
    expect(ARUCO_4X4_250).toHaveLength(250);
    expect(new Set(ARUCO_4X4_250).size).toBe(250);
    expect(ARUCO_4X4_250.every((n) => n >= 0 && n < 65536)).toBe(true);
  });
  it("6×6 celdas con el borde negro; 1 = blanca en la tabla", () => {
    const c = celdasMarcador(0);
    expect(c).toHaveLength(6);
    expect(c[0]!.every(Boolean) && c[5]!.every(Boolean) && c.every((f) => f[0] && f[5])).toBe(true);
    /* id 0 = 46386 = 1011 0101 0011 0010: la primera celda de adentro es blanca, la segunda negra. */
    expect(c[1]![1]).toBe(false);
    expect(c[1]![2]).toBe(true);
    expect(() => celdasMarcador(250)).toThrow();
  });
  it("el SVG va en negro puro, sin grises", () => {
    const s = svgMarcador(37);
    expect(s).toContain('fill="black"');
    expect(s).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
  it("px por celda: ≥4 holgado, 3 justo, menos no alcanza", () => {
    expect(veredictoLectura(24)).toBe("holgado");
    expect(veredictoLectura(19)).toBe("justo");
    expect(veredictoLectura(17)).toBe("corto");
  });
});

describe("día y lista", () => {
  const pasada = (en: string, ids: number[], camaraId = "c1"): PasadaMarcadores => ({
    en,
    camaraId,
    origen: "pasada",
    calidad: "hd",
    ids,
  });
  it("fusionarPasada suma pasadas por id y recorta a 48", () => {
    let d = fusionarPasada(null, "2026-10-08", pasada("2026-10-08T13:00:00.000Z", [3, 7]));
    d = fusionarPasada(d, "2026-10-08", pasada("2026-10-08T14:00:00.000Z", [7], "c2"));
    expect(d.ids["7"]).toEqual({
      primera: "2026-10-08T13:00:00.000Z",
      ultima: "2026-10-08T14:00:00.000Z",
      camaras: ["c1", "c2"],
      pasadas: 2,
    });
    for (let i = 0; i < 60; i++) d = fusionarPasada(d, "2026-10-08", pasada(`2026-10-08T15:${String(i).padStart(2, "0")}:00.000Z`, [1]));
    expect(d.pasadas).toHaveLength(MAX_PASADAS_DIA);
  });
  it("otro día empieza de cero", () => {
    const d = fusionarPasada(
      { dia: "2026-10-07", pasadas: [], ids: { "3": { primera: "x", ultima: "x", camaras: [], pasadas: 9 } } },
      "2026-10-08",
      pasada("2026-10-08T13:00:00.000Z", [5]),
    );
    expect(Object.keys(d.ids)).toEqual(["5"]);
  });
  it("armarALaVista: libre, salió, sin asignar; fuera los de prueba; m3 sólo de las libres", () => {
    const d = fusionarPasada(null, "2026-10-08", pasada("2026-10-08T13:00:00.000Z", [3, 7, 9, 246]));
    const asignaciones = {
      "3": { trozaId: "t3", asignadoEn: "", por: "" },
      "7": { trozaId: "t7", asignadoEn: "", por: "" },
    };
    const estados = new Map<string, EstadoDeTroza>([
      ["t3", { troza: { id: "t3", codigo: "12A-0001", especie: "Tornillo", volumenM3: 0.5, loteCode: null }, estado: "libre", motivo: null }],
    ]);
    const r = armarALaVista(d, "2026-10-08", asignaciones, estados);
    expect(r.trozas.map((t) => [t.marcador, t.estado])).toEqual([
      [3, "libre"],
      [7, "salio"],
      [9, "sin_asignar"],
    ]);
    expect(r.resumen).toEqual({ vistas: 3, libres: 1, m3Libres: 0.5 });
    expect(armarALaVista(d, "2026-10-08", asignaciones, estados, { m: [7] }).trozas.map((t) => t.marcador)).toEqual([7]);
  });
  it("armarALaVista: un id reusado después de la última vez que se vio no hereda lo visto", () => {
    let d = fusionarPasada(null, "2026-10-08", pasada("2026-10-08T13:00:00.000Z", [5, 6]));
    d = fusionarPasada(d, "2026-10-08", pasada("2026-10-08T21:00:00.000Z", [6]));
    const asignaciones = {
      "5": { trozaId: "tB", asignadoEn: "2026-10-08T19:00:00.000Z", por: "" },
      "6": { trozaId: "tC", asignadoEn: "2026-10-08T19:00:00.000Z", por: "" },
    };
    const troza = (id: string) => ({ id, codigo: id, especie: "Tornillo", volumenM3: 1, loteCode: null });
    const estados = new Map<string, EstadoDeTroza>([
      ["tB", { troza: troza("tB"), estado: "libre", motivo: null }],
      ["tC", { troza: troza("tC"), estado: "libre", motivo: null }],
    ]);
    const r = armarALaVista(d, "2026-10-08", asignaciones, estados);
    /* El 5 sólo se vio a las 13:00 (era la troza anterior); el 6 se volvió a ver a las 21:00, ya con tC. */
    expect(r.trozas.map((t) => [t.marcador, t.estado, t.troza?.id ?? null])).toEqual([
      [5, "sin_asignar", null],
      [6, "libre", "tC"],
    ]);
    expect(r.trozas[0]!.motivo).toMatch(/reasign/);
    expect(r.resumen).toEqual({ vistas: 2, libres: 1, m3Libres: 1 });
    /* Mirando sólo la pasada de las 13:00, el 6 tampoco era tC todavía. */
    const enLa13 = armarALaVista(d, "2026-10-08", asignaciones, estados, { pasada: "2026-10-08T13:00:00.000Z" });
    expect(enLa13.trozas.map((t) => [t.marcador, t.estado])).toEqual([
      [5, "sin_asignar"],
      [6, "sin_asignar"],
    ]);
    expect(enLa13.resumen.libres).toBe(0);
  });
  it("el enlace de Consumir lleva día y marcadores ordenados", () => {
    expect(enlaceConsumirDesdeCamara("2026-10-08", [12, 3, 3])).toBe(
      "/admin?tab=ctp-libro-operaciones&vista=consumos&desdeCamara=2026-10-08&m=3%2C12",
    );
  });
});
