/**
 * Tests — aviso de «fuera de plazo» AL REGISTRAR en el Libro TH (29-09).
 *
 * La RDE 264-2019 da 15 días para asentar una operación. La tabla y el impreso
 * la marcaban en ámbar recién después de guardar. Lo que se prueba:
 *   - el aviso sale sólo cuando el MISMO predicado de la tabla dice «fuera de
 *     plazo» (`estaFueraDePlazo`), con la hora de ahora como registro;
 *   - dice los días y la norma, y no bloquea nada;
 *   - aparece bajo la fecha en «Nueva línea» (tala, trozado, despacho de
 *     trozas) y en «Para todos» de «Talar varios árboles».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import LothAvisoPlazo from "@/components/admin/forestal/LothAvisoPlazo";
import LothEntryForm from "@/components/admin/forestal/LothEntryForm";
import LothTalaTandaComunes from "@/components/admin/forestal/LothTalaTandaComunes";
import { estaFueraDePlazo } from "@/lib/forestal/loth-constants";
import type { ComunesTala } from "@/lib/forestal/loth-tala-tanda";

/** El registro: martes 29/09 a las 10:00 de Lima (15:00 UTC). */
const AHORA = new Date("2026-09-29T15:00:00.000Z");
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const aviso = () => document.querySelector("[data-aviso-plazo]");

describe("LothAvisoPlazo", () => {
  it("55 días tarde: una línea con los días y la norma", () => {
    render(<LothAvisoPlazo fecha={haceDias(55)} ahora={AHORA} />);
    expect(aviso()?.getAttribute("data-aviso-plazo")).toBe("55");
    expect(aviso()?.textContent).toContain("Registras esto 55 días después: la norma pide 15. Queda marcado fuera de plazo.");
    // Coral por token del DS (texto chico → `-ink`), sin hex.
    expect(aviso()?.className).toContain("--data-warning-ink");
    // Trae su ⓘ con el detalle.
    expect(document.querySelector('button[aria-label="Qué significa fuera de plazo"]')).toBeTruthy();
  });

  it("dentro del plazo (hoy, 15 días) no dice nada", () => {
    for (const n of [0, 1, 15]) {
      const { unmount } = render(<LothAvisoPlazo fecha={haceDias(n)} ahora={AHORA} />);
      expect(aviso()).toBeNull();
      unmount();
    }
  });

  it("sin fecha o con una fecha a medio escribir no dice nada", () => {
    for (const f of ["", null, undefined, "2026-13-45"]) {
      const { unmount } = render(<LothAvisoPlazo fecha={f} ahora={AHORA} />);
      expect(aviso()).toBeNull();
      unmount();
    }
  });

  it("dice lo mismo que la tabla: el mismo predicado, día por día", () => {
    for (let n = 0; n <= 40; n++) {
      const f = haceDias(n);
      const { unmount } = render(<LothAvisoPlazo fecha={f} ahora={AHORA} />);
      expect(Boolean(aviso())).toBe(estaFueraDePlazo(`${f}T00:00:00.000Z`, AHORA));
      unmount();
    }
  });

  it("16 días: el primero fuera de plazo", () => {
    render(<LothAvisoPlazo fecha={haceDias(16)} ahora={AHORA} />);
    expect(aviso()?.textContent).toContain("Registras esto 16 días después");
  });
});

describe("dónde aparece", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const section of ["tala", "trozado", "despacho_troza"] as const) {
    it(`«Nueva línea» de ${section}: bajo la fecha, sin bloquear`, () => {
      render(<LothEntryForm section={section} onClose={() => {}} onSaved={() => {}} />);
      // El formulario vive en un modal (portal): se busca en el documento.
      const fecha = document.querySelector('input[type="date"]') as HTMLInputElement;
      expect(aviso()).toBeNull();
      fireEvent.change(fecha, { target: { value: haceDias(55) } });
      // Sin `ahora` fijo: el registro es hoy; 55 días atrás está fuera igual.
      expect(aviso()).toBeTruthy();
      expect(aviso()?.textContent).toMatch(/Registras esto 5\d días después: la norma pide 15/);
      // Va pegado al campo de la fecha (su misma columna), fuera del <label>.
      expect(aviso()?.closest("label")).toBeNull();
      expect(fecha.closest("div.col-span-3")?.contains(aviso())).toBe(true);
    });
  }

  it("«Para todos» de «Talar varios árboles»", () => {
    const props = {
      onComunes: () => {},
      forma: "promedio" as const,
      onForma: () => {},
      motosierristas: [],
      idLista: "lista",
      bloqueada: false,
    };
    const comunes: ComunesTala = { fecha: haceDias(3), motosierrista: "", motosierristaId: null, hora: "", modo: null };
    const { rerender } = render(<LothTalaTandaComunes {...props} comunes={comunes} />);
    expect(aviso()).toBeNull();
    rerender(<LothTalaTandaComunes {...props} comunes={{ ...comunes, fecha: haceDias(55) }} />);
    expect(aviso()?.textContent).toMatch(/Registras esto 5\d días después/);
    expect(aviso()?.closest("label")).toBeNull();
  });
});
