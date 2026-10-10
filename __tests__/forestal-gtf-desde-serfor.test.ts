import { describe, expect, it } from "vitest";
import {
  claveOrigen,
  cuerpoDesdeSerfor,
  documentoGtfSerfor,
  estadoGtf,
  insumosDesdeSerfor,
  partirDimensiones,
  separarDocumento,
  trozasDesdeSerfor,
} from "@/lib/forestal/ctp-gtf-desde-serfor";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";

const guia = (over: Partial<GtfSerfor> = {}): GtfSerfor => ({
  numeroRegistro: "1-19-0313969",
  gtfNumber: "019-0000004",
  estado: "Activa",
  registradoPor: null, fechaRegistro: null,
  fechaExpedicion: "2024-12-18", fechaVencimiento: "2024-12-25",
  origenRecurso: "Permiso", numeroTitulo: "19-SEC/PER-FMC-2024-008",
  titular: "COMUNIDAD NATIVA SAN LUIS", direccionTitular: "CC.NN SAN LUIS",
  numeroResolucion: "R.A N° D000485-2024", representanteLegal: "OSVALDO MUÑOS",
  departamento: "PASCO", provincia: "OXAPAMPA", distrito: "PUERTO BERMUDEZ",
  rucInstancia: null, instanciaRegistra: "SERFOR - ATFFS SELVA CENTRAL",
  propietario: "COMUNIDAD NATIVA SAN LUIS", propietarioDoc: "20156701263",
  propietarioDireccion: "CC.NN", propietarioDepartamento: "PASCO",
  propietarioProvincia: "OXAPAMPA", propietarioDistrito: "PUERTO BERMUDEZ",
  destinatario: "INVERSIONES BLAS SAC", destinatarioDoc: "08186494",
  destinatarioDireccion: "JR. ARGUEDAS", destinatarioDepartamento: "PASCO",
  destinatarioProvincia: "OXAPAMPA", destinatarioDistrito: "CONSTITUCION",
  transportista: "RUBEN BAZAN", transportistaDni: "48831805",
  licenciaConducir: "Q48831805", guiaRemision: null,
  tipoTransporte: "Terrestre", tipoVehiculo: "Camión", placa: "V2H-901",
  listaTrozas: "019-0000004",
  productos: [{ cientifico: "Copaifera reticulata", comun: "Copaiba", tipoProducto: "Madera En Rollo", presentacion: "Trozas", cantidad: 2, unidad: "Metros Cúbicos", volumen: 10.607 }],
  trozas: [{ codificacion: "106/B", cientifico: "Copaifera reticulata", comun: "Copaiba", tipoProducto: "Madera En Rollo", presentacion: "Trozas", cantidad: 1, unidad: "m3", volumen: 5.133, dimensiones: "105.0 x 101.0 x 6.16" }],
  volumenTotal: 13.311,
  campos: {},
  ...over,
});

describe("claveOrigen — el texto de SERFOR al casillero (5)", () => {
  it("reconoce las categorías del formato", () => {
    expect(claveOrigen("Concesión")).toBe("concesion");
    expect(claveOrigen("PERMISO")).toBe("permiso");
    expect(claveOrigen("Plan de Manejo Consolidado")).toBe("plan_consolidado");
  });

  it("sin origen no cruza ninguna casilla", () => {
    expect(claveOrigen("")).toBe("");
    expect(claveOrigen(null)).toBe("");
  });

  it("un texto desconocido cae en 'otros', que existe en el formato", () => {
    expect(claveOrigen("Régimen especial X")).toBe("otros");
  });
});

describe("tipo de documento por longitud", () => {
  it("11 dígitos es RUC y 8 es DNI: la ficha no dice de qué tipo es", () => {
    // Meter un RUC en el casillero del DNI llena el campo equivocado.
    const { datos } = insumosDesdeSerfor(guia());
    expect(datos.propietario.docTipo).toBe("RUC");
    expect(datos.destinatario.docTipo).toBe("DNI");
  });
});

describe("partirDimensiones", () => {
  it("parte d1 × d2 × largo, el orden de la guía", () => {
    expect(partirDimensiones("105.0 x 101.0 x 6.16")).toEqual({ d1Cm: 105, d2Cm: 101, largoM: 6.16 });
  });

  it("acepta coma decimal y el signo ×", () => {
    expect(partirDimensiones("72,0 × 58,0 × 8,15")).toEqual({ d1Cm: 72, d2Cm: 58, largoM: 8.15 });
  });

  it("con dos o cuatro números NO adivina: deja vacío", () => {
    // Rellenar una medida mal es peor que dejar el casillero en blanco.
    expect(partirDimensiones("105 x 101")).toEqual({ d1Cm: null, d2Cm: null, largoM: null });
    expect(partirDimensiones("1 x 2 x 3 x 4")).toEqual({ d1Cm: null, d2Cm: null, largoM: null });
    expect(partirDimensiones(null)).toEqual({ d1Cm: null, d2Cm: null, largoM: null });
  });
});

describe("cuerpoDesdeSerfor", () => {
  it("usa el MISMO renderer: los casilleros son los del formato", () => {
    const html = cuerpoDesdeSerfor(guia());
    for (const n of ["(2)", "(8)", "(17)", "(26)", "(35)", "(39)"]) expect(html).toContain(n);
  });

  it("reproduce el estado y el N° que devolvió SERFOR", () => {
    // Acá SÍ corresponde: es lo que dice la autoridad, no un trámite fabricado.
    const html = cuerpoDesdeSerfor(guia());
    expect(html).toContain("ESTADO: REGISTRADA");
    expect(html).toContain("1-19-0313969");
  });

  it("una guía ANULADA no se reimprime como registrada", () => {
    const html = cuerpoDesdeSerfor(guia({ estado: "Anulada" }));
    expect(html).not.toContain("ESTADO: REGISTRADA");
  });

  it("trae la resolución en el (8) y la ubicación de las partes", () => {
    const html = cuerpoDesdeSerfor(guia());
    expect(html).toContain("R.A N° D000485-2024");
    expect(html).toContain("CONSTITUCION");
  });
});

describe("trozasDesdeSerfor", () => {
  it("mapea la troza con sus medidas partidas y su volumen declarado", () => {
    const [t] = trozasDesdeSerfor(guia());
    expect(t.codificacion).toBe("106/B");
    expect(t.especieComun).toBe("Copaiba");
    expect(t.d1Cm).toBe(105);
    expect(t.volumenM3).toBe(5.133);
  });

  it("una guía sin lista de trozas no rompe", () => {
    expect(trozasDesdeSerfor(guia({ trozas: [] }))).toEqual([]);
  });
});

describe("separarDocumento — la ficha trae RUC y DNI en el mismo campo", () => {
  it("los separa por longitud: 11 es RUC, 8 es DNI", () => {
    // Sin esto el (23) mostraba "20605859438 / 80186494" pegados y el (24)
    // quedaba vacío teniendo el RUC ahí al lado.
    expect(separarDocumento("20605859438 / 80186494")).toEqual({ ruc: "20605859438", dni: "80186494" });
  });

  it("con uno solo llena el que corresponde", () => {
    expect(separarDocumento("20156701263")).toEqual({ ruc: "20156701263", dni: "" });
    expect(separarDocumento("04314730")).toEqual({ ruc: "", dni: "04314730" });
  });

  it("vacío o basura no inventa números", () => {
    expect(separarDocumento("")).toEqual({ ruc: "", dni: "" });
    expect(separarDocumento(null)).toEqual({ ruc: "", dni: "" });
    expect(separarDocumento("no aplica")).toEqual({ ruc: "", dni: "" });
  });

  it("el documento llega repartido en sus dos casilleros del formato", () => {
    const html = cuerpoDesdeSerfor(guia({ destinatarioDoc: "20605859438 / 80186494" }));
    expect(html).toContain("20605859438");
    expect(html).toContain("80186494");
    expect(html).not.toContain("20605859438 / 80186494");
  });

  it("el (20) se lee en criollo, no como valor de enum", () => {
    const html = cuerpoDesdeSerfor(guia({ guiaRemision: "001-123" }));
    expect(html).toContain("Guía de remisión");
    expect(html).not.toContain("guia_remision");
  });
});

describe("documentoGtfSerfor — la hoja completa, no sólo los casilleros", () => {
  it("declara que es una reproducción: el original lo emite la ARFFS", () => {
    // Un papel que reproduce una guía sin decirlo se termina presentando como si
    // fuera la guía. El sello es la diferencia entre respaldo y problema.
    const html = documentoGtfSerfor(guia());
    expect(html).toContain("Reproducción");
    expect(html).toContain("No sustituye el original");
  });

  it("una guía ANULADA lo grita, y no la pinta como vigente", () => {
    const html = documentoGtfSerfor(guia({ estado: "Anulada" }));
    expect(html).toContain("ANULADA");
    expect(html).toContain("no ampara movilización");
    // Y sin el estado en verde ni el registro afirmado.
    expect(html).not.toContain("ESTADO: REGISTRADA");
  });

  it("el resumen trae el volumen amparado que declara SERFOR", () => {
    expect(documentoGtfSerfor(guia())).toContain("13.311");
  });

  it("sin volumen declarado suma el detalle (37) en vez de mentir con un 0", () => {
    const html = documentoGtfSerfor(guia({ volumenTotal: null }));
    expect(html).toContain("10.607");
  });

  it("el número grande es el de la guía; el de registro va como nota", () => {
    const html = documentoGtfSerfor(guia());
    expect(html).toContain("019-0000004");
    expect(html).toContain("Registro 1-19-0313969");
  });
});

describe("estadoGtf", () => {
  it("anulada se detecta en cualquier redacción de SERFOR", () => {
    expect(estadoGtf(guia({ estado: "ANULADO POR EL EMISOR" })).anulada).toBe(true);
    expect(estadoGtf(guia({ estado: "Activa" })).anulada).toBe(false);
    expect(estadoGtf(guia({ estado: null })).anulada).toBe(false);
  });
});
