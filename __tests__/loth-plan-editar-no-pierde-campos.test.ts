import { describe, it, expect } from "vitest";
import { desdePlan, formularioVacio } from "@/components/admin/forestal/LothPlanForm";
import type { Plan } from "@/components/admin/forestal/loth-plan-shared";

/**
 * Editar un plan no puede perder campos (ADR-426).
 *
 * El formulario de edición copia el plan **campo por campo**. Una copia a mano
 * que se queda corta no falla: guarda, y lo que no copió viaja como `null` —
 * o sea **borra**. Es el mismo error que costó dos rondas en RRHH
 * (`PuestoInput`) y en el Directorio (`aBorrador`). Este test es el gate.
 */

/** Un plan con TODOS los campos llenos, cada uno con un valor reconocible. */
const planCompleto: Plan = {
  id: "plan-1",
  planType: "PMFI",
  planNumber: "PMFI-2026-007",
  tituloHabilitante: "10-HUA-PUE/PER-FMP-2026-007",
  resolucionNumber: "RDF 45-2026",
  resolucionDate: "2026-03-04T00:00:00.000Z",
  titularName: "SANTOS MUÑOZ JOSE HORD",
  regenteName: "Ing. Rosa Ríos",
  regenteRegistro: "RNR-0421",
  regenteEspecialidad: "no_maderable",
  representanteLegal: "Juan Pérez",
  arffs: "ATFFS Selva Central",
  region: "Pasco",
  parcelaCorta: "PC 3",
  areaHa: "850.25",
  uitRef: "5350",
  vigenciaDesde: "2026-03-05T00:00:00.000Z",
  vigenciaHasta: "2031-03-04T00:00:00.000Z",
  estado: "suspendido",
  costoExtraccionM3: "120",
  costoTransformacionM3: "80",
  costoFleteM3: "60",
  notes: "Observación del expediente",
  alias: "el de Puerto Inca",
  propietarioNombre: "Comunidad X",
  propietarioDocTipo: "RUC",
  propietarioDoc: "20605859438",
  provincia: "Oxapampa",
  distrito: "Puerto Bermúdez",
  sector: "Caserío Santa Rosa",
  cuenca: "Pichis",
  contratoId: "ctr-9",
};

describe("desdePlan", () => {
  it("no deja NINGÚN campo del formulario sin copiar", () => {
    const f = desdePlan(planCompleto);
    const vacios = Object.entries(f)
      .filter(([, v]) => v === "" || v == null)
      .map(([k]) => k);
    expect(vacios).toEqual([]);
  });

  it("devuelve exactamente las mismas claves que el formulario vacío", () => {
    expect(Object.keys(desdePlan(planCompleto)).sort()).toEqual(Object.keys(formularioVacio()).sort());
  });

  it("recorta las fechas a lo que come un input date", () => {
    const f = desdePlan(planCompleto);
    expect(f.resolucionDate).toBe("2026-03-04");
    expect(f.vigenciaDesde).toBe("2026-03-05");
    expect(f.vigenciaHasta).toBe("2031-03-04");
  });

  it("respeta el estado y el tipo guardados, no los defaults del alta", () => {
    const f = desdePlan(planCompleto);
    expect(f.estado).toBe("suspendido");
    expect(f.planType).toBe("PMFI");
    expect(f.regenteEspecialidad).toBe("no_maderable");
  });

  it("un plan a medio cargar no inventa valores: los nulos quedan vacíos", () => {
    const pelado: Plan = {
      ...planCompleto,
      alias: null,
      propietarioNombre: null,
      cuenca: null,
      notes: null,
      regenteEspecialidad: null,
    };
    const f = desdePlan(pelado);
    expect(f.alias).toBe("");
    expect(f.propietarioNombre).toBe("");
    expect(f.cuenca).toBe("");
    expect(f.notes).toBe("");
    // La especialidad sí tiene un default razonable: el formulario nunca la deja en blanco.
    expect(f.regenteEspecialidad).toBe("maderable");
  });
});
