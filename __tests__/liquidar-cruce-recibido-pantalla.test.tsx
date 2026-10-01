/**
 * ADR-449 en la pantalla: la fila sugiere el vínculo por nombre, «Solo cruzar»
 * cruza lo que te adelantó contra sus aserríos, el POST lleva `cruzarRecibido`
 * y la pantalla «Liquidación confirmada» se VE.
 *
 * Dos bugs que esto atrapa, medidos en el navegador el 28-09:
 *  · sin `cruzarRecibido` en el cuerpo del hook, la vista previa mostraba el
 *    cruce y el servidor recibía «nada que liquidar»;
 *  · `CuentasPorPersona` pintaba el esqueleto al recargar tras confirmar: la
 *    fila —y el modal que vive adentro— se desmontaba (POST 201 y el modal
 *    desaparecía sin mostrar el código).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CuentasPorPersona from "@/components/admin/adelantos/cuentas/CuentasPorPersona";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import type { PartidasDePersona } from "@/lib/cuentas/liquidacion";
import type { LiquidacionDTO } from "@/lib/db/liquidacion-cuenta.db";
import { invalidateCachedJson } from "@/lib/client-cache-fetch";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const adelantos = (recibido: number): NonNullable<CuentaPersona["adelantos"]> => ({
  teDebe: 0,
  aFavorSuyo: 0,
  abiertos: 0,
  recibidoPendiente: recibido,
  recibidoExcedido: 0,
  recibidosAbiertos: recibido > 0 ? 2 : 0,
  leDebes: recibido,
  neto: -recibido,
});

const wasaco = (recibido: number, madera: number): CuentaPersona => ({
  clave: "benef:b1",
  nombre: "Wasaco",
  documento: null,
  telefono: null,
  beneficiarioId: "b1",
  parteId: "p1",
  vinculo: "id",
  adelantos: adelantos(recibido),
  madera: { cargos: 12323.02, abonos: 12323.02 - madera, saldo: madera, porConcepto: { aserrio_prestado: 12323.02 }, movimientos: [], ultimo: "2026-09-28T00:00:00.000Z" },
  neto: Math.round((madera - recibido) * 100) / 100,
  otrasMonedas: {},
});

const partidas = (recibido: boolean): PartidasDePersona => ({
  persona: { beneficiarioId: "b1", parteId: "p1", nombre: "Wasaco", documento: null, parteNombre: "WASACO" },
  cruzable: true,
  adelantos: [],
  ...(recibido
    ? {
        recibidos: [
          { adelantoId: "a3", codigo: "ADL-2026-0003", fecha: "2026-09-19T22:00:00.000Z", saldo: 1731 },
          { adelantoId: "a4", codigo: "ADL-2026-0004", fecha: "2026-09-19T22:00:00.000Z", saldo: 1300 },
        ],
      }
    : {}),
  forestal: {
    saldo: recibido ? 12323.02 : 9292.02,
    desde: "2026-09-07T00:00:00.000Z",
    movimientos: [
      { id: "m1", parteId: "p1", parteNombre: "WASACO", fecha: "2026-09-07T00:00:00.000Z", tipo: "cargo", concepto: "aserrio_prestado", monto: 12323.02, moneda: "PEN", referencia: null, fleteId: null, notas: null },
    ],
  },
  fuera: [],
});

const liquidacion: LiquidacionDTO = {
  id: "liq9",
  codigo: "LIQ-2026-0009",
  fecha: "2026-09-28",
  persona: { beneficiarioId: "b1", parteId: "p1", nombre: "Wasaco", documento: null },
  compensado: 3031,
  pago: null,
  caja: { resultado: "no_mover", movimientoId: null },
  detalle: {} as unknown as LiquidacionDTO["detalle"],
  notas: null,
  creadaPor: "qa",
  creadaEn: "2026-09-28T00:00:00.000Z",
  anulada: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  /* `useMiRol` guarda `/api/auth/me` 60 s en memoria: sin esto, el rol de un
     test se filtraba al siguiente. */
  invalidateCachedJson();
});

describe("cruzar lo que te adelantó contra sus aserríos, desde la fila", () => {
  it("vista previa en su idioma, el POST lleva el cruce y el código se ve después de confirmar", async () => {
    let cruzado = false;
    let cuerpo: Record<string, unknown> | null = null;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      const method = init?.method ?? "GET";
      if (u.startsWith("/api/auth/me")) return jsonResponse({ role: "admin", authenticated: true });
      if (u === "/api/adelantos/cuentas") {
        /* La recarga de después tarda como en la red de verdad: con la respuesta
           instantánea del mock, React juntaba «cargando» y «cargado» en un solo
           render y el desmontaje no se veía (el navegador sí lo mostró). */
        if (cruzado) await new Promise((r) => setTimeout(r, 120));
        return jsonResponse({ forestal: true, personas: [cruzado ? wasaco(0, 9292.02) : wasaco(3031, 12323.02)], truncado: false });
      }
      if (u.startsWith("/api/adelantos/cuentas/partidas")) return jsonResponse({ partidas: partidas(!cruzado), huella: "h1" });
      if (method === "POST" && u === "/api/adelantos/cuentas/liquidaciones") {
        cuerpo = JSON.parse(String(init?.body));
        cruzado = true;
        return jsonResponse({ liquidacion, caja: null }, 201);
      }
      if (u.startsWith("/api/adelantos/cuentas/liquidaciones")) return jsonResponse({ liquidaciones: [] });
      return jsonResponse({}, 404);
    }) as typeof fetch;

    render(<CuentasPorPersona onGoTab={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Liquidar la cuenta de Wasaco/i }));
    const dialog = await screen.findByRole("dialog");

    /* La parte contra la que se cruza, con SU nombre (revisión ADR-449). */
    expect(await within(dialog).findByText(/Cuenta forestal de WASACO: te debe/)).toBeInTheDocument();
    const cruzar = await within(dialog).findByRole("button", { name: /Solo cruzar/i });
    expect(cruzar.textContent).toMatch(/Su adelanto contra sus aserríos · Máx\. S\/\s?3[,.]031\.00/);
    fireEvent.click(cruzar);

    expect(await within(dialog).findByText(/Cruzar S\/\s?3[,.]031\.00 de su adelanto contra sus aserríos/)).toBeInTheDocument();
    expect(within(dialog).getByText("No mueve la caja.")).toBeInTheDocument();
    expect(within(dialog).getByText("Sin cambio")).toBeInTheDocument();
    expect(within(dialog).getByText("Lo que te adelantó")).toBeInTheDocument();
    /* La cuenta forestal de Wasaco son sólo aserríos: se llama así. */
    expect(within(dialog).getByText("Aserríos")).toBeInTheDocument();

    const confirmar = await waitFor(() => {
      const b = within(dialog).getByRole("button", { name: /Confirmar liquidación/i });
      expect(b).not.toBeDisabled();
      return b;
    });
    fireEvent.click(confirmar);

    /* A nivel de documento: si la fila se desmontara al recargar, el modal
       —y el código— desaparecen. */
    expect(await screen.findByText("LIQ-2026-0009")).toBeInTheDocument();
    expect(cuerpo).toMatchObject({ compensar: 0, cruzarRecibido: 3031, pago: null, huella: "h1" });
    /* La recarga llegó igual: la fila de atrás ya dice el neto nuevo. */
    await waitFor(() => expect(screen.getByText("LIQ-2026-0009")).toBeInTheDocument());
  });

  it("la fila pregunta por la parte que se llama igual y no vincula hasta confirmar", async () => {
    const suelta: CuentaPersona = { ...wasaco(3031, 0), clave: "benef:b1", parteId: null, vinculo: null, madera: null, neto: -3031 };
    const parte: CuentaPersona = {
      ...wasaco(0, 12323.02),
      clave: "parte:p1",
      nombre: "WASACO",
      beneficiarioId: null,
      vinculo: null,
      adelantos: null,
      neto: 12323.02,
    };
    const patch = vi.fn();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      if (u.startsWith("/api/auth/me")) return jsonResponse({ role: "admin", authenticated: true });
      if (u === "/api/adelantos/cuentas") return jsonResponse({ forestal: true, personas: [suelta, parte], truncado: false });
      if ((init?.method ?? "GET") === "PATCH") {
        patch(u, init?.body);
        return jsonResponse({ ok: true });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;

    render(<CuentasPorPersona onGoTab={() => {}} />);
    const pregunta = await screen.findByRole("button", { name: /¿Es la misma persona que WASACO\?/ });
    fireEvent.click(pregunta);
    const grupo = await screen.findByRole("group", { name: /Vincular a Wasaco/ });
    expect((within(grupo).getByRole("combobox") as HTMLSelectElement).value).toBe("p1");
    expect(patch).not.toHaveBeenCalled();
    fireEvent.click(within(grupo).getByRole("button", { name: "Sí, vincular" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(String(patch.mock.calls[0][1])).toMatch(/"forestPartyId":"p1"/);
  });

  it("con el neto en 0 y una liquidación viva, la fila muestra «Liquidaciones» y adentro está «Anular»", async () => {
    const enCero: CuentaPersona = { ...wasaco(0, 0), neto: 0, liquidacionesVivas: 1 };
    const partidasCero: PartidasDePersona = { ...partidas(false), forestal: { saldo: 0, desde: null, movimientos: [] } };
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.startsWith("/api/auth/me")) return jsonResponse({ role: "admin", authenticated: true });
      if (u === "/api/adelantos/cuentas") return jsonResponse({ forestal: true, personas: [enCero], truncado: false });
      if (u.startsWith("/api/adelantos/cuentas/partidas")) return jsonResponse({ partidas: partidasCero, huella: "h0" });
      if (u.startsWith("/api/adelantos/cuentas/liquidaciones")) return jsonResponse({ liquidaciones: [liquidacion] });
      return jsonResponse({}, 404);
    }) as typeof fetch;

    render(<CuentasPorPersona onGoTab={() => {}} />);
    expect(await screen.findByText(/Wasaco está al día/)).toBeInTheDocument();
    /* Nada que liquidar: el botón dice lo que hay adentro. */
    expect(screen.queryByRole("button", { name: /Liquidar la cuenta de Wasaco/ })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Ver las liquidaciones de Wasaco" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("LIQ-2026-0009")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Anular" })).toBeInTheDocument();
  });

  it("sin liquidaciones y con el neto en 0, no hay botón (lo de antes)", async () => {
    const enCero: CuentaPersona = { ...wasaco(0, 0), neto: 0, liquidacionesVivas: 0 };
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.startsWith("/api/auth/me")) return jsonResponse({ role: "admin", authenticated: true });
      if (u === "/api/adelantos/cuentas") return jsonResponse({ forestal: true, personas: [enCero], truncado: false });
      return jsonResponse({}, 404);
    }) as typeof fetch;
    render(<CuentasPorPersona onGoTab={() => {}} />);
    expect(await screen.findByText(/Wasaco está al día/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /liquidaciones de Wasaco|Liquidar la cuenta/ })).toBeNull();
  });

  it("un manager no ve «¿Es la misma persona…?» (vincular es de admin o dueño)", async () => {
    const suelta: CuentaPersona = { ...wasaco(3031, 0), parteId: null, vinculo: null, madera: null, neto: -3031 };
    const parte: CuentaPersona = { ...wasaco(0, 12323.02), clave: "parte:p1", nombre: "WASACO", beneficiarioId: null, vinculo: null, adelantos: null, neto: 12323.02 };
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.startsWith("/api/auth/me")) return jsonResponse({ role: "manager", authenticated: true });
      if (u === "/api/adelantos/cuentas") return jsonResponse({ forestal: true, personas: [suelta, parte], truncado: false });
      return jsonResponse({}, 404);
    }) as typeof fetch;
    render(<CuentasPorPersona onGoTab={() => {}} />);
    expect(await screen.findByText("Wasaco", { selector: "p" })).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/auth\/me/), expect.anything()));
    /* Que el rol ya llegó: el mismo render con admin muestra la pregunta. */
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: /¿Es la misma persona/ })).toBeNull();
  });
});
