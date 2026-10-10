import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  codigoDeEtiqueta,
  codigoDeFichaTexto,
  esLineaDeFicha,
  medidasDeFicha,
  textoFichaDeTroza,
} from "@/lib/forestal/ficha-texto-troza";
import { leerEscaneo } from "@/lib/forestal/leer-escaneo-troza";
import {
  correccionDeQr,
  cssEtiquetas,
  FORMATOS_ETIQUETA,
  htmlEtiqueta,
} from "@/lib/forestal/ctp-troza-etiquetas";

const troza = (p: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id: "cmg0000000000000000000001",
  woodEntryId: "e1",
  codificacion: "13/A (0000008)",
  codigoPlanta: "118",
  especieComun: "Tornillo",
  volumenM3: 0.647,
  largoM: 4.2,
  gtfNumber: "001-0000201",
  libroNro: 45,
  constanciaSniffs: "1-19-0313629",
  proveedor: "COMUNIDAD NATIVA SANTA ROSA",
  permiso: "19-SEC/REG-PLT-2021-017",
  ...p,
});

/**
 * La troza más larga que hoy tiene Blas en el patio, campo por campo (medido
 * el 26-09 sobre la base: titular de 41 letras, permiso de 27, especie de 12)
 * con todo lo opcional lleno y un correlativo de 8 cifras.
 */
const LA_MAS_LARGA = troza({
  codigoPlanta: "90100135",
  codificacion: "10-HUA/0000123 (0000456)",
  especieComun: "Azucar huayo",
  volumenM3: 12.345,
  d1Cm: 145.5,
  d2Cm: 138.5,
  largoM: 12.35,
  libroNro: 12345,
  gtfNumber: "001-0012345",
  constanciaSniffs: "1-19-0313629",
  proveedor: "COMUNIDAD NATIVA SANTA ROSA DE MASHANGAY", // 41
  permiso: "10-HUA-PUE/PER-FMP-2026-007", // 27
  oxPt: 1234.56,
} as TrozaConsumible & { oxPt: number });

describe("textoFichaDeTroza", () => {
  it("lleva lo que pidió Brandon: código, especie, m³, medidas, N° de registro, GTF, titular y permiso", () => {
    const f = textoFichaDeTroza(troza({ d1Cm: 45, d2Cm: 48 }));
    const lineas = f.split("\n");
    expect(lineas[0]).toBe("TROZA 118");
    expect(f).toContain("🌳 Tornillo");
    expect(f).toContain("📦 0.647 m³");
    expect(f).toContain("📏 D1 45 · D2 48 cm · L 4.20 m");
    expect(f).toContain("🧾 Reg. N° 45");
    expect(f).toContain("🚚 GTF 001-0000201");
    expect(f).toContain("🔎 SNIFFS 1-19-0313629");
    expect(f).toContain("👤 COMUNIDAD NATIVA SANTA ROSA");
    expect(f).toContain("📜 Permiso 19-SEC/REG-PLT-2021-017");
    expect(f).not.toContain("0000008"); // el código del bosque no va en el QR (sí impreso)
    /* La raya separa la madera de sus papeles. */
    expect(lineas.indexOf("──────")).toBe(lineas.findIndex((l) => l.startsWith("🧾")) - 1);
  });

  it("lo que falta no se escribe (ni «null» ni «undefined»), salvo las medidas: D1, D2 y largo van siempre", () => {
    const f = textoFichaDeTroza(
      troza({ largoM: null, libroNro: null, constanciaSniffs: null, permiso: null, proveedor: "  " }),
    );
    expect(f).not.toMatch(/null|undefined/);
    expect(f).toContain("📏 D1 — · D2 — · L —");
    expect(f).not.toContain("👤");
    expect(f).not.toContain("Reg. N°");
  });

  it("sin marca de planta, el código de arriba es el del bosque y no se repite abajo", () => {
    const f = textoFichaDeTroza(troza({ codigoPlanta: null }));
    expect(f.split("\n")[0]).toBe("TROZA 13/A (0000008)");
    expect(f.split("\n").filter((l) => l.includes("0000008"))).toHaveLength(1);
  });

  it("nunca lleva DNI ni RUC: la etiqueta queda a la vista en la madera", () => {
    const conDocumento = { ...LA_MAS_LARGA, providerDocument: "20600000001" } as TrozaConsumible;
    const f = textoFichaDeTroza(conDocumento);
    expect(f).not.toContain("20600000001");
    expect(f).not.toMatch(/^(RUC|DNI|Documento)/m);
  });
});

describe("PT Oxapampa en la ficha", () => {
  it("si la troza ya se cubicó, va su PT entero; si no, no hay línea", () => {
    expect(textoFichaDeTroza({ ...troza(), oxPt: 163.4 })).toContain("🪚 163 PT Oxapampa");
    expect(textoFichaDeTroza(troza())).not.toContain("🪚");
  });
});

describe("tamaño del QR de la ficha", () => {
  it("con el codificador real: versión 10 con «L» (57 módulos) — 0,35 mm en el sticker de 20 mm", () => {
    const qr = QRCode.create(textoFichaDeTroza(LA_MAS_LARGA), { errorCorrectionLevel: "L" });
    expect(qr.version).toBeLessThanOrEqual(10);
  });

  it("los formatos chicos usan «L»; el rollo ancho y la testa, «M» (tolera más suciedad)", () => {
    expect(correccionDeQr("a4-3x7").grande).toBe("L");
    expect(correccionDeQr("rollo-50x30").grande).toBe("L");
    expect(correccionDeQr("rollo-100x50").grande).toBe("M");
    expect(correccionDeQr("testa-a6").grande).toBe("M");
  });

  it("en cada formato el módulo del QR de la ficha mide al menos 0,28 mm", () => {
    for (const f of FORMATOS_ETIQUETA) {
      const ecc = correccionDeQr(f.id).grande;
      const qr = QRCode.create(textoFichaDeTroza(LA_MAS_LARGA), { errorCorrectionLevel: ecc });
      /* margin 1 = un módulo de borde por lado. */
      expect(f.qrMm / (qr.modules.size + 2), f.id).toBeGreaterThanOrEqual(0.28);
    }
  });
});

describe("leer la ficha escaneada", () => {
  it("de la ficha entera sale el código de la primera línea", () => {
    expect(codigoDeFichaTexto(textoFichaDeTroza(troza()))).toBe("118");
  });

  it("la primera línea sola también (la pistola 2D manda cada línea con Enter)", () => {
    expect(codigoDeFichaTexto("TROZA 115-A")).toBe("115-A");
  });

  it("con los saltos de línea tragados (pistola o campo de texto), el código igual sale entero", () => {
    expect(codigoDeFichaTexto("TROZA 90100123Especie: CachimboVolumen: 1.200 m³")).toBe("90100123");
    expect(codigoDeFichaTexto("TROZA 13/A (0000008)Especie: Tornillo")).toBe("13/A (0000008)");
    expect(leerEscaneo(textoFichaDeTroza(troza()).replace(/\n/g, ""))).toEqual({ tipo: "codigo", codigo: "118" });
  });

  it("una ficha sin código, o un texto que no es ficha, no identifica nada", () => {
    expect(codigoDeFichaTexto("TROZA —")).toBeNull();
    expect(codigoDeFichaTexto("Hola")).toBeNull();
    expect(codigoDeFichaTexto("")).toBeNull();
  });

  it("la ficha de una pieza sin código no se busca como código (antes: «ninguna troza con el código TROZA — ESPECIE…»)", () => {
    expect(leerEscaneo("TROZA —\nEspecie: Tornillo")).toBeNull();
  });

  it("el lector del sistema entiende el QR grande como el código de la pieza", () => {
    expect(leerEscaneo(textoFichaDeTroza(troza()))).toEqual({ tipo: "codigo", codigo: "118" });
  });

  it("las líneas sueltas de la ficha (ícono o raya) se reconocen: no avisan «ninguna troza»", () => {
    for (const l of textoFichaDeTroza(troza()).split("\n").slice(1)) expect(esLineaDeFicha(l), l).toBe(true);
    expect(esLineaDeFicha("Titular: COMUNIDAD NATIVA SANTA ROSA")).toBe(true);
    expect(esLineaDeFicha("N° registro: 45")).toBe(true);
    expect(esLineaDeFicha("118")).toBe(false);
    expect(esLineaDeFicha("13/A (0000008)")).toBe(false);
  });
});

describe("etiqueta con dos QR", () => {
  const svg = '<svg viewBox="0 0 1 1"></svg>';

  it("con el QR chico, la etiqueta lleva los dos y se marca «dos»", () => {
    const html = htmlEtiqueta(troza(), svg, { formato: "a4-3x7", barras: true, qrChicoSvg: svg });
    expect(html).toContain('class="etq dos"');
    expect(html).toContain('class="chico"');
    expect(html).toContain("Ficha de la troza 118");
  });

  it("con la cubicación Oxapampa, el pie lleva su PT; sin ella, no", () => {
    const con = htmlEtiqueta({ ...troza(), oxPt: 195.92 }, svg, { formato: "a4-3x7", barras: true, qrChicoSvg: svg });
    expect(con).toContain('<b class="ptox">196 PT</b>');
    expect(htmlEtiqueta(troza(), svg, { formato: "a4-3x7", barras: true })).not.toContain("ptox");
  });

  it("sin el chico queda la etiqueta de antes: un QR", () => {
    const html = htmlEtiqueta(troza(), svg, { formato: "a4-3x7", barras: true });
    expect(html).toContain('class="etq"');
    expect(html).not.toContain('class="chico"');
  });

  it("cada formato sabe dónde va el QR chico", () => {
    for (const f of FORMATOS_ETIQUETA) {
      expect(cssEtiquetas(f.id), f.id).toMatch(/\.etq\.dos\s*\{[^}]*chico/);
      expect(f.qrChicoMm, f.id).toBeLessThan(f.qrMm);
    }
  });
});

describe("medidas y código", () => {
  it("D1, D2 y largo siempre; lo que falta, «—»", () => {
    expect(medidasDeFicha({ d1Cm: 45, largoM: 3 })).toBe("D1 45 · D2 — cm · L 3.00 m");
    expect(medidasDeFicha({})).toBe("D1 — · D2 — · L —");
  });

  it("«-» es sin código: la etiqueta dice «—»", () => {
    expect(codigoDeEtiqueta({ codigoPlanta: null, codificacion: "-" })).toBe("—");
  });
});
