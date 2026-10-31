import { describe, expect, it } from "vitest";
import {
  celularLegible,
  celularParaRecibo,
  detalleEnvio,
  esPapelDeAdelanto,
  fechaCortaLima,
  fichaSinTelefono,
  leerDetalleEnvio,
  mensajeRecibo,
  momentoDeLaFoto,
  pdfLlevaAlgunDocumento,
  puedeMandarRecibo,
} from "@/lib/adelantos/recibo-whatsapp";
import { PREFIJO_PRIVADO } from "@/lib/adelantos/recibo-firmado";

describe("celularParaRecibo", () => {
  it("acepta 9 dígitos con espacios, guiones o el 51 adelante", () => {
    expect(celularParaRecibo("987 654 321")).toEqual({ ok: true, nueve: "987654321" });
    expect(celularParaRecibo("+51 987-654-321")).toEqual({ ok: true, nueve: "987654321" });
    expect(celularParaRecibo("51987654321")).toEqual({ ok: true, nueve: "987654321" });
  });

  it("rechaza vacío, largo equivocado y fijos", () => {
    expect(celularParaRecibo("")).toMatchObject({ ok: false, error: expect.stringContaining("Escribe") });
    expect(celularParaRecibo(null)).toMatchObject({ ok: false });
    expect(celularParaRecibo("98765432")).toMatchObject({ ok: false, error: expect.stringContaining("9 dígitos") });
    expect(celularParaRecibo("061 575 123")).toMatchObject({ ok: false, error: expect.stringContaining("empieza con 9") });
  });

  it("se dicta en tres grupos", () => {
    expect(celularLegible("987654321")).toBe("987 654 321");
    expect(celularLegible("123")).toBe("123");
  });
});

describe("registro del envío en la actividad", () => {
  it("el detalle se vuelve a leer con el número y el documento", () => {
    const d = detalleEnvio({ codigo: "ADL-2026-0057", adelantoId: "cm1", nueve: "987654321", documentoId: "cmdoc_123" });
    expect(d).toBe("Recibo de ADL-2026-0057 enviado por WhatsApp al 987654321 · documento cmdoc_123");
    expect(leerDetalleEnvio(d)).toEqual({ nueve: "987654321", documentoId: "cmdoc_123", via: "whatsapp" });
  });

  it("compartido desde el celular queda aparte del chat de WhatsApp", () => {
    const d = detalleEnvio({ codigo: "ADL-2026-0057", adelantoId: "cm1", nueve: "987654321", documentoId: "cmdoc_1", via: "compartido" });
    expect(d).toBe("Recibo de ADL-2026-0057 compartido desde el celular para el 987654321 · documento cmdoc_1");
    expect(leerDetalleEnvio(d)).toEqual({ nueve: "987654321", documentoId: "cmdoc_1", via: "compartido" });
  });

  it("sin código usa el id, y un detalle ajeno no se lee como envío", () => {
    expect(detalleEnvio({ codigo: null, adelantoId: "cm1", nueve: "987654321", documentoId: "x" })).toMatch(/^Recibo de cm1 /);
    expect(leerDetalleEnvio("Adelanto anulado")).toBeNull();
    expect(leerDetalleEnvio("enviado por WhatsApp al 987654321")).toEqual({ nueve: "987654321", documentoId: null, via: "whatsapp" });
  });
});

describe("mensajeRecibo", () => {
  it("saluda por el primer nombre y lleva el enlace con su vencimiento", () => {
    const m = mensajeRecibo({ nombre: "  Juan Pérez Ríos", codigo: "ADL-2026-0057", monto: "S/ 120.00", negocio: "Bodega San Martín", enlace: "https://x.pe/d/abc", vence: "26/10 14:05" });
    expect(m).toBe(
      "Hola Juan, te mando el recibo del adelanto ADL-2026-0057 por S/ 120.00 de Bodega San Martín.\nPuedes verlo y bajarlo acá hasta el 26/10 14:05: https://x.pe/d/abc",
    );
  });

  it("sin nombre, código ni negocio no deja huecos", () => {
    expect(mensajeRecibo({ nombre: "", codigo: null, monto: "S/ 5.00", negocio: "", enlace: "e", vence: "" })).toBe(
      "Hola, te mando el recibo del adelanto por S/ 5.00.\nPuedes verlo y bajarlo acá: e",
    );
  });
});

describe("momentoDeLaFoto", () => {
  it("lee los milisegundos del nombre de la foto privada", () => {
    const ms = Date.UTC(2026, 9, 23, 19, 5);
    expect(momentoDeLaFoto(`${PREFIJO_PRIVADO}main/adelantos/cm1/${ms}-voucher-ab12.webp`)?.getTime()).toBe(ms);
  });

  it("null si no es una ruta privada o el nombre no trae la hora", () => {
    expect(momentoDeLaFoto("https://cdn.x/foto.jpg")).toBeNull();
    expect(momentoDeLaFoto(`${PREFIJO_PRIVADO}main/adelantos/cm1/voucher.webp`)).toBeNull();
    expect(momentoDeLaFoto(null)).toBeNull();
  });
});

describe("fechaCortaLima", () => {
  it("día/mes hora:minuto en hora de Lima (UTC−5)", () => {
    expect(fechaCortaLima("2026-10-23T19:05:00.000Z")).toBe("23/10 14:05");
    expect(fechaCortaLima("2026-10-24T03:30:00.000Z")).toBe("23/10 22:30");
    expect(fechaCortaLima("no-es-fecha")).toBe("");
  });
});

describe("lo que se anota y quién manda", () => {
  it("el celular se anota sólo si la ficha está vacía (un fijo o un número con espacios no se pisa)", () => {
    expect(fichaSinTelefono(null)).toBe(true);
    expect(fichaSinTelefono("")).toBe(true);
    expect(fichaSinTelefono("   ")).toBe(true);
    expect(fichaSinTelefono("061 575123")).toBe(false);
    expect(fichaSinTelefono(" 987 654 321 ")).toBe(false);
  });

  it("sólo el dueño y el administrador: el PDF va a la carpeta privada", () => {
    expect(puedeMandarRecibo("owner")).toBe(true);
    expect(puedeMandarRecibo("admin")).toBe(true);
    expect(puedeMandarRecibo("manager")).toBe(false);
    expect(puedeMandarRecibo("cashier")).toBe(false);
    expect(puedeMandarRecibo(null)).toBe(false);
  });

  it("el papel de un adelanto se reconoce por cualquiera de sus etiquetas", () => {
    expect(esPapelDeAdelanto(["persona:cm1", "recibo-adelanto"])).toBe(true);
    expect(esPapelDeAdelanto(["adelanto:cm9"])).toBe(true);
    expect(esPapelDeAdelanto(["contrato"])).toBe(false);
    expect(esPapelDeAdelanto(null)).toBe(false);
  });
});

describe("pdfLlevaAlgunDocumento", () => {
  const pdf = (texto: string) => new TextEncoder().encode(`%PDF-1.3\n(${texto}) Tj`);

  it("encuentra un DNI escrito entero y deja pasar el tapado", () => {
    expect(pdfLlevaAlgunDocumento(pdf("DNI 45678901"), ["45678901"])).toBe(true);
    expect(pdfLlevaAlgunDocumento(pdf("DNI ****8901"), ["45678901"])).toBe(false);
  });

  it("no mira documentos cortos ni vacíos (saldrían por casualidad)", () => {
    expect(pdfLlevaAlgunDocumento(pdf("12345 y más"), ["12345", null, ""])).toBe(false);
  });
});
