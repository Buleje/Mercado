/**
 * ADR-530 — comparar un respaldo del Libro CTP con hoy (lógica pura, sin base).
 */
import { describe, expect, it } from "vitest";
import { analizar, totalesDe } from "@/lib/forestal/ctp-respaldo-diff";
import { TABLAS_RESPALDO } from "@/lib/forestal/ctp-respaldo-tipos";
import type { TablasSerial } from "@/lib/forestal/ctp-respaldo-serial";
import { T, consumo, copia, corrida, ingreso, loteAserrio, sinCierres, troza } from "./ctp-respaldo-fixtures";

const grupo = (a: ReturnType<typeof analizar>, clave: string) => {
  const g = a.grupos.find((x) => x.clave === clave);
  if (!g) throw new Error(`no hay grupo ${clave}: ${a.grupos.map((x) => x.clave).join(", ")}`);
  return g;
};

describe("diff por tabla", () => {
  const respaldo: TablasSerial = {
    WoodEntry: [ingreso("w-borrada"), ingreso("w-baja"), ingreso("w-cambia"), ingreso("w-igual")],
  };
  const hoy: TablasSerial = {
    WoodEntry: [
      ingreso("w-baja", { deletedAt: T("2026-11-01") }),
      ingreso("w-cambia", { gtfNumber: "OTRA" }),
      /* Solo cambió `updatedAt`: no cuenta como cambio. */
      ingreso("w-igual", { updatedAt: T("2026-11-02") }),
      ingreso("w-nueva"),
    ],
  };
  const a = analizar(respaldo, hoy, sinCierres);

  it("separa borradas, de baja, cambiadas y nuevas (sin mirar updatedAt)", () => {
    expect(a.diff.WoodEntry).toEqual({ borradas: ["w-borrada"], deBaja: ["w-baja"], cambiadas: ["w-cambia"], nuevas: ["w-nueva"] });
    expect(totalesDe(a.diff)).toEqual({ borrada: 1, de_baja: 1, cambiada: 1, nueva: 1 });
  });

  it("solo lo borrado y lo dado de baja se puede recuperar; lo cambiado no se pisa", () => {
    expect(grupo(a, "ingreso:w-borrada")).toMatchObject({ estado: "borrada", recuperable: true, motivo: null });
    expect(grupo(a, "ingreso:w-baja")).toMatchObject({ estado: "de_baja", recuperable: true });
    expect(grupo(a, "ingreso:w-cambia")).toMatchObject({ estado: "cambiada", recuperable: false, motivo: "Existe hoy con otros datos: no se pisa." });
    expect(grupo(a, "ingreso:w-nueva")).toMatchObject({ estado: "nueva", recuperable: false });
    expect(a.grupos.some((g) => g.clave === "ingreso:w-igual")).toBe(false);
  });

  it("las cifras salen DEL RESPALDO (m³ y PT de la guía borrada)", () => {
    const r: TablasSerial = { WoodEntry: [ingreso("w1")], WoodEntryTroza: [troza("t1", "w1"), troza("t2", "w1")] };
    const g = grupo(analizar(r, {}, sinCierres), "ingreso:w1");
    expect(g).toMatchObject({ m3: 10, pt: 400, piezas: 3, etiqueta: "GTF GTF-w1 · Proveedor", fecha: "2026-10-10" });
  });

  it("los conteos cierran: respaldo = hoy + borradas − nuevas, en cada tabla", () => {
    const r: TablasSerial = {
      WoodEntry: [ingreso("w1"), ingreso("w2")],
      WoodEntryTroza: [troza("t1", "w1"), troza("t2", "w2", { consumidaEnId: "c1" })],
      ForestCtpEntry: [corrida("c1"), corrida("c2")],
      ForestCtpConsumo: [consumo("k1", "c1", "w2")],
    };
    const h = copia(r);
    h.WoodEntry = [ingreso("w1"), ingreso("w3")];
    h.WoodEntryTroza = [troza("t1", "w1")];
    h.ForestCtpEntry = [corrida("c1", { status: "anulado" }), corrida("c3")];
    h.ForestCtpConsumo = [];
    const d = analizar(r, h, sinCierres).diff;
    for (const t of TABLAS_RESPALDO) {
      expect((r[t] ?? []).length, t).toBe((h[t] ?? []).length + d[t].borradas.length - d[t].nuevas.length);
    }
    expect(d.ForestCtpEntry.deBaja).toEqual(["c1"]);
  });
});

describe("qué NO se puede recuperar (motivo en palabras del libro)", () => {
  it("un mes cerrado bloquea y no se reabre", () => {
    const r: TablasSerial = { ForestCtpEntry: [corrida("c1")] };
    const a = analizar(r, {}, { mesCerrado: (f) => (f && f.toISOString().startsWith("2026-10") ? "octubre 2026" : null) });
    expect(grupo(a, "corrida:c1")).toMatchObject({ recuperable: false });
    expect(grupo(a, "corrida:c1").motivo).toContain("El mes octubre 2026 está cerrado");
  });

  it("una troza que ya entró en otra corrida viva bloquea la corrida vieja", () => {
    const r: TablasSerial = {
      WoodEntry: [ingreso("w1")],
      WoodEntryTroza: [troza("t1", "w1", { consumidaEnId: "c1", fechaConsumo: T("2026-10-12") })],
      ForestCtpEntry: [corrida("c1")],
    };
    const h: TablasSerial = {
      WoodEntry: [ingreso("w1")],
      WoodEntryTroza: [troza("t1", "w1", { consumidaEnId: "c2", fechaConsumo: T("2026-10-20") })],
      ForestCtpEntry: [corrida("c1", { deletedAt: T("2026-10-15") }), corrida("c2", { entryDate: T("2026-10-20"), lineNo: 7 })],
    };
    const g = grupo(analizar(r, h, sinCierres), "corrida:c1");
    expect(g.recuperable).toBe(false);
    expect(g.motivo).toBe("La troza T1 ya entró en la corrida 20/10/2026 · Tornillo (N.° 7).");
  });

  it("si la troza hoy está libre, la corrida vuelve y la troza se re-engancha", () => {
    const r: TablasSerial = {
      WoodEntry: [ingreso("w1")],
      WoodEntryTroza: [troza("t1", "w1", { consumidaEnId: "c1", fechaConsumo: T("2026-10-12") })],
      ForestCtpEntry: [corrida("c1")],
    };
    const h: TablasSerial = {
      WoodEntry: [ingreso("w1")],
      WoodEntryTroza: [troza("t1", "w1")],
      ForestCtpEntry: [corrida("c1", { deletedAt: T("2026-10-15") })],
    };
    const a = analizar(r, h, sinCierres);
    expect(grupo(a, "corrida:c1")).toMatchObject({ estado: "de_baja", recuperable: true });
    expect(a.planes.get("corrida:c1")?.rehooks).toEqual([
      { trozaId: "t1", campo: "consumidaEnId", entryId: "c1", fecha: T("2026-10-12"), actual: null, otroActual: null },
    ]);
  });

  it("una columna nueva obligatoria sin valor bloquea", () => {
    const r: TablasSerial = { ForestCtpEntry: [corrida("c1")] };
    const a = analizar(r, {}, {
      mesCerrado: () => null,
      columnasRespaldo: { ForestCtpEntry: Object.keys(corrida("x")) },
      columnasHoy: { ForestCtpEntry: [{ nombre: "id", obligatoria: false }, { nombre: "turno", obligatoria: true }] },
    });
    expect(grupo(a, "corrida:c1").recuperable).toBe(false);
    expect(grupo(a, "corrida:c1").motivo).toContain("Este respaldo es anterior a un dato que hoy el libro pide");
    expect(grupo(a, "corrida:c1").motivo).toContain("turno");
  });

  it("los consumos de una corrida editada después no vuelven: mandan los de hoy", () => {
    const r: TablasSerial = { WoodEntry: [ingreso("w1")], ForestCtpEntry: [corrida("c1")], ForestCtpConsumo: [consumo("k-viejo", "c1", "w1")] };
    const h: TablasSerial = { WoodEntry: [ingreso("w1")], ForestCtpEntry: [corrida("c1")], ForestCtpConsumo: [consumo("k-nuevo", "c1", "w1", "1.5000")] };
    const a = analizar(r, h, sinCierres);
    const g = grupo(a, "corrida:c1");
    expect(g.estado).toBe("borrada");
    expect(g.recuperable).toBe(false);
    expect(g.motivo).toBe("La corrida se editó después; sus consumos de hoy mandan.");
  });

  it("…pero si hoy la corrida no tiene consumos, los viejos sí vuelven", () => {
    const r: TablasSerial = { WoodEntry: [ingreso("w1")], ForestCtpEntry: [corrida("c1")], ForestCtpConsumo: [consumo("k1", "c1", "w1")] };
    const h: TablasSerial = { WoodEntry: [ingreso("w1")], ForestCtpEntry: [corrida("c1")] };
    expect(grupo(analizar(r, h, sinCierres), "corrida:c1").recuperable).toBe(true);
  });

  it("deshacer la baja de un lote cuyo código hoy usa otro lote vivo se bloquea (ADR-396)", () => {
    const r: TablasSerial = { ForestLoteAserrio: [loteAserrio("l1", "A-1")] };
    const h: TablasSerial = { ForestLoteAserrio: [loteAserrio("l1", "A-1", { deletedAt: T("2026-10-20") }), loteAserrio("l2", "A-1")] };
    const g = grupo(analizar(r, h, sinCierres), "lote:l1");
    expect(g.recuperable).toBe(false);
    expect(g.motivo).toBe("El código de lote A-1 ya lo usa otro lote vivo: no puede haber dos.");
  });

  it("consumir más m³ de los que entraron por la guía se bloquea", () => {
    const r: TablasSerial = { WoodEntry: [ingreso("w1")], ForestCtpEntry: [corrida("c1")], ForestCtpConsumo: [consumo("k1", "c1", "w1", "6")] };
    const h: TablasSerial = {
      WoodEntry: [ingreso("w1")],
      ForestCtpEntry: [corrida("c2", { lineNo: 2 })],
      ForestCtpConsumo: [consumo("k2", "c2", "w1", "6")],
    };
    const g = grupo(analizar(r, h, sinCierres), "corrida:c1");
    expect(g.recuperable).toBe(false);
    expect(g.motivo).toContain("quedaría con 12 m³ consumidos de 10 m³ que entraron");
  });
});
