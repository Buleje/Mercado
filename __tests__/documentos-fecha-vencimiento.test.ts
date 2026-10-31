import { describe, it, expect } from "vitest";
import { esComprobanteDePago, fechaDeVencimientoEnTexto, leerVencimiento } from "@/lib/documentos/fecha-vencimiento";

const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

describe("fechaDeVencimientoEnTexto", () => {
  it("lee la licencia tal como la transcribe el OCR", () => {
    const texto = "MUNICIPALIDAD DE PUCALLPA LICENCIA DE FUNCIONAMIENTO RUC: 20609876543 Emitida: 15/01/2026 Valida Hasta: 15/01/2027";
    expect(dia(fechaDeVencimientoEnTexto(texto))).toBe("2027-01-15");
  });

  it("NO confunde la fecha de emisión con la de vencimiento", () => {
    expect(fechaDeVencimientoEnTexto("Emitida: 15/01/2026")).toBeNull();
    expect(fechaDeVencimientoEnTexto("Fecha de emision 12/03/2026, total S/ 100")).toBeNull();
  });

  it("acepta las formas que se usan en un papel peruano", () => {
    expect(dia(fechaDeVencimientoEnTexto("VENCE EL 03-08-2026"))).toBe("2026-08-03");
    expect(dia(fechaDeVencimientoEnTexto("Vigente hasta 1 de setiembre de 2027"))).toBe("2027-09-01");
    expect(dia(fechaDeVencimientoEnTexto("caducidad: 2026-12-31"))).toBe("2026-12-31");
    expect(dia(fechaDeVencimientoEnTexto("válida hasta 09/07/27"))).toBe("2027-07-09");
  });

  it("día y mes al modo peruano: 03/08 es 3 de agosto", () => {
    expect(dia(fechaDeVencimientoEnTexto("vence 03/08/2026"))).toBe("2026-08-03");
  });

  it("descarta fechas imposibles en vez de inventar una", () => {
    expect(fechaDeVencimientoEnTexto("vence el 31/02/2027")).toBeNull();
    expect(fechaDeVencimientoEnTexto("vence el 45/13/2027")).toBeNull();
  });

  it("sin texto o sin anuncio de vencimiento, null", () => {
    expect(fechaDeVencimientoEnTexto(null)).toBeNull();
    expect(fechaDeVencimientoEnTexto("factura por S/ 100 del 12/03/2026")).toBeNull();
  });
});

describe("leerVencimiento — texto real de OCR (papeles de Blas, 22-10)", () => {
  it("DNI: la zona de lectura mecánica con sus dos dígitos de control", () => {
    const v = leerVencimiento("I<PERD4314730<26<COCTCTA\n6401218M3001318PER<<<<<<<<<<<0\nMUNXXOS<<OSVALDO<<<<<<<");
    expect(v?.regla).toBe("mrz");
    expect(dia(v?.fecha ?? null)).toBe("2030-01-31");
  });

  it("DNI: el OCR se comió el primer dígito y sólo queda el control del vencimiento", () => {
    const v = leerVencimiento("ILPERD4314730<24<<CCOTOE\n401218M3001318PER<<<<<<<<<<<D");
    expect(dia(v?.fecha ?? null)).toBe("2030-01-31");
  });

  it("DNI: un dígito de control que no cuadra no da fecha", () => {
    expect(leerVencimiento("6401218M3001319PER<<<<<<<")).toBeNull();
    expect(leerVencimiento("401218M3001317PER<<<<")).toBeNull();
  });

  it("caja del DNI leída suelta: la fecha de emisión no se toma por la de caducidad", () => {
    // Así salió del carné: la etiqueta de caducidad quedó al final, sin su fecha (letra roja).
    expect(leerVencimiento("pomada 7 09 07 2001 Excha Emisión 31 01 2029 Facha Caducidad .... Una A")).toBeNull();
  });

  it("etiquetas en fila y fechas debajo: cada una con la suya, en orden", () => {
    expect(dia(fechaDeVencimientoEnTexto("Fecha Emisión Fecha Caducidad\n31 01 2022 31 01 2030"))).toBe("2030-01-31");
    expect(dia(fechaDeVencimientoEnTexto("Fecha de Emisión | Fecha de Caducidad\n12/05/2022 | 12/05/2030"))).toBe("2030-05-12");
  });

  it("«Fecha de Caducidad» con la fecha separada por espacios y ceros leídos como O", () => {
    expect(dia(fechaDeVencimientoEnTexto("Fecha de Caducidad 12 05 2030"))).toBe("2030-05-12");
    expect(dia(fechaDeVencimientoEnTexto("FECHA DE CADUCIDAD: 31 O1 2O30"))).toBe("2030-01-31");
    expect(dia(fechaDeVencimientoEnTexto("Fecha de Caducidad |12/05/2030|"))).toBe("2030-05-12");
  });

  it("certificado de plantación: «Lugar y Fecha» y «Fecha:» de la firma NO son vencimiento", () => {
    const texto =
      "CERTIFICADO DE INSCRIPCIÓN EN EL REGISTRO NACIONAL DE PLANTACIONES FORESTALES Registro N°: 19-SEC/REG-PLT-2025-096 " +
      "El registro será cancelado si se determina el empleo de información falsa. Lugar y Fecha: SELVA CENTRAL, 03 de Septiembre de 2025 " +
      "Firmado digitalmente por: ROJAS Motivo: Soy el autor del documento Fecha: 03.09.2025 11:42:10 -05:00";
    expect(leerVencimiento(texto)).toBeNull();
  });

  it("GTF: expedición y vencimiento en la misma línea, cada fecha con su casillero", () => {
    expect(dia(fechaDeVencimientoEnTexto("(3) Fecha de Expedición: 04/08/2026 (4) Fecha de Vencimiento: 20/08/2026"))).toBe("2026-08-20");
  });

  it("rango de vigencia: «del … al …» da la segunda", () => {
    const v = leerVencimiento("Licencia con vigencia del 01/01/2026 al 31/12/2026, renovable.");
    expect(v?.regla).toBe("rango");
    expect(dia(v?.fecha ?? null)).toBe("2026-12-31");
  });

  it("plazo de un título habilitante: N años desde una fecha escrita", () => {
    const v = leerVencimiento(
      "Otórguese el contrato con un plazo de vigencia de cuarenta (40) años, contados a partir del 12 de marzo de 2021.",
    );
    expect(v?.regla).toBe("plazo");
    expect(dia(v?.fecha ?? null)).toBe("2061-03-12");
    expect(dia(fechaDeVencimientoEnTexto("permiso por un plazo de 5 años desde el 29/02/2024"))).toBe("2029-02-28");
  });

  it("plazo sin fecha de inicio escrita no inventa nada", () => {
    expect(leerVencimiento("con un plazo de vigencia de cuarenta (40) años contados desde la suscripción del contrato")).toBeNull();
  });

  it("nacimiento e inscripción no son vencimiento", () => {
    expect(leerVencimiento("Fecha de Nacimiento 21 01 1964 Fecha de Inscripción 09 07 2001")).toBeNull();
  });

  it("devuelve el fragmento de donde salió, para revisarlo", () => {
    expect(leerVencimiento("Válido hasta: 15/01/2027")?.fragmento).toMatch(/valido hasta: 15\/01\/2027/);
  });
});

// Revisión 22-10: la fecha ahora se anota sola y dispara el aviso por WhatsApp,
// así que cada falso positivo es un mensaje equivocado al dueño.
describe("falsos positivos que no pueden anotarse", () => {
  it("un periodo cobrado no es una vigencia", () => {
    expect(leerVencimiento("Periodo: del 01/10/2026 al 31/10/2026")).toBeNull();
    expect(leerVencimiento("Período tributario del 01/10/2026 al 31/10/2026")).toBeNull();
  });

  it("un «hasta el» suelto no es vencimiento", () => {
    expect(leerVencimiento("Presente sus descargos hasta el 05/11/2026 en mesa de partes.")).toBeNull();
    expect(leerVencimiento("Declara que residió hasta el 12/05/1990 en Pucallpa.")).toBeNull();
  });

  it("con palabra de validez el rango y el «hasta» siguen valiendo", () => {
    expect(dia(fechaDeVencimientoEnTexto("Periodo de vigencia del 01/01/2026 al 31/12/2026"))).toBe("2026-12-31");
    expect(dia(fechaDeVencimientoEnTexto("Válido hasta el 15/01/2027"))).toBe("2027-01-15");
    expect(dia(fechaDeVencimientoEnTexto("Validez: hasta el 15/01/2027"))).toBe("2027-01-15");
  });

  it("«1o de enero» es el primero, no el 10", () => {
    expect(dia(fechaDeVencimientoEnTexto("vence el 1o de enero de 2027"))).toBe("2027-01-01");
    expect(dia(fechaDeVencimientoEnTexto("vence el 1º de enero de 2027"))).toBe("2027-01-01");
    // El cero leído como «O» mayúscula sigue siendo un cero.
    expect(dia(fechaDeVencimientoEnTexto("VENCE EL 1O DE ENERO DE 2027"))).toBe("2027-01-10");
  });
});

describe("esComprobanteDePago", () => {
  const factura =
    "FACTURA ELECTRÓNICA F001-00012345 RUC 20609876543 Fecha de emisión: 01/10/2026 Fecha de vencimiento: 31/10/2026 Forma de pago: Crédito OP. GRAVADA 100.00 IGV 18.00 TOTAL A PAGAR 118.00";

  it("una factura con «Fecha de vencimiento» se lee pero no se anota sola", () => {
    expect(dia(fechaDeVencimientoEnTexto(factura))).toBe("2026-10-31"); // queda como sugerencia
    expect(esComprobanteDePago(factura)).toBe(true);
  });

  it("lo reconoce por el tipo que dijo la IA aunque el OCR no lea la cabecera", () => {
    expect(esComprobanteDePago("Fecha de vencimiento: 31/10/2026", "factura")).toBe(true);
    expect(esComprobanteDePago("Fecha de vencimiento: 31/10/2026", "Boleta")).toBe(true);
    expect(esComprobanteDePago("Fecha de vencimiento: 31/10/2026", "contrato")).toBe(false);
  });

  it("boleta, recibo de luz, cotización y forma de pago", () => {
    expect(esComprobanteDePago("BOLETA DE VENTA ELECTRÓNICA B001-456")).toBe(true);
    expect(esComprobanteDePago("Recibo de luz N° de suministro 1234567 vence 15/11/2026")).toBe(true);
    expect(esComprobanteDePago("Cotización N° 045-2026 · oferta válida hasta el 30/10/2026")).toBe(true);
    expect(esComprobanteDePago("Condición de pago: al contado")).toBe(true);
  });

  it("licencias, DNI y contratos se siguen anotando", () => {
    expect(esComprobanteDePago("LICENCIA DE FUNCIONAMIENTO Emitida: 15/01/2026 Valida Hasta: 15/01/2027")).toBe(false);
    expect(esComprobanteDePago("REPÚBLICA DEL PERÚ DOCUMENTO NACIONAL DE IDENTIDAD Fecha de Caducidad 31 01 2030")).toBe(false);
    expect(esComprobanteDePago("CONTRATO DE ARRENDAMIENTO. CLÁUSULA QUINTA: FORMA DE PAGO. La renta se pagará previa presentación de la factura correspondiente.")).toBe(false);
    expect(esComprobanteDePago("SOAT Póliza N° 123 vigencia del 01/01/2026 al 01/01/2027")).toBe(false);
  });
});

// Textos inventados con la forma de los papeles peruanos (24-10): ninguno es
// de una persona real.
describe("leerVencimiento — papeles peruanos (lector v2)", () => {
  const lee = (t: string) => {
    const r = leerVencimiento(t);
    return r ? { dia: dia(r.fecha), regla: r.regla } : null;
  };

  it("SOAT: «Vigencia: Desde … 12:00 horas Hasta …»", () => {
    expect(lee("CERTIFICADO SOAT Placa ABC-123 Vigencia: Desde 15/03/2026 12:00 horas Hasta 15/03/2027 12:00 horas")).toEqual({ dia: "2027-03-15", regla: "rango" });
    expect(lee("Vigencia de la póliza desde las 12:00 hrs del 01/02/2026 hasta las 12:00 hrs del 01/02/2027")).toEqual({ dia: "2027-02-01", regla: "rango" });
  });

  it("contrato: «rige desde el … hasta el …»", () => {
    expect(lee("El presente contrato rige desde el 01/03/2025 hasta el 28/02/2027.")).toEqual({ dia: "2027-02-28", regla: "rango" });
  });

  it("formularios abreviados: «F. Venc.», «Fecha Vcto.», «Vto.»", () => {
    expect(lee("Certificado de fumigación N° 0456 F. Emisión 02/05/2026 F. Venc. 02/11/2026")?.dia).toBe("2026-11-02");
    expect(lee("Extintor PQS 6 kg · Fecha Vcto: 30/06/2027")?.dia).toBe("2027-06-30");
    expect(lee("Carné de sanidad Vto. 10/01/2027")?.dia).toBe("2027-01-10");
  });

  it("licencia de conducir: «Fecha de Revalidación»", () => {
    expect(lee("LICENCIA DE CONDUCIR Clase A Categoría IIb Fecha de Expedición 14/05/2024 Fecha de Revalidación 14/05/2032")?.dia).toBe("2032-05-14");
  });

  it("casillero de la GTF donde el OCR lee la barra como un 1", () => {
    expect(lee("GUIA DE TRANSPORTE FORESTAL Fecha de vencimiento (20 108 1 26)")?.dia).toBe("2026-08-20");
    // Pegado no es una fecha.
    expect(lee("Fecha de vencimiento 20108126")).toBeNull();
  });

  it("«Vigencia: 2 años desde el 01/03/2025»", () => {
    expect(lee("Constancia de inspección técnica. Vigencia: 2 años desde el 01/03/2025")).toEqual({ dia: "2027-03-01", regla: "plazo" });
  });

  it("«válido por un (01) año a partir de su emisión» con la fecha de emisión del papel", () => {
    expect(lee("CERTIFICADO DE CAPACITACIÓN Fecha de emisión: 10/04/2026. Válido por un (01) año a partir de su emisión.")).toEqual({ dia: "2027-04-10", regla: "plazo" });
  });

  it("resolución de la ARFFS: el plazo corre desde la fecha del encabezado", () => {
    const texto =
      "GOBIERNO REGIONAL DE UCAYALI GERENCIA REGIONAL FORESTAL Y DE FAUNA SILVESTRE RESOLUCIÓN GERENCIAL N° 0123-2024-GRU-GRFFS " +
      "Pucallpa, 12 de marzo de 2024 VISTO: el expediente… SE RESUELVE: ARTÍCULO PRIMERO.- OTORGAR el permiso forestal en predio privado " +
      "por un periodo de cinco (05) años contados a partir de la fecha de su emisión.";
    expect(lee(texto)).toEqual({ dia: "2029-03-12", regla: "plazo" });
  });

  it("plazo en días calendario desde una fecha escrita", () => {
    expect(lee("Autorización provisional con vigencia de noventa (90) días calendario desde el 01/07/2026")).toEqual({ dia: "2026-09-29", regla: "plazo" });
  });

  it("lo que NO es un vencimiento leíble", () => {
    // Días hábiles: dependen de los feriados.
    expect(lee("Plazo de quince (15) días hábiles desde el 01/07/2026 para levantar observaciones")).toBeNull();
    // Desde la notificación o el día siguiente: no hay fecha escrita.
    expect(lee("vigencia de un (01) año contado desde su notificación")).toBeNull();
    expect(lee("Resolución del 05/05/2026. La vigencia es de tres años a partir del día siguiente de su publicación.")).toBeNull();
    // Periodo de un recibo: lo que se cobra.
    expect(lee("Periodo: del 01/10/2026 al 31/10/2026 Total a pagar S/ 85.00")).toBeNull();
    // Un rango al revés no es una vigencia.
    expect(lee("vigencia del 31/12/2026 al 01/01/2026")).toBeNull();
  });
});
