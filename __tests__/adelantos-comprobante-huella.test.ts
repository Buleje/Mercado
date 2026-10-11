// @vitest-environment node
/**
 * ADR-491 — el recibo del adelanto en PDF con el registro de firmas.
 *
 * Fija: la casilla «Huella» sale SIEMPRE (vacía para entintar, o con la foto);
 * la firma va con el nombre, DNI y hora DEL REGISTRO (no «ahora»); si se firmó
 * por otro monto el papel lo dice; la hoja firmada vieja (legado) y el voucher
 * van en una página aparte.
 *
 * Se lee el PDF crudo (jsPDF sin comprimir): los textos salen como `(…) Tj` y
 * cada imagen como un `/Subtype /Image`.
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CASILLA_HUELLA, armarComprobante, avisoMontoFirmado, casillaDeHuella, type DatosComprobante } from "@/lib/adelantos/comprobante";
import type { FirmaRegistrada } from "@/lib/adelantos/entregar-tipos";
import { fechaHoraLima } from "@/lib/adelantos/recibo-firmado";
import { firmaEnPapelDelRegistro, vigentesDelRegistro } from "@/components/admin/adelantos/detalle/comprobante-del-adelanto";

const BASE: DatosComprobante = {
  codigoOperacion: "ADL-2026-0024",
  persona: "Juan Pérez",
  documento: "45678901",
  monto: 150,
  moneda: "PEN",
  fecha: "2026-10-08T15:00:00.000Z",
  modalidad: "CUENTA_CORRIENTE",
  negocio: "Bodega San Martín",
  direccion: "DADO",
};

async function imagen(formato: "png" | "jpeg", ancho: number, alto: number): Promise<string> {
  const buf = await sharp({ create: { width: ancho, height: alto, channels: 3, background: { r: 250, g: 250, b: 250 } } })
    [formato]()
    .toBuffer();
  return `data:image/${formato};base64,${buf.toString("base64")}`;
}

async function pdf(d: DatosComprobante) {
  const doc = await armarComprobante(d);
  const crudo = doc.output();
  return { paginas: doc.getNumberOfPages(), crudo, imagenes: (crudo.match(/\/Subtype \/Image/g) ?? []).length };
}

function firma(parcial: Partial<FirmaRegistrada>): FirmaRegistrada {
  return {
    id: "f1",
    tipo: "FIRMA",
    canal: "PANTALLA",
    firmanteNombre: "Juan Pérez",
    firmanteDocumento: "45678901",
    montoFirmado: 150,
    monedaFirmada: "PEN",
    codigoOperacion: "ADL-2026-0024",
    pedidoPor: "qaadmin",
    creadoEn: "2026-10-08T02:14:00.000Z",
    sha256: "a".repeat(64),
    vigente: true,
    src: "/api/adelantos/a1/firmas/f1/imagen",
    ...parcial,
  };
}

describe("la casilla de la huella", () => {
  it("sale siempre, aunque no haya firma ni huella (para entintar a mano)", async () => {
    const { crudo, paginas, imagenes } = await pdf(BASE);
    expect(crudo).toMatch(/\(Huella\) Tj/);
    expect(paginas).toBe(1);
    expect(imagenes).toBe(0);
  });

  it("mide 22 × 28 mm y va al lado de la línea de la PERSONA, sin pisarla", () => {
    expect(CASILLA_HUELLA).toEqual({ ancho: 22, alto: 28 });
    const W = 210;
    const dado = casillaDeHuella("DADO", W, 126);
    expect(dado.x + dado.ancho).toBeLessThanOrEqual(W - 76); // la línea «Recibí conforme» empieza en W-76
    expect(dado.x).toBeGreaterThanOrEqual(76); // y no pisa la del negocio
    const recibido = casillaDeHuella("RECIBIDO", W, 126);
    expect(recibido.x).toBeGreaterThanOrEqual(76); // la persona firma a la izquierda (16-76)
    expect(recibido.x + recibido.ancho).toBeLessThanOrEqual(W - 76);
  });

  it("con la foto de la huella del registro, la foto va adentro", async () => {
    const { imagenes, crudo } = await pdf({ ...BASE, huella: { imagen: await imagen("jpeg", 40, 52) } });
    expect(imagenes).toBe(1);
    expect(crudo).toMatch(/\(Huella\) Tj/);
  });
});

describe("la firma del registro", () => {
  it("elige la vigente de cada tipo", () => {
    const vieja = firma({ id: "f0", vigente: false, creadoEn: "2026-10-01T15:00:00.000Z" });
    const huella = firma({ id: "h1", tipo: "HUELLA" });
    const { firma: f, huella: h } = vigentesDelRegistro([firma({}), vieja, huella]);
    expect(f?.id).toBe("f1");
    expect(h?.id).toBe("h1");
    expect(vigentesDelRegistro([vieja]).firma).toBeNull();
  });

  it("lleva el nombre, DNI y la hora de Lima DEL REGISTRO, no la de ahora", async () => {
    const f = firmaEnPapelDelRegistro(firma({ firmanteDocumento: "4567 8901" }), await imagen("jpeg", 90, 30));
    expect(f.fechaHora).toBe(fechaHoraLima(new Date("2026-10-08T02:14:00.000Z")));
    expect(f.fechaHora).toMatch(/07\/10\/2026 · 21:14$/);
    expect(f.documento).toBe("45678901");
    const { crudo, imagenes } = await pdf({ ...BASE, firma: f });
    expect(imagenes).toBe(1);
    expect(crudo).toContain("07/10/2026");
    expect(crudo).toContain("DNI 45678901");
  });

  it("acepta la firma en PNG (pantalla) o JPEG (leída del registro)", async () => {
    for (const fmt of ["png", "jpeg"] as const) {
      const f = firmaEnPapelDelRegistro(firma({}), await imagen(fmt, 90, 30));
      const { imagenes } = await pdf({ ...BASE, firma: f });
      expect(imagenes).toBe(1);
    }
  });
});

describe("firmó por otro monto", () => {
  it("avisa sólo si cambió al céntimo", () => {
    expect(avisoMontoFirmado({ monto: 150, moneda: "PEN", montoFirmado: 120 })).toMatch(/^Firmó por S\/\s?120\.00; el monto hoy es S\/\s?150\.00\.$/);
    expect(avisoMontoFirmado({ monto: 150, moneda: "PEN", montoFirmado: 150.004 })).toBeNull();
    expect(avisoMontoFirmado({ monto: 150, moneda: "PEN", montoFirmado: null })).toBeNull();
    expect(avisoMontoFirmado({ monto: 150, moneda: "PEN" })).toBeNull();
  });

  it("el papel lo dice", async () => {
    const { crudo } = await pdf({ ...BASE, montoFirmado: 120 });
    expect(crudo).toContain("el monto hoy es");
    const igual = await pdf({ ...BASE, montoFirmado: 150 });
    expect(igual.crudo).not.toContain("el monto hoy es");
  });
});

describe("páginas aparte", () => {
  it("legado: sin registro, la hoja firmada vieja va en la segunda página", async () => {
    const { paginas, crudo } = await pdf({ ...BASE, hojaFirmada: await imagen("jpeg", 60, 90) });
    expect(paginas).toBe(2);
    expect(crudo).toContain("Recibo firmado guardado en el adelanto");
  });

  it("el voucher va en su página «Comprobante de pago», además de la firma", async () => {
    const f = firmaEnPapelDelRegistro(firma({}), await imagen("jpeg", 90, 30));
    const { paginas, crudo, imagenes } = await pdf({ ...BASE, firma: f, voucher: await imagen("jpeg", 60, 90) });
    expect(paginas).toBe(2);
    expect(crudo).toContain("Comprobante de pago");
    expect(imagenes).toBe(2);
  });
});
