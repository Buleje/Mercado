import { describe, expect, it, vi } from "vitest";
import { opcionesImpresionDespacho, SECCION_IMPRIMIR, SELLO_ANULADA } from "@/components/admin/forestal/despacho-impresiones-menu";
import { AVISO_SIN_GUIA } from "@/components/admin/forestal/hooks/use-guia-salida";

const vigente = { gtfNumber: "001-000123", status: "registrado" as const };

describe("impresiones de la GTF de salida en el ⋯ de la fila de Despacho", () => {
  it("guía emitida: las cuatro del Libro TH, con sus nombres, en su grupo y avisando que es la guía entera", () => {
    const onImprimir = vi.fn();
    const a = opcionesImpresionDespacho(vigente, { onImprimir });
    expect(a.map((x) => x.label)).toEqual(["Imprimir hoja SERFOR", "Imprimir resumen interno", "Imprimir en talonario", "Imprimir con formato"]);
    expect(a.every((x) => x.seccion === SECCION_IMPRIMIR && !x.disabled)).toBe(true);
    expect(a.every((x) => /guía entera/.test(x.hint ?? ""))).toBe(true);
    expect(a[0].tone).toBe("dark");
    a[2].onSelect();
    expect(onImprimir).toHaveBeenCalledWith("talonario");
  });

  it("borrador (sin N°): las cuatro a la vista y apagadas, con el camino", () => {
    const a = opcionesImpresionDespacho({ gtfNumber: "  ", status: "registrado" }, { onImprimir: vi.fn() });
    expect(a).toHaveLength(4);
    expect(a.every((x) => x.disabled && x.hint === AVISO_SIN_GUIA)).toBe(true);
  });

  it("anulada: sólo hoja SERFOR y resumen, con el sello", () => {
    const a = opcionesImpresionDespacho({ ...vigente, status: "anulado" }, { onImprimir: vi.fn() });
    expect(a.map((x) => x.id)).toEqual(["imprimir-hoja", "imprimir-resumen"]);
    expect(a.every((x) => x.hint === SELLO_ANULADA)).toBe(true);
  });

  it("mientras arma un papel: esa gira y las otras esperan", () => {
    const a = opcionesImpresionDespacho(vigente, { onImprimir: vi.fn(), ocupado: "hoja" });
    expect(a[0].busy).toBe(true);
    expect(a[0].disabled).toBe(false);
    expect(a.slice(1).every((x) => x.disabled && !x.busy)).toBe(true);
  });
});
