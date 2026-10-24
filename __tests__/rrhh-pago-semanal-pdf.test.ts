/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { inflateSync } from "zlib";
import type { Membrete } from "@/lib/admin/membrete";
import { pdfPagoSemanal, type DatosPagoSemanal } from "@/lib/rrhh/pago-semanal-pdf";

/** Todo el texto del PDF, concatenado (decodifica los `<hex> Tj` de cada stream). */
function textoDelPdf(bytes: Uint8Array): string {
  const crudo = Buffer.from(bytes).toString("latin1");
  const partes: string[] = [];
  for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let s: string;
    try {
      s = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      continue;
    }
    if (!/\bBT\b/.test(s)) continue;
    for (const t of s.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
      partes.push(Buffer.from(t[1], "hex").toString("latin1"));
    }
  }
  return partes.join(" ");
}

const membrete: Membrete = {
  nombre: "Bodega San Martin",
  logoUrl: null,
  telefono: null,
  direccion: null,
  ruc: "20123456789",
  pie: null,
  razonSocial: null,
  correo: null,
};

const base: DatosPagoSemanal = {
  membrete,
  nombre: "Juan Perez",
  puesto: "Cajero",
  desde: "2026-10-13",
  hasta: "2026-10-19",
  total: 1320,
  comoSale: ["22 dias x S/ 60.00 = S/ 1,320.00"],
  conteo: { PRESENTE: 5, FALTA: 1, TARDANZA: 0 },
  adelantos: { abiertosPen: 200, descontadoPen: 0 },
  aPagar: 1120,
  deuda: 0,
};

describe("pdfPagoSemanal", () => {
  it("el comprobante lleva nombre, puesto, la semana y el total formateado", async () => {
    const texto = textoDelPdf(await pdfPagoSemanal(base));
    expect(texto).toContain("Juan Perez");
    expect(texto).toContain("Cajero");
    // Fechas date-only reformateadas DD/MM/YYYY, sin correrse un dia.
    expect(texto).toContain("13/10/2026");
    expect(texto).toContain("19/10/2026");
    // El total, con 2 decimales y separador de miles es-PE.
    expect(texto).toContain("S/ 1,320.00");
    // Disclaimer obligatorio: es referencia, no boleta.
    expect(texto).toMatch(/no es planilla electronica ni boleta/i);
  });

  it("con cuenta vinculada muestra «Queda por pagar» y el saldo de adelantos", async () => {
    const texto = textoDelPdf(await pdfPagoSemanal(base));
    expect(texto).toContain("Queda por pagar");
    expect(texto).toContain("S/ 1,120.00");
    expect(texto).toContain("S/ 200.00");
  });

  it("si sigue debiendo tras descontar, lo dice en vez de «Queda por pagar»", async () => {
    const texto = textoDelPdf(
      await pdfPagoSemanal({ ...base, total: 100, adelantos: { abiertosPen: 300, descontadoPen: 0 }, aPagar: 0, deuda: 200 }),
    );
    expect(texto).toContain("Sigue debiendo");
    expect(texto).not.toContain("Queda por pagar");
  });

  it("sin cuenta vinculada no dibuja la seccion de adelantos ni «Queda por pagar»", async () => {
    const texto = textoDelPdf(await pdfPagoSemanal({ ...base, adelantos: null, aPagar: null, deuda: null }));
    expect(texto).toContain("Juan Perez");
    expect(texto).not.toContain("Queda por pagar");
    expect(texto).not.toContain("Adelantos abiertos");
  });

  it("muestra sólo los estados con conteo > 0", async () => {
    const texto = textoDelPdf(await pdfPagoSemanal(base));
    expect(texto).toContain("Presente: 5");
    expect(texto).toContain("Falta: 1");
    expect(texto).not.toContain("Tardanza: 0");
  });
});
