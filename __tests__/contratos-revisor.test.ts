import { describe, it, expect } from "vitest";
import { revisarPorReglas } from "@/lib/contratos/revisar-contrato";
import type { DbContract } from "@/lib/types/contracts";

/**
 * Las reglas duras del revisor: son las que corren SIEMPRE, con o sin IA, y las
 * que no admiten opinión. Si estas fallan, el panel promete una revisión legal
 * que en realidad no está mirando nada.
 */

function contrato(over: Partial<DbContract> = {}): DbContract {
  return {
    id: "c1",
    tenantId: "main",
    numero: "CONT-2026-0001",
    tipo: "SERVICIO",
    estado: "VIGENTE",
    clienteNombre: "Rosa Gutiérrez",
    clienteDoc: "45678912",
    customerId: null,
    supplierId: null,
    descripcion: "",
    resumen: "",
    monto: 500,
    moneda: "PEN",
    fechaInicio: "2026-01-01T12:00:00.000Z",
    fechaVencimiento: "2026-12-31T12:00:00.000Z",
    plantillaId: null,
    contenido: "CLAUSULA PRIMERA.- Objeto del servicio.",
    datos: null,
    clausulas: [],
    lugarFirma: "Pucallpa",
    condiciones: "",
    documentId: null,
    hashSha256: null,
    firmadoEn: null,
    renovadoDeId: null,
    revisionIa: null,
    creadoPor: "qaadmin",
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    firmantes: [
      {
        id: "f1",
        contractId: "c1",
        orden: 1,
        rol: "CONTRAPARTE",
        nombre: "Rosa Gutiérrez",
        documento: "45678912",
        telefono: "",
        email: null,
        estado: "PENDIENTE",
        tieneFirma: false,
        firmadoEn: null,
        enviadoEn: null,
        motivoRechazo: null,
        createdAt: "2026-01-01T12:00:00.000Z",
      },
    ],
    eventos: [],
    ...over,
  };
}

const titulos = (c: DbContract) => revisarPorReglas(c).riesgos.map((r) => r.titulo);

describe("revisarPorReglas", () => {
  it("detecta los campos que quedaron sin llenar", () => {
    const r = revisarPorReglas(
      contrato({ contenido: "Pago de S/ [PRECIO_TOTAL] a [NOMBRE_COMPRADOR] el [FECHA]." }),
    );
    expect(r.camposVacios).toEqual(["PRECIO_TOTAL", "NOMBRE_COMPRADOR", "FECHA"]);
    expect(r.riesgos[0].severidad).toBe("alta");
  });

  it("no inventa campos vacíos en un contrato completo", () => {
    expect(revisarPorReglas(contrato()).camposVacios).toEqual([]);
  });

  it("avisa cuando el contrato no dice cuándo termina", () => {
    expect(titulos(contrato({ fechaVencimiento: null }))).toContain("El contrato no dice cuándo termina");
  });

  it("marca las fechas invertidas", () => {
    const t = titulos(
      contrato({ fechaInicio: "2026-12-01T12:00:00.000Z", fechaVencimiento: "2026-01-01T12:00:00.000Z" }),
    );
    expect(t).toContain("Las fechas están al revés");
  });

  it("marca un contrato de trabajo que pasa los 5 años de ley", () => {
    const t = titulos(
      contrato({
        tipo: "TRABAJO",
        contenido: "CLAUSULA PRIMERA.- Causa objetiva: campaña navideña.",
        fechaInicio: "2026-01-01T12:00:00.000Z",
        fechaVencimiento: "2032-01-01T12:00:00.000Z",
      }),
    );
    expect(t).toContain("El contrato de trabajo pasa los 5 años");
  });

  it("acepta un contrato de trabajo dentro del plazo legal", () => {
    const t = titulos(
      contrato({
        tipo: "TRABAJO",
        contenido: "CLAUSULA PRIMERA.- Causa objetiva: campaña navideña.",
        fechaInicio: "2026-01-01T12:00:00.000Z",
        fechaVencimiento: "2027-01-01T12:00:00.000Z",
      }),
    );
    expect(t).not.toContain("El contrato de trabajo pasa los 5 años");
  });

  it("exige la causa objetiva en un contrato de trabajo", () => {
    const t = titulos(contrato({ tipo: "TRABAJO", contenido: "CLAUSULA PRIMERA.- Objeto." }));
    expect(t).toContain("Falta la causa objetiva de la contratación");
  });

  it("no le pide causa objetiva a un contrato que no es laboral", () => {
    expect(titulos(contrato())).not.toContain("Falta la causa objetiva de la contratación");
  });

  it("marca el contrato sin monto, salvo que sea un acuerdo de confidencialidad", () => {
    expect(titulos(contrato({ monto: 0 }))).toContain("El contrato no tiene monto");
    expect(titulos(contrato({ monto: 0, tipo: "NDA" }))).not.toContain("El contrato no tiene monto");
  });

  it("marca una penalidad desmedida y deja pasar una razonable", () => {
    const alta = titulos(
      contrato({ contenido: "Pagará una penalidad del 25% del precio total por cada semana de retraso." }),
    );
    expect(alta.some((t) => t.includes("penalidad del 25%"))).toBe(true);

    const normal = titulos(
      contrato({ contenido: "Pagará una penalidad del 2% del precio total por cada semana de retraso." }),
    );
    expect(normal.some((t) => t.includes("penalidad"))).toBe(false);
  });

  it("detecta un RUC que no puede existir", () => {
    const t = titulos(contrato({ contenido: "La empresa con RUC N.o 12345 celebra este contrato." }));
    expect(t).toContain("Hay un RUC que no es válido");
  });

  it("acepta un RUC bien formado", () => {
    const t = titulos(contrato({ contenido: "La empresa con RUC N.o 20512345678 celebra este contrato." }));
    expect(t).not.toContain("Hay un RUC que no es válido");
  });

  it("avisa cuando nadie fue invitado a firmar", () => {
    expect(titulos(contrato({ firmantes: [] }))).toContain("Todavía no hay firmantes definidos");
  });

  it("un contrato sano no dispara ningún riesgo", () => {
    expect(titulos(contrato())).toEqual([]);
  });
});
