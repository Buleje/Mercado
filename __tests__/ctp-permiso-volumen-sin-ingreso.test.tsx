/**
 * __tests__/ctp-permiso-volumen-sin-ingreso.test.tsx
 *
 * La ficha del permiso (ADR-432) no puede declarar lo que no sabe:
 *
 * 1. **Sin ingreso no hay techo.** Un permiso con producción y 0 guías (3
 *    REG-PLT reales de Blas, 25-09) daba «saldo aserrable» = 0 − lo producido y
 *    lo pintaba en rojo como «Se produjo más que el techo del 56 %». Sin madera
 *    ingresada no hay contra qué medir: «—».
 * 2. **Una unidad que no convierte no es 0.** Una fila de «Producción por
 *    tipo» con m³/pt `null` se pinta «—», nunca «0,000 / 0 pt».
 * 3. **«Producción sin guía de ingreso» son los mismos ids del aviso**, no un
 *    filtro propio que puede dar otra cantidad.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CtpPermisoTraza from "@/components/admin/forestal/CtpPermisoTraza";
import CtpPermisoVolumen from "@/components/admin/forestal/CtpPermisoVolumen";
import type { CorridaDelPermiso, VolumenDelPermiso } from "@/lib/forestal/volumen-del-permiso";

const corrida = (id: string, lineNo: number, consumidoM3: number): CorridaDelPermiso => ({
  id,
  lineNo,
  fecha: "2026-09-10T00:00:00.000Z",
  especie: "Bolaina",
  tipo: "MADERA ASERRADA (COMERCIAL)",
  cantidad: 1,
  unidad: "m3",
  piezas: 10,
  m3: 1,
  origen: "atada",
  parte: 1,
  m3DelPermiso: 1,
  consumidoM3,
  guias: [],
  lote: null,
  despachadoM3: 0,
});

/** Un REG-PLT como los de Blas: producción, cero guías de ingreso. */
function sinIngreso(): VolumenDelPermiso {
  return {
    contratoId: "ctr_reg",
    codigo: "REG-PLT-2025-096",
    totales: {
      guias: 0,
      trozas: 0,
      piezas: 0,
      ingresadoM3: 0,
      consumidoM3: 0,
      despachadoRollizaM3: 0,
      saldoRollizaM3: 0,
      aserrablePt: 0,
      corridas: 2,
      producidoM3: 2,
      producidoPt: 848,
      despachos: 0,
      despachadoM3: 0,
      saldoPt: -848,
      rendimientoPct: null,
    },
    especies: [
      {
        clave: "bolaina",
        especie: "Bolaina",
        guias: 0,
        piezas: 0,
        ingresadoM3: 0,
        consumidoM3: 0,
        despachadoRollizaM3: 0,
        saldoRollizaM3: 0,
        aserrablePt: 0,
        corridas: 2,
        producidoM3: 2,
        producidoPt: 848,
        despachadoM3: 0,
        saldoPt: -848,
        sinIngreso: true,
      },
    ],
    porTipo: [
      {
        clave: "bolaina",
        especie: "Bolaina",
        tipo: "MADERA ASERRADA (COMERCIAL)",
        corridas: 1,
        piezas: 10,
        m3: 2,
        pt: 848,
      },
      {
        clave: "bolaina",
        especie: "Bolaina",
        tipo: "LEÑA",
        corridas: 1,
        piezas: 0,
        m3: null,
        pt: null,
      },
    ],
    guias: [],
    corridas: [corrida("c1", 11, 0), corrida("c2", 12, 0)],
    despachos: [],
    avisos: {
      especiesSinIngreso: [{ especie: "Bolaina", m3: 2, corridas: 2 }],
      corridasSinAtar: [],
      corridasDeOtroPermiso: [],
      corridasSinMateriaPrima: { cantidad: 1, m3: 1, ids: ["c2"] },
      guiasSinTrozas: [],
      excesos: [],
      sinConvertir: [],
    },
  };
}

describe("Volumen de un permiso sin guías de ingreso", () => {
  it("el saldo aserrable sale «—» y no se declara un exceso sobre el techo", () => {
    render(<CtpPermisoVolumen volumen={sinIngreso()} />);
    expect(screen.queryByText(/Se produjo más que el techo/)).toBeNull();
    expect(screen.queryByText("pt de más")).toBeNull();
    expect(screen.getByText("Sin techo que medir")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Saldo aserrable/ })).toBeTruthy();
  });

  it("la fila de «por tipo» en una unidad que no convierte dice «—», no «0.000» ni «0»", () => {
    render(<CtpPermisoVolumen volumen={sinIngreso()} />);
    const tabla = within(screen.getByRole("region", { name: /Producción por tipo/ })).getByRole(
      "table",
    );
    const lena = within(tabla).getByText("Leña").closest("tr");
    expect(lena).toBeTruthy();
    const celdas = within(lena as HTMLElement).getAllByRole("cell");
    expect(celdas.at(-1)?.textContent).toBe("—");
    expect(celdas.at(-2)?.textContent).toBe("—");
    expect(within(tabla).getByText(/sin contar 1\s+corrida en otra unidad/)).toBeTruthy();
  });

  it("CONTROL: con ingreso y exceso real, el rojo sigue saliendo", () => {
    const v = sinIngreso();
    v.totales = {
      ...v.totales,
      guias: 1,
      trozas: 3,
      ingresadoM3: 1,
      aserrablePt: 237,
      saldoPt: -611,
    };
    render(<CtpPermisoVolumen volumen={v} />);
    expect(screen.getByText("Se produjo más que el techo del 56 %")).toBeTruthy();
  });
});

describe("Trazabilidad · producción sin guía de ingreso", () => {
  it("lista los MISMOS ids que cuenta el aviso, no las corridas con consumo 0", () => {
    render(<CtpPermisoTraza volumen={sinIngreso()} />);
    const bloque = screen.getByRole("region", { name: /Producción sin guía de ingreso/ });
    expect(within(bloque).getByText("N° 12")).toBeTruthy();
    expect(within(bloque).queryByText("N° 11")).toBeNull();
  });
});
