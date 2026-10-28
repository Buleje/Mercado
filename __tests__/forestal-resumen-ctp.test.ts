/**
 * «Resumen del CTP» (potenciar 28-10): el parte de las 6 pm sobre el parte
 * diario de siempre — Anexos 04 del día (m³ = PT ÷ 424), patio con trozas y
 * producto terminado, el OJO de lo que puede traer multa y el día sin movimiento.
 */
import { describe, expect, it } from "vitest";
import { RESUMEN_CTP, reporteDiarioSchema } from "@/lib/forestal/reporte-diario";
import { armarReporteForestal, type DatosReporteForestal } from "@/lib/forestal/reporte-diario-armado";

const base = (extra: Partial<DatosReporteForestal> = {}): DatosReporteForestal => ({
  negocio: "Blas",
  nombreReporte: "Resumen del CTP",
  fecha: "2026-10-28",
  rango: "hoy",
  desde: "2026-10-28",
  hasta: "2026-10-28",
  panelUrl: "https://buleje.pe/admin?tab=ctp-libro-operaciones",
  ...extra,
});

describe("Resumen del CTP", () => {
  it("el preset es válido para el esquema, sale a las 18:00 y nace apagado al armarlo", () => {
    const r = reporteDiarioSchema.safeParse({
      nombre: RESUMEN_CTP.nombre,
      activo: false,
      hora: RESUMEN_CTP.hora,
      dias: [1, 2, 3, 4, 5, 6],
      porCorreo: true,
      porWhatsapp: false,
      correos: ["dueno@blas.pe"],
      telefonos: [],
      secciones: [...RESUMEN_CTP.secciones],
      rango: RESUMEN_CTP.rango,
    });
    expect(r.success).toBe(true);
    expect(RESUMEN_CTP.hora).toBe("18:00");
  });

  it("el Anexo 04 del día sale con su guía, el PT y el m³ = PT ÷ 424", () => {
    const d = base({ anexos: { cantidad: 1, pt: 4240, m3: 10, lista: [{ numero: "0000071", gtf: "19-001-0000071", pt: 4240 }] } });
    const r = armarReporteForestal(d, ["anexos"]);
    expect(r.texto).toContain("*Anexos 04*: 1 Anexo 04 · 4,240 pt · 10.00 m³");
    expect(r.texto).toContain("guía 19-001-0000071");
    expect(r.html).toContain("19-001-0000071");
  });

  it("patio: trozas, producto terminado y el OJO del Anexo 04 sin salida con sus cifras", () => {
    const d = base({
      patio: {
        trozasEnPatio: 71,
        productoTerminado: { pt: 42400, m3: 100 },
        saldoM3: 12.5,
        sinValidarM3: 0,
        especiesEnNegativo: 0,
        varadas: { piezas: 0, m3: 0, dias: 30 },
        productos: [],
      },
      pendientes: [
        { titulo: "18 Anexos 04 (103,659 PT · 244.53 m³) sin salida en el libro", detalle: "", cantidad: 18, urgencia: "atrasado" },
        { titulo: "Guías del monte sin ingresar al CTP", detalle: "", cantidad: 14, urgencia: "atrasado" },
      ],
    });
    const r = armarReporteForestal(d, ["patio", "pendientes"]);
    expect(r.texto).toContain("71 trozas en patio");
    expect(r.texto).toContain("producto terminado 42,400 pt (100.00 m³)");
    expect(r.texto).toContain("18 Anexos 04 (103,659 PT · 244.53 m³) sin salida en el libro");
    expect(r.texto).toContain("Guías del monte sin ingresar al CTP (14)");
    expect(r.asunto.startsWith("[Atención]")).toBe(true);
  });

  it("día sin movimiento: lo dice en cada parte y no marca atención", () => {
    const d = base({
      ingresos: { guias: 0, m3: 0, porRecibir: 0, porEspecie: [], porProveedor: [] },
      anexos: { cantidad: 0, pt: 0, m3: 0, lista: [] },
      despachos: { registros: 0, m3: 0, piezas: 0, otraUnidad: 0, valorVenta: null, sinGuia: 0, porEspecie: [] },
      pendientes: [],
    });
    const r = armarReporteForestal(d, ["ingresos", "anexos", "despachos", "pendientes"]);
    expect(r.texto).toContain("No entró madera.");
    expect(r.texto).toContain("No se emitió ningún Anexo 04.");
    expect(r.texto).toContain("No salió madera.");
    expect(r.texto).toContain("El libro está al día.");
    expect(r.asunto.startsWith("[Atención]")).toBe(false);
  });
});
