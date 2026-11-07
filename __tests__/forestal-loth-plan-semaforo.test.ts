/**
 * Semáforo antimulta del plan (`loth-plan-semaforo`).
 */
import { describe, expect, it } from "vitest";
import { cuentaDeRazones, razonesPlazo, semaforoDelPlan, type DatosSemaforo, type PapelesSemaforo } from "@/lib/forestal/loth-plan-semaforo";

/** 24/10/2026 a mediodía de Lima, como lo da `hoyDelLibro`. */
const HOY = new Date("2026-10-24T05:00:00Z");
const BASE: DatosSemaforo = { planType: "PO", estado: "vigente", vigenciaHasta: "2027-06-30", hoy: HOY };

const especie = (especie: string, baseM3: number, taladoM3: number, despachadoM3 = 0) => ({ especie, baseM3, taladoM3, despachadoM3 });
const papeles = (p: Partial<PapelesSemaforo> = {}): PapelesSemaforo => ({ requeridos: 4, presentes: 4, vencidos: [], faltan: [], ...p });

describe("semaforoDelPlan — vigencia", () => {
  it("vigente y sin nada más: verde", () => {
    const s = semaforoDelPlan(BASE);
    expect(s.color).toBe("verde");
    expect(s.titulo).toBe("Al día");
    expect(s.razones).toEqual([]);
  });

  it("vencido: rojo", () => {
    const s = semaforoDelPlan({ ...BASE, vigenciaHasta: "2026-10-14" });
    expect(s.color).toBe("rojo");
    expect(s.razones[0]?.texto).toMatch(/^Vencido hace 10 días/);
  });

  it("≤ 30 días: ámbar urgente («Revisa pronto»); ≤ 90: ámbar", () => {
    expect(semaforoDelPlan({ ...BASE, vigenciaHasta: "2026-11-13" })).toMatchObject({ color: "ambar", titulo: "Revisa pronto" });
    expect(semaforoDelPlan({ ...BASE, vigenciaHasta: "2027-01-14" })).toMatchObject({ color: "ambar", titulo: "Revisa" });
  });

  it("sin fecha: ámbar en un PO, sólo informativo en una plantación", () => {
    const po = semaforoDelPlan({ ...BASE, vigenciaHasta: null });
    expect(po.color).toBe("ambar");
    expect(po.razones[0]?.texto).toMatch(/no te puedo avisar/);
    const plt = semaforoDelPlan({ ...BASE, planType: "PLANTACION", vigenciaHasta: null });
    expect(plt.color).toBe("verde");
    expect(plt.razones[0]?.nivel).toBe("info");
  });

  it("cerrado: neutro; suspendido: rojo", () => {
    expect(semaforoDelPlan({ ...BASE, estado: "cerrado", vigenciaHasta: "2020-01-01" }).color).toBe("neutro");
    expect(semaforoDelPlan({ ...BASE, estado: "suspendido" }).color).toBe("rojo");
  });

  it("DECLARADO vencido con fecha futura: rojo igual (M3)", () => {
    const s = semaforoDelPlan({ ...BASE, estado: "vencido", vigenciaHasta: "2026-11-23" });
    expect(s.color).toBe("rojo");
    expect(s.razones[0]).toMatchObject({ clave: "vigencia", nivel: "rojo" });
    expect(s.razones[0]?.texto).toMatch(/^Vencido: /);
  });
});

describe("semaforoDelPlan — saldo, plazo, ficha", () => {
  it("≥ 90 % del saldo: ámbar; pasado: rojo; usa lo mayor entre talado y despachado", () => {
    const cerca = semaforoDelPlan({ ...BASE, especies: [especie("Tornillo", 100, 40, 91), especie("Capirona", 50, 10)] });
    expect(cerca.color).toBe("ambar");
    expect(cerca.razones[0]?.texto).toBe("Saldo casi usado: Tornillo (91 %).");
    const pasado = semaforoDelPlan({ ...BASE, especies: [especie("Tornillo", 100, 104)] });
    expect(pasado.color).toBe("rojo");
    expect(pasado.razones[0]?.texto).toBe("Se taló más de lo autorizado: Tornillo (lo revisa OSINFOR).");
  });

  describe("B3: guías (SERFOR) y tala (OSINFOR) por separado, con la tolerancia de la guía", () => {
    it("161,265 movilizado contra 161,258 autorizado: se pasó del saldo de guías", () => {
      const s = semaforoDelPlan({ ...BASE, especies: [especie("Shihuahuaco", 161.258, 100, 161.265)] });
      expect(s.color).toBe("rojo");
      expect(s.razones.map((r) => r.texto)).toEqual(["Se pasó del saldo de guías: Shihuahuaco."]);
    });

    it("3,0004 contra 3,000: no se pasa (la tolerancia es la de la guía, 3 decimales)", () => {
      const s = semaforoDelPlan({ ...BASE, especies: [especie("Cumala", 3, 1, 3.0004)] });
      expect(s.razones.map((r) => r.texto)).not.toContain("Se pasó del saldo de guías: Cumala.");
      expect(s.razones.some((r) => r.nivel === "rojo")).toBe(false);
    });

    it("talado 16,2 contra autorizado 3 y movilizado 2: sólo la razón de OSINFOR", () => {
      const s = semaforoDelPlan({ ...BASE, especies: [especie("Lupuna", 3, 16.2, 2)] });
      expect(s.razones.map((r) => r.texto)).toEqual(["Se taló más de lo autorizado: Lupuna (lo revisa OSINFOR)."]);
    });

    it("si pasan las dos, salen las dos", () => {
      const s = semaforoDelPlan({ ...BASE, especies: [especie("Tornillo", 10, 12, 11)] });
      expect(s.razones.map((r) => r.texto)).toEqual([
        "Se pasó del saldo de guías: Tornillo.",
        "Se taló más de lo autorizado: Tornillo (lo revisa OSINFOR).",
      ]);
    });

    it("una plantación no la supervisa OSINFOR: «más de lo registrado»", () => {
      const s = semaforoDelPlan({ ...BASE, planType: "PLANTACION", especies: [especie("Bolaina", 3, 4)] });
      expect(s.razones.map((r) => r.texto)).toContain("Se taló más de lo registrado: Bolaina.");
    });
  });

  it("M2: lo que no se pudo leer NO es verde; lo que todavía no se pidió no se juzga", () => {
    expect(semaforoDelPlan({ ...BASE }).razones).toEqual([]);
    const sinLeer = semaforoDelPlan({ ...BASE, especies: null });
    expect(sinLeer.color).toBe("ambar");
    expect(sinLeer.razones[0]?.texto).toMatch(/^No pude leer el saldo/);
    const vacio = semaforoDelPlan({ ...BASE, especies: [] });
    expect(vacio.color).not.toBe("verde");
    expect(vacio.razones[0]?.clave).toBe("saldo");
  });

  it("el plan no lleva los plazos de 15 días (B5): son del libro", () => {
    expect(semaforoDelPlan({ ...BASE }).razones.some((r) => r.clave === "plazo")).toBe(false);
    // Aunque alguien se los pase, el plan no los cuenta: si no, cada tarjeta repetiría el mismo despacho.
    const conPlazos = { ...BASE, plazos: { vencidos: 3, porVencer: 1, quedanMin: -2, tardias: 0 } } as DatosSemaforo;
    expect(semaforoDelPlan(conPlazos)).toMatchObject({ color: "verde" });
  });

  it("plazos del libro: fuera de los 15 días rojo; por vencer ámbar; tardías info; sin leer ámbar", () => {
    const r = razonesPlazo({ vencidos: 1, porVencer: 2, quedanMin: 3, tardias: 1 });
    expect(r.map((x) => [x.clave, x.nivel])).toEqual([["plazo", "rojo"], ["plazo", "ambar"], ["tardias", "info"]]);
    expect(r[1]?.texto).toBe("2 despachos por asentar: quedan 3 días.");
    expect(cuentaDeRazones({ razones: r })).toEqual({ rojo: 1, ambar: 1, info: 1 });
    expect(razonesPlazo(undefined)).toEqual([]);
    expect(razonesPlazo(null)).toEqual([expect.objectContaining({ nivel: "ambar", texto: expect.stringMatching(/^No pude leer los plazos/) })]);
  });

  it("ficha incompleta: ámbar con la primera falta, siglas intactas", () => {
    const s = semaforoDelPlan({
      ...BASE,
      ficha: {
        pct: 75,
        faltan: [
          { id: "titular", rotulo: "", lleno: false, falta: "Falta su RUC o DNI", paso: "titular", fuente: "" },
          { id: "area", rotulo: "", lleno: false, falta: "Falta el área en hectáreas", paso: "area", fuente: "" },
        ],
      },
    });
    expect(s.color).toBe("ambar");
    expect(s.razones[0]?.texto).toBe("Ficha al 75 %: falta su RUC o DNI y 1 dato más.");
  });

  it("motosierrista: informativo", () => {
    const s = semaforoDelPlan({ ...BASE, talas: { total: 41, conMotosierrista: 0 } });
    expect(s.razones.map((r) => r.texto)).toEqual(["0 de 41 árboles dicen quién los taló."]);
    expect(s.color).toBe("verde");
  });

  describe("papeles del permiso", () => {
    it("un obligatorio vencido: rojo", () => {
      const s = semaforoDelPlan({ ...BASE, papeles: papeles({ presentes: 3, vencidos: ["Resolución de aprobación"] }) });
      expect(s.color).toBe("rojo");
      expect(s.razones.map((r) => r.texto)).toEqual(["Papel vencido: Resolución de aprobación."]);
    });

    it("un obligatorio que falta: ámbar", () => {
      const s = semaforoDelPlan({ ...BASE, papeles: papeles({ presentes: 3, faltan: ["Mapa o croquis de ubicación"] }) });
      expect(s.color).toBe("ambar");
      expect(s.razones.map((r) => r.texto)).toEqual(["Falta 1 papel de 4: Mapa o croquis de ubicación."]);
    });

    it("uno «si aplica» que falta deja el verde (el resumen no lo cuenta)", () => {
      expect(semaforoDelPlan({ ...BASE, papeles: papeles() }).color).toBe("verde");
    });

    it("sin leer: ámbar «No pude leer los papeles»", () => {
      const s = semaforoDelPlan({ ...BASE, papeles: null });
      expect(s.color).toBe("ambar");
      expect(s.razones[0]?.texto).toMatch(/^No pude leer los papeles/);
    });
  });

  it("el ámbar urgente encabeza a los demás ámbar", () => {
    const s = semaforoDelPlan({
      ...BASE,
      vigenciaHasta: "2026-11-01",
      especies: [especie("Tornillo", 100, 95)],
    });
    expect(s.razones[0]?.clave).toBe("vigencia");
    expect(s.titulo).toBe("Revisa pronto");
  });
});
