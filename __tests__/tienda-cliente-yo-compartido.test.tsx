/**
 * useClienteTienda: una sola consulta a /api/tienda-cliente/yo por página,
 * aunque lo usen el checkout y la ficha de la tienda a la vez (2026-10-11).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseAuthConfigured: () => true,
  getSupabaseBrowser: () => ({ auth: { signInWithOAuth: async () => ({ error: null }) } }),
}));
vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: () => ({}) }));

import {
  RUTA_YO,
  reiniciarConsultaClienteTienda,
  useClienteTienda,
} from "@/components/store/cliente/use-cliente-tienda";

const ana = { nombre: "Ana Pérez", email: "ana@example.com", avatar: null, proveedor: "google" };

function Quien({ id }: { id: string }) {
  const c = useClienteTienda();
  return (
    <span data-testid={id}>
      {c.cargando ? "…" : (c.cliente?.nombre ?? "nadie")}
      <button type="button" data-testid={`${id}-salir`} onClick={() => void c.salir()} />
    </span>
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  reiniciarConsultaClienteTienda();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    init?.method === "DELETE"
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ cliente: ana }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useClienteTienda compartido", () => {
  it("dos componentes → un solo GET a /yo y los dos ven a Ana", async () => {
    const r = render(
      <>
        <Quien id="a" />
        <Quien id="b" />
      </>,
    );
    await waitFor(() => expect(r.getByTestId("a").textContent).toBe("Ana Pérez"));
    expect(r.getByTestId("b").textContent).toBe("Ana Pérez");
    const gets = fetchMock.mock.calls.filter(([url, init]) => url === RUTA_YO && (init as RequestInit | undefined)?.method !== "DELETE");
    expect(gets).toHaveLength(1);
  });

  it("uno que se monta después usa la misma respuesta, sin preguntar otra vez", async () => {
    const r = render(<Quien id="a" />);
    await waitFor(() => expect(r.getByTestId("a").textContent).toBe("Ana Pérez"));
    r.rerender(
      <>
        <Quien id="a" />
        <Quien id="c" />
      </>,
    );
    expect(r.getByTestId("c").textContent).toBe("Ana Pérez");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("«No soy yo» en uno lo saca en todos y la próxima lectura vuelve a preguntar", async () => {
    const r = render(
      <>
        <Quien id="a" />
        <Quien id="b" />
      </>,
    );
    await waitFor(() => expect(r.getByTestId("b").textContent).toBe("Ana Pérez"));
    await act(async () => {
      r.getByTestId("a-salir").click();
    });
    expect(r.getByTestId("a").textContent).toBe("nadie");
    expect(r.getByTestId("b").textContent).toBe("nadie");
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(true);
  });
});
