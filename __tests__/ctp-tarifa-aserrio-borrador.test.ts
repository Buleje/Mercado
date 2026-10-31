/**
 * Tests — el borrador de tarifa armado con la producción real (ADR-412,
 * «Armar con tu producción»): convertir lo que devuelve el servidor
 * (`VersionTarifaInput` con todo en 0) al borrador del formulario, en blanco
 * de verdad (no en "0"), y quedarse sólo con los tipos que aparecen.
 */

import { describe, expect, it } from "vitest";
import type { VersionTarifa, VersionTarifaInput } from "@/lib/forestal/tarifa-aserrio";
import { borradorDesde, borradorDesdeProduccion, inputDesde, tiposDelBorrador } from "@/components/admin/forestal/ctp-tarifa-aserrio-shared";

const inputDelServidor: VersionTarifaInput = {
  vigenteDesde: "2026-09-14",
  basePt: 0,
  especies: [
    { nombre: "Tornillo", precioPt: 0 },
    { nombre: "Cumala", precioPt: 0 },
  ],
  tipos: [{ tipo: "Comercial", ajustePt: 0 }],
  largos: [{ desdePies: 0, hastaPies: 12, ajustePt: 5 }],
  nota: "Borrador armado con tu producción: pon los precios",
};

describe("borradorDesdeProduccion", () => {
  it("los precios llegan VACÍOS, no en \"0\" — 0 se leería como ya decidido", () => {
    const b = borradorDesdeProduccion(inputDelServidor);
    expect(b.basePt).toBe("");
    expect(b.especies).toEqual([
      { nombre: "Tornillo", precioPt: "" },
      { nombre: "Cumala", precioPt: "" },
    ]);
    expect(b.tipos.Comercial).toBe("");
  });

  it("los tramos de largo se copian (desde/hasta), el ajuste también en blanco", () => {
    const b = borradorDesdeProduccion(inputDelServidor);
    expect(b.largos).toHaveLength(1);
    expect(b.largos[0]).toMatchObject({ desdePies: "0", hastaPies: "12", ajustePt: "" });
  });

  it("sin al menos un precio puesto, `revisarVersion` lo sigue rechazando (el borrador no se guarda tal cual)", () => {
    const b = borradorDesdeProduccion(inputDelServidor);
    // `inputDesde` filtra los precios vacíos: no llega ninguno al servidor.
    const enviado = inputDesde(b);
    expect(enviado.basePt).toBe(0);
    expect(enviado.especies).toEqual([]);
  });

  it("con UN precio puesto, ese sí viaja", () => {
    const b = borradorDesdeProduccion(inputDelServidor);
    b.especies[0]!.precioPt = "0.35";
    const enviado = inputDesde(b);
    expect(enviado.especies).toEqual([{ nombre: "Tornillo", precioPt: 0.35 }]);
  });

  it("un tramo con ajuste 0 en la producción real no distinguió nada: no se muestra (BAJO 2026-09-14)", () => {
    const b = borradorDesdeProduccion({ ...inputDelServidor, largos: [{ desdePies: 0, hastaPies: 12, ajustePt: 0 }] });
    expect(b.largos).toEqual([]);
  });

  it("la nota del servidor («pon los precios») no se copia a la tarifa: nace en blanco (BAJO 2026-09-14)", () => {
    const b = borradorDesdeProduccion(inputDelServidor);
    expect(b.nota).toBe("");
  });
});

const vigenteDesdeAgosto: VersionTarifa = {
  id: "v-agosto",
  vigenteDesde: "2026-08-01",
  basePt: 0.3,
  especies: [{ nombre: "Tornillo", clave: "tornillo", precioPt: 0.35 }],
  tipos: [],
  largos: [],
  nota: null,
  creadoPor: "qa",
  creadoEn: "2026-08-01T00:00:00.000Z",
};

describe("borradorDesde — «Nueva tarifa desde hoy» no puede pisar la vigente (ALTO 2026-09-14)", () => {
  it("editando una versión existente, el borrador se queda con SU id", () => {
    const b = borradorDesde(vigenteDesdeAgosto, ["Tornillo"], "2026-08-01");
    expect(b.id).toBe("v-agosto");
  });

  it("«nueva desde hoy» copia los VALORES de la vigente pero nace SIN id", () => {
    // Si esto reusara `vigenteDesdeAgosto.id`, guardar con `vigenteDesde: hoy`
    // le movería la fecha a la versión de agosto en vez de crear una nueva —
    // la vigencia de agosto a hoy desaparecería del tarifario.
    const b = borradorDesde(vigenteDesdeAgosto, ["Tornillo"], "2026-09-14", true);
    expect(b.id).toBeUndefined();
    expect(b.basePt).toBe("0.3");
    expect(b.vigenteDesde).toBe("2026-09-14");
  });

  it("sin ninguna vigente (aserradero nuevo), «nueva» tampoco inventa un id", () => {
    const b = borradorDesde(null, ["Tornillo"], "2026-09-14", true);
    expect(b.id).toBeUndefined();
  });
});

describe("tiposDelBorrador", () => {
  it("sólo los tipos que de verdad aparecen en la producción — no los 7 fijos", () => {
    expect(tiposDelBorrador(inputDelServidor)).toEqual(["Comercial"]);
  });

  it("sin tipos en la producción (paquetes sin medidas ni producto reconocible), lista vacía", () => {
    expect(tiposDelBorrador({ ...inputDelServidor, tipos: [] })).toEqual([]);
  });
});
