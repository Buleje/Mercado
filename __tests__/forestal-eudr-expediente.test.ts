/**
 * Expediente EUDR: lo que se le entrega al comprador europeo.
 * Se testea el CONTENIDO (que es lo que se audita), no el zip.
 */
import { describe, expect, it } from "vitest";
import {
  cadenaCsv, construirExpedienteEudr, geoJsonDelDespacho, lineaTitulo, nombreExpediente, slugArchivo,
} from "@/lib/forestal/eudr-expediente";
import type { DdsData } from "@/lib/forestal/eudr-types";

const PLOT = {
  originCode: "CFP-25-UCA/001",
  originType: "concesión",
  region: "Ucayali",
  lat: -8.383333,
  lng: -74.533333,
  hasPolygon: false,
  pais: "PE",
  deforestationFree: true,
  gtfs: ["001-0000120"],
  especies: ["Tornillo"],
  cites: false,
  sinGeo: false,
};

const DDS: DdsData = {
  despachoId: "cmpqatcuc0003",
  producto: "Madera aserrada",
  especie: "Tornillo",
  cantidad: 12.5,
  unidad: "m3",
  destino: "Importadora Rotterdam BV",
  gtfSalida: "19-001-0000052",
  pais: "PE",
  plots: [PLOT],
  trazabilidadCompleta: true,
  geoCompleta: true,
  deforestationFreeTotal: true,
  cites: false,
  riesgo: "negligible",
  gaps: [],
  generadoAt: "2026-07-25T15:00:00.000Z",
};

const EMISOR = { razonSocial: "Maderera San Martín SAC", ruc: "20512345678", codigoCtp: "CTP-25-000123", arffs: "GORE Ucayali" };

describe("construirExpedienteEudr", () => {
  it("entrega los cinco documentos y el LEEME los nombra a todos", () => {
    const files = construirExpedienteEudr(DDS, EMISOR, { ddsHtml: "<html>dds</html>", baseUrl: "https://bodega.pe" });
    const nombres = files.map((f) => f.nombre);
    expect(nombres).toEqual([
      "LEEME.txt", "01-declaracion-dds.html", "02-parcelas.geojson",
      "03-cadena-de-custodia.csv", "04-operador.txt", "05-verificacion.txt",
    ]);
    const leeme = files[0].contenido;
    for (const n of nombres.slice(1)) expect(leeme).toContain(n);
  });

  it("el riesgo no negligible se dice en el LEEME, con los gaps", () => {
    const files = construirExpedienteEudr(
      { ...DDS, riesgo: "no_negligible", gaps: ["1 origen sin geolocalizar"] },
      EMISOR,
      { ddsHtml: "" },
    );
    expect(files[0].contenido).toContain("NO NEGLIGIBLE");
    expect(files[0].contenido).toContain("1 origen sin geolocalizar");
  });

  it("sin baseUrl no promete un enlace de verificación que no existe", () => {
    const files = construirExpedienteEudr(DDS, EMISOR, { ddsHtml: "" });
    expect(files.map((f) => f.nombre)).not.toContain("05-verificacion.txt");
    expect(files[0].contenido).not.toContain("05-verificacion");
  });

  it("el enlace de verificación apunta al despacho, sin barra doble", () => {
    const files = construirExpedienteEudr(DDS, EMISOR, { ddsHtml: "", baseUrl: "https://bodega.pe/" });
    const v = files.find((f) => f.nombre === "05-verificacion.txt")!.contenido;
    expect(v).toContain("https://bodega.pe/verificar/despacho/cmpqatcuc0003");
  });
});

describe("geoJsonDelDespacho", () => {
  it("un punto sale como Point en orden lng,lat (GeoJSON, no lat,lng)", () => {
    const fc = JSON.parse(geoJsonDelDespacho(DDS));
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features[0].geometry).toEqual({ type: "Point", coordinates: [-74.533333, -8.383333] });
    expect(fc.features[0].properties.corteEudr).toBe("2020-12-31");
  });

  it("el polígono declarado gana sobre el punto", () => {
    const poly = JSON.stringify({ type: "Polygon", coordinates: [[[-74.5, -8.3], [-74.4, -8.3], [-74.4, -8.2], [-74.5, -8.3]]] });
    const fc = JSON.parse(geoJsonDelDespacho({ ...DDS, plots: [{ ...PLOT, hasPolygon: true, polygonJson: poly }] }));
    expect(fc.features[0].geometry.type).toBe("Polygon");
  });

  it("un polígono ilegible cae al punto en vez de romper el archivo", () => {
    const fc = JSON.parse(geoJsonDelDespacho({ ...DDS, plots: [{ ...PLOT, hasPolygon: true, polygonJson: "{no-json" }] }));
    expect(fc.features[0].geometry.type).toBe("Point");
  });

  it("un origen sin geo no inventa una coordenada", () => {
    const fc = JSON.parse(geoJsonDelDespacho({ ...DDS, plots: [{ ...PLOT, lat: null, lng: null, sinGeo: true }] }));
    expect(fc.features).toEqual([]);
  });
});

describe("cadenaCsv", () => {
  it("marca lo que NO está atestado y lo que no tiene geo", () => {
    const csv = cadenaCsv({ ...DDS, plots: [{ ...PLOT, deforestationFree: false, lat: null, lng: null, sinGeo: true }] });
    expect(csv).toContain("NO ATESTADO");
    expect(csv).toContain("SIN GEOLOCALIZAR");
  });

  it("una concesión con punto y coma en el nombre no corre las columnas", () => {
    const csv = cadenaCsv({ ...DDS, plots: [{ ...PLOT, originCode: 'CFP; "El Roble"' }] });
    expect(csv).toContain('"CFP; ""El Roble"""');
    expect(csv.split("\r\n")[1].split(";").length).toBeGreaterThan(5);
  });

  it("lleva BOM para que Excel no rompa los acentos", () => {
    expect(cadenaCsv(DDS).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("nombres de archivo", () => {
  it("el zip se identifica por la guía de salida", () => {
    expect(nombreExpediente(DDS)).toBe("expediente-eudr-19-001-0000052.zip");
  });
  it("slug sin barras, acentos ni espacios", () => {
    expect(slugArchivo("GTF 19/001 Ñandú")).toBe("gtf-19-001-nandu");
    expect(slugArchivo("")).toBe("despacho");
  });
});

describe("04-operador.txt", () => {
  it("lista los títulos habilitantes y no deja campos en blanco", () => {
    const files = construirExpedienteEudr(DDS, {
      ...EMISOR,
      registroArffs: "   ",
      titulos: [{ tipo: "concesion", codigo: "CFP-25-UCA/001", vencimiento: "2035-12-31" }],
    }, { ddsHtml: "" });
    const op = files.find((f) => f.nombre === "04-operador.txt")!.contenido;
    expect(op).toContain("Registro ante la ARFFS:  —");
    expect(op).toContain("concesion: CFP-25-UCA/001 · vence 2035-12-31");
  });

  it("sin títulos declarados lo dice, en vez de dejar la sección muda", () => {
    const op = construirExpedienteEudr(DDS, EMISOR, { ddsHtml: "" })
      .find((f) => f.nombre === "04-operador.txt")!.contenido;
    expect(op).toContain("no declaró títulos habilitantes");
  });
});

describe("títulos vencidos", () => {
  const TIT = [
    { tipo: "concesion", codigo: "CONC-25-001", vencimiento: "2025-01-01" },
    { tipo: "permiso", codigo: "PERM-26-088", vencimiento: "2027-12-31" },
  ];

  it("un título vencido se marca, no se lista como si nada", () => {
    expect(lineaTitulo(TIT[0], "2026-07-26")).toBe("  concesion: CONC-25-001 · VENCIDO el 2025-01-01");
    expect(lineaTitulo(TIT[1], "2026-07-26")).toBe("  permiso: PERM-26-088 · vence 2027-12-31");
    expect(lineaTitulo({ tipo: "predio", codigo: "P-1" }, "2026-07-26")).toBe("  predio: P-1");
  });

  it("el aviso sube al LEEME: nadie abre el 04 primero", () => {
    const files = construirExpedienteEudr(DDS, { ...EMISOR, titulos: TIT }, { ddsHtml: "", hoy: "2026-07-26" });
    expect(files[0].contenido).toContain("1 título(s) habilitante(s) del operador figuran VENCIDOS");
    expect(files.find((f) => f.nombre === "04-operador.txt")!.contenido).toMatch(/no ampara aprovechamiento nuevo/);
  });

  it("sin vencidos no inventa una alarma", () => {
    const files = construirExpedienteEudr(DDS, { ...EMISOR, titulos: [TIT[1]] }, { ddsHtml: "", hoy: "2026-07-26" });
    expect(files[0].contenido).not.toContain("VENCIDOS");
  });
});

