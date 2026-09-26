/**
 * La etiqueta de una troza trae DOS códigos de la misma pieza (ADR-436): el QR
 * `/admin/q/<id>` y el Code128 con el código de planta. Leídos seguidos, el
 * segundo decía «ya estaba» — un aviso falso. Regla: la MISMA troza recién
 * aceptada (<2 s) se ignora en silencio; pasado ese tiempo, sí es «ya estaba».
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ECO_DE_ETIQUETA_MS, esEcoDeEtiqueta } from "@/lib/forestal/leer-escaneo-troza";
import EscanerTrozas, { type TrozaDelEscaner } from "@/components/admin/forestal/EscanerTrozas";

const ID_A = "cmfTrozaAAAA0001";
const ID_B = "cmfTrozaBBBB0002";

describe("esEcoDeEtiqueta", () => {
  it("la misma troza dentro de 2 s es el eco de la etiqueta", () => {
    expect(esEcoDeEtiqueta({ id: ID_A, en: 1000 }, ID_A, 1000 + ECO_DE_ETIQUETA_MS - 1)).toBe(true);
  });
  it("a los 2 s justos ya no: es otra lectura", () => {
    expect(esEcoDeEtiqueta({ id: ID_A, en: 1000 }, ID_A, 1000 + ECO_DE_ETIQUETA_MS)).toBe(false);
  });
  it("otra troza nunca es eco, aunque sea al instante", () => {
    expect(esEcoDeEtiqueta({ id: ID_A, en: 1000 }, ID_B, 1001)).toBe(false);
  });
  it("sin lectura previa, o con reloj que retrocede, no es eco", () => {
    expect(esEcoDeEtiqueta(null, ID_A, 1000)).toBe(false);
    expect(esEcoDeEtiqueta({ id: ID_A, en: 5000 }, ID_A, 4000)).toBe(false);
  });
});

const TROZAS: TrozaDelEscaner[] = [
  { id: ID_A, codigoPlanta: "118", codificacion: "13/A (0000008)", especieComun: "Tornillo" },
  { id: ID_B, codigoPlanta: "119", codificacion: "13/A (0000009)", especieComun: "Cumala" },
];

/** La pantalla real (sierra, despacho): lo tildado vuelve como `yaElegidas`. */
function Arnes() {
  const [tildadas, setTildadas] = useState<Set<string>>(new Set());
  return (
    <EscanerTrozas
      trozas={TROZAS}
      yaElegidas={tildadas}
      onTroza={(t) => setTildadas((p) => new Set(p).add(t.id))}
    />
  );
}

function escanear(texto: string) {
  const campo = screen.getByPlaceholderText("Escanear o tipear código");
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.keyDown(campo, { key: "Enter" });
}

const aviso = () => document.querySelector("[data-escaner-resultado]");

describe("EscanerTrozas · QR + Code128 de la misma etiqueta", () => {
  afterEach(() => vi.restoreAllMocks());

  it("el Code128 justo después del QR no dice «ya estaba»", () => {
    const reloj = vi.spyOn(Date, "now").mockReturnValue(10_000);
    render(<Arnes />);
    escanear(`https://blas.buleje.pe/admin/q/${ID_A}`);
    expect(aviso()?.textContent).toContain("Troza 118 · Tornillo tildada");
    expect(aviso()?.getAttribute("data-escaner-resultado")).toBe("ok");

    reloj.mockReturnValue(10_400);
    escanear("118");
    expect(aviso()?.textContent).toContain("tildada");
    expect(aviso()?.textContent).not.toContain("ya estaba");
  });

  it("la misma etiqueta otra vez pasados 2 s sí avisa «ya estaba»", () => {
    const reloj = vi.spyOn(Date, "now").mockReturnValue(10_000);
    render(<Arnes />);
    escanear("118");
    reloj.mockReturnValue(10_000 + ECO_DE_ETIQUETA_MS + 1);
    escanear(`/admin/q/${ID_A}`);
    expect(aviso()?.textContent).toContain("ya estaba");
  });

  it("otra troza al instante se toma normal (el silencio es sólo para la misma)", () => {
    const reloj = vi.spyOn(Date, "now").mockReturnValue(10_000);
    render(<Arnes />);
    escanear("118");
    reloj.mockReturnValue(10_100);
    escanear("119");
    expect(aviso()?.textContent).toContain("Troza 119 · Cumala tildada");
  });
});
