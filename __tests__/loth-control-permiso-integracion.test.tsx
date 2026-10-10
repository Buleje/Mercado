/**
 * Tests — «Control del permiso» montado como lo monta el libro (jsdom): el
 * tablero con su encabezado (ficha + planes vivos + saldo por especie + cuadre
 * por guía), la API de guías y planes simulada con los datos de Blas medidos
 * el 30-09-2026:
 *  · dos planes vivos — cmuamvvnu… (el más nuevo, el de `?active=1`, sin
 *    vigencia) y cmrtxh5bp… (Tornillo, vigente hasta el lunes 20/03/2028);
 *  · GTF 019-0000002 (6,6102 m³, 2 piezas) que cuadra con 111-A + 113-A;
 *  · el libro cita la 001-0045678, que no está entre las emitidas → rojo.
 *
 * Lo que prueba: el orden de arriba abajo, que la banda vieja se fue, que el
 * plan vigente no queda fuera, que las plegables abren solas sólo con rojo y
 * se recuerdan, y que sin guías no se acusa a nadie.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LothTableroTrozas from "@/components/admin/forestal/LothTableroTrozas";
import LothControlPermisoEncabezado, {
  CLAVE_PLEGABLE_CUADRE,
  CLAVE_PLEGABLE_SALDO,
} from "@/components/admin/forestal/LothControlPermisoEncabezado";
import { planFichaDesdeApi } from "@/lib/forestal/loth-ficha-permiso";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

/** 30/09/2026, 10:00 de Lima. */
const AHORA = new Date("2026-09-30T15:00:00.000Z");
const P_TOR = "cmrtxh5bp-plan-tornillo";
const P_GRANDE = "cmuamvvnu-plan-grande";

const PLAN_GRANDE = {
  id: P_GRANDE, isActive: true, planType: "PO", planNumber: null, alias: null, estado: "vigente",
  titularName: "Inversiones Agroforestales Blas S.A.", parcelaCorta: null, vigenciaDesde: null, vigenciaHasta: null,
  createdAt: "2026-09-10T00:00:00.000Z",
};
const PLAN_TOR = {
  id: P_TOR, isActive: true, planType: "PO", planNumber: null, alias: "Tornillo", estado: "vigente",
  titularName: "Inversiones Agroforestales Blas S.A.", parcelaCorta: "PC-12",
  vigenciaDesde: "2026-03-20T00:00:00.000Z", vigenciaHasta: "2028-03-20T00:00:00.000Z",
  createdAt: "2026-03-20T00:00:00.000Z",
};
const GTFS = [
  { gtfNumber: "019-0000002", gtfDate: "2026-09-29T00:00:00.000Z", volumenTotalM3: "6.6102", piezasTotal: 2, placaVehiculo: "W2D-835", status: "emitida" },
];

let n = 0;
const base = {
  despachoCode: null, isRama: false, speciesScientific: null, cites: false, diamMayorM: null, diamMenorM: null,
  lengthM: null, productType: null, quantity: null, unit: null, pieces: null, gtfNumber: null, discarded: false,
  consumoInterno: false, observations: null, status: "registrado" as const, annulledReason: null, gpsLat: null,
  gpsLng: null, photoUrl: null, treeCode: null, trozaCode: null, speciesCommon: null, volumeM3: null, planId: null,
};
const l = (p: Partial<LothEntryDTO> & Pick<LothEntryDTO, "section">): LothEntryDTO => ({
  ...base, id: `e${++n}`, lineNo: n, entryDate: "2026-09-22T00:00:00.000Z", ...p,
});

const ENTRIES: LothEntryDTO[] = [
  l({ section: "tala", treeCode: "111", speciesCommon: "Copaiba", volumeM3: "10.3700", planId: P_GRANDE }),
  l({ section: "tala", treeCode: "113", speciesCommon: "Sapotillo", volumeM3: "4.1420", planId: P_GRANDE }),
  l({ section: "trozado", treeCode: "111", trozaCode: "111-A", speciesCommon: "Copaiba", volumeM3: "4.9510", planId: P_GRANDE }),
  l({ section: "trozado", treeCode: "113", trozaCode: "113-A", speciesCommon: "Sapotillo", volumeM3: "1.6590", planId: P_GRANDE }),
  l({ section: "despacho_troza", treeCode: "111", trozaCode: "111-A", gtfNumber: "019-0000002", planId: P_GRANDE }),
  l({ section: "despacho_troza", treeCode: "113", trozaCode: "113-A", gtfNumber: "019-0000002", planId: P_GRANDE }),
  l({ section: "tala", treeCode: "85-TOR", speciesCommon: "Tornillo", volumeM3: "3.5640", planId: P_TOR }),
  l({ section: "trozado", treeCode: "85-TOR", trozaCode: "001-TOR-A", speciesCommon: "Tornillo", volumeM3: "2.8500", planId: P_TOR }),
  l({ section: "despacho_troza", treeCode: "85-TOR", trozaCode: "001-TOR-A", gtfNumber: "001-0045678", planId: P_TOR }),
];
const CENSO_GRANDE = [
  { treeCode: "111", speciesCommon: "Copaiba", volumenEstimadoM3: 120 },
  { treeCode: "113", speciesCommon: "Sapotillo", volumenEstimadoM3: 70 },
];

function mockApi({ gtfOk = true } = {}) {
  return vi.fn(async (url: string) => {
    if (url.includes("/gtf")) {
      return gtfOk ? new Response(JSON.stringify({ gtfs: GTFS }), { status: 200 }) : new Response("{}", { status: 500 });
    }
    // Del más nuevo al más viejo, como `listPlans`.
    return new Response(JSON.stringify({ plans: [PLAN_GRANDE, PLAN_TOR] }), { status: 200 });
  });
}

function montar(cb: { onPlan?: () => void; onCaratula?: () => void } = {}) {
  return render(
    <LothTableroTrozas
      entries={ENTRIES}
      caratula={null}
      encabezado={(datos) => (
        <LothControlPermisoEncabezado
          datos={datos}
          caratula={null}
          planActivo={planFichaDesdeApi(PLAN_GRANDE)}
          saldo={{ censo: CENSO_GRANDE, entries: ENTRIES, autorizadas: [] }}
          onCompletarPlan={cb.onPlan}
          onCompletarCaratula={cb.onCaratula}
        />
      )}
    />,
  );
}

const panelDe = (titulo: string) => {
  const boton = screen.getByRole("button", { name: new RegExp(`(Ver|Ocultar) ${titulo.toLowerCase()}`) });
  return { boton, panel: document.getElementById(boton.getAttribute("aria-controls") ?? "") as HTMLElement };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Control del permiso — tablero + ficha + saldo + cuadre (Blas)", () => {
  it("de arriba abajo: ficha, planes vivos, saldo, cuadre, estado de las trozas; sin la banda vieja", async () => {
    vi.stubGlobal("fetch", mockApi());
    const { container } = montar();
    await waitFor(() => expect(screen.getByLabelText("Planes vivos")).toBeTruthy());
    const html = container.innerHTML;
    const pos = (s: string) => {
      const i = html.indexOf(s);
      expect(i, s).toBeGreaterThanOrEqual(0);
      return i;
    };
    const orden = [
      pos('aria-label="Ficha del permiso"'),
      pos('aria-label="Planes vivos"'),
      pos("Saldo por especie"),
      pos("Cuadre por guía"),
      pos("Estado de las trozas"),
    ];
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    // La banda de seis códigos ya no se dibuja: la ficha trae los mismos.
    expect(screen.queryByText("N° registro del libro")).toBeNull();
  });

  it("el plan vigente de Tornillo no queda fuera: una fila por plan vivo, el del libro marcado", async () => {
    vi.stubGlobal("fetch", mockApi());
    const onPlan = vi.fn();
    montar({ onPlan });
    const lista = await screen.findByLabelText("Planes vivos");
    const filas = within(lista).getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(filas[0].getAttribute("data-plan-vivo")).toBe(P_GRANDE);
    expect(within(filas[0]).getByText("el del libro")).toBeTruthy();
    expect(within(filas[0]).getByText("Sin vigencia")).toBeTruthy();
    expect(within(filas[1]).getByText("Vigente")).toBeTruthy();
    expect(within(filas[1]).getByText("quedan 537 días")).toBeTruthy();
    expect(filas[1].textContent).toContain("hasta el lunes 20/03/2028");
    expect(filas[1].textContent).toContain("PC-12");
    // La ficha grande sigue al plan del libro (sin vigencia) y ofrece completarlo.
    const ficha = screen.getByLabelText("Ficha del permiso");
    expect(within(ficha).getByText("Sin vigencia")).toBeTruthy();
    fireEvent.click(within(ficha).getByRole("button", { name: /^Completar: El plan no tiene vigencia/ }));
    expect(onPlan).toHaveBeenCalledTimes(1);
  });

  it("el cuadre arranca abierto porque tiene rojo; el saldo, plegado pero con sus cifras", async () => {
    vi.stubGlobal("fetch", mockApi());
    montar();
    await waitFor(() => expect(screen.getAllByText("Citada, sin registrar").length).toBeGreaterThan(0));
    const cuadre = panelDe("Cuadre por guía");
    expect(cuadre.boton.getAttribute("aria-expanded")).toBe("true");
    expect(cuadre.panel.hidden).toBe(false);
    /* En la fila, no en la lista del autofiltro «Veredicto» (05-10), que también dice «Cuadra». */
    expect(within(cuadre.panel.querySelector("tbody") as HTMLElement).getByText("Cuadra")).toBeTruthy(); // 019-0000002: 4,951 + 1,659 ≈ 6,6102

    const saldo = panelDe("Saldo por especie");
    expect(saldo.boton.getAttribute("aria-expanded")).toBe("false");
    expect(saldo.panel.hidden).toBe(true);
    // Plegado no es esconder: la línea de la cabecera sigue diciendo sus cifras.
    expect(saldo.boton.parentElement?.textContent).toMatch(/m³ por talar · .* m³ en patio/);
  });

  it("abrir el saldo queda recordado en localStorage", async () => {
    vi.stubGlobal("fetch", mockApi());
    const { unmount } = montar();
    fireEvent.click(panelDe("Saldo por especie").boton);
    expect(panelDe("Saldo por especie").panel.hidden).toBe(false);
    expect(window.localStorage.getItem(CLAVE_PLEGABLE_SALDO)).toBe("true");
    // Plegar el cuadre aunque tenga rojo también se respeta.
    await waitFor(() => expect(panelDe("Cuadre por guía").boton.getAttribute("aria-expanded")).toBe("true"));
    fireEvent.click(panelDe("Cuadre por guía").boton);
    expect(window.localStorage.getItem(CLAVE_PLEGABLE_CUADRE)).toBe("false");
    unmount();
    montar();
    expect(panelDe("Saldo por especie").panel.hidden).toBe(false);
    await waitFor(() => expect(screen.getAllByText(/Citada, sin registrar/).length).toBeGreaterThan(0));
    expect(panelDe("Cuadre por guía").panel.hidden).toBe(true);
  });

  it("sin la lista de guías no acusa a nadie: lo dice y no cuadra contra vacío", async () => {
    vi.stubGlobal("fetch", mockApi({ gtfOk: false }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    montar();
    await waitFor(() => expect(screen.getByText("No se pudieron leer las guías")).toBeTruthy());
    expect(screen.queryByText(/Citada, sin registrar/)).toBeNull();
    expect(panelDe("Cuadre por guía").boton.getAttribute("aria-expanded")).toBe("false");
  });
});
