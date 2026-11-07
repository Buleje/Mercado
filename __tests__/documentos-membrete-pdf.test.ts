/**
 * El membrete común de los papeles de la empresa (23-10, Brandon: «cualquier
 * documento de la empresa saldrá con el logo y nombre en el título»).
 *
 * Se lee el PDF crudo (jsPDF sin comprimir): cada texto sale como `(…) Tj`.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { jsPDF } from "jspdf";
import {
  PALETA,
  acentoLegible,
  contrasteSobreBlanco,
  datosDelMembrete,
  dibujarMembrete,
  dibujarPies,
  emitidoEnLima,
  fechaDelDocumento,
  rgbDeHex,
  type MembreteDocumento,
} from "@/lib/documentos/membrete-pdf";
import { armarComprobante, type DatosComprobante } from "@/lib/adelantos/comprobante";

const DOC = { tipo: "Comprobante de adelanto", codigo: "ADL-2026-0024", fecha: "jueves 08/10/2026" };

async function logoPng() {
  const buf = await sharp({ create: { width: 120, height: 60, channels: 3, background: { r: 0, g: 120, b: 110 } } }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${buf.toString("base64")}`, ancho: 120, alto: 60 };
}

const imagenes = (crudo: string) => (crudo.match(/\/Subtype \/Image/g) ?? []).length;

describe("datosDelMembrete", () => {
  it("con logo y RUC: nombre de título, razón social aparte, RUC primero en la línea de datos", async () => {
    const m: MembreteDocumento = {
      nombre: "Inversiones Agroforestales Blas",
      razonSocial: "Inversiones Agroforestales Blas S.A.C.",
      ruc: "20605859438",
      direccion: "Jr. Tacna 345, Pucallpa",
      telefono: "961 234 567",
      whatsapp: "+51 961234567",
      correo: "contacto@blas.pe",
      logo: await logoPng(),
    };
    const d = datosDelMembrete(m, DOC);
    expect(d.titulo).toBe("Inversiones Agroforestales Blas");
    expect(d.razonSocial).toBe("Inversiones Agroforestales Blas S.A.C.");
    // El WhatsApp que es el mismo número que el teléfono no se repite.
    expect(d.datos).toEqual(["RUC 20605859438", "Jr. Tacna 345, Pucallpa", "Tel. 961 234 567", "contacto@blas.pe"]);
    expect(d.logo?.ancho).toBe(120);
    expect(d).toMatchObject({ tipo: DOC.tipo, codigo: DOC.codigo, fecha: DOC.fecha, monograma: "I" });
  });

  it("sin logo ni RUC: monograma con la inicial, sin «RUC» vacío; la razón social igual al nombre no se repite", () => {
    const d = datosDelMembrete({ nombre: "  buleje ", razonSocial: "Buleje", ruc: "  ", logo: null }, DOC);
    expect(d.titulo).toBe("buleje");
    expect(d.monograma).toBe("B");
    expect(d.razonSocial).toBeNull();
    expect(d.datos).toEqual([]);
    expect(d.logo).toBeNull();
  });

  it("sin nombre usa la razón social; sin nada, «Documento»", () => {
    expect(datosDelMembrete({ razonSocial: "Blas S.A.C." }, DOC).titulo).toBe("Blas S.A.C.");
    expect(datosDelMembrete(null, DOC).titulo).toBe("Documento");
    expect(datosDelMembrete({ whatsapp: "999 111 222", telefono: "961 234 567" }, DOC).datos).toEqual(["Tel. 961 234 567", "WhatsApp 999 111 222"]);
  });

  it("el acento se lee sobre blanco: un color claro se oscurece y sin color va el turquesa oscuro", () => {
    const claro = acentoLegible(rgbDeHex("#9ee6dd"));
    expect(contrasteSobreBlanco(claro)).toBeGreaterThanOrEqual(4.5);
    expect(acentoLegible(null)).toEqual(PALETA.acento);
    expect(datosDelMembrete({ color: "no-es-color" }, DOC).acento).toEqual(PALETA.acento);
  });
});

describe("fechas en hora de Lima", () => {
  it("date-only se lee tal cual; con hora, en Lima (a las 21:14 de Lima el UTC ya es mañana)", () => {
    expect(fechaDelDocumento("2026-10-08")).toBe("jueves 08/10/2026");
    expect(fechaDelDocumento("2026-10-08T02:14:00.000Z")).toBe("miércoles 07/10/2026");
    expect(fechaDelDocumento(null)).toBeNull();
    expect(emitidoEnLima(new Date("2026-10-23T20:05:00.000Z"))).toBe("viernes 23/10/2026 · 15:05");
  });
});

describe("dibujo", () => {
  it("el pie dice «Página X de Y» en cada página y la hora de emisión", () => {
    const doc = new jsPDF({ format: "a4" });
    doc.addPage();
    doc.addPage();
    dibujarPies(doc, datosDelMembrete({ nombre: "Buleje" }, DOC), { emitido: new Date("2026-10-23T20:05:00.000Z") });
    const crudo = doc.output();
    for (const p of [1, 2, 3]) expect(crudo).toContain(`(Página ${p} de 3) Tj`);
    expect(crudo).toContain("(Emitido el viernes 23/10/2026 · 15:05 \\(hora de Lima\\)) Tj");
  });

  it("con logo pinta la imagen; sin logo, el monograma (sin imagen); el cuerpo arranca debajo", async () => {
    const con = new jsPDF({ format: "a4" });
    const y = dibujarMembrete(con, datosDelMembrete({ nombre: "Blas", ruc: "20605859438", logo: await logoPng() }, DOC));
    expect(imagenes(con.output())).toBe(1);
    expect(con.output()).toContain("(RUC 20605859438) Tj");
    expect(y).toBeGreaterThan(30);

    const sin = new jsPDF({ format: "a4" });
    dibujarMembrete(sin, datosDelMembrete({ nombre: "Buleje" }, DOC));
    const crudo = sin.output();
    expect(imagenes(crudo)).toBe(0);
    expect(crudo).toContain("(B) Tj");
    expect(crudo).toContain("(Buleje) Tj");
    expect(crudo).toContain("(ADL-2026-0024) Tj");
  });
});

describe("el recibo del adelanto sobre el membrete", () => {
  const BASE: DatosComprobante = {
    codigoOperacion: "ADL-2026-0024",
    reciboManual: "001-0457",
    persona: "Juan Pérez",
    documento: "45678901",
    monto: 2500,
    moneda: "PEN",
    fecha: "2026-10-08",
    modalidad: "ENTREGAS_PACTADAS",
    notas: "Tres entregas de tornillo",
    direccion: "DADO",
    membrete: { nombre: "Inversiones Agroforestales Blas", ruc: "20605859438" },
  };

  it("A4 por defecto, con todos sus textos: membrete, monto en letras, partes, detalle, firmas y pie", async () => {
    const doc = await armarComprobante({
      ...BASE,
      vence: "2026-11-15",
      liquidado: 800,
      saldo: 1700,
      entregasPactadas: [{ numero: 1, descripcion: "400 PT tornillo 2x4", valor: 800, fecha: "2026-10-15", cumplida: true }],
    });
    expect([doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight()].map(Math.round)).toEqual([210, 297]);
    const crudo = doc.output();
    for (const texto of [
      "(Inversiones Agroforestales Blas) Tj",
      "(RUC 20605859438) Tj",
      "(COMPROBANTE DE ADELANTO) Tj",
      "(ADL-2026-0024) Tj",
      "(Recibo manual N.° 001-0457) Tj",
      "(Son: dos mil quinientos con 00/100 soles) Tj",
      "(Juan Pérez) Tj",
      "(DNI 45678901) Tj",
      "(domingo 15/11/2026) Tj",
      "(Saldo pendiente) Tj",
      "(Cumplida) Tj",
      "(Tres entregas de tornillo) Tj",
      "(Declaro haber recibido el monto indicado y me comprometo a liquidarlo según la modalidad acordada.) Tj",
      "(Recibí conforme) Tj",
      "(Entregó) Tj",
      "(Huella) Tj",
      "(Sin foto) Tj",
      "(Página 1 de 1) Tj",
    ]) {
      expect(crudo).toContain(texto);
    }
  });

  it("sin entregas todavía no dice «Saldo pendiente» (sería el mismo monto)", async () => {
    const crudo = (await armarComprobante({ ...BASE, liquidado: 0, saldo: 2500 })).output();
    expect(crudo).not.toContain("(Saldo pendiente) Tj");
  });

  it("la media hoja sigue: A5 apaisado con las dos líneas de firma y la casilla de la huella", async () => {
    const doc = await armarComprobante({ ...BASE, formato: "media-hoja" });
    expect([doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight()].map(Math.round)).toEqual([210, 148]);
    const crudo = doc.output();
    expect(crudo).toContain("(Huella) Tj");
    expect(crudo).toContain("(Página 1 de 1) Tj");
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("el pie de comprobantes de venta («Gracias por su compra») no va en un adelanto", async () => {
    const crudo = (await armarComprobante({ ...BASE, membrete: { nombre: "Buleje", pie: "Gracias por su compra" } })).output();
    expect(crudo).not.toContain("Gracias por su compra");
  });
});
