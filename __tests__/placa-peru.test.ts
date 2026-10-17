/**
 * placa-peru (29-09-2026) — la placa peruana leída con sus reglas.
 *
 * Los casos salen de la base: las placas REALES de las guías de SERFOR
 * (`V2H-901 / -`, `W2D-853 / -`) y las inventadas que se guardaron en guías
 * del CTP y del Libro TH (`WRFWR242`, `W3242G`, `QA-450`, `QBK-12…`).
 */

import { describe, expect, it } from "vitest";
import {
  formatearAlTipear,
  leerPlaca,
  mismaPlaca,
  normalizarPlacaPeru,
  partirPlacasDeGuia,
} from "@/lib/forestal/placa-peru";
import { gtfDatosVacio, faltantesGtf, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";

describe("leerPlaca — las reales de SERFOR", () => {
  it.each([
    ["V2H-901", "V2H-901", "V", "Arequipa"],
    ["W2D-853", "W2D-853", "W", "Huánuco, Junín y Pasco"],
    ["w2d 853", "W2D-853", "W", "Huánuco, Junín y Pasco"],
    ["AXQ871", "AXQ-871", "A", "Lima y Callao"],
  ])("%s es válida, se escribe %s y es de la zona %s", (entrada, formateada, letra, zona) => {
    const l = leerPlaca(entrada);
    expect(l.estado).toBe("valida");
    if (l.estado !== "valida") return;
    expect(l.formateada).toBe(formateada);
    expect(l.tipo).toBe("vehiculo");
    expect(l.letraZona).toBe(letra);
    expect(l.zona).toBe(zona);
    expect(l.aviso).toBeNull();
  });

  it("«V2H-901 / -» (placa / remolque de SERFOR) se lee como V2H-901", () => {
    const l = leerPlaca("V2H-901 / -");
    expect(l.estado === "valida" && l.formateada).toBe("V2H-901");
    expect(partirPlacasDeGuia("V2H-901 / -")).toEqual({ placa: "V2H-901", remolque: "" });
    expect(partirPlacasDeGuia("W2D-853 / W3A-123")).toEqual({ placa: "W2D-853", remolque: "W3A-123" });
    expect(partirPlacasDeGuia("W2D-853")).toEqual({ placa: "W2D-853", remolque: "" });
  });

  it("«V2H-901 / W3A-123» (casillero «Placa(s)» de SERFOR) se lee por la 1.ª, no «le sobran»", () => {
    const l = leerPlaca("V2H-901 / W3A-123");
    expect(l.estado === "valida" && [l.formateada, l.zona]).toEqual(["V2H-901", "Arequipa"]);
    expect(leerPlaca("- / W3A-123").estado).toBe("vacia");
  });

  it.each(["", "  ", "-", "/ -", " - / - "])("«%s» es vacía (no hay placa), no inválida", (v) => {
    expect(leerPlaca(v).estado).toBe("vacia");
  });
});

describe("leerPlaca — las inventadas que se guardaron", () => {
  it.each([
    ["WRFWR242", /sobran/i],
    ["W3242G", /tres últimos son números/i],
    ["QA-450", /faltan/i],
    ["QBK-12", /faltan/i],
    ["123-ABC", /letra de la zona/i],
  ])("%s es inválida y dice por qué", (placa, motivo) => {
    const l = leerPlaca(placa);
    expect(l.estado).toBe("invalida");
    if (l.estado === "invalida") expect(l.motivo).toMatch(motivo);
  });
});

describe("leerPlaca — casos que se avisan sin bloquear", () => {
  it("AB-1234 (vehículo menor) es válida pero avisa que es de moto", () => {
    const l = leerPlaca("AB-1234");
    expect(l.estado).toBe("valida");
    if (l.estado !== "valida") return;
    expect(l.tipo).toBe("menor");
    expect(l.formateada).toBe("AB-1234");
    expect(l.aviso).toMatch(/moto/i);
  });

  it("AB1234 sin guion es AB1-234: un formato de camión (MTC: A1B-234, AB1-234, ABC-123)", () => {
    const l = leerPlaca("AB1234");
    expect(l.estado === "valida" && [l.tipo, l.formateada]).toEqual(["vehiculo", "AB1-234"]);
  });

  it("una letra fuera de la tabla de zonas (Q) es válida con aviso", () => {
    const l = leerPlaca("QAT-902");
    expect(l.estado).toBe("valida");
    if (l.estado !== "valida") return;
    expect(l.zona).toBeNull();
    expect(l.aviso).toMatch(/zona registral/i);
  });
});

describe("formatearAlTipear", () => {
  it.each([
    ["w", "W"],
    ["w2d", "W2D"],
    ["w2d8", "W2D-8"],
    ["w2d853", "W2D-853"],
    ["W2D-853", "W2D-853"],
    ["w2d 853 extra", "W2D-853"],
    // Sin guion es AB1-234 (auto/camión); la moto sólo con su guion.
    ["ab1234", "AB1-234"],
    ["ab-", "AB-"],
    ["ab-12", "AB-12"],
    ["AB-1234", "AB-1234"],
    ["AB 1234", "AB-1234"],
    ["V2H-901 / -", "V2H-901"],
    // Pegados con basura de adelante o un 5.º número: no se come el último dígito.
    [" V2H-901", "V2H-901"],
    ["V2H - 901", "V2H-901"],
    ["AB-12345", "AB-1234"],
    ["-", ""],
  ])("«%s» → «%s»", (entrada, salida) => {
    expect(formatearAlTipear(entrada)).toBe(salida);
  });
});

describe("mismaPlaca / normalizarPlacaPeru", () => {
  it("compara sin guion, espacios ni mayúsculas", () => {
    expect(normalizarPlacaPeru(" w2d-853 ")).toBe("W2D853");
    expect(mismaPlaca("W2D-853", "w2d 853")).toBe(true);
    expect(mismaPlaca("W2D-853", "W2D-854")).toBe(false);
    expect(mismaPlaca("", "")).toBe(false);
  });
});

describe("faltantesGtf — la placa bloquea el registro en carretera, no en río", () => {
  const conPlaca = (modo: GtfDatos["vehiculo"]["modo"], placa: string, placaRemolque = ""): GtfDatos => {
    const d = gtfDatosVacio();
    return { ...d, vehiculo: { ...d.vehiculo, modo, placa, placaRemolque, embarcacion: "Chata Doña Rosa" } };
  };
  const dePlaca = (d: GtfDatos) => faltantesGtf(d).filter((f) => /formato no válido/.test(f.campo));

  it("terrestre con QA-450: falta, con el motivo", () => {
    const f = dePlaca(conPlaca("terrestre", "QA-450"));
    expect(f).toHaveLength(1);
    expect(f[0].campo).toBe("Placa del vehículo: formato no válido");
    expect(f[0].motivo).toMatch(/faltan/i);
  });

  it("terrestre con remolque inventado: falta el del remolque", () => {
    const f = dePlaca(conPlaca("terrestre", "W2D-853", "WRFWR242"));
    expect(f.map((x) => x.campo)).toEqual(["Placa del remolque: formato no válido"]);
  });

  it("terrestre con «V2H-901 / W3A-123» en la placa: nada (se lee la 1.ª)", () => {
    expect(dePlaca(conPlaca("terrestre", "V2H-901 / W3A-123"))).toEqual([]);
  });

  it("terrestre con W2D-853 y remolque «-»: nada", () => {
    expect(dePlaca(conPlaca("terrestre", "W2D-853", "-"))).toEqual([]);
  });

  it("multimodal también se valida (el casillero es la placa del camión)", () => {
    expect(dePlaca(conPlaca("multimodal", "QA-450"))).toHaveLength(1);
  });

  it("fluvial: la matrícula no sigue el formato y no se valida", () => {
    expect(dePlaca(conPlaca("fluvial", "IQ-12345-BM", "XX"))).toEqual([]);
  });
});
