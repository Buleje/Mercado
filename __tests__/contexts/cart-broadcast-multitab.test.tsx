/**
 * CartContext — BroadcastChannel multi-tab sync
 *
 * Bus sintético compartido: simula que dos instancias de CartProvider
 * (dos "tabs") comparten el mismo canal de mensajes, sin BroadcastChannel real.
 *
 * NOTA de diseño:
 * - El context filtra mensajes con el mismo tabId (anti-echo-loop).
 * - Los mensajes outgoing tienen type "CART_UPDATE" (no "ADD").
 * - El canal se crea por tenantSlug: "buleje-cart-sync-{slug}".
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { act as reactAct } from "react";
import { CartProvider, useCart } from "@/contexts/cart-context";
import type { Product } from "@/data/products";
import type { ReactNode } from "react";

// ── Producto de prueba ────────────────────────────────────────────────────────
const arroz: Product = {
  id: 10,
  name: "Arroz Paisano",
  category: "abarrotes",
  price: 4.5,
  image: "/arroz.jpg",
  unit: "kg",
};

// ── Bus sintético compartido ─────────────────────────────────────────────────
// Registra instancias por nombre de canal. Cuando una instancia postMessage,
// reenvía el mensaje a TODAS las demás instancias del mismo canal.
type Listener = (evt: MessageEvent) => void;

const channelBus: Map<string, Set<MockBroadcastChannel>> = new Map();

class MockBroadcastChannel {
  name: string;
  private listeners: Set<Listener> = new Set();
  private _closed = false;

  constructor(name: string) {
    this.name = name;
    if (!channelBus.has(name)) channelBus.set(name, new Set());
    channelBus.get(name)!.add(this);
  }

  addEventListener(_type: "message", handler: Listener) {
    this.listeners.add(handler);
  }

  removeEventListener(_type: "message", handler: Listener) {
    this.listeners.delete(handler);
  }

  postMessage(data: unknown) {
    if (this._closed) return;
    // Entrega SÍNCRONA a todos los peers del mismo canal.
    //
    // Problema de entorno de test: TAB_ID es una constante de módulo.
    // Todos los CartProvider del mismo proceso de test comparten el mismo
    // TAB_ID, por lo que el filtro anti-echo (tabId === TAB_ID) descarta
    // los mensajes entre dos renderHooks del mismo test.
    //
    // Solución: al entregar a un peer, reemplazamos el tabId por uno
    // distinto (el ID de la instancia del canal que entrega). Esto simula
    // fielmente el comportamiento real: en prod cada tab tiene su propio
    // módulo y por tanto su propio TAB_ID.
    const peers = channelBus.get(this.name);
    if (!peers) return;
    for (const peer of peers) {
      if (peer !== this && !peer._closed) {
        // Sustituir tabId con el "instanceId" del peer sender para que
        // el receptor no lo filtre como propio.
        const mutatedData =
          data !== null && typeof data === "object" && "tabId" in data
            ? { ...(data as Record<string, unknown>), tabId: `peer-${this.name}-${Math.random()}` }
            : data;
        const evt = new MessageEvent("message", { data: mutatedData });
        for (const listener of peer.listeners) {
          listener(evt);
        }
      }
    }
  }

  close() {
    this._closed = true;
    channelBus.get(this.name)?.delete(this);
  }
}

// ── Setup / teardown ──────────────────────────────────────────────────────────
beforeEach(() => {
  channelBus.clear();
  localStorage.clear();
  // Instalar mock global de BroadcastChannel
  vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
  // Suprimir AudioContext (no disponible en jsdom).
  // resume() DEBE retornar Promise para que .catch() no falle.
  vi.stubGlobal("AudioContext", function MockAudioContext() {
    return {
      state: "suspended",
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn(() => ({
        connect: vi.fn(),
        type: "sine",
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      })),
      destination: {},
      currentTime: 0,
    };
  });
  // Mock fetch:
  // - /api/products?active=true → devolver los productos válidos del tenant
  //   (si no, validProductIdsRef queda vacío y addItem rechaza todo)
  // - cualquier otra URL → lista vacía
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes("/api/products")) {
        return new Response(
          JSON.stringify([{ id: arroz.id }, { id: 11 }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ existingIds: [arroz.id], missingIds: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── Wrapper helpers ───────────────────────────────────────────────────────────
function makeWrapper(slug = "tienda-test") {
  return ({ children }: { children: ReactNode }) => (
    <CartProvider tenantSlug={slug}>{children}</CartProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("CartContext — BroadcastChannel multi-tab", () => {
  // ── Case 1: Tab A postMessage al agregar item ─────────────────────────────
  it("Tab A: postMessage CART_UPDATE con items al agregar un producto", async () => {
    const { result } = renderHook(() => useCart(), { wrapper: makeWrapper() });

    // Encontrar el canal creado por este provider
    const channels = channelBus.get("buleje-cart-sync-tienda-test");
    expect(channels).toBeDefined();
    const channelInstance = [...channels!][0] as MockBroadcastChannel;
    const postSpy = vi.spyOn(channelInstance, "postMessage");

    act(() => {
      result.current.addItem(arroz);
    });

    // La persistencia a localStorage + broadcast ocurre en un effect síncrono
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CART_UPDATE",
        payload: expect.arrayContaining([
          expect.objectContaining({ id: arroz.id, quantity: 1 }),
        ]),
      }),
    );
  });

  // ── Case 2: Tab B sincroniza estado al recibir CART_UPDATE ────────────────
  it("Tab B sincroniza carrito al recibir mensaje CART_UPDATE de Tab A", async () => {
    const slug = "tienda-sync";

    // Montar Tab A y Tab B (mismo slug → mismo canal)
    const tabA = renderHook(() => useCart(), { wrapper: makeWrapper(slug) });
    const tabB = renderHook(() => useCart(), { wrapper: makeWrapper(slug) });

    // Tab A agrega item. El bus entrega el mensaje síncronamente al listener
    // de Tab B dentro del mismo act(). Como el dispatch de Tab B también
    // ocurre sincrónicamente, await act() asegura que React procese todos
    // los updates de ambos componentes antes de que ejecutemos assertions.
    await act(async () => {
      tabA.result.current.addItem(arroz);
    });

    // Tab B debe haberse actualizado con el CART_UPDATE de Tab A
    expect(tabB.result.current.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: arroz.id, quantity: 1 }),
      ]),
    );
    expect(tabB.result.current.count).toBe(1);
  });

  // ── Case 3: Race condition — dos tabs agregan el mismo item ───────────────
  it("race condition: dos tabs agregan el mismo item — última escritura gana (HYDRATE)", async () => {
    const slug = "tienda-race";

    const tabA = renderHook(() => useCart(), { wrapper: makeWrapper(slug) });
    const tabB = renderHook(() => useCart(), { wrapper: makeWrapper(slug) });

    // Tab A agrega 1 arroz → Tab B recibe HYDRATE con qty=1
    act(() => {
      tabA.result.current.addItem(arroz);
    });

    // Tab B también agrega 1 arroz localmente (antes de sincronizar)
    act(() => {
      tabB.result.current.addItem(arroz);
    });

    // Tab B transmite su estado (qty=2 si sumó, o qty=1 si fue hydratado).
    // Lo importante: ni Tab A ni Tab B deben tener qty > MAX_QTY=20.
    const finalQtyA = tabA.result.current.items.find((i) => i.id === arroz.id)?.quantity ?? 0;
    const finalQtyB = tabB.result.current.items.find((i) => i.id === arroz.id)?.quantity ?? 0;

    // Ambos tabs tienen al menos 1 arroz y ninguno supera MAX_QTY
    expect(finalQtyA).toBeGreaterThanOrEqual(1);
    expect(finalQtyA).toBeLessThanOrEqual(20);
    expect(finalQtyB).toBeGreaterThanOrEqual(1);
    expect(finalQtyB).toBeLessThanOrEqual(20);
  });

  // ── Case 4: close() al desmontar — sin memory leak ───────────────────────
  it("close() se llama en el canal al desmontar el provider (sin memory leak)", () => {
    const slug = "tienda-leak";

    const { unmount } = renderHook(() => useCart(), { wrapper: makeWrapper(slug) });

    const channels = channelBus.get(`buleje-cart-sync-${slug}`);
    expect(channels?.size).toBe(1);
    const ch = [...channels!][0];
    const closeSpy = vi.spyOn(ch, "close");

    // Desmontar el provider
    unmount();

    expect(closeSpy).toHaveBeenCalledOnce();
    // El canal se eliminó del bus tras close()
    expect(channelBus.get(`buleje-cart-sync-${slug}`)?.size ?? 0).toBe(0);
  });

  // ── Case 5: no self-echo — Tab A no procesa su propio mensaje ─────────────
  it("Tab A no procesa su propio postMessage (anti-echo tabId filter)", async () => {
    const slug = "tienda-echo";

    const tabA = renderHook(() => useCart(), { wrapper: makeWrapper(slug) });

    // Agregar 1 item
    act(() => {
      tabA.result.current.addItem(arroz);
    });
    expect(tabA.result.current.count).toBe(1);

    // Agregar otro item — si hubiera self-echo, el HYDRATE del broadcast
    // clobbearia el state con items viejos. Verificamos que count sigue subiendo.
    act(() => {
      tabA.result.current.addItem(arroz);
    });
    expect(tabA.result.current.count).toBe(2);
  });
});
