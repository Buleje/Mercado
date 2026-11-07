/**
 * __tests__/admin-notifications-reconexion.test.ts
 *
 * El stream de notificaciones del panel reconectaba cada 10 s fijos: con la
 * ruta caída (un 404 del dev server, 2026-09-14) la consola sumaba un pedido
 * fallido cada 10 s mientras el panel estuviera abierto. Ahora la espera crece
 * 10 s → 20 s → 40 s… hasta 5 min y vuelve a 10 s cuando la conexión abre.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/client-cache-fetch", () => ({
  cachedJson: vi.fn(async () => ({ role: "admin" })),
}));

import { useAdminNotifications } from "@/hooks/use-admin-notifications";

class EventSourceFalso {
  static instancias: EventSourceFalso[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(url: string) {
    this.url = url;
    EventSourceFalso.instancias.push(this);
  }
}

const ultima = () => EventSourceFalso.instancias[EventSourceFalso.instancias.length - 1];
let rolDeLaSesion = "admin";

async function avanzar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function montar() {
  const hook = renderHook(() => useAdminNotifications());
  await avanzar(0);
  expect(EventSourceFalso.instancias).toHaveLength(1);
  return hook;
}

/** Corta la conexión actual y comprueba que la siguiente abre a los `ms` justos, ni uno antes. */
async function reconectaA(ms: number) {
  const antes = EventSourceFalso.instancias.length;
  act(() => ultima().onerror?.());
  await avanzar(ms - 1);
  expect(EventSourceFalso.instancias).toHaveLength(antes);
  await avanzar(1);
  expect(EventSourceFalso.instancias).toHaveLength(antes + 1);
}

beforeEach(() => {
  vi.useFakeTimers();
  EventSourceFalso.instancias = [];
  rolDeLaSesion = "admin";
  vi.stubGlobal("EventSource", EventSourceFalso);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => ({ role: rolDeLaSesion }) })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAdminNotifications — reconexión del stream", () => {
  it("la espera crece: 10 s, 20 s, 40 s", async () => {
    await montar();
    await reconectaA(10_000);
    await reconectaA(20_000);
    await reconectaA(40_000);
  });

  it("no pasa de 5 minutos", async () => {
    await montar();
    for (const ms of [10_000, 20_000, 40_000, 80_000, 160_000]) await reconectaA(ms);
    await reconectaA(300_000);
    await reconectaA(300_000);
  });

  it("vuelve a 10 s cuando la conexión llega a abrir", async () => {
    await montar();
    await reconectaA(10_000);
    await reconectaA(20_000);
    act(() => ultima().onopen?.());
    await reconectaA(10_000);
  });

  it("no reconecta si la sesión dejó de ser admin", async () => {
    await montar();
    rolDeLaSesion = "cajero";
    act(() => ultima().onerror?.());
    await avanzar(60_000);
    expect(EventSourceFalso.instancias).toHaveLength(1);
  });

  it("si la verificación de sesión falla por red, reintenta con la espera siguiente", async () => {
    await montar();
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    act(() => ultima().onerror?.());
    await avanzar(10_000);
    expect(EventSourceFalso.instancias).toHaveLength(1);
    await avanzar(19_999);
    expect(EventSourceFalso.instancias).toHaveLength(1);
    await avanzar(1);
    expect(EventSourceFalso.instancias).toHaveLength(2);
  });

  it("CONTROL: desmontar cancela la reconexión pendiente", async () => {
    const { unmount } = await montar();
    act(() => ultima().onerror?.());
    unmount();
    await avanzar(60_000);
    expect(EventSourceFalso.instancias).toHaveLength(1);
  });
});
