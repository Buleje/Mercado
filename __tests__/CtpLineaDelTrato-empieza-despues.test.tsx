/**
 * La línea del trato avisa cuando el trato EMPIEZA DESPUÉS de la producción
 * (caso WASACO, Blas 23-09: trato desde el 14/09, corridas del 07/09 → sin
 * precio). Es la pieza de Declarar producción y de Cobrar aserrío.
 *
 * Revisión 23-09: antes del clic se pide la propuesta para ESA fecha
 * (`GET …/vigencia?desde=`) y se muestra —corridas, PT y S/—; sin ella el
 * botón no se habilita. Si el trato no pone precio a la madera, no se ofrece.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CtpLineaDelTrato from "@/components/admin/forestal/CtpLineaDelTrato";
import type { TarifaCliente } from "@/lib/forestal/precio-cliente";
import type { ArregloDelTrato, PropuestaDelTrato, ResultadoDelArreglo } from "@/lib/forestal/trato-sin-cobrar";

const trato = (vigenteDesde: string, parcial: Partial<TarifaCliente> = {}): TarifaCliente => ({
  id: "tc-14",
  parteId: "wasaco",
  servicio: "aserrio",
  vigenteDesde,
  basePt: 0.5,
  grupos: [],
  especies: [],
  tipos: [],
  nota: null,
  ...parcial,
});

const listo = (tarifas: TarifaCliente[]) => ({ tarifas, cargando: false, error: null });
const mockFetch = vi.fn();

/** La corrida N° 30 de WASACO (Panguana, 542,99 PT → S/ 271,50 con el trato). */
const ARREGLO: ArregloDelTrato = {
  parteId: "wasaco",
  servicio: "aserrio",
  mover: { tarifaId: "tc-14", vigenteDesde: "2026-09-14", desde: "2026-09-07" },
  corte: "2026-09-07",
  sinCobrar: [
    { id: "c30", lineNo: 30, fecha: "2026-09-07", especie: "Panguana", pt: 542.99, importeActual: null, importeConTrato: 271.5 },
  ],
  antesDelTrato: 1,
  quedanAntes: 0,
  cambian: [],
  pt: 542.99,
  importe: 271.5,
  diferencia: 0,
};

const RESULTADO: ResultadoDelArreglo = {
  parteNombre: "WASACO",
  movio: { tarifaId: "tc-14", de: "2026-09-14", a: "2026-09-07" },
  arreglo: ARREGLO,
  cobro: {
    resultados: [{ id: "c30", lineNo: 30, cobrado: true, importe: 271.5, parteNombre: "WASACO", motivo: null, accion: "crear" }],
    resumen: { cobradas: 1, importeTotal: 271.5, sinCambio: 0, sinCobrar: 0, dadasDeBaja: 0, importeDadoDeBaja: 0 },
  },
};

/** GET = la propuesta para la fecha pedida; POST = el resultado. */
function servidor(
  propuesta: (url: string) => PropuestaDelTrato,
  post: () => { ok: boolean; status: number; body: unknown } = () => ({ ok: true, status: 200, body: RESULTADO }),
) {
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "POST") {
      const r = post();
      return { ok: r.ok, status: r.status, json: async () => r.body };
    }
    return { ok: true, status: 200, json: async () => propuesta(url) };
  });
}
const conArreglo = (arreglo: ArregloDelTrato | null) => (url: string): PropuestaDelTrato => ({
  parteId: "wasaco",
  parteNombre: "WASACO",
  desde: new URL(url, "http://x").searchParams.get("desde"),
  arreglo,
});

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

const linea = (tarifas: TarifaCliente[], extra: Partial<Parameters<typeof CtpLineaDelTrato>[0]> = {}) => (
  <CtpLineaDelTrato
    trato={listo(tarifas)}
    servicio="aserrio"
    fecha="2026-09-07"
    grupos={[]}
    nombre="WASACO"
    parteId="wasaco"
    {...extra}
  />
);

describe("CtpLineaDelTrato — el trato empieza después", () => {
  it("avisa con las dos fechas, dice cuánto ANTES del clic y el botón adelanta a la fecha de la producción", async () => {
    servidor(conArreglo(ARREGLO));
    const eventos: unknown[] = [];
    const oir = (e: Event) => eventos.push((e as CustomEvent).detail);
    window.addEventListener("forestal:tratos-cliente", oir);

    const { rerender } = render(linea([trato("2026-09-14")]));
    expect(screen.getByText(/El trato con WASACO empieza el lunes 14\/09 y esta madera es del lunes 07\/09/)).toBeTruthy();

    /* La propuesta para ESA fecha, antes de tocar nada. */
    await screen.findByText(/Si lo adelantas, también entra 1 corrida ya declarada \(542[.,]99 PT\)\. Con el trato se cargan S\/\s?271[.,]50 a su cuenta\./);
    expect(String(mockFetch.mock.calls[0][0])).toBe(
      "/api/admin/forestal/tarifas-cliente/vigencia?parteId=wasaco&desde=2026-09-07",
    );
    expect(screen.getByText("Ver la corrida")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Empezar el trato el 07/09" }));
    await waitFor(() => expect(mockFetch.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "POST")).toBe(true));
    const [url, init] = mockFetch.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "POST") as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/admin/forestal/tarifas-cliente/vigencia");
    expect(JSON.parse(String(init.body))).toEqual({ parteId: "wasaco", tarifaId: "tc-14", desde: "2026-09-07" });
    await waitFor(() => expect(eventos).toEqual([{ parteId: "wasaco", origen: -1 }]));
    window.removeEventListener("forestal:tratos-cliente", oir);

    /* La pantalla relee el trato (ahora desde el 07/09): la línea pasa a «Precio
       pactado» y dice qué más se cobró. */
    rerender(linea([trato("2026-09-07")]));
    expect(screen.getByText(/Precio pactado/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(
      /Listo: el trato con WASACO rige desde el lunes 07\/09\. Además se cobró 1 corrida que había quedado sin precio \(\+S\/\s?271[.,]50\)\./,
    );
  });

  it("#1 sin la propuesta el botón NO se habilita (no se cobra a ciegas)", async () => {
    let soltar: (v: unknown) => void = () => {};
    mockFetch.mockImplementation(() => new Promise((r) => (soltar = r)));
    render(linea([trato("2026-09-14")]));
    const boton = screen.getByRole("button", { name: /Empezar el trato el 07\/09/ });
    expect(boton).toBeDisabled();
    expect(screen.getByText("Revisando qué más cobraría adelantarlo…")).toBeTruthy();
    soltar({ ok: true, status: 200, json: async () => conArreglo(null)("/x?desde=2026-09-07") });
    await waitFor(() => expect(boton).not.toBeDisabled());
    expect(screen.getByText(/adelantarlo no carga nada más/)).toBeTruthy();
  });

  it("#1 una propuesta de OTRA fecha no habilita el botón", async () => {
    servidor(() => ({ parteId: "wasaco", parteNombre: "WASACO", desde: "2026-09-01", arreglo: ARREGLO }));
    render(linea([trato("2026-09-14")]));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /Empezar el trato/ })).toBeDisabled();
  });

  it("el error del servidor (409: otra versión empieza antes) se muestra, no se traga", async () => {
    servidor(conArreglo(ARREGLO), () => ({
      ok: false,
      status: 409,
      body: { error: "otra_version", message: "El trato cambió: ahora empieza el 01/09/2026. Vuelve a mirar el aviso." },
    }));
    render(linea([trato("2026-09-14")]));
    const boton = screen.getByRole("button", { name: /Empezar el trato/ });
    await waitFor(() => expect(boton).not.toBeDisabled());
    await userEvent.click(boton);
    expect(await screen.findByText(/El trato cambió: ahora empieza el 01\/09\/2026/)).toBeTruthy();
  });

  it("#10 un trato que no pone precio a la especie que se declara no ofrece el botón", () => {
    const soloTornillo = trato("2026-09-14", { basePt: null, especies: [{ clave: "tornillo", nombre: "Tornillo", precioPt: 0.5 }] });
    render(linea([soloTornillo], { bloques: [{ etiqueta: "PQ-1", especie: "Cumala", volumenM3: 0.5, pt: 212 }] }));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/no pone precio a la especie de esta madera: rige la tarifa de la planta/)).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no avisa si una versión anterior ya cubre esa fecha, ni para el trato de venta", () => {
    const { rerender } = render(linea([trato("2026-09-01", { id: "tc-01" }), trato("2026-09-14")]));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Precio pactado/)).toBeTruthy();

    rerender(linea([trato("2026-09-14", { servicio: "venta" })], { servicio: "venta" }));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/no tiene precio pactado de venta para ese día/)).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
