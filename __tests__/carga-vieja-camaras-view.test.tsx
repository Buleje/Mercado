/**
 * __tests__/carga-vieja-camaras-view.test.tsx
 *
 * Mismo bug que se midió en Tareas el 2026-09-14, en Cámaras: con un GET viejo
 * todavía en vuelo (doble montaje o «Actualizar»), lo que volvía tarde pisaba lo
 * que la escritura acababa de dejar. La foto borrada reaparecía y, peor, tras
 * «Cambiar la dirección» el botón «Copiar dirección» copiaba la VIEJA, que ya no
 * funciona: la cámara quedaba configurada con una dirección muerta.
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve: el orden de
 * llegada lo decide el test, no la red. StrictMode reproduce los dos GET.
 */
import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import CamarasView from "@/components/admin/forestal/CamarasView";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";

const API = "/api/admin/camaras";

const camara = (token: string) => ({
  id: "cam1",
  nombre: "Portón de entrada",
  lugar: "Patio de trozas",
  token,
  activa: true,
  creadaEn: "2026-09-12T12:00:00.000Z",
  ultimaCapturaEn: null,
});
const FOTO = {
  id: "cap1",
  camaraId: "cam1",
  url: "https://storage.test/cap1.jpg",
  evento: "persona",
  at: "2026-09-14T02:10:00.000Z",
};

type Pendiente = {
  metodo: string;
  url: string;
  body?: string;
  resolver: (cuerpo: unknown) => void;
};
let pendientes: Pendiente[] = [];
const writeText = vi.fn(async (_texto: string) => undefined);

beforeEach(() => {
  pendientes = [];
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise((resolve) => {
          pendientes.push({
            metodo: init?.method ?? "GET",
            url,
            body: typeof init?.body === "string" ? init.body : undefined,
            resolver: (cuerpo) => resolve({ ok: true, status: 200, json: async () => cuerpo }),
          });
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  /* La vista elegida se recuerda (URL + localStorage): sin limpiar, un test que
     entra a «Cámaras» deja al siguiente parado ahí. */
  window.history.replaceState(null, "", "/");
  localStorage.clear();
});

const gets = () => pendientes.filter((p) => p.metodo === "GET" && p.url === API);
const direcciones = () => pendientes.filter((p) => p.url === `${API}/direccion`);
const patches = () => pendientes.filter((p) => p.metodo === "PATCH");
const pedido = (metodo: string, url: string) =>
  pendientes.find((p) => p.metodo === metodo && p.url === url);
const botonesBorrarFoto = () =>
  screen.queryAllByRole("button", { name: "Borrar esta foto del historial" });

async function resolver(p: Pendiente | undefined, cuerpo: unknown) {
  if (!p) throw new Error("el pedido todavía no salió");
  await act(async () => {
    p.resolver(cuerpo);
  });
}

async function clic(nombre: string) {
  await act(async () => {
    screen.getByRole("button", { name: nombre }).click();
  });
}

function montar() {
  render(
    <StrictMode>
      <CamarasView />
    </StrictMode>,
  );
}

describe("CamarasView — una carga vieja no pisa lo que se acaba de escribir", () => {
  it("la foto borrada no reaparece cuando el GET del doble montaje vuelve tarde", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));
    await resolver(gets()[1], { camaras: [camara("tok-1")], capturas: [FOTO] });
    await waitFor(() => expect(botonesBorrarFoto()).toHaveLength(1));

    await clic("Borrar esta foto del historial");
    const borrado = `${API}?captura=cap1`;
    await waitFor(() => expect(pedido("DELETE", borrado)).toBeTruthy());
    await resolver(pedido("DELETE", borrado), { camaras: [camara("tok-1")] });
    expect(botonesBorrarFoto()).toHaveLength(0);

    // El GET que salió en el montaje llega ahora, con la foto todavía adentro.
    await resolver(gets()[0], { camaras: [camara("tok-1")], capturas: [FOTO] });
    expect(botonesBorrarFoto()).toHaveLength(0);

    // La carga silenciosa que sigue a la escritura trae lo guardado.
    await waitFor(() => expect(gets()).toHaveLength(3));
    await resolver(gets()[2], { camaras: [camara("tok-1")], capturas: [] });
    expect(botonesBorrarFoto()).toHaveLength(0);
  });

  it("tras «Cambiar la dirección», un GET que salió antes no deja copiar la dirección vieja", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));
    await resolver(gets()[1], { camaras: [camara("tok-viejo")], capturas: [] });
    await resolver(gets()[0], { camaras: [camara("tok-viejo")], capturas: [] });

    // «Actualizar» deja un GET en vuelo y, mientras viaja, se rota la dirección.
    await clic("Actualizar");
    await waitFor(() => expect(gets()).toHaveLength(3));
    await clic("Cambiar la dirección de Portón de entrada");
    await waitFor(() => expect(pedido("PATCH", API)).toBeTruthy());
    await resolver(pedido("PATCH", API), {
      camaras: [camara("tok-nuevo")],
      mensaje: "Dirección nueva.",
    });

    // El GET de «Actualizar» leyó la base antes de rotar.
    await resolver(gets()[2], { camaras: [camara("tok-viejo")], capturas: [] });

    // Sin saber la dirección pública no hay qué copiar (con el túnel abierto,
    // la de la pestaña es localhost): el botón espera a que conteste.
    for (const d of direcciones()) {
      await resolver(d, {
        publica: "https://abc-def.trycloudflare.com",
        origen: "tunel",
        desde: null,
        vivo: true,
      });
    }
    await clic("Copiar dirección");
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toBe(
      "https://abc-def.trycloudflare.com/api/webhooks/camara?k=tok-nuevo",
    );
  });
});

/* Los mismos dos cambios que viven en la captura y en la cámara, con un GET de
   «Actualizar» todavía en vuelo (revisión del 01-10, R1/R2). */
const ahora = new Date().toISOString();
const placa = (confirmado: boolean) => ({
  id: "cap2",
  camaraId: "cam1",
  url: "https://storage.test/2.jpg",
  evento: "vehiculo",
  at: ahora,
  lectura: {
    descripcion: "camión",
    hayPersona: false,
    hayVehiculo: true,
    personas: 0,
    placa: "ABC123",
    confianza: "alta",
    motivo: null,
    chalecos: [],
  },
  cruces: {
    placas: [
      {
        placa: "ABC123",
        tipo: "gtf",
        refId: "g1",
        etiqueta: "Guía 19-001",
        coincidencia: "exacta",
        ...(confirmado ? { confirmadoPor: "brandon", confirmadoEn: ahora } : {}),
      },
    ],
    chalecos: [],
    calculadoEn: ahora,
  },
});

function montarEn(vista: string) {
  window.history.replaceState(null, "", `/admin?tab=camaras&vista=${vista}`);
  render(
    <ConfirmDialogProvider>
      <CamarasView />
    </ConfirmDialogProvider>,
  );
}

describe("CamarasView — confirmar y prender la pila con un GET viejo en vuelo", () => {
  it("confirmar la placa: el GET de «Actualizar» que vuelve tarde no borra la confirmación", async () => {
    montarEn("fotos");
    await waitFor(() => expect(gets().length).toBeGreaterThan(0));
    for (const g of gets())
      await resolver(g, {
        camaras: [camara("tok")],
        capturas: [placa(false)],
        chalecos: {},
        colaboradores: [],
      });
    await clic("Actualizar");
    const viejo = gets()[gets().length - 1];
    await act(async () => {
      screen.getByRole("button", { name: /Confirmar que la placa ABC123/ }).click();
    });
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(JSON.parse(patches()[0].body ?? "{}")).toEqual({
      accion: "confirmar-cruce",
      capturaId: "cap2",
      refId: "g1",
    });
    await resolver(patches()[0], { captura: placa(true), mensaje: "Confirmada." });
    await resolver(viejo, {
      camaras: [camara("tok")],
      capturas: [placa(false)],
      chalecos: {},
      colaboradores: [],
    });
    expect(screen.queryByRole("button", { name: /Confirmar que la placa ABC123/ })).toBeNull();
    expect(screen.getByText(/brandon/)).toBeTruthy();
  });

  it("la pila: el GET viejo no apaga el interruptor recién prendido y el doble clic manda UN pedido", async () => {
    montarEn("camaras");
    await waitFor(() => expect(gets().length).toBeGreaterThan(0));
    for (const g of gets())
      await resolver(g, {
        camaras: [{ ...camara("tok"), vigilaPila: false }],
        capturas: [],
        chalecos: {},
        colaboradores: [],
      });
    await clic("Actualizar");
    const viejo = gets()[gets().length - 1];
    await act(async () => {
      screen.getByRole("switch", { name: /Mira la pila/ }).click();
    });
    await act(async () => {
      screen.getByRole("switch", { name: /Mira la pila/ }).click();
    });
    expect(patches()).toHaveLength(1);
    expect(JSON.parse(patches()[0].body ?? "{}")).toEqual({
      id: "cam1",
      accion: "vigila-pila",
      activa: true,
    });
    await resolver(patches()[0], {
      camaras: [{ ...camara("tok"), vigilaPila: true }],
      mensaje: "ok",
    });
    await resolver(viejo, {
      camaras: [{ ...camara("tok"), vigilaPila: false }],
      capturas: [],
      chalecos: {},
      colaboradores: [],
    });
    expect(screen.getByRole("switch", { name: /Mira la pila/ }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });
});
