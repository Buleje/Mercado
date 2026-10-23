/**
 * __tests__/carga-vieja-cubicaciones-guardadas.test.tsx
 *
 * Mismo bug que se midió en Tareas el 2026-09-14: al abrir el historial del
 * cubicador salen dos GET (doble montaje) y, si el viejo vuelve después del
 * borrado, la cubicación borrada reaparece aunque ya no está en la base. El
 * cubicador también sube `recargarToken` al guardar (incluso en segundo plano,
 * al vincularla con el Libro) mientras puedes estar borrando otra.
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve: el orden de
 * llegada lo decide el test, no la red. `recargar()` reproduce el segundo GET.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import { useGuardadasDelCubicador } from "@/components/admin/forestal/hooks/use-guardadas-del-cubicador";

const API = "/api/admin/forestal/cubicaciones";

const registro = (id: string, nombre: string) => ({
  id,
  nombre,
  fecha: "2026-09-10",
  precioPt: 0,
  valor: 0,
  totales: { pieTablar: 424, piezas: 12 },
  piezas: [],
  createdAt: "2026-09-10T15:00:00.000Z",
  updatedAt: "2026-09-10T15:00:00.000Z",
});
const TORNILLO = registro("c1", "Lote Tornillo · Pérez");
const CAPIRONA = registro("c2", "Lote Capirona · Ramírez");
const SHIHUAHUACO = registro("c3", "Lote Shihuahuaco recién guardado");

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

afterEach(() => {
  vi.unstubAllGlobals();
});

const gets = () => pendientes.filter((p) => p.metodo === "GET" && p.url === API);
const pedido = (metodo: string, url: string) => pendientes.find((p) => p.metodo === metodo && p.url === url);

async function resolver(p: Pendiente | undefined, cuerpo: unknown) {
  if (!p) throw new Error("el pedido todavía no salió");
  await act(async () => {
    p.resolver(cuerpo);
  });
}

/* La regla vive en el hook de la sección «Guardadas» (antes, dentro de la
   lista `CubicacionesGuardadas`): se prueba directo, sin el menú «⋯». */
/* Dos GET al montar, como en el doble montaje de StrictMode (el cubicador
   real lo vive así en dev y cuando `recargarToken` sube en segundo plano):
   acá el segundo sale de `recargar()`, para que el número no dependa de React. */
const montar = () => {
  const h = renderHook(({ token }: { token: number }) => useGuardadasDelCubicador(token), { initialProps: { token: 0 } });
  act(() => h.result.current.recargar());
  return h;
};
type Montado = ReturnType<typeof montar>;
const nombres = (h: Montado) => h.result.current.lista.map((c) => c.nombre);

async function borrar(h: Montado, id: string) {
  await act(async () => {
    void h.result.current.borrar(id);
  });
  await waitFor(() => expect(pedido("DELETE", `${API}?id=${id}`)).toBeTruthy());
}

describe("Guardadas del cubicador — una carga vieja no devuelve lo borrado", () => {
  it("la cubicación borrada no reaparece cuando el GET del doble montaje vuelve tarde", async () => {
    const h = montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], { cubicaciones: [TORNILLO] });
    await waitFor(() => expect(nombres(h)).toContain(TORNILLO.nombre));

    await borrar(h, "c1");
    await resolver(pedido("DELETE", `${API}?id=c1`), { ok: true });
    expect(nombres(h)).not.toContain(TORNILLO.nombre);

    // El GET que salió en el montaje llega ahora, con la lista de antes del borrado.
    await resolver(gets()[0], { cubicaciones: [TORNILLO] });
    expect(nombres(h)).not.toContain(TORNILLO.nombre);

    // La carga silenciosa que sigue al borrado trae lo guardado.
    await waitFor(() => expect(gets()).toHaveLength(3));
    await resolver(gets()[2], { cubicaciones: [] });
    expect(nombres(h)).not.toContain(TORNILLO.nombre);
  });

  it("si se guarda otra mientras se borra, la recarga de `recargarToken` no devuelve la borrada y lo nuevo aparece", async () => {
    const h = montar();
    await waitFor(() => expect(gets()).toHaveLength(2));
    await resolver(gets()[1], { cubicaciones: [TORNILLO, CAPIRONA] });
    await resolver(gets()[0], { cubicaciones: [TORNILLO, CAPIRONA] });
    await waitFor(() => expect(nombres(h)).toContain(TORNILLO.nombre));

    // Con el DELETE en vuelo, el cubicador guarda otra y sube el token.
    await borrar(h, "c1");
    h.rerender({ token: 1 });
    await waitFor(() => expect(gets()).toHaveLength(3));

    await resolver(pedido("DELETE", `${API}?id=c1`), { ok: true });
    // Esa recarga leyó la base antes del borrado.
    await resolver(gets()[2], { cubicaciones: [SHIHUAHUACO, TORNILLO, CAPIRONA] });
    expect(nombres(h)).not.toContain(TORNILLO.nombre);

    await waitFor(() => expect(gets()).toHaveLength(4));
    await resolver(gets()[3], { cubicaciones: [SHIHUAHUACO, CAPIRONA] });
    expect(nombres(h)).toContain(SHIHUAHUACO.nombre);
    expect(nombres(h)).not.toContain(TORNILLO.nombre);
  });

  it("CONTROL: sin cambios de por medio, la carga más nueva gana aunque la vieja llegue después", async () => {
    const h = montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], { cubicaciones: [TORNILLO] });
    await waitFor(() => expect(nombres(h)).toContain(TORNILLO.nombre));

    await resolver(gets()[0], { cubicaciones: [] });
    expect(nombres(h)).toContain(TORNILLO.nombre);
  });
});
