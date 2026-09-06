/**
 * Ficha del CTP — lo que la pantalla tiene que gritar y lo que no.
 *
 * El caso que motivó esto: un título habilitante vencido se veía como un chip
 * gris al lado del código, del mismo tamaño que el resto. Un título vencido
 * invalida el origen de toda la madera que ampara — no es un detalle de estilo.
 */
import { describe, expect, it } from "vitest";
import {
  avisosDeFicha, ctpFichaFaltantes, diasParaVencer, documentosVencimientoDeFicha, emptyCtpFicha, estadoVencimiento,
  fechaCortaUTC, requisitosFaltantes, rucValido, tituloDeGuia, type CtpFicha,
} from "@/lib/forestal/ctp-ficha-types";

/** 2026-08-12 12:00 UTC — "hoy" fijo para que los tests no dependan del reloj. */
const HOY = Date.UTC(2026, 7, 12, 12, 0, 0);

function ficha(over: Partial<CtpFicha> = {}): CtpFicha {
  return {
    ...emptyCtpFicha(),
    nombreCtp: "Aserradero San Martín",
    codigoCtp: "CTP-25-000123",
    ruc: "20512345671",
    razonSocial: "Maderera San Martín S.A.C.",
    arffs: "GORE Ucayali · DRSAFFS",
    representante: "Juan Pérez",
    direccion: "Carretera Federico Basadre Km 12",
    region: "Ucayali", provincia: "Coronel Portillo", distrito: "Callería",
    gtfSerie: "GTF-001",
    titulos: [{ tipo: "concesion", codigo: "CONC-001", resolucion: "R.A. 123-2024", planManejo: "PGMF", vencimiento: "2030-01-01" }],
    ...over,
  };
}

const claves = (f: CtpFicha) => avisosDeFicha(f, HOY).map((a) => a.clave);

describe("rucValido — dígito verificador de SUNAT", () => {
  it("acepta un RUC real (módulo 11 correcto)", () => {
    expect(rucValido("20100070970")).toBe(true); // RUC público de una empresa real
    expect(rucValido("20512345671")).toBe(true);
    expect(rucValido("10423456782")).toBe(true); // persona natural con negocio
  });

  it("rechaza un dígito cambiado: la longitud sola no alcanza", () => {
    expect("20512345678").toHaveLength(11);
    expect(rucValido("20512345678")).toBe(false);
  });

  it("rechaza prefijos que no son de contribuyente", () => {
    expect(rucValido("99512345678")).toBe(false);
  });

  it("rechaza lo que no son 11 dígitos", () => {
    expect(rucValido("2051234567")).toBe(false);
    expect(rucValido("")).toBe(false);
    expect(rucValido("205123456AB")).toBe(false);
  });
});

describe("fechas date-only", () => {
  it("formatea en UTC: con la hora de Lima se leería el día anterior", () => {
    expect(fechaCortaUTC("2026-01-01")).toContain("2026");
    expect(fechaCortaUTC("2026-01-01")).toContain("01");
    expect(fechaCortaUTC("")).toBe("");
  });

  it("diasParaVencer da negativo para lo ya vencido", () => {
    expect(diasParaVencer("2026-08-02", HOY)).toBeLessThan(0);
    expect(diasParaVencer("2026-09-11", HOY)).toBeGreaterThan(20);
    expect(diasParaVencer("", HOY)).toBeNull();
  });

  it("estadoVencimiento sigue siendo la misma regla (≤30 días = por vencer)", () => {
    expect(estadoVencimiento("2026-08-01", HOY)).toBe("vencido");
    expect(estadoVencimiento("2026-08-30", HOY)).toBe("por_vencer");
    expect(estadoVencimiento("2027-01-01", HOY)).toBe("vigente");
    expect(estadoVencimiento("", HOY)).toBeNull();
  });
});

describe("documentosVencimientoDeFicha — single source con el cron forestal-plazos", () => {
  it("sin ficha no revienta, devuelve listas vacías", () => {
    expect(documentosVencimientoDeFicha(null, HOY)).toEqual({ vencidosLabels: [], porVencerLabels: [] });
    expect(documentosVencimientoDeFicha(undefined, HOY)).toEqual({ vencidosLabels: [], porVencerLabels: [] });
  });

  it("un título vencido entra a vencidosLabels con su código", () => {
    const f = ficha({ titulos: [{ tipo: "concesion", codigo: "TH-004", resolucion: "", planManejo: "", vencimiento: "2026-08-01" }] });
    const r = documentosVencimientoDeFicha(f, HOY);
    expect(r.vencidosLabels).toEqual(["TH-004"]);
    expect(r.porVencerLabels).toEqual([]);
  });

  it("un permiso CITES por vencer (≤30 días) entra a porVencerLabels con los días", () => {
    const f = ficha({ citesPermisos: [{ especie: "Caoba", numero: "P-1", vencimiento: "2026-08-30" }] });
    const r = documentosVencimientoDeFicha(f, HOY);
    expect(r.vencidosLabels).toEqual([]);
    expect(r.porVencerLabels[0]).toContain("CITES Caoba");
    expect(r.porVencerLabels[0]).toMatch(/\(\d+ días?\)/);
  });

  it("un título vigente (fuera de la ventana de 30 días) no entra a ninguna lista", () => {
    const f = ficha({ titulos: [{ tipo: "concesion", codigo: "TH-VIGENTE", resolucion: "", planManejo: "", vencimiento: "2030-01-01" }] });
    const r = documentosVencimientoDeFicha(f, HOY);
    expect(r.vencidosLabels).toEqual([]);
    expect(r.porVencerLabels).toEqual([]);
  });

  it("sin fecha de vencimiento cargada, no se inventa un estado", () => {
    const f = ficha({ titulos: [{ tipo: "concesion", codigo: "TH-SIN-FECHA", resolucion: "", planManejo: "", vencimiento: "" }] });
    const r = documentosVencimientoDeFicha(f, HOY);
    expect(r.vencidosLabels).toEqual([]);
    expect(r.porVencerLabels).toEqual([]);
  });
});

describe("tituloDeGuia — el que se imprime en la GTF", () => {
  it("es el primero de la lista (lo mismo que lee ctp-gtf-formato)", () => {
    const f = ficha({
      titulos: [
        { tipo: "permiso", codigo: "PER-9", resolucion: "", planManejo: "", vencimiento: "" },
        { tipo: "concesion", codigo: "CONC-1", resolucion: "", planManejo: "", vencimiento: "" },
      ],
    });
    expect(tituloDeGuia(f)?.codigo).toBe("PER-9");
  });

  it("null si no hay títulos (no rompe)", () => {
    expect(tituloDeGuia(ficha({ titulos: [] }))).toBeNull();
    expect(tituloDeGuia(null)).toBeNull();
  });

  /** El bug que motivó esto: el operador elegía el 2° título en el formulario
   *  de la guía, se guardaba en `GtfDatos.titulos`, y el papel imprimía el 1°.
   *  La guía declaraba un origen distinto del que el operador eligió. */
  it("el título ELEGIDO en la guía manda sobre el predeterminado de la Ficha", () => {
    const f = ficha({
      titulos: [
        { tipo: "concesion", codigo: "CONC-1", resolucion: "R1", planManejo: "PGMF", vencimiento: "" },
        { tipo: "permiso", codigo: "PER-2", resolucion: "R2", planManejo: "DEMA", vencimiento: "" },
      ],
    });
    const elegido = tituloDeGuia(f, "PER-2");
    expect(elegido?.codigo).toBe("PER-2");
    expect(elegido?.resolucion).toBe("R2");   // (8) sale del título elegido
    expect(elegido?.planManejo).toBe("DEMA"); // (9) también
  });

  it("el código elegido se compara sin mayúsculas ni espacios", () => {
    const f = ficha({ titulos: [{ tipo: "permiso", codigo: "PER-2", resolucion: "R2", planManejo: "DEMA", vencimiento: "" }] });
    expect(tituloDeGuia(f, "  per-2 ")?.resolucion).toBe("R2");
  });

  it("un código tipeado a mano se imprime igual, con (8) y (9) VACÍOS", () => {
    const f = ficha({ titulos: [{ tipo: "concesion", codigo: "CONC-1", resolucion: "R1", planManejo: "PGMF", vencimiento: "" }] });
    const t = tituloDeGuia(f, "OTRO-999");
    expect(t?.codigo).toBe("OTRO-999");
    // Nunca los datos de OTRO título: eso declararía un origen falso.
    expect(t?.resolucion).toBe("");
    expect(t?.planManejo).toBe("");
  });

  it("sin elegido (vista previa de la Ficha) cae al predeterminado", () => {
    const f = ficha({
      titulos: [
        { tipo: "concesion", codigo: "CONC-1", resolucion: "R1", planManejo: "PGMF", vencimiento: "" },
        { tipo: "permiso", codigo: "PER-2", resolucion: "R2", planManejo: "DEMA", vencimiento: "" },
      ],
    });
    expect(tituloDeGuia(f, "")?.codigo).toBe("CONC-1");
    expect(tituloDeGuia(f, null)?.codigo).toBe("CONC-1");
  });
});

describe("avisosDeFicha", () => {
  it("una ficha completa y vigente no tiene nada que decir", () => {
    expect(avisosDeFicha(ficha(), HOY)).toEqual([]);
  });

  it("título vencido es CRÍTICO y dice desde cuándo", () => {
    const f = ficha({ titulos: [{ tipo: "concesion", codigo: "CONC-001", resolucion: "R", planManejo: "P", vencimiento: "2026-07-13" }] });
    const aviso = avisosDeFicha(f, HOY).find((a) => a.clave.startsWith("titulo-vencido"));
    expect(aviso?.nivel).toBe("critico");
    expect(aviso?.detalle).toContain("hace 30 días");
  });

  it("título por vencer avisa con los días exactos, no con un chip", () => {
    const f = ficha({ titulos: [{ tipo: "concesion", codigo: "CONC-001", resolucion: "R", planManejo: "P", vencimiento: "2026-08-25" }] });
    const aviso = avisosDeFicha(f, HOY).find((a) => a.clave.startsWith("titulo-por-vencer"));
    expect(aviso?.nivel).toBe("aviso");
    expect(aviso?.titulo).toContain("13 días");
  });

  it("CITES vencido avisa pero NUNCA es crítico (es legal con permiso)", () => {
    const f = ficha({ citesPermisos: [{ especie: "Caoba", numero: "CITES-1", vencimiento: "2026-01-01" }] });
    const aviso = avisosDeFicha(f, HOY).find((a) => a.clave.startsWith("cites-vencido"));
    expect(aviso?.nivel).toBe("aviso");
    expect(avisosDeFicha(f, HOY).some((a) => a.nivel === "critico")).toBe(false);
  });

  it("delata los casilleros (8) y (9) vacíos del título que va en la guía", () => {
    const f = ficha({ titulos: [{ tipo: "concesion", codigo: "CONC-001", resolucion: "", planManejo: "", vencimiento: "2030-01-01" }] });
    const aviso = avisosDeFicha(f, HOY).find((a) => a.clave === "gtf-casilleros");
    expect(aviso?.detalle).toContain("(8)");
    expect(aviso?.detalle).toContain("(9)");
  });

  it("mira SÓLO el título de la guía para los casilleros: el segundo no imprime", () => {
    const f = ficha({
      titulos: [
        { tipo: "concesion", codigo: "A", resolucion: "R", planManejo: "P", vencimiento: "2030-01-01" },
        { tipo: "permiso", codigo: "B", resolucion: "", planManejo: "", vencimiento: "2030-01-01" },
      ],
    });
    expect(claves(f)).not.toContain("gtf-casilleros");
  });

  it("un título sin fecha de vencimiento avisa: nadie podría alertar cuando caduque", () => {
    const f = ficha({ titulos: [{ tipo: "concesion", codigo: "CONC-001", resolucion: "R", planManejo: "P", vencimiento: "" }] });
    expect(claves(f).some((c) => c.startsWith("titulo-sin-vencimiento"))).toBe(true);
  });

  it("RUC con dígito cambiado se avisa (sale impreso en el certificado)", () => {
    expect(claves(ficha({ ruc: "20512345678" }))).toContain("ruc-invalido");
  });

  it("identidad incompleta es crítica y nombra los campos en castellano", () => {
    const f = ficha({ codigoCtp: "", razonSocial: "" });
    const aviso = avisosDeFicha(f, HOY).find((a) => a.clave === "identidad-incompleta");
    expect(aviso?.nivel).toBe("critico");
    expect(aviso?.detalle).toContain("Código de CTP");
    expect(aviso?.detalle).toContain("Razón social");
  });

  it("lo crítico va primero", () => {
    const f = ficha({
      ruc: "20512345678",
      titulos: [{ tipo: "concesion", codigo: "X", resolucion: "R", planManejo: "P", vencimiento: "2020-01-01" }],
    });
    expect(avisosDeFicha(f, HOY)[0]?.nivel).toBe("critico");
  });

  it("no repite lo mismo dos veces: los mínimos salen sólo como identidad incompleta", () => {
    const f = ficha({ razonSocial: "" });
    const cs = claves(f);
    expect(cs.filter((c) => c === "identidad-incompleta")).toHaveLength(1);
    // La GTF también usa razonSocial, pero no vuelve a listarla.
    expect(cs.some((c) => c === "doc:certificado")).toBe(false);
  });
});

describe("requisitosFaltantes — por documento, no por campo suelto", () => {
  it("una ficha vacía rompe los tres papeles", () => {
    const faltas = requisitosFaltantes(emptyCtpFicha());
    expect(faltas.map((f) => f.documento.clave).sort()).toEqual(["certificado", "gtf", "libro"]);
  });

  it("la GTF pide el título habilitante además de los campos", () => {
    const gtf = requisitosFaltantes(ficha({ titulos: [] })).find((f) => f.documento.clave === "gtf");
    expect(gtf?.faltan).toContain("título habilitante");
  });

  it("una ficha completa no le falta nada a ningún documento", () => {
    expect(requisitosFaltantes(ficha())).toEqual([]);
  });

  it("ctpFichaFaltantes sigue siendo el mínimo de 4 (lo usa WoodEntryForm)", () => {
    expect(ctpFichaFaltantes(emptyCtpFicha())).toEqual(["nombreCtp", "codigoCtp", "ruc", "razonSocial"]);
    expect(ctpFichaFaltantes(ficha())).toEqual([]);
  });
});
