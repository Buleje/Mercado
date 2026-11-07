/**
 * La fecha para devolver un adelanto ya dado: día de Lima → instante, y qué
 * fechas valen. Con HEAD falla: el módulo no existía.
 */
import { describe, expect, it } from "vitest";
import { limaDateKey } from "@/lib/utils";
import { detalleDelControl, instanteDeVencimiento, problemaDeVencimiento } from "@/lib/adelantos/control-edicion";

describe("instanteDeVencimiento", () => {
  it("guarda el mediodía de Lima: vuelve a leerse como el MISMO día", () => {
    const i = instanteDeVencimiento("2026-10-15");
    expect(i?.toISOString()).toBe("2026-10-15T17:00:00.000Z");
    expect(limaDateKey(i!)).toBe("2026-10-15");
  });

  it("la trampa que evita: medianoche UTC se lee como el día anterior en Lima", () => {
    expect(limaDateKey(new Date("2026-08-03"))).toBe("2026-08-02");
    expect(limaDateKey(instanteDeVencimiento("2026-08-03")!)).toBe("2026-08-03");
  });

  it("fin e inicio de año no se corren", () => {
    expect(limaDateKey(instanteDeVencimiento("2026-12-31")!)).toBe("2026-12-31");
    expect(limaDateKey(instanteDeVencimiento("2027-01-01")!)).toBe("2027-01-01");
  });

  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "15/10/2026", "2026-10-15T00:00", "", "1999-12-31", "2101-01-01"])(
    "«%s» no es un día válido → null",
    (d) => expect(instanteDeVencimiento(d)).toBeNull(),
  );

  it("29 de febrero sólo en bisiesto", () => {
    expect(instanteDeVencimiento("2028-02-29")).not.toBeNull();
    expect(instanteDeVencimiento("2027-02-29")).toBeNull();
  });
});

describe("problemaDeVencimiento", () => {
  /* Quispe Galindo: S/ 17 000 dados el 03/08 a las 12:00 de Lima. */
  const dado = new Date("2026-08-03T17:00:00.000Z");

  it("el mismo día en que se dio vale", () => {
    expect(problemaDeVencimiento("2026-08-03", dado)).toBeNull();
  });

  it("antes de darlo no vale, y lo dice con la fecha", () => {
    expect(problemaDeVencimiento("2026-08-02", dado)).toMatch(/antes del día en que se dio \(03\/08\/2026\)/);
  });

  it("una fecha ya pasada SÍ vale: el acuerdo fue ese y ya venció", () => {
    expect(problemaDeVencimiento("2026-09-01", dado)).toBeNull();
  });

  it("dado a las 21:00 de Lima (ya día siguiente en UTC): cuenta el día de Lima", () => {
    const deNoche = new Date("2026-08-04T02:00:00.000Z"); // 03/08 21:00 en Lima
    expect(problemaDeVencimiento("2026-08-03", deNoche)).toBeNull();
  });

  it("borde 23:30 de Lima: el día del adelanto vale, el anterior no", () => {
    const tarde = new Date("2026-08-04T04:30:00.000Z"); // 03/08 23:30 en Lima
    expect(problemaDeVencimiento("2026-08-03", tarde)).toBeNull();
    expect(problemaDeVencimiento("2026-08-02", tarde)).toMatch(/03\/08\/2026/);
    expect(problemaDeVencimiento("2026-08-04", new Date("2026-08-04T05:30:00.000Z"))).toBeNull(); // 04/08 00:30 Lima
  });

  it("fecha inexistente", () => {
    expect(problemaDeVencimiento("2026-02-30", dado)).toMatch(/no existe/);
  });
});

describe("detalleDelControl (la línea de la auditoría)", () => {
  it("sólo lo que cambió, antes → después", () => {
    expect(
      detalleDelControl(
        "ADL-2026-0007",
        { fechaVencimiento: null, contrato: null },
        { fechaVencimiento: "2026-10-15T17:00:00.000Z", contrato: null },
      ),
    ).toBe("ADL-2026-0007: vence sin fecha → 15/10/2026.");
    expect(
      detalleDelControl(
        "ADL-2026-0007",
        { fechaVencimiento: "2026-10-15T17:00:00.000Z", contrato: null },
        { fechaVencimiento: "2026-10-15T17:00:00.000Z", contrato: "19-SEC/REG-PLT-2018-020" },
      ),
    ).toBe("ADL-2026-0007: permiso ninguno → 19-SEC/REG-PLT-2018-020.");
  });

  it("nada cambió → vacío (un reintento no deja rastro repetido)", () => {
    const e = { fechaVencimiento: new Date("2026-10-15T17:00:00.000Z"), contrato: "X" };
    expect(detalleDelControl("ADL-1", e, { fechaVencimiento: "2026-10-15T17:00:00.000Z", contrato: "X" })).toBe("");
  });
});
