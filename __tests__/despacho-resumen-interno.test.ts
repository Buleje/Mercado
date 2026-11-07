import { describe, expect, it } from "vitest";
import { hojaResumenInternoDespacho, plazoDeLaSalida, sinAtribuirDeLaGuia } from "@/lib/forestal/despacho-resumen-interno";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { GuiaSalidaImprimible } from "@/lib/forestal/guia-salida-imprimible";
import type { PiezaGuia } from "@/lib/forestal/loth-guia-despacho";

const datos = {
  titulos: ["25-UCA/C-OPP-A-001-23"],
  citesPermiso: "",
  destinatario: { nombre: "Maderera El Roble" },
} as unknown as GtfDatos;

const linea = (comun: string, tipoProducto: string, total: number, cantidad = 10, unidad = "m³") => ({
  cientifico: comun === "Tornillo" ? "Cedrelinga cateniformis" : "",
  comun,
  tipoProducto,
  presentacion: unidad,
  cantidad,
  unidad,
  total,
});

const troza = (codigo: string, volumeM3: number, codigoGuia: string | null = null): PiezaGuia =>
  ({ codigo, codigoGuia, arbol: "A-7", comun: "Tornillo", cientifico: "Cedrelinga cateniformis", cites: false, diamMayorM: 0.62, diamMenorM: 0.55, lengthM: 4.1, volumeM3 }) as PiezaGuia;

const guia = (p: Partial<GuiaSalidaImprimible> = {}): GuiaSalidaImprimible => ({
  despachoId: "d1",
  lineNo: 41,
  lineIds: ["d1", "d2"],
  gtfNumber: "001-000123",
  fecha: "2026-10-20",
  datos,
  lineas: [linea("Tornillo", "Tablas", 4.2), linea("Tornillo", "Vigas", 1.8, 4)],
  cadena: { corridas: [{ lineNo: 12, quantity: 6, guias: ["GTF-IN-77"] }] },
  trozas: [],
  enRollo: false,
  titular: "Inversiones Agroforestales Blas",
  faltan: [],
  anulada: false,
  ...p,
});

describe("resumen interno de la GTF de salida", () => {
  it("aserrada: filas por producto, total del (34h), cadena completa y sin lista de trozas", () => {
    const h = hojaResumenInternoDespacho(guia(), { anexo04: true, hoy: "2026-10-27" });
    expect(h.nombre).toBe("Resumen interno");
    expect(h.html).toContain("Tablas");
    expect(h.html).toContain("Vigas");
    expect(h.html).toContain("Total de la guía (34h)");
    expect(h.html).toContain(fmtM3(6));
    expect(h.html).toContain("Corrida de producción #12");
    expect(h.html).toContain("GTF-IN-77");
    expect(h.html).toContain("Madera transformada");
    expect(h.html).toContain("25-UCA/C-OPP-A-001-23");
    expect(h.html).toContain("Emitido");
    expect(h.html).not.toContain("Sin atribuir");
    expect(h.html).not.toContain("GUÍA ANULADA");
  });

  it("trozas sin aserrar: su tabla con el código de la guía y lo sin atribuir (nunca forzado)", () => {
    const g = guia({
      lineas: [linea("Tornillo", "Trozas", 3, 3)],
      cadena: { corridas: [{ lineNo: null, quantity: 2.5, guias: ["GTF-IN-9"] }] },
      trozas: [troza("T-1", 1.2, "12A"), troza("T-2", 1.3)],
      enRollo: true,
    });
    expect(sinAtribuirDeLaGuia(g)).toBe(0.5);
    const h = hojaResumenInternoDespacho(g, { anexo04: false, hoy: "2026-10-27" });
    expect(h.html).toContain("Trozas sin transformar");
    expect(h.html).toContain("12A");
    expect(h.html).toContain("T-2");
    expect(h.html).toContain("Sin atribuir");
    expect(h.html).toContain("Falta emitirlo");
  });

  it("lo sin atribuir nunca es negativo y no se calcula con unidades mezcladas", () => {
    expect(sinAtribuirDeLaGuia(guia({ cadena: { corridas: [{ lineNo: 1, quantity: 9, guias: [] }] } }))).toBe(0);
    expect(sinAtribuirDeLaGuia(guia({ lineas: [linea("Tornillo", "Tablas", 4), linea("Tornillo", "Tablas", 300, 5, "pt")] }))).toBeNull();
  });

  it("anulada: sale con el sello y su motivo", () => {
    const h = hojaResumenInternoDespacho(guia(), { anexo04: false, anulada: "Error en la placa", hoy: "2026-10-27" });
    expect(h.html).toContain("GUÍA ANULADA");
    expect(h.html).toContain("Error en la placa");
    expect(h.etiqueta).toContain("Anulada");
  });

  it("plazo: el mismo predicado del libro (registrada el mismo día = en plazo; 20 días después = fuera)", () => {
    expect(plazoDeLaSalida("2026-10-20", "2026-10-20T15:00:00.000Z", "2026-10-27").fuera).toBe(false);
    const tarde = plazoDeLaSalida("2026-10-20", "2026-11-09T15:00:00.000Z", "2026-11-09");
    expect(tarde.fuera).toBe(true);
    expect(tarde.texto).toContain("fuera de plazo");
    expect(plazoDeLaSalida("2026-10-01", null, "2026-10-27").texto).toContain("Venció");
    /* Registrada a las 20:30 de Pucallpa: en UTC ya es el 27, en el papel va el 26. */
    expect(plazoDeLaSalida("2026-10-26", "2026-10-27T01:30:00.000Z", "2026-10-27").texto).toContain("el 26/10/2026");
  });
});
