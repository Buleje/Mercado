import { describe, expect, it } from "vitest";
import {
  GuiaGuardadaInput,
  esFechaReal,
  fechaDeSerfor,
  fusionarConFicha,
  ingresoEsDeGuia,
  ordenarGuias,
  resumenDeFicha,
  type CamposDeGuia,
} from "@/lib/forestal/guias-guardadas";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { segmentoDeCarpeta } from "@/lib/forestal/documentos-guia";

const vacio: CamposDeGuia = {
  numeroRegistro: null,
  gtfNumber: null,
  gtfDate: null,
  titularNombre: null,
  titularDoc: null,
  permisoCodigo: null,
};

const ficha = {
  numeroRegistro: "110-19-0469779",
  gtfNumber: "019-001-0000003",
  fechaExpedicion: "12/09/2026",
  fechaVencimiento: "15/09/2026",
  titular: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
  numeroTitulo: "19-SEC/REG-PLT-2021-017",
  transportista: "JUAN PÉREZ",
  placa: "ABC-123",
  volumenTotal: 12.5,
  productos: [{ comun: "Tornillo", cientifico: null }],
  trozas: [
    { comun: "Tornillo", cientifico: null },
    { comun: "Copaiba", cientifico: null },
  ],
} as unknown as GtfSerfor;

describe("guías guardadas (ADR-442)", () => {
  it("la ficha oficial manda en GTF, titular, permiso y fecha, y dice qué corrigió", () => {
    const { campos, corregidos } = fusionarConFicha(
      { ...vacio, gtfNumber: "19-1-3", titularNombre: "Santa Rosa", titularDoc: "20100000001" },
      ficha,
      "20999999999",
    );
    expect(campos).toEqual({
      numeroRegistro: "110-19-0469779",
      gtfNumber: "019-001-0000003",
      gtfDate: "2026-09-12",
      titularNombre: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
      /* Lo tipeado a mano gana sobre el documento deducido de la ficha. */
      titularDoc: "20100000001",
      permisoCodigo: "19-SEC/REG-PLT-2021-017",
    });
    expect(corregidos).toHaveLength(2);
    expect(corregidos[0]).toContain("N° de GTF");
  });

  it("sin ficha queda lo tipeado; lo que coincide sin importar mayúsculas no se reporta", () => {
    const tip = { ...vacio, gtfNumber: "A-1" };
    expect(fusionarConFicha(tip, null)).toEqual({ campos: tip, corregidos: [] });
    const r = fusionarConFicha({ ...vacio, titularNombre: "comunidad nativa santa rosa de chivis" }, ficha);
    expect(r.corregidos).toEqual([]);
  });

  it("la fecha de SERFOR pasa a AAAA-MM-DD; otra forma no se adivina", () => {
    expect(fechaDeSerfor("01/08/2026")).toBe("2026-08-01");
    expect(fechaDeSerfor("2026-08-01")).toBeNull();
    expect(fechaDeSerfor(null)).toBeNull();
  });

  it("el resumen junta especies sin repetir", () => {
    expect(resumenDeFicha(ficha)).toEqual({
      especies: ["Tornillo", "Copaiba"],
      volumenM3: 12.5,
      trozas: 2,
      fechaVencimiento: "15/09/2026",
      transportista: "JUAN PÉREZ",
      placa: "ABC-123",
    });
    expect(resumenDeFicha(null)).toBeNull();
  });

  it("un ingreso es de la guía por su GTF o por su N° de registro", () => {
    const guia = { gtfNumber: "019-001-0000003", numeroRegistro: "110-19-0469779" };
    expect(ingresoEsDeGuia({ gtfNumber: " 019-001-0000003 ", serforNumeroRegistro: null }, guia)).toBe(true);
    expect(ingresoEsDeGuia({ gtfNumber: "19-1-3", serforNumeroRegistro: "110-19-0469779" }, guia)).toBe(true);
    /* Desde el 28-09 la GTF se compara tramo a tramo: «19-1-3» ES «019-001-0000003»
       (el talonario y SERFOR escriben el mismo papel distinto). Otra GTF y
       otro registro, en cambio, no es la guía. */
    expect(ingresoEsDeGuia({ gtfNumber: "19-1-3", serforNumeroRegistro: null }, guia)).toBe(true);
    expect(ingresoEsDeGuia({ gtfNumber: "19-1-4", serforNumeroRegistro: "110190469779" }, guia)).toBe(false);
    expect(ingresoEsDeGuia({ gtfNumber: "19-2-3", serforNumeroRegistro: null }, guia)).toBe(false);
    expect(
      ingresoEsDeGuia({ gtfNumber: "X", serforNumeroRegistro: null }, { gtfNumber: "Y", numeroRegistro: null }),
    ).toBe(false);
  });

  it("por ingresar primero, después lo más nuevo", () => {
    const g = ordenarGuias([
      { id: "a", ingreso: { en: "x" }, createdAt: "2026-09-27" },
      { id: "b", ingreso: null, createdAt: "2026-09-20" },
      { id: "c", ingreso: null, createdAt: "2026-09-25" },
    ]);
    expect(g.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("el esquema: vacío = null, campo ausente = ausente (un PATCH parcial no pisa)", () => {
    const r = GuiaGuardadaInput.safeParse({ titularNombre: "  ", notas: "hola" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.titularNombre).toBeNull();
    expect("gtfNumber" in r.data).toBe(false);
    expect(GuiaGuardadaInput.safeParse({ gtfDate: "12/09/2026" }).success).toBe(false);
  });

  it("la GTF lleva números: una «GTF» Tornillo se quedaba con lo archivado de esa especie", () => {
    expect(GuiaGuardadaInput.safeParse({ gtfNumber: "Tornillo" }).success).toBe(false);
    expect(GuiaGuardadaInput.safeParse({ gtfNumber: "019-001-0000003" }).success).toBe(true);
  });

  it("una fecha que no existe no pasa (Date la corría al mes siguiente)", () => {
    expect(esFechaReal("2026-02-31")).toBe(false);
    expect(esFechaReal("9999-99-99")).toBe(false);
    expect(esFechaReal("2026-09-27")).toBe(true);
    expect(GuiaGuardadaInput.safeParse({ gtfDate: "2026-02-31" }).success).toBe(false);
  });

  it("el nombre de carpeta cabe en los 80 que guarda el Drive y no termina en punto", () => {
    const s = segmentoDeCarpeta("A".repeat(79) + ". B");
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith(".")).toBe(false);
  });
});
