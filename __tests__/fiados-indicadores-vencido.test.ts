/**
 * Cifras de «Me deben» (revisión del 10-10): las cuatro que el revisor encontró
 * contando distinto según la pantalla. Todas en el día de Lima.
 *
 * 1. «Vencido» comparaba contra la hora: el fiado que vence hoy (llega a
 *    medianoche UTC) ya contaba como vencido.
 * 2. La promesa de un cliente que ya pagó todo seguía «sin cumplir».
 * 3. La agenda sumaba la promesa y el saldo del mismo cliente (el doble).
 * 4. El mes con la hora del navegador; la semana, domingo en un lado y lunes en otro.
 */
import { describe, expect, it } from "vitest";
import type { Gestion } from "@/lib/fiados/gestion-cobranza";
import { limaDateKey } from "@/lib/utils";
import {
  armarAgenda,
  calendarioDeAgenda,
  cobradoDesde,
  fiadosVencidos,
  lunesDe,
  primeroDelMes,
  promesasDeQuienDebe,
  totalPorCobrar,
} from "@/components/admin/fiados/cifras-me-deben";
import { telefonoTapado } from "@/components/admin/fiados/fiados-exportar";
import type { Fiado } from "@/components/admin/fiados/tipos";

const AHORA = Date.parse("2026-10-10T15:00:00Z"); // sábado 10/10, 10:00 en Lima
const HOY = limaDateKey(AHORA);

function fiado(p: Partial<Fiado>): Fiado {
  return {
    id: "f1", tenantId: "t", customerId: "912345678", customerName: "Rosa",
    total: 50, saldo: 50, status: "ACTIVO", cuotas: [],
    createdAt: "2026-09-01T15:00:00.000Z", updatedAt: "2026-09-01T15:00:00.000Z",
    ...p,
  };
}

function promesa(p: Partial<Gestion>): Gestion {
  return { id: "g1", customerId: "912345678", fecha: "2026-09-25T15:00:00.000Z", tipo: "PROMESA", fechaPrometida: "2026-10-01T17:00:00.000Z", ...p };
}

describe("«Vencido» por día de Lima", () => {
  it("el fiado que vence hoy (medianoche UTC) no está vencido a las 10:00 de Lima", () => {
    expect(HOY).toBe("2026-10-10");
    expect(fiadosVencidos([fiado({ fechaVence: "2026-10-10T00:00:00.000Z" })], HOY)).toHaveLength(0);
  });

  it("tampoco si el cron ya lo marcó VENCIDO por la hora UTC", () => {
    expect(fiadosVencidos([fiado({ status: "VENCIDO", fechaVence: "2026-10-10T00:00:00.000Z" })], HOY)).toHaveLength(0);
  });

  it("el de mañana no vence a las 20:00 de Lima (ya es mañana en UTC)", () => {
    const noche = limaDateKey(Date.parse("2026-10-11T01:00:00Z"));
    expect(noche).toBe("2026-10-10");
    expect(fiadosVencidos([fiado({ fechaVence: "2026-10-11T00:00:00.000Z" })], noche)).toHaveLength(0);
  });

  it("el de ayer sí, y el pagado nunca", () => {
    const ayer = fiado({ fechaVence: "2026-10-09T00:00:00.000Z" });
    const pagado = fiado({ id: "f2", status: "PAGADO", saldo: 0, fechaVence: "2026-09-01T00:00:00.000Z" });
    expect(fiadosVencidos([ayer, pagado], HOY).map((f) => f.id)).toEqual(["f1"]);
  });
});

describe("promesas: sólo de quien todavía debe", () => {
  it("el cliente sin deuda con una promesa vieja no suma promesas rotas", () => {
    const pagado = fiado({ status: "PAGADO", saldo: 0 });
    const m = promesasDeQuienDebe([promesa({})], [pagado], AHORA);
    expect([...m.values()].filter((p) => p.estado === "incumplio")).toHaveLength(0);
    expect(m.size).toBe(0);
  });

  it("el que todavía debe y no cumplió, sí", () => {
    const m = promesasDeQuienDebe([promesa({})], [fiado({})], AHORA);
    expect(m.get("912345678")?.estado).toBe("incumplio");
  });

  it("la promesa de hoy es «vence hoy» guardada a mediodía o a medianoche UTC", () => {
    for (const fechaPrometida of ["2026-10-10T17:00:00.000Z", "2026-10-10T00:00:00.000Z"]) {
      const m = promesasDeQuienDebe([promesa({ fechaPrometida })], [fiado({})], AHORA);
      expect(m.get("912345678")?.estado).toBe("vence-hoy");
    }
  });
});

describe("agenda: la promesa no se suma dos veces", () => {
  it("promesa + vencimiento del mismo cliente en la semana → total = saldo", () => {
    const f = fiado({ fechaVence: "2026-10-13T00:00:00.000Z" });
    const promesas = promesasDeQuienDebe([promesa({ fechaPrometida: "2026-10-12T17:00:00.000Z" })], [f], AHORA);
    const { items } = armarAgenda([f], promesas);
    expect(items.map((i) => i.tipo).sort()).toEqual(["promesa", "vence"]);
    expect(totalPorCobrar(items)).toBe(50);
  });

  it("el calendario marca el día de la promesa sin sumarle plata", () => {
    const f = fiado({ fechaVence: "2026-10-13T00:00:00.000Z" });
    const promesas = promesasDeQuienDebe([promesa({ fechaPrometida: "2026-10-13T17:00:00.000Z" })], [f], AHORA);
    const dia = calendarioDeAgenda(armarAgenda([f], promesas).items).get("2026-10-13");
    expect(dia).toEqual({ dia: "2026-10-13", monto: 50, cuantos: 2 });
  });
});

describe("un solo reloj: Lima, semana desde el lunes", () => {
  it("el lunes de la semana y el 1 del mes", () => {
    expect(lunesDe("2026-10-10")).toBe("2026-10-05"); // sábado → lunes 5
    expect(lunesDe("2026-10-11")).toBe("2026-10-05"); // domingo sigue en la misma semana
    expect(lunesDe("2026-10-12")).toBe("2026-10-12");
    expect(primeroDelMes("2026-10-10")).toBe("2026-10-01");
  });

  it("lo cobrado el 30/09 a las 21:00 de Lima es de setiembre, aunque en UTC ya sea octubre", () => {
    const f = fiado({ cuotas: [{ id: "c1", fiadoId: "f1", monto: 20, pagadoEn: "2026-10-01T02:00:00.000Z", createdAt: "2026-10-01T02:00:00.000Z" }] });
    expect(cobradoDesde([f], primeroDelMes(HOY))).toBe(0);
  });
});

describe("lista de cobro impresa", () => {
  it("el celular sale tapado", () => {
    expect(telefonoTapado("912345678")).toBe("912XXXXXX");
    expect(telefonoTapado("+51 912 345 678")).toBe("912XXXXXX");
    expect(telefonoTapado("")).toBe("—");
  });
});
