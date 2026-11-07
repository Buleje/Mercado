/**
 * ADR-503 — permiso por archivo al importar el libro: la regla PURA.
 *
 * Sólo se llena lo vacío; la fila que trae otro permiso lo conserva
 * (`conflicto`); la corrida que consumió hereda; la guía ya guardada sigue a
 * `planearTitulo` (mes cerrado y anulados mandan). El proveedor de relleno de
 * la Sección 1 pasa a ser el titular del permiso, nunca la marca del patio.
 */
import { describe, expect, it } from "vitest";
import {
  decidirPermisoFila,
  esProveedorDeRelleno,
  fuenteDelRelleno,
  mismaResolucion,
  permisoDeGuiaExistente,
  permisoDeLaDecision,
  permisoParaImport,
  proveedorDelPermiso,
  rescatarFuenteDelRelleno,
  resumirPermiso,
  type PermisoParaImport,
} from "@/lib/forestal/asignar-permiso-import";
import { planearTitulo, type IngresoParaTitulo } from "@/lib/forestal/titulo-de-guia";
import { PROVEEDOR_INVENTARIO_APERTURA, proveedorDesdeFormato } from "@/lib/forestal/ctp-serfor-a-libro";

const PERMISO: PermisoParaImport = {
  contratoId: "c1",
  codigo: "PER-FMP-2024-0012",
  resolucion: "R.D. 045-2024",
  titular: "Comunidad Nativa Santa Rosa",
  ruc: "20601234567",
};

describe("permisoParaImport (del catálogo al permiso del archivo)", () => {
  it("«—» no es un titular y el RUC sólo vale con 11 dígitos y tipo RUC (o sin tipo)", () => {
    const base = { id: "c1", codigo: " PER-1 ", resolucionNumero: "  ", titularNombre: "—", titularDoc: "20 6012 34567", titularDocTipo: null };
    expect(permisoParaImport(base)).toEqual({ contratoId: "c1", codigo: "PER-1", resolucion: null, titular: null, ruc: "20601234567" });
    expect(permisoParaImport({ ...base, titularDocTipo: "DNI" }).ruc).toBeNull();
    expect(permisoParaImport({ ...base, titularDoc: "4512345" }).ruc).toBeNull();
    expect(permisoParaImport({ ...base, titularNombre: "Juan Pérez", titularDocTipo: "ruc" }).titular).toBe("Juan Pérez");
  });
});

describe("decidirPermisoFila (fila nueva)", () => {
  it("vacía → asignado: código, resolución del permiso y vínculo", () => {
    expect(decidirPermisoFila({ codigo: "  " }, PERMISO)).toEqual({
      estado: "asignado",
      escribir: { originCode: "PER-FMP-2024-0012", originSourceNumber: "R.D. 045-2024", contratoId: "c1" },
    });
  });

  it("vacía con OTRA resolución → conflicto: no se le escribe el código ajeno (reviewer 19-10)", () => {
    const d = decidirPermisoFila({ resolucion: "R.D. 999" }, PERMISO);
    expect(d).toEqual({ estado: "conflicto", delArchivo: "R.D. 999", motivo: "la fila trae otra resolución", escribir: null });
    expect(permisoDeLaDecision(d)).toEqual({ estado: "conflicto", delArchivo: "R.D. 999", motivo: "la fila trae otra resolución" });
  });

  it("vacía con la MISMA resolución escrita distinto → asignado, queda su texto", () => {
    const d = decidirPermisoFila({ resolucion: "RD N° 045-2024" }, PERMISO);
    expect(d.estado).toBe("asignado");
    expect(d.escribir?.originSourceNumber).toBe("RD N° 045-2024");
  });

  it("vacía con el CÓDIGO del permiso en la resolución → no lo contradice", () => {
    expect(decidirPermisoFila({ resolucion: "PER-FMP-2024-0012" }, PERMISO).estado).toBe("asignado");
  });

  it("vacía con resolución propia y un permiso SIN resolución → conserva la suya", () => {
    expect(decidirPermisoFila({ resolucion: "R.D. 999" }, { ...PERMISO, resolucion: null }).escribir?.originSourceNumber).toBe("R.D. 999");
  });

  it("mismo código escrito distinto → ya-tenia: queda su texto, se vincula", () => {
    const d = decidirPermisoFila({ codigo: "per-fmp-2024-0012" }, PERMISO);
    expect(d.estado).toBe("ya-tenia");
    expect(d.escribir).toEqual({ originCode: "per-fmp-2024-0012", originSourceNumber: "R.D. 045-2024", contratoId: "c1" });
  });

  it("los espacios internos no hacen otro permiso (normalizarCodigoContrato)", () => {
    expect(decidirPermisoFila({ codigo: "PER-FMP-2024-0012 " }, { ...PERMISO, codigo: "PER-FMP-2024-0012" }).estado).toBe("ya-tenia");
    expect(decidirPermisoFila({ codigo: "CON  25" }, { ...PERMISO, codigo: "con 25" }).estado).toBe("ya-tenia");
  });

  it("otro código → conflicto: no se escribe nada y se dice cuál traía", () => {
    expect(decidirPermisoFila({ codigo: "CON-25-UCA-0207" }, PERMISO)).toEqual({
      estado: "conflicto",
      delArchivo: "CON-25-UCA-0207",
      escribir: null,
    });
  });

  it("corrida que consumió → hereda, aunque esté vacía", () => {
    expect(decidirPermisoFila({ consume: true }, PERMISO)).toEqual({ estado: "hereda", escribir: null });
  });
});

describe("permisoDeGuiaExistente (guía ya guardada → planearTitulo)", () => {
  const ing = (p: Partial<IngresoParaTitulo> & { id: string }): IngresoParaTitulo => ({
    especie: "Tornillo", status: "validado", anulado: false, originCode: null, originSourceNumber: null, contratoId: null, periodoCerrado: null, ...p,
  });
  const pedido = { originCode: PERMISO.codigo, originSourceNumber: PERMISO.resolucion, contratoId: PERMISO.contratoId };
  const estado = (ingresos: IngresoParaTitulo[], opts?: Parameters<typeof permisoDeGuiaExistente>[2]) =>
    permisoDeGuiaExistente(ingresos, planearTitulo(ingresos, pedido), opts);

  it("vacía → asignado", () => {
    expect(estado([ing({ id: "w1" })])).toEqual({ estado: "asignado" });
  });

  it("con el mismo código (aunque sin vínculo) → ya-tenia", () => {
    expect(estado([ing({ id: "w1", originCode: "per-fmp-2024-0012" })])).toEqual({ estado: "ya-tenia" });
  });

  it("con OTRO código → conflicto con el código de la base", () => {
    expect(estado([ing({ id: "w1", originCode: "CON-25-UCA-0207" })])).toEqual({ estado: "conflicto", delArchivo: "CON-25-UCA-0207" });
  });

  it("mes cerrado → conflicto con motivo (no se aplicó)", () => {
    const r = estado([ing({ id: "w1", periodoCerrado: "setiembre 2026" })]);
    expect(r.estado).toBe("conflicto");
    expect(r.motivo).toContain("mes cerrado");
  });

  it("mira la especie de la fila: la otra especie de la guía no decide", () => {
    const guia = [ing({ id: "w1", especie: "Tornillo" }), ing({ id: "w2", especie: "Cumala", originCode: "OTRO-1" })];
    expect(estado(guia, { especie: "cumala" }).estado).toBe("conflicto");
    expect(estado(guia, { especie: "Tornillo" }).estado).toBe("asignado");
    /* Sin ingreso de esa especie, cuenta la guía entera: alguno recibió. */
    expect(estado(guia, { especie: "Capirona" }).estado).toBe("asignado");
  });

  it("lo que `declarar` no llegó a escribir (otra pantalla) no se cuenta como asignado", () => {
    const r = estado([ing({ id: "w1" })], { escritos: new Set() });
    expect(r).toEqual({ estado: "conflicto", delArchivo: null, motivo: "otra pantalla lo completó antes" });
  });
});

describe("proveedor: el relleno de la Sección 1 → titular del permiso", () => {
  it("reconoce TODO lo que arma proveedorDesdeFormato", () => {
    for (const datos of [
      { codigoOrigen: "PER-1", numeroDocumento: "019-0001" },
      { fuenteOrigen: "R.D. 1", numeroDocumento: "019-0001" },
      { numeroDocumento: "019-0001" },
      {},
    ]) {
      expect(esProveedorDeRelleno(proveedorDesdeFormato(datos), "019-0001")).toBe(true);
    }
  });

  it("la marca del inventario de patio y un nombre real NO son relleno", () => {
    expect(esProveedorDeRelleno(PROVEEDOR_INVENTARIO_APERTURA, "019-0001")).toBe(false);
    expect(esProveedorDeRelleno("Maderera El Aguajal S.A.C.", "019-0001")).toBe(false);
  });

  it("asignado/ya-tenia con titular → titular + SU RUC; conflicto o sin titular → se deja", () => {
    expect(proveedorDelPermiso("Origen PER-1 · 019-0001", "019-0001", PERMISO, "asignado")).toEqual({
      providerName: "Comunidad Nativa Santa Rosa",
      providerDocument: "20601234567",
      providerDocumentType: "RUC",
    });
    expect(proveedorDelPermiso("019-0001", "019-0001", { ...PERMISO, ruc: null }, "ya-tenia")).toEqual({
      providerName: "Comunidad Nativa Santa Rosa",
      providerDocument: null,
      providerDocumentType: null,
    });
    expect(proveedorDelPermiso("Origen X · 019-0001", "019-0001", PERMISO, "conflicto")).toBeNull();
    expect(proveedorDelPermiso("Origen X · 019-0001", "019-0001", { ...PERMISO, titular: null }, "asignado")).toBeNull();
    expect(proveedorDelPermiso(PROVEEDOR_INVENTARIO_APERTURA, "019-0001", PERMISO, "asignado")).toBeNull();
  });
});

describe("resumirPermiso", () => {
  it("cuenta por estado", () => {
    expect(
      resumirPermiso("PER-1", [{ estado: "asignado" }, { estado: "asignado" }, { estado: "ya-tenia" }, { estado: "conflicto" }, { estado: "hereda" }]),
    ).toEqual({ codigo: "PER-1", asignadas: 2, yaTenian: 1, conflictos: 1, heredan: 1 });
  });
});

describe("mismaResolucion (la de la fila vs la del permiso)", () => {
  it("la misma escrita distinto", () => {
    expect(mismaResolucion("R.A N° D000485-2024", "D000485-2024")).toBe(true);
    expect(mismaResolucion("R.A N° D000485-2024", "RA Nº D000485-2024")).toBe(true);
    expect(mismaResolucion("R.D. 045-2024", "RD 45-2024")).toBe(true);
  });
  it("otra", () => {
    expect(mismaResolucion("R.D. 045-2024", "QA-RES-503")).toBe(false);
    expect(mismaResolucion("R.D. 045-2024", "R.D. 046-2024")).toBe(false);
  });
});

describe("la fuente del relleno («Origen X · GTF») no se pierde (reviewer 19-10)", () => {
  const RELLENO = "Origen R.A N° D000485-2024 · 019-001-0000001";

  it("fuenteDelRelleno saca la X; un nombre real no tiene", () => {
    expect(fuenteDelRelleno(RELLENO)).toBe("R.A N° D000485-2024");
    expect(fuenteDelRelleno(proveedorDesdeFormato({ fuenteOrigen: "R.A 12", numeroDocumento: "019-9" }))).toBe("R.A 12");
    expect(fuenteDelRelleno("Maderera El Aguajal SAC")).toBeNull();
  });

  it("resolución vacía → la fuente va a la resolución", () => {
    expect(rescatarFuenteDelRelleno({ providerName: RELLENO })).toEqual({
      originSourceNumber: "R.A N° D000485-2024",
      notes: null,
      fuente: "R.A N° D000485-2024",
      guardadaEn: "resolucion",
    });
  });

  it("resolución ocupada con otra → la fuente va a las notas, sin borrar las suyas", () => {
    expect(rescatarFuenteDelRelleno({ providerName: RELLENO, originSourceNumber: "R.D. 045-2024", notes: "Código CTP 3012264" })).toEqual({
      originSourceNumber: "R.D. 045-2024",
      notes: "Código CTP 3012264 · Fuente de origen: R.A N° D000485-2024",
      fuente: "R.A N° D000485-2024",
      guardadaEn: "notas",
    });
  });

  it("ya está en la resolución, en el código o en las notas → no se repite", () => {
    expect(rescatarFuenteDelRelleno({ providerName: RELLENO, originSourceNumber: "R.A N° D000485-2024" }).guardadaEn).toBeNull();
    expect(rescatarFuenteDelRelleno({ providerName: "Origen PER-FMP-2024-0012 · 019-1", originCode: "PER-FMP-2024-0012" }).guardadaEn).toBeNull();
    expect(rescatarFuenteDelRelleno({ providerName: "Origen 33/B (0000010) · 019-1", notes: "Código CTP 1 · Origen 33/B (0000010)" }).guardadaEn).toBeNull();
  });

  it("sin relleno no toca nada", () => {
    expect(rescatarFuenteDelRelleno({ providerName: "Comunidad Nativa Santa Rosa", originSourceNumber: null, notes: null }).guardadaEn).toBeNull();
  });
});
