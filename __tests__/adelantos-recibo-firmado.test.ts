import { describe, expect, it } from "vitest";
import { ladoDeFirma, monedaEnLetras, montoConMoneda, montoEnLetras, rotuloDocumento } from "@/lib/adelantos/comprobante";
import {
  esFotoDelNegocio,
  esReciboFirmado,
  esRutaFirmaDelAdelanto,
  fechaHoraLima,
  limpiarDocumento,
  lineasHojaFirmada,
  rutaFirmaPrivada,
  srcDelComprobante,
  validarFirmante,
} from "@/lib/adelantos/recibo-firmado";
import { cajaDeTrazos, encuadrar, esFirmaSuficiente, largoDeTrazos, pintarTrazos, type Pincel } from "@/lib/firma/trazos";

describe("hora del recibo", () => {
  it("es la de Lima aunque el celular esté en otra zona", () => {
    // 02:14 UTC del viernes = 21:14 del jueves en Lima (UTC−5).
    expect(fechaHoraLima(new Date("2026-10-09T02:14:00Z"))).toBe("jueves 08/10/2026 · 21:14");
  });
  it("medianoche en 00, no en 24", () => {
    expect(fechaHoraLima(new Date("2026-10-09T05:05:00Z"))).toBe("viernes 09/10/2026 · 00:05");
  });
});

describe("quién firma", () => {
  it("pide nombre y DNI", () => {
    expect(validarFirmante({ nombre: "", documento: "12345678" })).toMatch(/nombre/);
    expect(validarFirmante({ nombre: "Juan Pérez", documento: "" })).toMatch(/DNI/);
    expect(validarFirmante({ nombre: "Juan Pérez", documento: "1234" })).toBe("El DNI tiene 8 números.");
  });
  it("acepta DNI con espacios o prefijo, y carné de extranjería", () => {
    expect(validarFirmante({ nombre: "Juan Pérez", documento: "DNI 4567 8901" })).toBeNull();
    expect(limpiarDocumento("dni: 4567-8901")).toBe("45678901");
    expect(validarFirmante({ nombre: "Ana Silva", documento: "ce001234567" })).toBeNull();
    expect(validarFirmante({ nombre: "Ana Silva", documento: "12345678901234" })).toMatch(/9 a 12/);
  });
  it("rotula DNI sólo con 8 números", () => {
    expect(rotuloDocumento("45678901")).toBe("DNI 45678901");
    expect(rotuloDocumento("CE001234567")).toBe("Doc. CE001234567");
  });
});

describe("la persona firma en su línea del papel", () => {
  it("DADO: recibe la plata → «Recibí conforme» a la derecha", () => {
    expect(ladoDeFirma("DADO")).toBe("derecha");
    expect(ladoDeFirma(undefined)).toBe("derecha");
  });
  it("RECIBIDO: entrega la plata → «Entregó» a la izquierda", () => {
    expect(ladoDeFirma("RECIBIDO")).toBe("izquierda");
  });
});

describe("monto en letras con tilde", () => {
  it("veintidós, veintitrés y veintiséis llevan tilde; veintiuno no", () => {
    expect(montoEnLetras(123)).toBe("ciento veintitrés con 00/100");
    expect(montoEnLetras(22)).toBe("veintidós con 00/100");
    expect(montoEnLetras(1026.5)).toBe("mil veintiséis con 50/100");
    expect(montoEnLetras(21)).toBe("veintiuno con 00/100");
  });
  it("delante de «mil» el uno se apocopa: veintiún mil, ciento un mil", () => {
    expect(montoEnLetras(21_000)).toBe("veintiún mil con 00/100");
    expect(montoEnLetras(101_000)).toBe("ciento un mil con 00/100");
    expect(montoEnLetras(31_500)).toBe("treinta y un mil quinientos con 00/100");
    expect(montoEnLetras(121_021)).toBe("ciento veintiún mil veintiuno con 00/100");
    expect(montoEnLetras(1_000)).toBe("mil con 00/100");
    expect(montoEnLetras(11_000)).toBe("once mil con 00/100");
    expect(montoEnLetras(22_000)).toBe("veintidós mil con 00/100");
  });
});

describe("moneda del papel", () => {
  it("un adelanto en dólares no dice «soles»", () => {
    expect(monedaEnLetras("USD")).toBe("dólares americanos");
    expect(monedaEnLetras("PEN")).toBe("soles");
    expect(montoConMoneda(1234.5, "USD")).toBe("US$ 1,234.50");
    expect(montoConMoneda(1234.5, "PEN")).toMatch(/^S\/ 1,234\.50$/);
  });
});

describe("la hoja que se guarda", () => {
  const base = {
    codigoOperacion: "ADL-2026-0007",
    negocio: "Bodega San Martín",
    persona: "Juan Pérez",
    monto: 1234.5,
    moneda: "PEN",
    firmante: { nombre: " Juan Pérez ", documento: "45678901" },
    fechaHora: "jueves 08/10/2026 · 21:14",
  };
  it("DADO: el negocio dio, la persona recibió; monto en número y letras", () => {
    const l = lineasHojaFirmada({ ...base, direccion: "DADO" });
    expect(l.titulo).toBe("Recibo firmado · ADL-2026-0007");
    expect(l.letras).toBe("Son: mil doscientos treinta y cuatro con 50/100 soles");
    expect(l.quien).toBe("Dio: Bodega San Martín · Recibió: Juan Pérez");
    expect(l.firmo).toBe("Firmó: Juan Pérez · DNI 45678901");
    expect(l.cuando).toBe("jueves 08/10/2026 · 21:14 (hora de Lima)");
  });
  it("RECIBIDO: al revés, con el concepto", () => {
    const l = lineasHojaFirmada({ ...base, direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO" });
    expect(l.quien).toMatch(/^Dio: Juan Pérez · Recibió: Bodega San Martín · /);
  });
});

describe("el archivo de la firma (privado)", () => {
  it("ruta en la carpeta del adelanto, reconocible y sin caracteres raros", () => {
    const r = rutaFirmaPrivada("t1", "a1", 1728000000000, "A1B2c3d4-e5f6");
    expect(r).toBe("t1/adelantos/a1/1728000000000-firma-recibo-a1b2c3d4e5f6.webp");
    expect(esRutaFirmaDelAdelanto(r, "t1", "a1")).toBe(true);
    expect(esRutaFirmaDelAdelanto(r, "t2", "a1")).toBe(false);
    expect(esRutaFirmaDelAdelanto(r, "t1", "a2")).toBe(false);
    expect(esRutaFirmaDelAdelanto("t1/adelantos/a1/../../t2/x.webp", "t1", "a1")).toBe(false);
    expect(() => rutaFirmaPrivada("t1", "../t2", 1, "abcdef12")).toThrow();
  });
  it("la ficha la reconoce y la pide por la puerta del servidor", () => {
    const priv = `priv:${rutaFirmaPrivada("t1", "a1", 1728000000000, "abcdef1234")}`;
    expect(esReciboFirmado(priv)).toBe(true);
    expect(esReciboFirmado("https://x.supabase.co/storage/v1/object/public/media/t1/media/1728-voucher.webp")).toBe(false);
    expect(esReciboFirmado(null)).toBe(false);
    expect(srcDelComprobante({ id: "a1", comprobanteUrl: priv })).toBe("/api/adelantos/a1/comprobante?v=1728000000000-firma-recibo-abcdef1234.webp");
    expect(srcDelComprobante({ id: "a1", comprobanteUrl: "https://x/v.webp" })).toBe("https://x/v.webp");
    expect(srcDelComprobante({ id: "a1", comprobanteUrl: null })).toBeNull();
  });
  it("sólo acepta fotos de la carpeta de ESTE negocio, con la forma exacta de /api/upload", () => {
    const o = { tenantId: "t1", origenStorage: "https://x.supabase.co" };
    const base = "https://x.supabase.co/storage/v1/object/public/media";
    expect(esFotoDelNegocio(`${base}/t1/media/1728000000000-voucher_yape.webp`, o)).toBe(true);
    expect(esFotoDelNegocio(`${base}/t2/media/1728000000000-a.webp`, o)).toBe(false);
    expect(esFotoDelNegocio("https://otro.com/storage/v1/object/public/media/t1/media/1728000000000-a.webp", o)).toBe(false);
    expect(esFotoDelNegocio("http://x.supabase.co/storage/v1/object/public/media/t1/media/1728000000000-a.webp", o)).toBe(false);
    expect(esFotoDelNegocio("javascript:alert(1)", o)).toBe(false);
    // Revisión 08-10: lo que `includes("..")` dejaba pasar.
    expect(esFotoDelNegocio(`${base}/t1/media/%2e%2e%2f%2e%2e%2ft2/1728000000000-a.webp`, o)).toBe(false);
    expect(esFotoDelNegocio(`${base}/t1/%2e%2e/t2/media/1728000000000-a.webp`, o)).toBe(false);
    expect(esFotoDelNegocio("https://user@x.supabase.co/storage/v1/object/public/media/t1/media/1728000000000-a.webp", o)).toBe(false);
    expect(esFotoDelNegocio(`${base}/t1/media/1728000000000-a.webp?x=1`, o)).toBe(false);
    expect(esFotoDelNegocio(`${base}/t1/media/1728000000000-a.html`, o)).toBe(false);
  });
});

describe("trazos de la firma", () => {
  const raya = [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.2 }];
  it("un toque o una rayita no es firma", () => {
    expect(esFirmaSuficiente([[{ x: 0.5, y: 0.2 }]])).toBe(false);
    expect(esFirmaSuficiente([[{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }]])).toBe(false);
    expect(largoDeTrazos([raya])).toBeCloseTo(0.3);
    expect(esFirmaSuficiente([raya])).toBe(true);
  });
  it("encuadra la tinta centrada y sin deformar", () => {
    const caja = cajaDeTrazos([raya, [{ x: 0.25, y: 0.3 }]]);
    expect(caja).toEqual({ x0: 0.1, y0: 0.2, x1: 0.4, y1: 0.3 });
    const e = encuadrar(caja!, 400, 100, 10);
    // 0.3 × 0.1 en 380 × 80 → manda el alto: escala 800.
    expect(e.escala).toBeCloseTo(800);
    expect(0.1 * e.escala + e.dx).toBeCloseTo((400 - 0.3 * 800) / 2);
    expect(0.2 * e.escala + e.dy).toBeCloseTo(10);
  });
  it("pinta un punto suelto como círculo y una raya como trazo", () => {
    const llamadas: string[] = [];
    const ctx = {
      beginPath: () => llamadas.push("begin"),
      moveTo: () => llamadas.push("move"),
      lineTo: () => llamadas.push("line"),
      quadraticCurveTo: () => llamadas.push("curva"),
      arc: () => llamadas.push("arc"),
      stroke: () => llamadas.push("stroke"),
      fill: () => llamadas.push("fill"),
    } as unknown as Pincel;
    pintarTrazos(ctx, [[{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.2, y: 0.1 }]], {
      encuadre: { escala: 100, dx: 0, dy: 0 },
      tinta: "black",
      grosor: 3,
    });
    expect(llamadas).toEqual(["begin", "arc", "fill", "begin", "move", "curva", "line", "stroke"]);
  });
});
