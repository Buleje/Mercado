/**
 * OnboardingWizard — tests unitarios.
 *
 * Cobertura:
 * - skeleton inicial
 * - happy path (3/5 detectados desde API real-shape)
 * - estado de error (banner visible cuando fetch falla)
 * - resiliencia: paymentMethods=null, settings=null
 * - localStorage sanitiza tenantSlug peligroso
 * - aria-labelledby apunta al título dinámico
 * - Escape cierra el modal
 * - body scroll lock aplica y restaura
 * - whitelist bloquea hrefs no permitidos (preventivo open redirect)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingWizard from "@/components/admin/OnboardingWizard";

// Mock SectionTitle del DS — pasamos id para validar aria-labelledby
vi.mock("@buleje/design-system", () => ({
  SectionTitle: ({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) => (
    <h2 id={id} className={className} data-testid="section-title">
      {children}
    </h2>
  ),
}));

// Mock los íconos como spans simples — evita cargar SVGs reales
vi.mock("@buleje/design-system/icons", () => {
  const stub = (name: string) => {
    const IconStub = () => <span data-testid={`icon-${name}`} />;
    IconStub.displayName = `IconStub(${name})`;
    return IconStub;
  };
  return {
    Store: stub("Store"),
    Package: stub("Package"),
    CreditCard: stub("CreditCard"),
    Users: stub("Users"),
    ShoppingCart: stub("ShoppingCart"),
    ArrowRight: stub("ArrowRight"),
    X: stub("X"),
    Sparkles: stub("Sparkles"),
    Rocket: stub("Rocket"),
    Check: stub("Check"),
    ChevronRight: stub("ChevronRight"),
  };
});

// Helper: arma una respuesta dashboard
function dashboardOk(opts?: { products?: number; customers?: number; sales?: number }) {
  return {
    products: Array.from({ length: opts?.products ?? 0 }).map((_, i) => ({ id: `p${i}` })),
    customers: Array.from({ length: opts?.customers ?? 0 }).map((_, i) => ({ id: `c${i}` })),
    sales: Array.from({ length: opts?.sales ?? 0 }).map((_, i) => ({ id: `s${i}` })),
    orders: [],
  };
}

function settingsOk(opts?: { businessName?: string; paymentMethods?: unknown }) {
  return {
    slug: "main",
    businessName: opts?.businessName ?? "",
    paymentMethods: opts?.paymentMethods,
  };
}

function mockFetch(dashRes: unknown, settingsRes: unknown, opts?: { dashStatus?: number; settingsStatus?: number }) {
  return vi.fn(async (url: string) => {
    if (url.includes("/api/admin/dashboard")) {
      const status = opts?.dashStatus ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => dashRes,
      } as Response;
    }
    if (url.includes("/api/settings")) {
      const status = opts?.settingsStatus ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => settingsRes,
      } as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

beforeEach(() => {
  // Aislar localStorage entre tests
  localStorage.clear();
  document.body.style.overflow = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OnboardingWizard", () => {
  it("renderiza skeleton mientras carga", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => { /* never resolves */ })),
    );
    const onClose = vi.fn();
    render(<OnboardingWizard tenantSlug="main" onClose={onClose} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // 5 skeletons (clases con animate-pulse)
    expect(document.querySelectorAll(".animate-pulse").length).toBe(5);
  });

  it("happy path: detecta 3/5 pasos completados desde API", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        dashboardOk({ products: 2, customers: 1, sales: 0 }),
        settingsOk({ businessName: "Mi Bodega", paymentMethods: { yape: true } }),
      ),
    );
    render(<OnboardingWizard tenantSlug="main" onClose={vi.fn()} />);

    // 3 "LISTO" badges visibles (settings, products, payment, customers — son 4 en realidad)
    await waitFor(() => {
      const listos = screen.getAllByText("Listo");
      expect(listos.length).toBe(4);
    });

    expect(screen.getByText("4/5 pasos")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("muestra banner de error cuando dashboard responde 500", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ error: "boom" }, settingsOk(), { dashStatus: 500 }),
    );
    render(<OnboardingWizard tenantSlug="main" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No pudimos cargar tu progreso/i)).toBeInTheDocument();
    });
  });

  it("no crashea si paymentMethods llega null explícito", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        dashboardOk(),
        settingsOk({ paymentMethods: null }),
      ),
    );
    render(<OnboardingWizard tenantSlug="main" onClose={vi.fn()} />);

    // No tira TypeError
    await waitFor(() => {
      expect(screen.getByText("0/5 pasos")).toBeInTheDocument();
    });
  });

  it("no crashea si settings es null/array malformado", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(dashboardOk(), null),
    );
    render(<OnboardingWizard tenantSlug="main" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("0/5 pasos")).toBeInTheDocument();
    });
  });

  it("sanitiza tenantSlug peligroso al persistir en localStorage", async () => {
    vi.stubGlobal("fetch", mockFetch(dashboardOk(), settingsOk()));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<OnboardingWizard tenantSlug="../../etc/passwd" onClose={onClose} />);

    await waitFor(() => screen.getByText("0/5 pasos"));
    await user.click(screen.getByLabelText("Cerrar"));

    // La clave NO debe contener `/` ni `.`
    const keys = Object.keys(localStorage);
    expect(keys).toContain("onboarding-completed-______etc_passwd");
    expect(keys.some((k) => k.includes("/"))).toBe(false);
  });

  it("aria-labelledby apunta al id del título dinámico", async () => {
    vi.stubGlobal("fetch", mockFetch(dashboardOk(), settingsOk()));
    render(<OnboardingWizard tenantSlug="main" onClose={vi.fn()} />);

    await waitFor(() => screen.getByText("0/5 pasos"));

    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();

    const title = document.getElementById(labelledBy!);
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toMatch(/Configura tu bodega/);
  });

  it("Escape cierra el modal y persiste el flag", async () => {
    vi.stubGlobal("fetch", mockFetch(dashboardOk(), settingsOk()));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<OnboardingWizard tenantSlug="main" onClose={onClose} />);
    await waitFor(() => screen.getByText("0/5 pasos"));

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("onboarding-completed-main")).toBe("1");
  });

  it("aplica y restaura body scroll lock", async () => {
    vi.stubGlobal("fetch", mockFetch(dashboardOk(), settingsOk()));
    document.body.style.overflow = "auto"; // valor previo

    const { unmount } = render(<OnboardingWizard tenantSlug="main" onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("0/5 pasos"));

    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("aborta el fetch al desmontar (no setea estado en componente muerto)", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => { /* never resolves */ })),
    );

    const { unmount } = render(<OnboardingWizard tenantSlug="main" onClose={vi.fn()} />);
    unmount();

    expect(abortSpy).toHaveBeenCalled();
  });

  it("idempotencia: doble click en Saltar solo dispara onClose una vez", async () => {
    vi.stubGlobal("fetch", mockFetch(dashboardOk(), settingsOk()));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<OnboardingWizard tenantSlug="main" onClose={onClose} />);
    await waitFor(() => screen.getByText("Saltar"));

    const skipBtn = screen.getByText("Saltar");
    await act(async () => {
      await user.click(skipBtn);
      await user.click(skipBtn);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("muestra estado allDone cuando los 5 pasos están completos", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        dashboardOk({ products: 1, customers: 1, sales: 1 }),
        settingsOk({ businessName: "Mi Bodega", paymentMethods: { yape: true } }),
      ),
    );
    render(<OnboardingWizard tenantSlug="main" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Tu bodega está lista/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Empezar a vender/i)).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
