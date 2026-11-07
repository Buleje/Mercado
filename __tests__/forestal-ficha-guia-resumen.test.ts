import { describe, expect, it } from "vitest";
import {
  estadoDeTroza,
  lineaDeTiempo,
  repartoDeEspecies,
  resumirTrozas,
} from "@/lib/forestal/ficha-guia-resumen";

describe("estadoDeTroza", () => {
  it("decide en el orden del libro: no llegó antes que cualquier consumo", () => {
    expect(estadoDeTroza({ noRecepcionada: true, consumidaEnId: "c1" })).toBe("no_llego");
    expect(estadoDeTroza({ fechaRecepcion: "2026-09-10", despachadaEnId: "d1", consumidaEnId: "c1" })).toBe("despachada");
    expect(estadoDeTroza({ fechaRecepcion: "2026-09-10", consumidaEnId: "c1" })).toBe("aserrada");
    expect(estadoDeTroza({ fechaRecepcion: "2026-09-10", retrozos: 2 })).toBe("retrozada");
    expect(estadoDeTroza({ fechaRecepcion: "2026-09-10", descarte: true })).toBe("descarte");
    expect(estadoDeTroza({ fechaRecepcion: "2026-09-10" })).toBe("en_patio");
    expect(estadoDeTroza({})).toBe("sin_recibir");
  });
});

describe("resumirTrozas", () => {
  it("cuenta por estado y separa las del patio sin etiqueta", () => {
    const r = resumirTrozas([
      { fechaRecepcion: "2026-09-10", volumenM3: "1.25", etiquetadaEn: "2026-09-11T10:00:00Z" },
      { fechaRecepcion: "2026-09-10", volumenM3: 0.75 },
      { consumidaEnId: "c1", volumenM3: 1 },
      { noRecepcionada: true, volumenM3: null },
    ]);
    expect(r.total).toBe(4);
    expect(r.porEstado.en_patio).toBe(2);
    expect(r.porEstado.aserrada).toBe(1);
    expect(r.porEstado.no_llego).toBe(1);
    expect(r.etiquetadas).toBe(1);
    expect(r.enPatioSinEtiqueta).toBe(1);
    expect(r.m3).toBe(3);
  });
});

describe("repartoDeEspecies", () => {
  it("los porcentajes suman 100 por el mayor resto", () => {
    const r = repartoDeEspecies([
      { comun: "Copaiba", volumenM3: 1 },
      { comun: "Sapotillo", volumenM3: 1 },
      { comun: "Cumala", volumenM3: 1 },
    ]);
    expect(r.map((e) => e.pct).reduce((s, n) => s + n, 0)).toBe(100);
    expect(r.map((e) => e.pct)).toEqual([34, 33, 33]);
  });

  it("sin volumen no inventa una proporción", () => {
    expect(repartoDeEspecies([{ comun: "Copaiba", volumenM3: 0 }]).map((e) => e.pct)).toEqual([0]);
  });
});

describe("lineaDeTiempo", () => {
  const base = { expedicion: "2026-09-01", vencimiento: "2026-09-05", piezasDecididas: 0, piezasTotal: 4, hoy: "2026-09-20" };

  it("recibida después de vencer se marca en alerta", () => {
    const t = lineaDeTiempo({
      ...base,
      lineas: [{ entryDate: "2026-09-02", gtfDate: "2026-09-01", fechaRecepcion: "2026-09-07", status: "pendiente" }],
    });
    expect(t.recibidaVencida).toBe(true);
    expect(t.hitos.find((h) => h.clave === "llego")).toMatchObject({ dia: "2026-09-07", estado: "alerta", detalle: "después de vencer" });
  });

  it("sin recibir y vencida hoy avisa; sin vencimiento no afirma nada", () => {
    const lineas = [{ entryDate: "2026-09-02", status: "pendiente" }];
    expect(lineaDeTiempo({ ...base, lineas }).vencidaSinRecibir).toBe(true);
    const sinPapel = lineaDeTiempo({ ...base, vencimiento: null, lineas });
    expect(sinPapel.vencidaSinRecibir).toBe(false);
    expect(sinPapel.hitos.find((h) => h.clave === "llego")?.estado).toBe("pendiente");
  });

  it("validada = todos los asientos vivos validados; toma la última validación", () => {
    const t = lineaDeTiempo({
      ...base,
      vencimiento: null,
      lineas: [
        { entryDate: "2026-09-02", status: "validado", validatedAt: "2026-09-03T15:00:00Z", validatedBy: "ana" },
        { entryDate: "2026-09-02", status: "validado", validatedAt: "2026-09-04T15:00:00Z", validatedBy: "luis" },
        { entryDate: "2026-09-02", status: "anulado" },
      ],
    });
    expect(t.hitos.find((h) => h.clave === "validada")).toMatchObject({ dia: "2026-09-04", estado: "hecho", detalle: "luis" });
  });
});
