/**
 * Tests para el registro de live-viewers en StoreDetail.
 *
 * Verifica:
 *   1. Al mount se hace POST a /api/marketplace/stores/{slug}/live-viewers
 *   2. El body contiene un sessionId válido (UUID)
 *   3. El sessionId se reutiliza entre re-mounts (persiste en sessionStorage)
 *   4. Un error de fetch no rompe el render (fire-and-forget)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

// ── Mocks de dependencias pesadas ────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt ?? ""} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("framer-motion", () => {
  const motion = {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
  };
  return {
    motion,
    m: motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    domAnimation: {},
  };
});

vi.mock("@/hooks/use-marketplace-cart", () => ({
  useMarketplaceCart: () => ({
    byStore: {},
    totalByStore: {},
    updateQuantity: vi.fn(),
    removeItem: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-cart-with-undo", () => ({
  useCartWithUndo: () => ({
    addItemWithUndo: vi.fn(),
  }),
}));

vi.mock("@/components/marketplace/MarketplaceChat", () => ({
  default: () => null,
}));

vi.mock("@/components/marketplace/MarketplaceCart", () => ({
  default: () => null,
}));

// ── Mock fetch global ─────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Mock sessionStorage ───────────────────────────────────────────────────────

const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, "sessionStorage", { value: sessionStorageMock });

// ── Import del componente (después de los mocks) ──────────────────────────────

import StoreDetail from "@/components/marketplace/StoreDetail";

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeFetchOk(data: unknown = null) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("StoreDetail — registro de live-viewers", () => {
  beforeEach(() => {
    mockFetch.mockImplementation(() => makeFetchOk());
    sessionStorageMock.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("hace POST a /api/marketplace/stores/{slug}/live-viewers al montar", async () => {
    render(<StoreDetail slug="bodega-test" />);

    // Esperar el tick del useEffect
    await Promise.resolve();

    const postCall = mockFetch.mock.calls.find(
      ([url, options]) =>
        typeof url === "string" &&
        url.includes("/api/marketplace/stores/bodega-test/live-viewers") &&
        options?.method === "POST",
    );

    expect(postCall).toBeDefined();
  });

  it("el body del POST contiene un sessionId con formato UUID válido", async () => {
    render(<StoreDetail slug="bodega-test" />);

    await Promise.resolve();

    const postCall = mockFetch.mock.calls.find(
      ([url, options]) =>
        typeof url === "string" &&
        url.includes("/live-viewers") &&
        options?.method === "POST",
    );

    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1].body as string);
    expect(body.sessionId).toMatch(UUID_REGEX);
  });

  it("el sessionId se reutiliza entre re-mounts (persiste en sessionStorage)", async () => {
    const { unmount } = render(<StoreDetail slug="bodega-test" />);
    await Promise.resolve();

    const firstCalls = mockFetch.mock.calls.filter(
      ([url, options]) =>
        typeof url === "string" &&
        url.includes("/live-viewers") &&
        options?.method === "POST",
    );
    const firstSessionId = JSON.parse(firstCalls[0][1].body as string).sessionId;

    unmount();
    mockFetch.mockClear();

    render(<StoreDetail slug="bodega-test" />);
    await Promise.resolve();

    const secondCalls = mockFetch.mock.calls.filter(
      ([url, options]) =>
        typeof url === "string" &&
        url.includes("/live-viewers") &&
        options?.method === "POST",
    );
    const secondSessionId = JSON.parse(secondCalls[0][1].body as string).sessionId;

    expect(secondSessionId).toBe(firstSessionId);
  });

  it("un fallo del fetch no rompe el render (fire-and-forget)", async () => {
    // El POST falla en silencio; los otros fetch (store/products) devuelven OK
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (
        typeof url === "string" &&
        url.includes("/live-viewers") &&
        options?.method === "POST"
      ) {
        return Promise.reject(new Error("network error"));
      }
      return makeFetchOk({ data: null });
    });

    // No debe lanzar ninguna excepción
    expect(() => render(<StoreDetail slug="bodega-test" />)).not.toThrow();

    await Promise.resolve();
  });
});
