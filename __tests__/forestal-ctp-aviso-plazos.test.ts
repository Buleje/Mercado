import { describe, it, expect } from "vitest";
import {
  plazoDeGuia,
  diasHabilesEntre,
  construirAviso,
  type GuiaPendiente,
} from "@/lib/forestal/ctp-aviso-plazos";

/** Las fechas de guía son date-only (medianoche UTC), como las guarda Prisma. */
const guia = (gtfNumber: string, gtfDate: string, extra: Partial<GuiaPendiente> = {}): GuiaPendiente => ({
  gtfNumber,
  gtfDate: new Date(`${gtfDate}T00:00:00.000Z`),
  ...extra,
});

// Referencias: 2026-07-27 fue LUNES.
const LUNES = new Date("2026-07-27T15:00:00.000Z");
const MARTES = new Date("2026-07-28T15:00:00.000Z");
const MIERCOLES = new Date("2026-07-29T15:00:00.000Z");
const JUEVES = new Date("2026-07-30T15:00:00.000Z");

describe("diasHabilesEntre", () => {
  it("no cuenta el fin de semana", () => {
    // Viernes 24 → lunes 27 son 3 días calendario pero 1 hábil.
    expect(diasHabilesEntre(new Date("2026-07-24T00:00:00.000Z"), LUNES)).toBe(1);
  });

  it("es 0 el mismo día", () => {
    expect(diasHabilesEntre(new Date("2026-07-27T00:00:00.000Z"), LUNES)).toBe(0);
  });
});

describe("plazoDeGuia", () => {
  it("recién emitida está en plazo", () => {
    const p = plazoDeGuia(guia("001-1", "2026-07-27"), LUNES);
    expect(p.estado).toBe("en_plazo");
    expect(p.quedan).toBe(2);
  });

  it("al día hábil siguiente avisa que queda 1", () => {
    const p = plazoDeGuia(guia("001-1", "2026-07-27"), MARTES);
    expect(p.estado).toBe("por_vencer");
    expect(p.quedan).toBe(1);
  });

  it("al segundo día hábil se vence hoy", () => {
    const p = plazoDeGuia(guia("001-1", "2026-07-27"), MIERCOLES);
    expect(p.estado).toBe("vence_hoy");
    expect(p.quedan).toBe(0);
  });

  it("al tercero ya está pasada de plazo", () => {
    const p = plazoDeGuia(guia("001-1", "2026-07-27"), JUEVES);
    expect(p.estado).toBe("vencido");
    expect(p.quedan).toBe(-1);
  });

  it("una guía del viernes sigue en plazo el lunes (el finde no cuenta)", () => {
    const p = plazoDeGuia(guia("001-1", "2026-07-24"), LUNES);
    expect(p.estado).toBe("por_vencer");
    expect(p.quedan).toBe(1);
  });
});

describe("construirAviso", () => {
  const vacio = { guiasSinIngresar: [], despachosSinGtf: 0, saldosNegativos: 0, fueraDePlazo: 0, documentosVencidosLabels: [] };

  it("no interrumpe si no hay nada accionable", () => {
    const a = construirAviso(vacio, LUNES);
    expect(a.hayQueAvisar).toBe(false);
  });

  it("una guía recién emitida NO dispara aviso", () => {
    const a = construirAviso({ ...vacio, guiasSinIngresar: [guia("001-1", "2026-07-27")] }, LUNES);
    expect(a.hayQueAvisar).toBe(false);
  });

  it("dispara cuando al plazo le queda 1 día", () => {
    const a = construirAviso({ ...vacio, guiasSinIngresar: [guia("001-1", "2026-07-27")] }, MARTES);
    expect(a.hayQueAvisar).toBe(true);
    expect(a.severidad).toBe("MEDIUM");
    expect(a.whatsapp).toContain("te queda 1 día hábil");
  });

  it("sube a HIGH cuando vence hoy o ya venció", () => {
    expect(construirAviso({ ...vacio, guiasSinIngresar: [guia("001-1", "2026-07-27")] }, MIERCOLES).severidad).toBe("HIGH");
    expect(construirAviso({ ...vacio, guiasSinIngresar: [guia("001-1", "2026-07-27")] }, JUEVES).severidad).toBe("HIGH");
  });

  it("los ingresos ya fuera de plazo NO disparan el aviso solos (no son accionables hoy)", () => {
    const a = construirAviso({ ...vacio, fueraDePlazo: 9 }, LUNES);
    expect(a.hayQueAvisar).toBe(false);
  });

  it("un saldo negativo alcanza para avisar en HIGH", () => {
    const a = construirAviso({ ...vacio, saldosNegativos: 1 }, LUNES);
    expect(a.hayQueAvisar).toBe(true);
    expect(a.severidad).toBe("HIGH");
    expect(a.whatsapp).toContain("saldo negativo");
  });

  it("un despacho sin GTF avisa, en MEDIUM", () => {
    const a = construirAviso({ ...vacio, despachosSinGtf: 2 }, LUNES);
    expect(a.hayQueAvisar).toBe(true);
    expect(a.severidad).toBe("MEDIUM");
    expect(a.whatsapp).toContain("sin GTF de salida");
  });

  it("ordena lo vencido antes que lo que recién vence", () => {
    const a = construirAviso(
      {
        ...vacio,
        guiasSinIngresar: [guia("001-NUEVA", "2026-07-27"), guia("001-VIEJA", "2026-07-20")],
      },
      JUEVES,
    );
    expect(a.guias[0].gtfNumber).toBe("001-VIEJA");
    expect(a.guias[0].estado).toBe("vencido");
  });

  it("corta la lista larga pero dice cuántas faltan", () => {
    const muchas = Array.from({ length: 9 }, (_, i) => guia(`001-${i}`, "2026-07-20"));
    const a = construirAviso({ ...vacio, guiasSinIngresar: muchas }, JUEVES);
    expect(a.whatsapp).toContain("…y 3 más.");
  });

  it("el mensaje nombra el negocio cuando se lo pasan", () => {
    const a = construirAviso({ ...vacio, saldosNegativos: 1 }, LUNES, "Aserradero San Martín");
    expect(a.whatsapp).toContain("Aserradero San Martín");
  });

  it("un documento vencido en la Ficha dispara el aviso en HIGH, aunque no haya guías", () => {
    const a = construirAviso({ ...vacio, documentosVencidosLabels: ["TH-004"] }, LUNES);
    expect(a.hayQueAvisar).toBe(true);
    expect(a.severidad).toBe("HIGH");
    expect(a.titulo).toContain("documento vencido");
    expect(a.whatsapp).toContain("TH-004");
    expect(a.whatsapp).toContain("invalida el origen legal");
  });

  it("varios documentos vencidos encabezan el título y el resumen antes que las guías", () => {
    const a = construirAviso(
      { ...vacio, documentosVencidosLabels: ["CITES Caoba", "TH-004"], guiasSinIngresar: [guia("001-1", "2026-07-20")] },
      JUEVES,
    );
    expect(a.titulo).toBe("2 documentos vencidos en la Ficha CTP");
    expect(a.resumen.startsWith("2 documentos vencidos en la Ficha")).toBe(true);
  });
});
