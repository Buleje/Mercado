/**
 * La llegada al patio de las guías importadas (casilla «¿Estas trozas ya están
 * en el patio?») y el aviso «Sin recepcionar» de Trozas.
 *
 * La fecha de recepción es dato legal: nunca futura, nunca antes de la guía,
 * y si el archivo no la trae no se inventa. Las guías de un mes cerrado no van
 * al aviso (no se tocan sin reabrirlo). Con la fecha puesta, el conteo del
 * patio las espera y cuenta sus días desde la llegada.
 */
import { describe, expect, it } from "vitest";
import { aTrozaDelConteo } from "@/lib/forestal/conteo-patio";
import { guiaRecibida, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import {
  SIN_FECHA_EN_EL_ARCHIVO,
  TOPE_GUIAS_DEL_AVISO,
  diaDeRecepcionAlImportar,
  resumirGuiasSinRecibir,
  type AsientoSinRecibir,
} from "@/lib/forestal/recepcion-al-importar";

const HOY = "2026-10-28";

describe("diaDeRecepcionAlImportar", () => {
  it("sin fecha común, la de la guía en el archivo", () => {
    expect(diaDeRecepcionAlImportar({ comun: null, delArchivo: "2026-10-10", hoy: HOY })).toEqual({ dia: "2026-10-10", problema: null });
  });

  it("la fecha común manda sobre la del archivo", () => {
    expect(diaDeRecepcionAlImportar({ comun: "2026-10-12", delArchivo: "2026-10-10", hoy: HOY })).toEqual({ dia: "2026-10-12", problema: null });
  });

  it("acepta un instante ISO del archivo como su día", () => {
    expect(diaDeRecepcionAlImportar({ comun: undefined, delArchivo: "2026-10-10T00:00:00.000Z", hoy: HOY }).dia).toBe("2026-10-10");
  });

  it("el inventario sin fecha y sin común: no se inventa", () => {
    expect(diaDeRecepcionAlImportar({ comun: null, delArchivo: null, hoy: HOY })).toEqual({ dia: null, problema: SIN_FECHA_EN_EL_ARCHIVO });
    expect(diaDeRecepcionAlImportar({ comun: "", delArchivo: "", hoy: HOY }).problema).toBe(SIN_FECHA_EN_EL_ARCHIVO);
  });

  it("el inventario sin fecha con común: entra con la común", () => {
    expect(diaDeRecepcionAlImportar({ comun: "2026-10-20", delArchivo: null, hoy: HOY }).dia).toBe("2026-10-20");
  });

  it("nunca futura", () => {
    const r = diaDeRecepcionAlImportar({ comun: "2026-10-29", delArchivo: "2026-10-10", hoy: HOY });
    expect(r.dia).toBeNull();
    expect(r.problema).toBe("no puede ser una fecha futura: hoy es 28/10");
  });

  it("nunca antes de la guía", () => {
    const r = diaDeRecepcionAlImportar({ comun: "2026-10-09", delArchivo: "2026-10-10", hoy: HOY });
    expect(r.dia).toBeNull();
    expect(r.problema).toBe("la madera no pudo llegar antes de su guía, que es del 10/10");
  });

  it("la guía de hoy, recibida hoy, vale", () => {
    expect(diaDeRecepcionAlImportar({ comun: HOY, delArchivo: HOY, hoy: HOY }).dia).toBe(HOY);
  });
});

const asiento = (p: Partial<AsientoSinRecibir> & { gtfNumber: string }): AsientoSinRecibir => ({
  gtfSeries: "019-001",
  status: "validado",
  entryDate: new Date("2026-10-19T15:00:00.000Z"),
  fechaRecepcion: null,
  volumeM3: 1,
  trozasCount: 0,
  trozasDecididas: 0,
  ...p,
});

const SEPTIEMBRE_CERRADO: CtpCierrePeriodo = {
  periodKey: "2026-09",
  from: "2026-09-01T05:00:00.000Z",
  to: "2026-10-01T04:59:59.999Z",
  label: "setiembre de 2026",
  closedAt: "2026-10-02T15:00:00.000Z",
  closedBy: "qa",
} as CtpCierrePeriodo;

describe("resumirGuiasSinRecibir", () => {
  it("una guía validada sin fecha cuenta (el conteo la espera, pero no sabe desde cuándo)", () => {
    const r = resumirGuiasSinRecibir([asiento({ gtfNumber: "3", volumeM3: 2.5, trozasCount: 6 })], []);
    expect(r).toMatchObject({ guias: 1, m3: 2.5, trozas: 6, enMesCerrado: 0, gtfs: ["3"] });
  });

  it("dos especies de la misma guía son UNA guía; series distintas, dos", () => {
    const r = resumirGuiasSinRecibir(
      [
        asiento({ gtfNumber: "3", volumeM3: 1 }),
        asiento({ gtfNumber: "3", volumeM3: 2 }),
        asiento({ gtfNumber: "3", gtfSeries: "010-001", volumeM3: 4 }),
      ],
      [],
    );
    expect(r.guias).toBe(2);
    expect(r.m3).toBe(7);
  });

  it("recibida con fecha y todas sus trozas decididas: fuera", () => {
    const r = resumirGuiasSinRecibir(
      [asiento({ gtfNumber: "8", fechaRecepcion: new Date("2026-10-20T00:00:00.000Z"), trozasCount: 6, trozasDecididas: 6 })],
      [],
    );
    expect(r.guias).toBe(0);
  });

  it("recibida con fecha pero con trozas sin decidir: adentro, sin sumar m³ de la ya fechada", () => {
    const r = resumirGuiasSinRecibir(
      [asiento({ gtfNumber: "8", fechaRecepcion: new Date("2026-10-20T00:00:00.000Z"), volumeM3: 3, trozasCount: 6, trozasDecididas: 4 })],
      [],
    );
    expect(r).toMatchObject({ guias: 1, m3: 0, trozas: 2 });
  });

  it("anulada o rechazada: no se recibe, no avisa", () => {
    const r = resumirGuiasSinRecibir([asiento({ gtfNumber: "9", status: "anulado" }), asiento({ gtfNumber: "10", status: "rechazado" })], []);
    expect(r.guias).toBe(0);
  });

  it("la de un mes cerrado no va al aviso: se cuenta aparte", () => {
    const r = resumirGuiasSinRecibir(
      [
        asiento({ gtfNumber: "1", entryDate: new Date("2026-09-15T15:00:00.000Z") }),
        asiento({ gtfNumber: "2", entryDate: new Date("2026-10-15T15:00:00.000Z") }),
      ],
      [SEPTIEMBRE_CERRADO],
    );
    expect(r).toMatchObject({ guias: 1, enMesCerrado: 1, gtfs: ["2"] });
  });

  it("un mes reabierto vuelve a avisar", () => {
    const r = resumirGuiasSinRecibir(
      [asiento({ gtfNumber: "1", entryDate: new Date("2026-09-15T15:00:00.000Z") })],
      [{ ...SEPTIEMBRE_CERRADO, reabierto: { at: "2026-10-05T15:00:00.000Z", by: "qa", motivo: "corregir" } }],
    );
    expect(r.guias).toBe(1);
  });

  it("la más vieja primero y con tope para abrir el bloque", () => {
    const muchas = Array.from({ length: TOPE_GUIAS_DEL_AVISO + 5 }, (_, i) =>
      asiento({ gtfNumber: String(100 + i), entryDate: new Date(Date.UTC(2026, 9, 27 - (i % 20), 15)) }),
    );
    const r = resumirGuiasSinRecibir(muchas, []);
    expect(r.guias).toBe(TOPE_GUIAS_DEL_AVISO + 5);
    expect(r.gtfs).toHaveLength(TOPE_GUIAS_DEL_AVISO);
    expect(r.detalle[0].fecha <= r.detalle[1].fecha).toBe(true);
  });
});

describe("con la fecha puesta, «Contar el patio» la cuenta", () => {
  const troza = (p: Partial<TrozaConsumible>): TrozaConsumible => ({
    id: "t-1",
    woodEntryId: "we-1",
    codificacion: "T-1",
    especieComun: "Tornillo",
    volumenM3: 1.2,
    gtfNumber: "019-001-0000003",
    fechaIngreso: "2026-10-19T15:00:00.000Z",
    ...p,
  });

  it("guía importada pendiente y sin fecha: no llegó todavía", () => {
    const recibida = guiaRecibida({ estado: "pendiente", fechaRecepcionGuia: null, fechaRecepcionTroza: null });
    expect(aTrozaDelConteo(troza({ guiaRecepcionada: recibida })).motivo).toBe("no_recepcionada");
  });

  it("recibida al importar: esperada, y sus días cuentan desde la llegada", () => {
    const llegada = "2026-10-12T00:00:00.000Z";
    const recibida = guiaRecibida({ estado: "pendiente", fechaRecepcionGuia: llegada, fechaRecepcionTroza: null });
    const t = aTrozaDelConteo(troza({ guiaRecepcionada: recibida, guiaFechaRecepcion: llegada }));
    expect(t.motivo).toBeNull();
    expect(t.desde).toBe("2026-10-12");
  });

  it("validada sin fecha (el libro oficial): esperada, pero los días salen del asiento", () => {
    const recibida = guiaRecibida({ estado: "validado", fechaRecepcionGuia: null, fechaRecepcionTroza: null });
    const t = aTrozaDelConteo(troza({ guiaRecepcionada: recibida }));
    expect(t.motivo).toBeNull();
    expect(t.desde).toBe("2026-10-19");
  });
});
