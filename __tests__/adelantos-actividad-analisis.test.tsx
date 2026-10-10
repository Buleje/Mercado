/**
 * Actividad y Análisis del módulo Adelantos ven lo RECIBIDO (ADR-448, 28-09).
 *
 * Antes del cambio: `AdelantosModule.tsx` le pasaba a las dos vistas sólo
 * `dados` (filtrado por dirección) — un adelanto RECIBIDO (WASACO paga el
 * aserrío antes) desaparecía del historial y del análisis, aunque el negocio
 * le debiera esa plata. Estos tests fallan si eso vuelve a pasar.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { ActividadView } from "@/components/admin/adelantos/ActividadView";
import { AnalisisView } from "@/components/admin/adelantos/AnalisisView";

vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Stub,
    AreaChart: Stub,
    Area: () => null,
    BarChart: Stub,
    Bar: () => null,
    PieChart: Stub,
    Pie: () => null,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

/** Un DbAdelanto mínimo (los campos que estas dos vistas leen), con overrides. */
function ad(overrides: Partial<DbAdelanto> & { id: string }): DbAdelanto {
  return {
    tenantId: "t1",
    codigoOperacion: `ADL-${overrides.id}`,
    reciboManual: null,
    beneficiarioId: "b1",
    beneficiario: { id: "b1", nombre: "WASACO", documento: null, telefono: null, notas: null, limiteCredito: null } as never,
    modalidad: "CUENTA_CORRIENTE",
    montoAdelantado: 1731,
    contratoId: null,
    moneda: "PEN",
    fechaAdelanto: "2026-09-20T12:00:00.000Z",
    fechaVencimiento: null,
    status: "ABIERTO",
    saldoPendiente: 1731,
    totalEntregado: 0,
    notas: null,
    comprobanteUrl: null,
    piesTablares: null,
    piesTablaresTipo: null,
    direccion: "DADO",
    conceptoRecibido: null,
    entregas: [],
    entregasPactadas: [],
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
    ...overrides,
  } as DbAdelanto;
}

describe("ActividadView — lo dado y lo recibido en el mismo feed", () => {
  it("un DADO se lee «Diste a Persona», sin chip de concepto", () => {
    const dado = ad({ id: "1", beneficiario: { id: "b1", nombre: "Juan" } as never });
    render(<ActividadView adelantos={[dado]} loading={false} />);
    expect(screen.getByText("Diste a Juan")).toBeTruthy();
    expect(screen.queryByText(/Te prestaron|Te pagaron antes/)).toBeNull();
  });

  it("un RECIBIDO por servicio se lee «Recibiste de Persona» con el chip «Te pagaron antes»", () => {
    const recibido = ad({
      id: "2",
      beneficiario: { id: "b2", nombre: "WASACO" } as never,
      direccion: "RECIBIDO",
      conceptoRecibido: "SERVICIO",
    });
    render(<ActividadView adelantos={[recibido]} loading={false} />);
    expect(screen.getByText("Recibiste de WASACO")).toBeTruthy();
    expect(screen.getByText("Te pagaron antes")).toBeTruthy();
  });

  it("un RECIBIDO por préstamo con una devolución se lee «Le diste a Persona»", () => {
    const recibido = ad({
      id: "3",
      beneficiario: { id: "b3", nombre: "Pedro" } as never,
      direccion: "RECIBIDO",
      conceptoRecibido: "PRESTAMO",
      saldoPendiente: 500,
      entregas: [
        { id: "e1", adelantoId: "3", fecha: "2026-09-25T12:00:00.000Z", tipo: "PRODUCTO", descripcion: null, productId: null, cantidad: null, valor: 300, sumadoAStock: false, notas: null, comprobanteUrl: null } as never,
      ],
    });
    render(<ActividadView adelantos={[recibido]} loading={false} />);
    expect(screen.getByText("Recibiste de Pedro")).toBeTruthy();
    expect(screen.getByText("Le diste a Pedro")).toBeTruthy();
    expect(screen.getAllByText("Te prestaron").length).toBeGreaterThan(0);
  });

  it("sin ningún recibido no aparece el filtro de dirección (no ensucia la vista de siempre)", () => {
    const dado = ad({ id: "4" });
    render(<ActividadView adelantos={[dado]} loading={false} />);
    expect(screen.queryByText("Sólo recibiste")).toBeNull();
  });

  it("el filtro «Sólo recibiste» esconde lo dado", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const dado = ad({ id: "5", beneficiario: { id: "b1", nombre: "Ana" } as never });
    const recibido = ad({ id: "6", beneficiario: { id: "b2", nombre: "WASACO" } as never, direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" });
    render(<ActividadView adelantos={[dado, recibido]} loading={false} />);
    /* Desde N20e (08-10) la dirección es un desplegable, no tres chips. */
    await userEvent.selectOptions(screen.getByLabelText("Dirección de la plata"), "RECIBIDO");
    expect(screen.queryByText("Diste a Ana")).toBeNull();
    expect(screen.getByText("Recibiste de WASACO")).toBeTruthy();
  });
});

describe("AnalisisView — «Lo que recibiste» separado de lo dado", () => {
  it("sin recibidos no dibuja el bloque nuevo", () => {
    const dado = ad({ id: "1" });
    render(<AnalisisView adelantos={[dado]} recibidos={[]} loading={false} />);
    expect(screen.queryByText("Lo que recibiste")).toBeNull();
  });

  it("con un recibido dibuja el bloque, sin tocar el KPI de lo dado", () => {
    const dado = ad({ id: "1", montoAdelantado: 1000, saldoPendiente: 1000 });
    const recibido = ad({
      id: "2",
      beneficiario: { id: "b2", nombre: "WASACO" } as never,
      direccion: "RECIBIDO",
      conceptoRecibido: "SERVICIO",
      montoAdelantado: 1731,
      saldoPendiente: 1731,
    });
    render(<AnalisisView adelantos={[dado]} recibidos={[recibido]} loading={false} />);
    const bloque = screen.getByText("Lo que recibiste").closest("div") as HTMLElement;
    expect(bloque).toBeTruthy();
    // El KPI "Adelantado" sigue siendo SÓLO lo dado (S/ 1,000), no S/ 2,731.
    const adelantadoCard = screen.getByText("Adelantado").closest("div") as HTMLElement;
    expect(within(adelantadoCard).getByText(/1,000|1000/)).toBeTruthy();
  });

  it("un recibido cuando NO hay ningún dado igual muestra el bloque (no cae al EmptyState)", () => {
    const recibido = ad({ id: "1", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO" });
    render(<AnalisisView adelantos={[]} recibidos={[recibido]} loading={false} />);
    expect(screen.queryByText("Sin datos")).toBeNull();
    expect(screen.getByText("Lo que recibiste")).toBeTruthy();
  });

  it("nunca mezcla PEN con USD en «Por devolver»", () => {
    const recibidoPen = ad({ id: "1", direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", moneda: "PEN", montoAdelantado: 1000, saldoPendiente: 1000 });
    const recibidoUsd = ad({ id: "2", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", moneda: "USD", montoAdelantado: 300, saldoPendiente: 300 });
    render(<AnalisisView adelantos={[]} recibidos={[recibidoPen, recibidoUsd]} loading={false} />);
    // Toggle por defecto muestra la de mayor volumen (PEN, 1000 > 300): "Por
    // devolver" debe ser S/ 1,000, nunca la suma 1300.
    const porDevolverCard = screen.getByText("Por devolver").closest("div") as HTMLElement;
    expect(within(porDevolverCard).queryByText(/1,300/)).toBeNull();
  });
});
