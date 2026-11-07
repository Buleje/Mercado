import { describe, it, expect } from "vitest";
import {
  PLANTILLAS,
  vencimientoDelContrato,
  inicioDelContrato,
  montoDelContrato,
  contraparteDelContrato,
  fillTemplate,
  type ContractTemplate,
} from "@/lib/contratos/plantillas";

/**
 * Lo que se prueba acá es exactamente lo que estaba roto: el asistente sabía
 * pedir la fecha de fin y el plazo, pero nadie los traducía a un vencimiento,
 * así que TODOS los contratos quedaban vigentes para siempre.
 */

function plantillaPorId(id: string): ContractTemplate {
  const tpl = PLANTILLAS.find((t) => t.id === id);
  if (!tpl) throw new Error(`No existe la plantilla ${id}`);
  return tpl;
}

describe("vencimientoDelContrato", () => {
  it("usa la fecha de fin cuando la plantilla la pide", () => {
    const tpl = plantillaPorId("trabajo-plazo-fijo");
    const venc = vencimientoDelContrato(tpl, {
      FECHA_INICIO: "2026-08-01",
      FECHA_FIN: "2027-01-31",
    });
    expect(venc).toBe("2027-01-31");
  });

  it("cuenta el plazo en meses desde el inicio cuando no hay fecha de fin", () => {
    const conPlazo = PLANTILLAS.find((t) =>
      t.fields.some((f) => f.key === "DURACION_MESES") && !t.fields.some((f) => f.key === "FECHA_FIN"),
    );
    expect(conPlazo, "debería existir al menos una plantilla con plazo en meses").toBeTruthy();
    const venc = vencimientoDelContrato(conPlazo as ContractTemplate, {
      FECHA_INICIO: "2026-03-15",
      DURACION_MESES: "12",
    });
    expect(venc).toBe("2027-03-15");
  });

  it("convierte los años a meses", () => {
    const conAnos = PLANTILLAS.find((t) => t.fields.some((f) => f.key === "DURACION_ANOS"));
    expect(conAnos).toBeTruthy();
    const venc = vencimientoDelContrato(conAnos as ContractTemplate, {
      FECHA: "2026-01-10",
      DURACION_ANOS: "2",
    });
    expect(venc).toBe("2028-01-10");
  });

  it("devuelve null cuando el contrato de verdad no tiene término", () => {
    const tpl = plantillaPorId("trabajo-indeterminado");
    const venc = vencimientoDelContrato(tpl, { FECHA_INICIO: "2026-05-01" });
    expect(venc).toBeNull();
  });

  it("no inventa un vencimiento si falta la fecha de inicio", () => {
    const tpl = plantillaPorId("trabajo-plazo-fijo");
    expect(vencimientoDelContrato(tpl, {})).toBeNull();
  });
});

describe("inicioDelContrato", () => {
  it("prefiere la fecha de inicio sobre la de celebración", () => {
    expect(inicioDelContrato({ FECHA_INICIO: "2026-02-01", FECHA: "2026-01-20" })).toBe("2026-02-01");
  });

  it("cae a la fecha del contrato si no hay inicio explícito", () => {
    expect(inicioDelContrato({ FECHA: "2026-01-20" })).toBe("2026-01-20");
  });

  it("usa hoy como último recurso", () => {
    expect(inicioDelContrato({})).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("montoDelContrato", () => {
  it("toma el precio total de una compraventa", () => {
    const tpl = plantillaPorId("compraventa-mercaderia");
    expect(montoDelContrato(tpl, { PRECIO_TOTAL: "1500.50" })).toBe(1500.5);
  });

  it("toma la remuneración en un contrato de trabajo", () => {
    const tpl = plantillaPorId("trabajo-plazo-fijo");
    expect(montoDelContrato(tpl, { REMUNERACION: "1025" })).toBe(1025);
  });

  it("NO confunde una penalidad con el monto del contrato", () => {
    const tpl = plantillaPorId("compraventa-mercaderia");
    // Sólo hay penalidad cargada: el monto del contrato sigue siendo cero.
    expect(montoDelContrato(tpl, { PENALIDAD_PORCENTAJE: "2" })).toBe(0);
  });

  it("ignora montos negativos o basura", () => {
    const tpl = plantillaPorId("compraventa-mercaderia");
    expect(montoDelContrato(tpl, { PRECIO_TOTAL: "-5" })).toBe(0);
    expect(montoDelContrato(tpl, { PRECIO_TOTAL: "no es un número" })).toBe(0);
  });
});

describe("contraparteDelContrato", () => {
  it("lee el nombre y el documento del grupo contraparte", () => {
    const tpl = plantillaPorId("trabajo-plazo-fijo");
    const { nombre, documento } = contraparteDelContrato(tpl, {
      NOMBRE_EMPLEADOR: "Bodega San Martín",
      NOMBRE_TRABAJADOR: "Rosa Gutiérrez",
      DNI_TRABAJADOR: "45678912",
    });
    // El empleador es el emisor: la contraparte es el trabajador.
    expect(nombre).toBe("Rosa Gutiérrez");
    expect(documento).toBe("45678912");
  });

  it("no explota cuando falta todo", () => {
    const tpl = plantillaPorId("trabajo-plazo-fijo");
    expect(contraparteDelContrato(tpl, {})).toEqual({ nombre: "Sin nombre", documento: "" });
  });
});

describe("fillTemplate", () => {
  it("deja marcado lo que no se pudo llenar", () => {
    expect(fillTemplate("Pago de S/ {{MONTO}} a {{QUIEN}}", { MONTO: "100" })).toBe(
      "Pago de S/ 100 a [QUIEN]",
    );
  });
});

describe("integridad de las plantillas", () => {
  it("no hay ids repetidos", () => {
    const ids = PLANTILLAS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda plantilla tiene cláusulas y al menos un campo de contraparte", () => {
    for (const tpl of PLANTILLAS) {
      expect(tpl.clausulas.length, `${tpl.id} sin cláusulas`).toBeGreaterThan(0);
      expect(
        tpl.fields.some((f) => f.group === "contraparte"),
        `${tpl.id} sin campos de contraparte`,
      ).toBe(true);
    }
  });

  it("todo placeholder usado en las cláusulas existe como campo", () => {
    for (const tpl of PLANTILLAS) {
      const claves = new Set(tpl.fields.map((f) => f.key));
      const usados = new Set(
        [...tpl.clausulas, tpl.summaryTemplate]
          .join(" ")
          .match(/\{\{(\w+)\}\}/g)
          ?.map((m) => m.slice(2, -2)) ?? [],
      );
      const huerfanos = [...usados].filter((k) => !claves.has(k));
      expect(huerfanos, `${tpl.id} usa campos que nadie pide: ${huerfanos.join(", ")}`).toEqual([]);
    }
  });
});
