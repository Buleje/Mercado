import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import StoreOpenIndicator, {
  type WeeklySchedule,
} from "@/components/marketplace/StoreOpenIndicator";

const FULL_WEEK: WeeklySchedule = {
  mon: { open: "08:00", close: "18:00" },
  tue: { open: "08:00", close: "18:00" },
  wed: { open: "08:00", close: "18:00" },
  thu: { open: "08:00", close: "18:00" },
  fri: { open: "08:00", close: "18:00" },
  sat: { open: "09:00", close: "14:00" },
  sun: null,
};

describe("StoreOpenIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renderiza null cuando no hay weekly ni hoursText", () => {
    const { container } = render(<StoreOpenIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("muestra 'Abierto ahora' dentro del horario y lejos del cierre", () => {
    // Martes (tue) a las 10:00 — dentro de 08-18
    vi.setSystemTime(new Date("2026-04-14T10:00:00"));
    render(<StoreOpenIndicator weekly={FULL_WEEK} />);
    expect(screen.getByText(/Abierto ahora/i)).toBeInTheDocument();
  });

  it("muestra 'Cierra en N min' cuando quedan ≤30 minutos", () => {
    // Martes a las 17:45 — 15 min para el cierre de las 18:00
    vi.setSystemTime(new Date("2026-04-14T17:45:00"));
    render(<StoreOpenIndicator weekly={FULL_WEEK} />);
    expect(screen.getByText(/Cierra en 15 min/i)).toBeInTheDocument();
  });

  it("muestra 'Abre a las HH:MM' cuando aún no abre hoy", () => {
    // Martes a las 07:00 — abre a las 08:00
    vi.setSystemTime(new Date("2026-04-14T07:00:00"));
    render(<StoreOpenIndicator weekly={FULL_WEEK} />);
    expect(screen.getByText(/Abre a las 08:00/i)).toBeInTheDocument();
  });

  it("muestra 'Abre mañana' cuando ya cerró hoy", () => {
    // Martes a las 19:00 — cerró a las 18:00, abre mañana (miércoles) 08:00
    vi.setSystemTime(new Date("2026-04-14T19:00:00"));
    render(<StoreOpenIndicator weekly={FULL_WEEK} />);
    expect(screen.getByText(/Abre mañana 08:00/i)).toBeInTheDocument();
  });

  it("muestra 'Abre [día]' cuando el siguiente día abierto no es mañana", () => {
    // Domingo a las 14:00 — sun=null, abre lunes 08:00 → "Abre mañana"
    vi.setSystemTime(new Date("2026-04-12T14:00:00"));
    render(<StoreOpenIndicator weekly={FULL_WEEK} />);
    expect(screen.getByText(/Abre mañana 08:00/i)).toBeInTheDocument();
  });

  it("fallback a hoursText cuando no hay weekly", () => {
    render(<StoreOpenIndicator hoursText="Lunes a Sábado 8am-6pm" />);
    expect(screen.getByText(/Lunes a Sábado 8am-6pm/i)).toBeInTheDocument();
  });

  it("prefiere weekly sobre hoursText cuando ambos presentes", () => {
    vi.setSystemTime(new Date("2026-04-14T10:00:00"));
    render(
      <StoreOpenIndicator weekly={FULL_WEEK} hoursText="L-V 8-6" />,
    );
    expect(screen.getByText(/Abierto ahora/i)).toBeInTheDocument();
    expect(screen.queryByText(/L-V 8-6/i)).not.toBeInTheDocument();
  });

  it("aria-live='polite' para anunciar cambios sin interrumpir", () => {
    vi.setSystemTime(new Date("2026-04-14T10:00:00"));
    render(<StoreOpenIndicator weekly={FULL_WEEK} />);
    const el = screen.getByRole("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });

  it("variante compact renderiza como span inline", () => {
    vi.setSystemTime(new Date("2026-04-14T10:00:00"));
    render(<StoreOpenIndicator weekly={FULL_WEEK} compact />);
    const el = screen.getByRole("status");
    expect(el.tagName).toBe("SPAN");
  });
});
