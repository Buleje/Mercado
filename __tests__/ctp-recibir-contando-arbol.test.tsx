/**
 * «La troza recuerda su árbol» (ADR-450 L4) — lo que la ficha dice y adónde lleva.
 *
 *   · la frase y los renglones salen del Libro TH con el estado de sus líneas:
 *     una tala anulada se cuenta como historia, una zona UTM supuesta se dice;
 *   · «Ver en el mapa del bosque» lleva a `?tab=loth-libro-operaciones&vista=mapa&arbol=113`
 *     (dentro del panel, por `admin:navigate` + los parámetros propios);
 *   · lo medido en planta se muestra aparte: la guía no se toca.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { armarArbolDeTroza, type ArbolDeTroza, type CensoDelArbol, type TalaDelArbol } from "@/lib/forestal/arbol-de-troza";
import { fraseDeMedidaEnPlanta, renglonesDelBosque, urlDelArbolEnElMapa } from "@/lib/forestal/tarjeta-troza";
import { ChipArbol, HitoDelBosque, irAlArbolEnElMapa } from "@/components/admin/forestal/ctp-arbol-de-la-troza";

const trozado = { id: "tz1", lineNo: 12, entryDate: "2026-09-28", status: "registrado", deletedAt: null, treeCode: "113", trozaCode: "113-A", speciesCommon: "Sapotillo", speciesScientific: "Quararibea sp." };
const tala: TalaDelArbol = { id: "tl1", lineNo: 7, entryDate: "2026-09-28", status: "registrado", deletedAt: null, gpsLat: -8.38, gpsLng: -74.55, gpsOrigen: "telefono" };
const censo: CensoDelArbol = { utmX: 550000, utmY: 9073000, utmZona: null, parcelaCorta: "PC-2", condicion: "aprovechable" };

const arbol = (t: TalaDelArbol = tala, c: CensoDelArbol | null = censo): ArbolDeTroza => {
  const a = armarArbolDeTroza(trozado, t, c);
  if (!a) throw new Error("sin árbol");
  return a;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("Del bosque · renglones", () => {
  it("tala vigente con GPS del teléfono", () => {
    const r = renglonesDelBosque(arbol());
    expect(r.find((x) => x.rotulo === "Tala")?.valor).toBe("línea N° 7 del lunes 28/09");
    expect(r.find((x) => x.rotulo === "Trozado")?.valor).toBe("línea N° 12 del lunes 28/09");
    expect(r.find((x) => x.rotulo === "Ubicación")?.valor).toBe("GPS del teléfono al talar");
    expect(r.find((x) => x.rotulo === "Censo")?.valor).toBe("parcela PC-2 · aprovechable");
    expect(r.some((x) => x.aviso)).toBe(false);
  });

  it("tala anulada = historia; sin GPS cae a la UTM del censo con la zona supuesta", () => {
    const a = arbol({ ...tala, status: "anulado", gpsLat: null, gpsLng: null });
    const r = renglonesDelBosque(a);
    expect(r.find((x) => x.rotulo === "Tala")).toMatchObject({ valor: "línea N° 7 del lunes 28/09 · se anuló en el Libro TH", aviso: true });
    expect(r.find((x) => x.rotulo === "Ubicación")).toMatchObject({ aviso: true });
    expect(r.find((x) => x.rotulo === "Ubicación")?.valor).toMatch(/se supuso la 18S/);
  });

  it("la dirección del mapa", () => {
    expect(urlDelArbolEnElMapa("113")).toBe("/admin?tab=loth-libro-operaciones&vista=mapa&arbol=113");
  });

  it("lo medido en planta, aparte de la guía", () => {
    expect(fraseDeMedidaEnPlanta(null, 1.6)).toBeNull();
    expect(fraseDeMedidaEnPlanta({ d1Cm: 100, d2Cm: 96, largoM: 4.2, volumenM3: 1.2682 }, 1.6592)).toBe(
      "En planta 100·96 cm · 4.20 m = 1.268 m³ (la guía dice 1.659 m³)",
    );
  });
});

describe("Del bosque · pantalla", () => {
  it("el hito dice la frase y la tala anulada; sin árbol ni código no dibuja nada", () => {
    const { container, rerender } = render(<ol><HitoDelBosque arbol={arbol({ ...tala, status: "anulado" })} arbolCodigo="113" /></ol>);
    expect(screen.getByText("Salió del árbol 113 · Sapotillo, talado el lunes 28/09 (esa tala se anuló en el Libro TH)")).toBeTruthy();
    rerender(<ol><HitoDelBosque arbol={null} arbolCodigo={null} /></ol>);
    expect(container.querySelector("li")).toBeNull();
    rerender(<ol><HitoDelBosque arbol={null} arbolCodigo="113" /></ol>);
    expect(screen.getByText("Salió del árbol 113")).toBeTruthy();
  });

  it("«Ver en el mapa del bosque» desde otro módulo del panel: navega al Libro TH con ?arbol=", () => {
    window.history.replaceState(null, "", "/admin?tab=ctp-libro-operaciones&vista=trozas");
    const eventos: string[] = [];
    window.addEventListener("admin:navigate", (e) => eventos.push(JSON.stringify((e as CustomEvent).detail)), { once: true });
    render(<ol><HitoDelBosque arbol={arbol()} arbolCodigo="113" /></ol>);
    fireEvent.click(screen.getByRole("button", { name: /Ver en el mapa del bosque/ }));
    expect(eventos).toEqual([JSON.stringify({ tab: "loth-libro-operaciones", vista: "mapa" })]);
    const q = new URLSearchParams(window.location.search);
    expect([q.get("tab"), q.get("vista"), q.get("arbol")]).toEqual(["loth-libro-operaciones", "mapa", "113"]);
  });

  it("ya en el Libro TH: pushState propio (el «atrás» vuelve)", () => {
    window.history.replaceState(null, "", "/admin?tab=loth-libro-operaciones&vista=secciones");
    const push = vi.spyOn(window.history, "pushState");
    irAlArbolEnElMapa("113");
    expect(push).toHaveBeenCalledWith(null, "", "/admin?tab=loth-libro-operaciones&vista=mapa&arbol=113");
  });

  it("el chip del patio", () => {
    const { container, rerender } = render(<ChipArbol codigo="113" />);
    expect(screen.getByText(/Árbol 113/)).toBeTruthy();
    rerender(<ChipArbol codigo=" " />);
    expect(container.textContent).toBe("");
  });
});
