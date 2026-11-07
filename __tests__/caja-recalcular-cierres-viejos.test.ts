/**
 * Arreglo de los resúmenes viejos del cron (`scripts/recalcular-cierres-viejos.ts`):
 * fila vieja (0 / vacío / 0) + cuadre de las cajas del día → cambio o null.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { CUADRE_VACIO, cuadreDeCajas, type CajaCerradaDelDia } from "@/lib/caja/cierres-por-dia";
import {
  cambioDelCierreViejo,
  cuadreDe,
  cuadresPorDia,
  diaDelResumen,
  type FilaDelResumen,
} from "@/lib/caja/recalcular-cierres-viejos";
import { sentenciaDeCambioDeCaja } from "@/lib/db/daily-summary.db";

const HOY = "2026-10-19";

/** Una caja cerrada el `dia` a las 20:00 de Lima (01:00 UTC del día siguiente). */
function caja(dia: string, esperado: number, contado: number, notes: string | null = null): CajaCerradaDelDia {
  return {
    openedAt: new Date(`${dia}T13:00:00.000Z`),
    closedAt: new Date(`${dia}T20:00:00-05:00`),
    expectedAmount: esperado,
    closingAmount: contado,
    difference: Math.round((contado - esperado) * 100) / 100,
    notes,
  };
}

function fila(dia: string, extra: Partial<FilaDelResumen> = {}): FilaDelResumen {
  return {
    id: `ds-${dia}`,
    tenantId: "main",
    fecha: new Date(`${dia}T00:00:00.000Z`),
    creadoPor: "cron",
    efectivoEsperado: 0,
    efectivoContado: null,
    diferenciaCaja: 0,
    ...extra,
  };
}

describe("cambioDelCierreViejo", () => {
  it("main 28/09: 5 cajas (esperado 55, contado 0) → 55 / 0 / −55", () => {
    const cuadre = cuadreDeCajas([caja("2026-09-28", 55, 0), ...[1, 2, 3, 4].map(() => caja("2026-09-28", 0, 0))]);
    expect(cambioDelCierreViejo(fila("2026-09-28"), cuadre, HOY)).toEqual({
      id: "ds-2026-09-28",
      tenantId: "main",
      dia: "2026-09-28",
      cajas: 5,
      sinConteo: 0,
      antes: { efectivoEsperado: 0, efectivoContado: null, diferenciaCaja: 0 },
      despues: { efectivoEsperado: 55, efectivoContado: 0, diferenciaCaja: -55 },
    });
  });

  it("un día sin cajas queda como lo deja el cron: sin cambio", () => {
    expect(cambioDelCierreViejo(fila("2026-08-01"), CUADRE_VACIO, HOY)).toBeNull();
  });

  it("un día con sólo cierres automáticos (sin conteo) tampoco cambia", () => {
    const cuadre = cuadreDeCajas([caja("2026-10-12", 80, 80, "Cierre automático (sin conteo)")]);
    expect(cuadre.cajas).toBe(1);
    expect(cambioDelCierreViejo(fila("2026-10-12"), cuadre, HOY)).toBeNull();
  });

  it("idempotente: la fila ya recalculada no vuelve a cambiar", () => {
    const cuadre = cuadreDeCajas([caja("2026-09-29", 100, 100)]);
    const c = cambioDelCierreViejo(fila("2026-09-29"), cuadre, HOY);
    expect(c?.despues).toEqual({ efectivoEsperado: 100, efectivoContado: 100, diferenciaCaja: 0 });
    expect(cambioDelCierreViejo(fila("2026-09-29", { ...c?.despues }), cuadre, HOY)).toBeNull();
  });

  it("nunca toca un cierre hecho a mano ni el día de hoy (sus cajas siguen abiertas)", () => {
    const cuadre = cuadreDeCajas([caja("2026-10-19", 50, 40)]);
    expect(cambioDelCierreViejo(fila("2026-10-18", { creadoPor: "admin" }), cuadre, HOY)).toBeNull();
    expect(cambioDelCierreViejo(fila(HOY), cuadre, HOY)).toBeNull();
  });
});

describe("cuadresPorDia", () => {
  it("agrupa por el día de Lima del cierre: la de las 20:00 de Lima es de ese día, no del siguiente en UTC", () => {
    const cajas = [caja("2026-10-08", 90, 90), caja("2026-10-10", 50, 50), caja("2026-10-10", 0, 0)];
    const m = cuadresPorDia(cajas);
    expect([...m.keys()].sort()).toEqual(["2026-10-08", "2026-10-10"]);
    expect(cuadreDe(m, "2026-10-10")).toEqual(cuadreDeCajas(cajas.slice(1)));
    expect(cuadreDe(m, "2026-10-09")).toEqual(CUADRE_VACIO);
  });

  it("el día del resumen es la fecha a medianoche UTC tal cual", () => {
    expect(diaDelResumen(new Date("2026-09-28T00:00:00.000Z"))).toBe("2026-09-28");
  });
});

describe("sentenciaDeCambioDeCaja", () => {
  it("compara-y-cambia con tenantId y creadoPor en el WHERE, todo como parámetro", () => {
    const s = sentenciaDeCambioDeCaja("main", [
      { id: "ds-1", antes: { efectivoEsperado: 0, efectivoContado: null, diferenciaCaja: 0 }, despues: { efectivoEsperado: 55, efectivoContado: 0, diferenciaCaja: -55 } },
    ]);
    expect(s.values).toEqual(["ds-1", 55, 0, -55, 0, null, 0, "main", "cron"]);
    expect(s.text).toMatch(/d\."tenantId" = \$8 AND d\."creadoPor" = \$9/);
    expect(s.text).toMatch(/"efectivoContado" IS NOT DISTINCT FROM v\.cont_antes/);
  });
});
