import { describe, expect, it } from "vitest";
import { horaLima, textoAvisoBorrado, tocaAvisar, UMBRAL_AVISO_BORRADO } from "@/lib/forestal/loth-aviso-borrado";

describe("tocaAvisar", () => {
  it("en bloque avisa desde 10 líneas", () => {
    expect(tocaAvisar(UMBRAL_AVISO_BORRADO - 1)).toBe(false);
    expect(tocaAvisar(UMBRAL_AVISO_BORRADO)).toBe(true);
    expect(tocaAvisar(44)).toBe(true);
  });
  it("de a una avisa sólo al cruzar las 10 (no repite con la 11.ª)", () => {
    expect(tocaAvisar(9, true)).toBe(false);
    expect(tocaAvisar(10, true)).toBe(true);
    expect(tocaAvisar(11, true)).toBe(false);
  });
});

describe("textoAvisoBorrado", () => {
  // Blas, 06-10 23:35 de Lima = 07-10 04:35 UTC.
  const base = {
    borradas: 44,
    porSeccion: [
      { section: "despacho_troza" as const, borradas: 22 },
      { section: "trozado" as const, borradas: 22 },
    ],
    m3: 20.303,
    user: "blasadmin",
    cuando: new Date("2026-10-07T04:35:29.340Z"),
    negocio: "Inversiones <Blas> & Cía",
  };

  it("dice cuántas, quién, a qué hora de Lima, qué secciones (de la fuente a la salida) y dónde recuperar", () => {
    const t = textoAvisoBorrado(base);
    expect(t).toContain("<b>Se borraron 44 líneas del Libro TH</b>");
    expect(t).toContain("Por: blasadmin · 06/10 23:35");
    expect(t).toContain("22 Trozado · 22 Despacho de trozas · 20.303 m³");
    expect(t).toContain("Papelera del libro");
  });

  it("escapa el HTML del nombre del negocio (Telegram lo rechazaría)", () => {
    expect(textoAvisoBorrado(base)).toContain("Inversiones &lt;Blas&gt; &amp; Cía");
  });

  it("sin m³ (sólo despachos) no dice «0 m³»; de a una lo dice en el título", () => {
    const t = textoAvisoBorrado({ ...base, borradas: 10, m3: 0, porSeccion: [{ section: "despacho_troza", borradas: 10 }], sueltas: true });
    expect(t).toContain("Van 10 líneas borradas del Libro TH en 10 minutos");
    expect(t).not.toContain("m³");
  });

  it("la hora es la de Lima aunque sea otro día en UTC", () => {
    expect(horaLima(new Date("2026-10-07T01:17:24.018Z"))).toBe("06/10 20:17");
  });
});
