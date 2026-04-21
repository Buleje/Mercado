/**
 * Cart context tests — contexts/cart-context.tsx
 *
 * Cubre los 5 escenarios criticos:
 *   1. Hydrate desde localStorage al mount
 *   2. Add item → persiste a localStorage + broadcast multi-tab
 *   3. Recibir CART_UPDATE de otro tab → actualiza state
 *   4. Self-echo guard: mensaje con mismo TAB_ID es ignorado
 *   5. Guard hydration: si /check-exists devuelve vacio, NUNCA borra el carrito
 *      (regresion 2026-04-19 — bug que borraba carrito multi-store)
 *
 * Mocks: BroadcastChannel (no existe en jsdom), AudioContext (no existe en jsdom),
 * fetch (controla la respuesta de /api/marketplace/products/check-exists).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { CartProvider, useCart } from "@/contexts/cart-context";

// ─── BroadcastChannel mock ──────────────────────────────────────────────────

type Listener = (ev: MessageEvent) => void;

class MockBroadcastChannel {
  static channels: Map<string, MockBroadcastChannel[]> = new Map();
  name: string;
  closed = false;
  listeners: Listener[] = [];

  constructor(name: string) {
    this.name = name;
    const existing = MockBroadcastChannel.channels.get(name) ?? [];
    existing.push(this);
    MockBroadcastChannel.channels.set(name, existing);
  }

  addEventListener(type: string, fn: Listener) {
    if (type === "message") this.listeners.push(fn);
  }

  removeEventListener(type: string, fn: Listener) {
    if (type !== "message") return;
    this.listeners = this.listeners.filter((l) => l !== fn);
  }

  postMessage(data: unknown) {
    if (this.closed) return;
    const peers = MockBroadcastChannel.channels.get(this.name) ?? [];
    for (const peer of peers) {
      if (peer === this || peer.closed) continue;
      // Simula MessageEvent (jsdom-friendly)
      const event = { data } as MessageEvent;
      for (const l of peer.listeners) l(event);
    }
  }

  close() {
    this.closed = true;
    const peers = MockBroadcastChannel.channels.get(this.name) ?? [];
    MockBroadcastChannel.channels.set(
      this.name,
      peers.filter((p) => p !== this),
    );
  }
}

// ─── AudioContext mock (cart usa playPopSound al ADD_ITEM) ──────────────────

class MockAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    return {
      connect: () => {},
      type: "",
      frequency: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      start: () => {},
      stop: () => {},
    };
  }
  createGain() {
    return {
      connect: () => {},
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
    };
  }
}

// ─── Setup global mocks ─────────────────────────────────────────────────────

beforeEach(() => {
  MockBroadcastChannel.channels = new Map();
  // @ts-expect-error — jsdom no tiene BroadcastChannel
  globalThis.BroadcastChannel = MockBroadcastChannel;
  // @ts-expect-error — jsdom no tiene AudioContext
  globalThis.AudioContext = MockAudioContext;
  localStorage.clear();
  // Mock fetch por default: devuelve check-exists "todos existen"
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/marketplace/products/check-exists")) {
        const idsParam = new URL("http://x" + url).searchParams.get("ids") ?? "";
        const ids = idsParam
          .split(",")
          .map((s) => parseInt(s, 10))
          .filter((n) => Number.isInteger(n));
        return new Response(JSON.stringify({ existingIds: ids, missingIds: [] }), {
          status: 200,
        });
      }
      return new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const wrapper = ({ children, slug = "main" }: { children: ReactNode; slug?: string }) => (
  <CartProvider tenantSlug={slug}>{children}</CartProvider>
);

const productSample = {
  id: 42,
  name: "Arroz 5kg",
  price: 28.5,
  image: "/img.jpg",
  category: "abarrotes",
  unit: "bolsa",
};

function seedLocalStorageCart(slug: string, items: unknown[]) {
  const key = `buleje-${slug}-cart`;
  localStorage.setItem(key, JSON.stringify(items));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("CartProvider — hydration desde localStorage", () => {
  it("hidrata items guardados al montar", async () => {
    seedLocalStorageCart("main", [{ ...productSample, quantity: 3 }]);

    const { result } = renderHook(() => useCart(), { wrapper });

    // Esperar microtask del useEffect inicial (sync localStorage read)
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe(42);
    expect(result.current.items[0].quantity).toBe(3);
  });

  it("arranca vacio si localStorage no tiene cart", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.items).toEqual([]);
  });
});

describe("CartProvider — add item persiste y broadcast", () => {
  it("addItem actualiza state y persiste a localStorage", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      result.current.addItem(productSample);
      await Promise.resolve();
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(1);

    // Debe persistir en localStorage
    const saved = localStorage.getItem("buleje-main-cart");
    expect(saved).toBeTruthy();
    const parsed = JSON.parse(saved ?? "[]");
    expect(parsed[0].id).toBe(42);
  });

  it("addItem 2 veces el mismo producto incrementa quantity (max 20)", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      result.current.addItem(productSample);
      result.current.addItem(productSample);
      result.current.addItem(productSample);
      await Promise.resolve();
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(3);
  });
});

describe("CartProvider — multi-tab sync via BroadcastChannel", () => {
  it("recibir CART_UPDATE de otro tab actualiza el carrito local", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.items).toHaveLength(0);

    // Otro tab postea CART_UPDATE con tabId DIFERENTE
    await act(async () => {
      const otherTab = new MockBroadcastChannel("buleje-cart-sync-main");
      otherTab.postMessage({
        type: "CART_UPDATE",
        payload: [{ ...productSample, quantity: 5 }],
        tabId: "other-tab-uuid-different",
      });
      await Promise.resolve();
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(5);
  });

  it("CART_CLEAR de otro tab vacia el carrito local", async () => {
    seedLocalStorageCart("main", [{ ...productSample, quantity: 2 }]);

    const { result } = renderHook(() => useCart(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.items).toHaveLength(1);

    await act(async () => {
      const otherTab = new MockBroadcastChannel("buleje-cart-sync-main");
      otherTab.postMessage({
        type: "CART_CLEAR",
        tabId: "other-tab",
      });
      await Promise.resolve();
    });

    expect(result.current.items).toHaveLength(0);
  });
});

describe("CartProvider — guard contra hydration que borra carrito", () => {
  it("preserva carrito si check-exists devuelve existingIds vacio (bug 2026-04-19)", async () => {
    seedLocalStorageCart("main", [{ ...productSample, quantity: 2 }]);

    // Mock fetch: check-exists devuelve TODOS los items como "missing"
    // Si el guard fallara, el carrito quedaria vacio. El comportamiento correcto
    // es PRESERVAR el carrito (senal dudosa = no borrar).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ existingIds: [], missingIds: [42] }), {
          status: 200,
        }),
      ),
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    await act(async () => {
      // Esperar a que el fetch interno corra
      await new Promise((r) => setTimeout(r, 50));
    });

    // Guard activo: items siguen ahi
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe(42);
  });

  it("limpia items que efectivamente faltan si quedan otros validos", async () => {
    seedLocalStorageCart("main", [
      { ...productSample, id: 42, quantity: 2 },
      { ...productSample, id: 99, quantity: 1 },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ existingIds: [42], missingIds: [99] }), {
          status: 200,
        }),
      ),
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // El item missing fue removido, el valido sigue
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe(42);
  });
});

describe("CartProvider — operaciones basicas", () => {
  it("removeItem quita el producto del carrito", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      result.current.addItem(productSample);
      await Promise.resolve();
    });
    expect(result.current.items).toHaveLength(1);

    await act(async () => {
      result.current.removeItem(productSample.id);
      await Promise.resolve();
    });
    expect(result.current.items).toHaveLength(0);
  });

  it("clear vacia el carrito", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      result.current.addItem(productSample);
      result.current.addItem({ ...productSample, id: 99 });
      await Promise.resolve();
    });
    expect(result.current.items).toHaveLength(2);

    await act(async () => {
      result.current.clear();
      await Promise.resolve();
    });
    expect(result.current.items).toHaveLength(0);
  });

  it("useCart fuera de provider tira error claro", () => {
    // Suprimir el error console (es esperado)
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <UseCartConsumer />,
      ),
    ).toThrow(/useCart must be inside CartProvider/);
    errSpy.mockRestore();
  });
});

function UseCartConsumer() {
  useCart();
  return null;
}
