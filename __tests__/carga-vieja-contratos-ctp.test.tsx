/**
 * __tests__/carga-vieja-contratos-ctp.test.tsx
 *
 * Dos cosas que la pantalla Contratos (ADR-421) no puede hacer mal:
 *
 * 1. **Carga vieja pisa lo recién creado.** Al abrir la vista salen dos cargas
 *    (doble montaje). Si la primera vuelve DESPUÉS de sembrar un permiso, trae
 *    la lista de antes y el contrato recién creado desaparece de la pantalla
 *    aunque exista en la base — el mismo bug medido en Tareas y en el historial
 *    del cubicador.
 * 2. **Un balance no dice «S/ 0» cuando no se puede saber.** Con los 24
 *    ingresos sin valorizar del tenant real, un «S/ 0.00» declararía que la
 *    madera salió gratis. Tiene que decir «—» y cuántos ingresos faltan.
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve: el orden de
 * llegada lo decide el test, no la red.
 */
import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));
vi.mock("@/components/admin/shared/ConfirmDialog", () => ({
  useConfirm: () => ({ confirm: async () => true }),
}));

import CtpContratosView from "@/components/admin/forestal/CtpContratosView";

const BASE = "/api/admin/forestal/contratos";
/* La lista pide `?balances=1`: la tabla muestra la plata de cada contrato y
   viene en la MISMA respuesta, para que lista y balances no se contradigan. */
const LISTA = `${BASE}?balances=1`;
const CANDIDATOS = `${BASE}?candidatos=1`;
const ALTA = `${BASE}?vincular=1`;

const contrato = (codigo: string) => ({
  id: codigo,
  codigo,
  codigoNorm: codigo,
  alias: null,
  titularNombre: "Maderera El Aguajal SAC",
  titularId: null,
  titularDoc: null,
  titularDocTipo: null,
  resolucionNumero: null,
  resolucionFecha: null,
  tipo: "CONCESION" as const,
  arffs: null,
  region: null,
  provincia: null,
  distrito: null,
  areaHa: null,
  vigenciaDesde: null,
  vigenciaHasta: null,
  estado: "vigente" as const,
  planId: null,
  notas: null,
  isActive: true,
  createdAt: "2026-09-18T10:00:00.000Z",
});

const CANDIDATO = {
  codigo: "CON-25-PAS-0033",
  codigoNorm: "CON-25-PAS-0033",
  filas: 1,
  m3: 4.7868,
  sospechoso: false,
  tipo: "CONCESION" as const,
  titularSugerido: "Maderera El Aguajal SAC",
};

/** El balance del permiso cuyos DOS ingresos están sin precio. */
const BALANCE_SIN_PRECIO = {
  contratoId: "CON-25-PAS-0033",
  madera: { documentos: 2, monto: 0, m3: 13.939, sinValorizar: 2 },
  produccion: { documentos: 0, monto: 0, m3: 0 },
  /* Sin ningún despacho: la ganancia tiene que salir «sin ventas», no en negativo. */
  ventas: { documentos: 0, monto: 0, sinValorizar: 0 },
  gastos: { documentos: 0, monto: 0 },
  fletes: { documentos: 0, monto: 0 },
  adelantos: { documentos: 0, monto: 0 },
  adelantosSaldo: 0,
  cuentaCargos: { documentos: 0, monto: 0 },
  cuentaAbonos: { documentos: 0, monto: 0 },
};

type Pendiente = { metodo: string; url: string; resolver: (cuerpo: unknown) => void };
let pendientes: Pendiente[] = [];

beforeEach(() => {
  pendientes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise((resolve) => {
          pendientes.push({
            metodo: init?.method ?? "GET",
            url,
            resolver: (cuerpo) => resolve({ ok: true, status: 200, json: async () => cuerpo }),
          });
        }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

const de = (url: string, metodo = "GET") =>
  pendientes.filter((p) => p.metodo === metodo && p.url === url);

async function resolver(p: Pendiente | undefined, cuerpo: unknown) {
  if (!p) throw new Error("el pedido todavía no salió");
  await act(async () => {
    p.resolver(cuerpo);
  });
}

/** Contesta la carga número `n` (0 = la del primer montaje). */
async function contestarCarga(n: number, contratos: unknown[], candidatos: unknown[]) {
  await resolver(de(LISTA)[n], { contratos });
  await resolver(de(CANDIDATOS)[n], { candidatos });
}

describe("Contratos CTP — una carga vieja no borra el permiso recién sembrado", () => {
  it("el contrato creado sigue en pantalla cuando la carga del doble montaje vuelve tarde", async () => {
    render(
      <StrictMode>
        <CtpContratosView />
      </StrictMode>,
    );
    await waitFor(() => expect(de(LISTA).length).toBeGreaterThanOrEqual(2));

    // Contesta la carga MÁS NUEVA: no hay contratos, hay un candidato.
    await contestarCarga(1, [], [CANDIDATO]);
    expect(await screen.findByRole("button", { name: /Crear el contrato/ })).toBeTruthy();

    await act(async () => {
      screen.getByRole("button", { name: /Crear el contrato/ }).click();
    });
    await waitFor(() => expect(de(ALTA, "POST")).toHaveLength(1));
    await resolver(de(ALTA, "POST")[0], {
      contrato: contrato(CANDIDATO.codigo),
      vinculado: { madera: 1, produccion: 0, lotes: 0 },
    });
    expect(await screen.findByText(/Se creó 1 contrato/)).toBeTruthy();

    // La recarga silenciosa que sigue al alta trae el permiso ya creado.
    await waitFor(() => expect(de(LISTA).length).toBeGreaterThanOrEqual(3));
    await contestarCarga(2, [contrato(CANDIDATO.codigo)], []);
    // La tabla y las tarjetas del celular están las DOS en el DOM (jsdom no
    // aplica el `hidden sm:block`): el código aparece dos veces, una por cada
    // superficie. Por eso `findAllByText`.
    expect((await screen.findAllByText("CON-25-PAS-0033")).length).toBeGreaterThan(0);

    // Recién ahora vuelve la carga del primer montaje, con la lista de ANTES.
    await contestarCarga(0, [], [CANDIDATO]);
    expect(screen.getAllByText("CON-25-PAS-0033").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Crear el contrato/ })).toBeNull();
  });

  it("CONTROL: sin cambios de por medio, la carga más nueva gana aunque la vieja llegue después", async () => {
    render(
      <StrictMode>
        <CtpContratosView />
      </StrictMode>,
    );
    await waitFor(() => expect(de(LISTA).length).toBeGreaterThanOrEqual(2));

    await contestarCarga(1, [contrato("CON-25-UCA-0207")], []);
    expect((await screen.findAllByText("CON-25-UCA-0207")).length).toBeGreaterThan(0);

    await contestarCarga(0, [], []);
    expect(screen.getAllByText("CON-25-UCA-0207").length).toBeGreaterThan(0);
  });
});

describe("Balance del contrato — lo que no se puede saber es «—», nunca «S/ 0»", () => {
  it("con los dos ingresos sin precio, egresos y costo por m³ salen en raya y se dice cuántos faltan", async () => {
    render(<CtpContratosView />);
    await waitFor(() => expect(de(LISTA).length).toBeGreaterThanOrEqual(1));
    await contestarCarga(0, [contrato("CON-25-PAS-0033")], []);

    await act(async () => {
      screen.getByRole("button", { name: /Ver el balance de CON-25-PAS-0033/ }).click();
    });
    const balanceUrl = `${BASE}/CON-25-PAS-0033?balance=1`;
    await waitFor(() => expect(de(balanceUrl)).toHaveLength(1));
    await resolver(de(balanceUrl)[0], {
      contrato: contrato("CON-25-PAS-0033"),
      balance: BALANCE_SIN_PRECIO,
    });

    expect(
      await screen.findByText("2 de 2 ingresos de madera no tienen precio cargado"),
    ).toBeTruthy();
    expect(screen.getByText(/Los 2 ingresos de madera están sin precio/)).toBeTruthy();
    // Ni un solo «S/ 0.00» en toda la pantalla: lo que no se sabe va en raya.
    expect(screen.queryByText("S/ 0.00")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(3);
  });
});
