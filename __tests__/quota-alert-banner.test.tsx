/**
 * Tests — QuotaAlertBanner + QuotaAlertModal
 *
 * Cubre:
 *  - Banner no aparece cuando uso < 70%
 *  - Banner amarillo aparece cuando alguna métrica >= 70%
 *  - Banner rojo aparece cuando alguna métrica >= 90%
 *  - Botón de cierre oculta el banner
 *  - CTA "Ver detalles" abre el modal
 *  - CTA "Mejorar plan" es un enlace con href correcto
 *  - Modal se cierra con Escape
 *  - Modal tiene role=dialog y aria-modal
 *  - Modal muestra breakdown de métricas
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("server-only", () => ({}));

import type { MeteringSnapshot } from "@/components/admin/unified/MeteringCard/types";
import { QuotaAlertBanner } from "@/components/admin/billing/QuotaAlertBanner";
import { QuotaAlertModal } from "@/components/admin/billing/QuotaAlertModal";
import { METERED_EVENTS } from "@/lib/billing/metering";

// ─── Factories ────────────────────────────────────────────────────────────────

function buildSnapshot(overrides: Partial<MeteringSnapshot> = {}): MeteringSnapshot {
  const baseUsage = Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as MeteringSnapshot["usage"];
  const baseQuotas = Object.fromEntries(
    METERED_EVENTS.map((e) => [e, { limit: 1000, alertAt: 0.8 }]),
  ) as MeteringSnapshot["quotas"];
  const baseSparklines = Object.fromEntries(
    METERED_EVENTS.map((e) => [e, [1, 2, 3, 4, 5, 6, 7]]),
  ) as MeteringSnapshot["sparklines"];

  return {
    tenantId: "tenant_test",
    plan: "starter",
    period: {
      from: "2026-04-01T00:00:00.000Z",
      to: "2026-05-01T00:00:00.000Z",
    },
    usage: baseUsage,
    quotas: baseQuotas,
    estimatedCostUsd: 8.0,
    sparklines: baseSparklines,
    ...overrides,
  };
}

function buildSnapshotAtPct(event: "order.created", pct: number): MeteringSnapshot {
  const LIMIT = 1000;
  return buildSnapshot({
    usage: {
      ...Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as MeteringSnapshot["usage"],
      [event]: Math.round(pct * LIMIT), // pct=0.75 → 750
    },
    quotas: {
      ...Object.fromEntries(METERED_EVENTS.map((e) => [e, { limit: LIMIT, alertAt: 0.8 }])) as MeteringSnapshot["quotas"],
      [event]: { limit: LIMIT, alertAt: 0.8 },
    },
  });
}

afterEach(() => {
  // Restaurar overflow del body si algún test montó el modal
  document.body.style.overflow = "";
});

// ─── Tests: QuotaAlertBanner ──────────────────────────────────────────────────

describe("QuotaAlertBanner", () => {
  it("NO se renderiza cuando el uso es < 70% en todas las métricas", () => {
    const snapshot = buildSnapshotAtPct("order.created", 0.5); // 50%
    const { container } = render(<QuotaAlertBanner snapshot={snapshot} />);
    expect(container.firstChild).toBeNull();
  });

  it("se renderiza en amarillo cuando alguna métrica está entre 70% y 90%", () => {
    const snapshot = buildSnapshotAtPct("order.created", 0.75); // 75%
    render(<QuotaAlertBanner snapshot={snapshot} />);
    const banner = screen.getByRole("alert");
    expect(banner).toBeInTheDocument();
    expect(banner.className).toContain("amber");
    expect(screen.getByText(/Estás cerca del límite/i)).toBeInTheDocument();
  });

  it("se renderiza en rojo cuando alguna métrica supera el 90%", () => {
    const snapshot = buildSnapshotAtPct("order.created", 0.95); // 95%
    render(<QuotaAlertBanner snapshot={snapshot} />);
    const banner = screen.getByRole("alert");
    expect(banner).toBeInTheDocument();
    expect(banner.className).toContain("red");
    expect(screen.getByText(/Has alcanzado el límite/i)).toBeInTheDocument();
  });

  it("menciona el nombre de la métrica afectada en el mensaje", () => {
    const snapshot = buildSnapshotAtPct("order.created", 0.75);
    render(<QuotaAlertBanner snapshot={snapshot} />);
    expect(screen.getByText(/Pedidos/i)).toBeInTheDocument();
  });

  it("el botón X cierra el banner", async () => {
    const user = userEvent.setup();
    const snapshot = buildSnapshotAtPct("order.created", 0.75);
    render(<QuotaAlertBanner snapshot={snapshot} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: /Cerrar alerta/i });
    await user.click(closeBtn);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el CTA 'Mejorar plan' tiene href correcto", () => {
    const snapshot = buildSnapshotAtPct("order.created", 0.75);
    render(
      <QuotaAlertBanner
        snapshot={snapshot}
        upgradeHref="/admin/billing/upgrade"
      />,
    );
    const link = screen.getByRole("link", { name: /Mejorar plan/i });
    expect(link).toHaveAttribute("href", "/admin/billing/upgrade");
  });

  it("el CTA 'Ver detalles' abre el modal", async () => {
    const user = userEvent.setup();
    const snapshot = buildSnapshotAtPct("order.created", 0.75);
    render(<QuotaAlertBanner snapshot={snapshot} />);

    const detailsBtn = screen.getByRole("button", { name: /Ver detalles/i });
    await user.click(detailsBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
  });

  it("usa aria-live=assertive en modo crítico", () => {
    const snapshot = buildSnapshotAtPct("order.created", 0.95);
    render(<QuotaAlertBanner snapshot={snapshot} />);
    const banner = screen.getByRole("alert");
    expect(banner).toHaveAttribute("aria-live", "assertive");
  });

  it("usa aria-live=polite en modo advertencia", () => {
    const snapshot = buildSnapshotAtPct("order.created", 0.75);
    render(<QuotaAlertBanner snapshot={snapshot} />);
    const banner = screen.getByRole("alert");
    expect(banner).toHaveAttribute("aria-live", "polite");
  });

  it("todos los botones tienen min-height de touch target (44px via clase)", () => {
    const snapshot = buildSnapshotAtPct("order.created", 0.75);
    render(<QuotaAlertBanner snapshot={snapshot} />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn.className).toContain("min-h-[44px]");
    });
  });
});

// ─── Tests: QuotaAlertModal ───────────────────────────────────────────────────

describe("QuotaAlertModal", () => {
  it("tiene role=dialog y aria-modal=true", () => {
    const snapshot = buildSnapshot();
    const onClose = vi.fn();
    render(<QuotaAlertModal snapshot={snapshot} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("tiene aria-labelledby apuntando al título", () => {
    const snapshot = buildSnapshot();
    render(<QuotaAlertModal snapshot={snapshot} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const labelledById = dialog.getAttribute("aria-labelledby");
    expect(labelledById).toBeTruthy();
    const title = document.getElementById(labelledById!);
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toContain("Uso de cuota");
  });

  it("muestra breakdown de todas las métricas", () => {
    const snapshot = buildSnapshot();
    render(<QuotaAlertModal snapshot={snapshot} onClose={vi.fn()} />);
    for (const evt of METERED_EVENTS) {
      // Cada evento tiene su etiqueta en la lista
      const label = snapshot.quotas[evt]; // solo para verificar que iteramos
      expect(label).toBeDefined();
    }
    // Al menos 8 barras de progreso (una por evento)
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBeGreaterThanOrEqual(METERED_EVENTS.length);
  });

  it("muestra el costo estimado del período", () => {
    const snapshot = buildSnapshot({ estimatedCostUsd: 55.33 });
    render(<QuotaAlertModal snapshot={snapshot} onClose={vi.fn()} />);
    expect(screen.getByText(/55\.33/)).toBeInTheDocument();
  });

  it("cierra con Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const snapshot = buildSnapshot();
    render(<QuotaAlertModal snapshot={snapshot} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("cierra al hacer click en el botón X", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const snapshot = buildSnapshot();
    render(<QuotaAlertModal snapshot={snapshot} onClose={onClose} />);
    const closeBtn = screen.getByRole("button", { name: /Cerrar modal/i });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("cierra al hacer click en el backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const snapshot = buildSnapshot();
    const { container } = render(<QuotaAlertModal snapshot={snapshot} onClose={onClose} />);
    // El backdrop es el primer div con aria-hidden
    const backdrop = container.querySelector("[aria-hidden='true']");
    if (backdrop) await user.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it("muestra 'Mejorar plan' solo para planes free/starter", () => {
    const snapshotStarter = buildSnapshot({ plan: "starter" });
    const { unmount } = render(<QuotaAlertModal snapshot={snapshotStarter} onClose={vi.fn()} upgradeHref="/upgrade" />);
    expect(screen.getByRole("link", { name: /Mejorar plan/i })).toBeInTheDocument();
    unmount();

    const snapshotEnterprise = buildSnapshot({ plan: "enterprise" });
    render(<QuotaAlertModal snapshot={snapshotEnterprise} onClose={vi.fn()} upgradeHref="/upgrade" />);
    expect(screen.queryByRole("link", { name: /Mejorar plan/i })).not.toBeInTheDocument();
  });

  it("muestra las barras de progreso con aria-valuenow correcto", () => {
    const snapshot = buildSnapshot({
      usage: {
        ...Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as MeteringSnapshot["usage"],
        "order.created": 300,
      },
      quotas: {
        ...Object.fromEntries(METERED_EVENTS.map((e) => [e, { limit: 1000, alertAt: 0.8 }])) as MeteringSnapshot["quotas"],
        "order.created": { limit: 1000, alertAt: 0.8 },
      },
    });
    render(<QuotaAlertModal snapshot={snapshot} onClose={vi.fn()} />);
    const bar30 = screen.getByRole("progressbar", { name: /30% de cuota utilizada para Pedidos/i });
    expect(bar30).toHaveAttribute("aria-valuenow", "30");
  });

  it("bloquea el scroll del body mientras está abierto", () => {
    const snapshot = buildSnapshot();
    const { unmount } = render(<QuotaAlertModal snapshot={snapshot} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    // Después de unmount se restaura
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("muestra el plan del tenant en el subtítulo", () => {
    const snapshot = buildSnapshot({ plan: "pro" });
    render(<QuotaAlertModal snapshot={snapshot} onClose={vi.fn()} />);
    expect(screen.getByText(/Pro/)).toBeInTheDocument();
  });

  it("muestra listas de métricas con rol list/listitem para screen readers", () => {
    const snapshot = buildSnapshot();
    render(<QuotaAlertModal snapshot={snapshot} onClose={vi.fn()} />);
    const list = screen.getByRole("list", { name: /Lista de métricas/i });
    expect(list).toBeInTheDocument();
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(METERED_EVENTS.length);
  });
});
