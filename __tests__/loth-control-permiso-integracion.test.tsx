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
 * plan vigente no queda fuera, que el cuadre arranca cerrado aun con rojo
 * (17-10, «compactar el Libro TH»: el rojo lo dice el borde y su resumen), que
 * lo abierto se recuerda, y que sin guías no se acusa a nadie.
 *
 * Desde el 17-10 la ficha es una línea («Vigente · N días · Ver ficha») y el
 * saldo otra; la ficha entera y los planes vivos se abren con «Ver ficha». Acá
 * el encabezado va SIN las pestañas del Control: el saldo por especie se abre
 * en su lugar («Ver por especie»); dentro de ellas es un enlace a Extracción.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LothTableroTrozas from "@/components/admin/forestal/LothTableroTrozas";
import LothControlPermisoEncabezado, {
  CLAVE_FICHA_ABIERTA,
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
/** «Ver ficha» despliega la ficha entera y los planes vivos. */
const abrirFicha = () => fireEvent.click(screen.getByRole("button", { name: /Ver ficha/ }));

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
  it("de arriba abajo: línea de la ficha, línea del saldo, ficha y planes vivos al abrir, cuadre, estado de las trozas; sin la banda vieja", async () => {
    vi.stubGlobal("fetch", mockApi());
    const { container } = montar();
    abrirFicha();
    await waitFor(() => expect(screen.getByLabelText("Planes vivos")).toBeTruthy());
    const html = container.innerHTML;
    const pos = (s: string) => {
      const i = html.indexOf(s);
      expect(i, s).toBeGreaterThanOrEqual(0);
      return i;
    };
    const orden = [
      pos("data-ficha-linea"),
      pos("data-saldo-linea"),
      pos('aria-label="Ficha del permiso"'),
      pos('aria-label="Planes vivos"'),
      pos("Cuadre por guía"),
      pos("Estado de las trozas"),
    ];
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    // La banda de seis códigos ya no se dibuja: la ficha trae los mismos.
    expect(screen.queryByText("N° registro del libro")).toBeNull();
  });

  it("cerrada, la ficha no se dibuja; la línea ya dice el estado", async () => {
    vi.stubGlobal("fetch", mockApi());
    const { container } = montar();
    expect(screen.queryByLabelText("Ficha del permiso")).toBeNull();
    expect(screen.queryByLabelText("Planes vivos")).toBeNull();
    const linea = container.querySelector("[data-ficha-linea]") as HTMLElement;
    expect(within(linea).getByText("Sin vigencia")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver ficha/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("el plan vigente de Tornillo no queda fuera: una fila por plan vivo, el del libro marcado", async () => {
    vi.stubGlobal("fetch", mockApi());
    const onPlan = vi.fn();
    montar({ onPlan });
    abrirFicha();
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
    // Con dos planes vivos, la línea lo dice en su «Ver/Ocultar ficha».
    expect(screen.getByRole("button", { name: /Ocultar ficha\s*· 2 planes vivos/ })).toBeTruthy();

    const ficha = screen.getByLabelText("Ficha del permiso");
    expect(within(ficha).getByText("Sin vigencia")).toBeTruthy();
    fireEvent.click(within(ficha).getByRole("button", { name: /^Completar: El plan no tiene vigencia/ }));
    expect(onPlan).toHaveBeenCalledTimes(1);
  });

  it("el cuadre arranca cerrado aunque tenga rojo: lo dicen su resumen y el borde; el saldo, con sus cifras en la línea", async () => {
    vi.stubGlobal("fetch", mockApi());
    const { container } = montar();
    await waitFor(() => expect(screen.getAllByText(/Citada, sin registrar/).length).toBeGreaterThan(0));
    const cuadre = panelDe("Cuadre por guía");
    expect(cuadre.boton.getAttribute("aria-expanded")).toBe("false");
    expect(cuadre.panel.hidden).toBe(true);
    expect((container.querySelector("[data-control-resumen]") as HTMLElement).className).toMatch(/data-error-500/);
    fireEvent.click(cuadre.boton);
    /* En la fila, no en la lista del autofiltro «Veredicto» (05-10), que también dice «Cuadra». */
    expect(within(cuadre.panel.querySelector("tbody") as HTMLElement).getByText("Cuadra")).toBeTruthy(); // 019-0000002: 4,951 + 1,659 ≈ 6,6102

    const saldo = panelDe("por especie");
    expect(saldo.boton.getAttribute("aria-expanded")).toBe("false");
    expect(saldo.panel.hidden).toBe(true);
    // Plegado no es esconder: la línea sigue diciendo sus cifras.
    expect(container.querySelector("[data-saldo-linea]")?.textContent).toMatch(/m³ por talar · .* m³ en patio/);
  });

  it("abrir el saldo, la ficha y el cuadre queda recordado en localStorage", async () => {
    vi.stubGlobal("fetch", mockApi());
    const { unmount } = montar();
    fireEvent.click(panelDe("por especie").boton);
    expect(panelDe("por especie").panel.hidden).toBe(false);
    expect(window.localStorage.getItem(CLAVE_PLEGABLE_SALDO)).toBe("true");
    abrirFicha();
    expect(window.localStorage.getItem(CLAVE_FICHA_ABIERTA)).toBe("true");
    fireEvent.click(panelDe("Cuadre por guía").boton);
    expect(window.localStorage.getItem(CLAVE_PLEGABLE_CUADRE)).toBe("true");
    unmount();
    montar();
    expect(panelDe("por especie").panel.hidden).toBe(false);
    expect(await screen.findByLabelText("Planes vivos")).toBeTruthy();
    expect(panelDe("Cuadre por guía").panel.hidden).toBe(false);
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
