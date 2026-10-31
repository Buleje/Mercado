import { describe, expect, it } from "vitest";
import { consolidarLeads } from "@/lib/leads/consolidar-leads";

const fila = (entityId: string, dia: number, status: string) => ({
  id: `${entityId}-${dia}`,
  entityId,
  status,
  createdAt: new Date(Date.UTC(2026, 9, dia, 15)),
});

describe("consolidarLeads", () => {
  it("un interesado avanzado de estado cuenta UNA vez, con su estado de hoy y el día que llegó", () => {
    // Como las devuelve Prisma: más nuevas primero.
    const filas = [fila("rosa", 9, "contacted"), fila("rosa", 3, "new")];
    const leads = consolidarLeads(filas);
    expect(leads).toHaveLength(1);
    expect(leads[0]!.status).toBe("contacted");
    expect(leads[0]!.createdAt.toISOString()).toBe("2026-10-03T15:00:00.000Z");
    expect(leads[0]!.id).toBe("rosa-9");
  });

  it("no depende del orden de entrada y ordena por llegada, el más reciente primero", () => {
    const filas = [
      fila("ana", 2, "new"),
      fila("rosa", 3, "new"),
      fila("ana", 8, "demo_done"),
      fila("rosa", 5, "contacted"),
      fila("luis", 6, "new"),
    ];
    const leads = consolidarLeads(filas);
    expect(leads.map((l) => `${l.entityId}:${l.status}`)).toEqual([
      "luis:new",
      "rosa:contacted",
      "ana:demo_done",
    ]);
  });

  it("sin filas, sin interesados", () => {
    expect(consolidarLeads([])).toEqual([]);
  });
});
