/**
 * CSV de la pestaña Ingresos — lo que el operador abre en Excel.
 *
 * Se testea el contenido (no el download): separador, escapes, fechas date-only
 * en UTC y el pie con los totales. Un CSV que abre corrido o con la fecha
 * corrida un día es un registro fiscalizable mal transcripto.
 */
import { describe, expect, it } from "vitest";
import { celdaCsv, ingresosACsv, nombreArchivoIngresos } from "@/lib/forestal/ctp-ingresos-csv";
import type { WoodEntry } from "@/components/admin/forestal/ctp-shared";

const base: WoodEntry = {
  id: "e1",
  // Campos oficiales del LO-CTP (ADR-311).
  libroNro: 121,
  docType: "GTF",
  originSourceNumber: "RD-SD-549",
  ctpProductCode: null,
  unit: "m3",
  entryDate: "2026-05-26T00:00:00.000Z",
  serforNumeroRegistro: null,
  gtfNumber: "001-0000121",
  gtfDate: "2026-05-25T00:00:00.000Z",
  gtfSeries: null,
  providerName: "Maderera El Aguajal SAC",
  providerDocument: "20123456789",
  providerDocumentType: "RUC",
  originType: "concesion",
  originCode: "16-PUC/C-J-001-03",
  originRegion: "Ucayali",
  originDistrict: "Callería",
  speciesCommonName: "Shihuahuaco",
  speciesScientificName: "Dipteryx micrantha",
  speciesCites: true,
  productType: "rolliza",
  volumeM3: "5.2000",
  pieces: 7,
  avgLengthM: "8.50",
  avgDiameterCm: "62.0",
  humidityPct: null,
  defectsNotes: null,
  notes: null,
  photos: null,
  status: "validado",
  validatedBy: "qaadmin",
  validatedAt: "2026-05-27T14:00:00.000Z",
  rejectionReason: null,
  createdBy: "qaadmin",
  createdAt: "2026-05-30T10:15:00.000Z",
};

const otra: WoodEntry = {
  ...base,
  id: "e2",
  gtfNumber: "001-0000120",
  speciesCommonName: "Tornillo",
  speciesCites: false,
  volumeM3: "8.4500",
  pieces: 12,
  notes: 'Trae "coma, y comillas"',
};

const lineas = (csv: string) => csv.split("\r\n");
const celdas = (linea: string) => linea.split(";");

describe("celdaCsv", () => {
  it("entrecomilla sólo cuando hace falta y duplica las comillas internas", () => {
    expect(celdaCsv("Tornillo")).toBe("Tornillo");
    expect(celdaCsv("Aguajal; SAC")).toBe('"Aguajal; SAC"');
    expect(celdaCsv('dijo "listo"')).toBe('"dijo ""listo"""');
    expect(celdaCsv(null)).toBe("");
  });

  it("la coma NO entrecomilla: el separador es ; y los decimales van con coma", () => {
    expect(celdaCsv("13,6500")).toBe("13,6500");
    expect(celdaCsv("Aguajal, SAC")).toBe("Aguajal, SAC");
  });
});

describe("ingresosACsv", () => {
  it("una fila por ingreso más cabecera y pie de totales", () => {
    const out = lineas(ingresosACsv([base, otra]));
    expect(out).toHaveLength(4);
    expect(celdas(out[0])[0]).toBe("Fecha operación");
    expect(out[3]).toContain("TOTAL (2 ingresos)");
  });

  it("suma volumen y piezas en el pie, con coma decimal (Excel es-PE)", () => {
    const pie = celdas(lineas(ingresosACsv([base, otra])).at(-1)!);
    expect(pie[14]).toBe("13,6500"); // 5.20 + 8.45
    expect(pie[15]).toBe("19");
  });

  it("la fecha date-only NO se corre un día al formatearse (bug Lima UTC-5)", () => {
    const fila = celdas(lineas(ingresosACsv([base]))[1]);
    expect(fila[0]).toBe("26/05/2026");
    expect(fila[2]).toBe("25/05/2026");
  });

  it("marca CITES en texto legible y respeta las etiquetas que le pasa la vista", () => {
    const fila = celdas(lineas(ingresosACsv([base], {
      origenLabel: () => "Concesión forestal",
      productoLabel: () => "Rolliza",
      estadoLabel: () => "Validado",
    }))[1]);
    expect(fila[12]).toBe("SÍ");
    expect(fila[6]).toBe("Concesión forestal");
    expect(fila[13]).toBe("Rolliza");
    expect(fila[19]).toBe("Validado");
  });

  it("un valor con comillas o punto y coma no rompe las columnas", () => {
    const fila = lineas(ingresosACsv([otra]))[1];
    expect(fila).toContain('"Trae ""coma, y comillas"""');
    // 25 columnas ⇒ 24 separadores fuera de las comillas.
    expect(celdas(fila)).toHaveLength(25);
  });

  it("sin ingresos igual sale la cabecera y un total en cero", () => {
    const out = lineas(ingresosACsv([]));
    expect(out).toHaveLength(2);
    expect(out[1]).toContain("TOTAL (0 ingresos)");
  });
});

describe("nombreArchivoIngresos", () => {
  it("mete el período (sin tildes ni espacios) y el filtro en el nombre", () => {
    expect(nombreArchivoIngresos("May–Jul 2026")).toBe("ingresos-ctp-may-jul-2026.csv");
    expect(nombreArchivoIngresos("Mayo 2026", "pendiente")).toBe("ingresos-ctp-mayo-2026-pendiente.csv");
  });
});
