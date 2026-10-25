import { describe, expect, it } from "vitest";
import { planDesdeLaGuia, sugerirPlanDeLaGuia } from "@/lib/forestal/loth-atar-lo-suelto";

/* La guía 19-000004 de Blas (24-10), recortada: plantación, sin plan, titular en el propietario. */
const guia = {
  gtfNumber: "19-000004",
  tituloHabilitante: "19-SEC/REG-PLT-2026-117",
  titularName: null,
  origen: "COMUNIDAD NATIVA SEPTIMO UNIDOS DE SANTA FE DE AGUACHINI, Puerto Bermúdez, Oxapampa, Pasco",
  items: [
    { code: "1-0004", species: "Tornillo", scientific: "Cedrelinga cateniformis", volumeM3: 0.4545, aMano: true },
    { code: "1-0005", species: "TORNILLO", scientific: null, volumeM3: 0.5 },
    { code: "1-0006", species: "Capirona", scientific: null, volumeM3: 0.25, cites: false },
  ],
  gtfDatos: {
    titulos: ["19-SEC/REG-PLT-2026-117"],
    propietario: { nombre: "COMUNIDAD NATIVA SEPTIMO UNIDOS DE SANTA FE DE AGUACHINI", docTipo: "RUC", docNumero: "20156700615", esElCtp: false },
    traslado: { partida: { departamento: "Pasco", provincia: "Oxapampa", distrito: "Puerto Bermúdez" } },
    guia: { autoridad: "ATFFS SELVA CENTRAO - PUERTO BERMUDEZ", resolucion: "-", origenRecurso: "plantacion", representanteLegal: "DAMIAN ESPINOZA SEBASTIAN" },
  },
};

const plan = (id: string, o: Partial<{ planNumber: string | null; tituloHabilitante: string | null; titularName: string }> = {}) => ({
  id, planNumber: null, tituloHabilitante: null, titularName: "Otro titular", ...o,
});

describe("sugerirPlanDeLaGuia", () => {
  it("por el título, tramo a tramo y sin ceros a la izquierda", () => {
    const planes = [plan("a", { planNumber: "19-SEC/REG-PLT-2025-096" }), plan("b", { planNumber: "19 SEC REG PLT 2026 0117" })];
    expect(sugerirPlanDeLaGuia(guia, planes)).toEqual({ planId: "b", via: "titulo" });
  });

  it("sin título que cruce, por el titular si un solo plan lo tiene", () => {
    const planes = [plan("a", { planNumber: "096" }), plan("c", { titularName: "Comunidad Nativa Séptimo Unidos de Santa Fe de Aguachini" })];
    expect(sugerirPlanDeLaGuia(guia, planes)).toEqual({ planId: "c", via: "titular" });
  });

  it("dos planes con el mismo título o el mismo titular: no se adivina", () => {
    expect(sugerirPlanDeLaGuia(guia, [plan("a", { planNumber: "19-SEC/REG-PLT-2026-117" }), plan("b", { tituloHabilitante: "19-SEC-REG-PLT-2026-117" })])).toBeNull();
    const titular = "COMUNIDAD NATIVA SEPTIMO UNIDOS DE SANTA FE DE AGUACHINI";
    expect(sugerirPlanDeLaGuia(guia, [plan("a", { titularName: titular }), plan("b", { titularName: titular })])).toBeNull();
    expect(sugerirPlanDeLaGuia(guia, [])).toBeNull();
  });
});

describe("planDesdeLaGuia", () => {
  it("toma título, tipo, titular, ATFFS y lugar de la guía; lo autorizado no", () => {
    const p = planDesdeLaGuia(guia);
    expect(p).toMatchObject({
      codigo: "19-SEC/REG-PLT-2026-117",
      planType: "PLANTACION",
      plantacion: true,
      planNumber: "19-SEC/REG-PLT-2026-117",
      tituloHabilitante: null,
      titularName: "COMUNIDAD NATIVA SEPTIMO UNIDOS DE SANTA FE DE AGUACHINI",
      propietarioDoc: "20156700615",
      representanteLegal: "DAMIAN ESPINOZA SEBASTIAN",
      resolucionNumber: null,
      arffs: "ATFFS SELVA CENTRAO - PUERTO BERMUDEZ",
      region: "Pasco",
      provincia: "Oxapampa",
      distrito: "Puerto Bermúdez",
    });
    expect(p.especies).toEqual([
      { especie: "Tornillo", cientifico: "Cedrelinga cateniformis", cites: false, trozas: 2, m3: 0.9545 },
      { especie: "Capirona", cientifico: null, cites: false, trozas: 1, m3: 0.25 },
    ]);
    expect(JSON.stringify(p)).not.toMatch(/autorizad/i);
  });

  it("un CTP dueño de la madera no es el titular; sin título no hay código", () => {
    const p = planDesdeLaGuia({ ...guia, tituloHabilitante: null, gtfDatos: { propietario: { nombre: "Blas SAC", esElCtp: true }, guia: { origenRecurso: "bosque" } } });
    expect(p.codigo).toBeNull();
    expect(p.titularName).toBeNull();
    expect(p.planType).toBe("PO");
    /* Sin partida ni casilleros, el lugar sale de la columna `origen`. */
    expect([p.distrito, p.provincia, p.region]).toEqual(["Puerto Bermúdez", "Oxapampa", "Pasco"]);
  });
});
