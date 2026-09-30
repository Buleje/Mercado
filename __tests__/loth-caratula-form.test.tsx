/**
 * Tests — LothCaratulaForm en pasos, con la red simulada.
 *
 *  · abre en el primer paso que falta (el «Completar» de la ficha cae directo ahí);
 *  · lo que el negocio y el plan ya saben llega con su marca «Propuesto de…»;
 *  · RUC con dígito verificador malo bloquea el guardado y lo dice en texto;
 *  · con sólo el titular se puede guardar desde el paso 1;
 *  · la ficha llama a «Completar» con el paso que falta.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LothCaratulaForm from "@/components/admin/forestal/LothCaratulaForm";
import LothFichaPermiso from "@/components/admin/forestal/LothFichaPermiso";

// El selector del Directorio pide el ConfirmDialogProvider del panel: acá no se prueba.
vi.mock("@/components/admin/forestal/DirectorioPicker", () => ({ default: () => null }));

const PROPUESTA = {
  negocio: { nombre: "Blas", razonSocial: "Inversiones Agroforestales Blas S.A.", ruc: "20123456786", email: null, telefono: null, direccion: null },
  plan: { planType: "PO", planNumber: null, tituloHabilitante: "10-HUA-PUE/PER-FMP-2026-007", resolucionNumber: "RDE 001-2026", resolucionDate: "2026-03-20T00:00:00.000Z", titularName: null },
};

let llamadas: { url: string; method: string; body?: Record<string, unknown> }[] = [];

beforeEach(() => {
  llamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      llamadas.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
      if (url.includes("/caratula/propuesta")) return json(PROPUESTA);
      if (url.includes("/loth/cites")) return json(method === "PUT" ? { ok: true } : { catalogo: { permisos: [] } });
      if (url.includes("/loth/caratula")) return json({ caratula: { id: "c1" } }, 201);
      return json({});
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const base = { onClose: vi.fn(), onSaved: vi.fn() };

describe("LothCaratulaForm", () => {
  it("nueva: abre en el paso 1 y trae el título y la resolución del plan con su marca", async () => {
    render(<LothCaratulaForm current={null} {...base} />);
    expect(screen.getByRole("button", { name: /^Paso 1:/ }).getAttribute("aria-current")).toBe("step");
    await waitFor(() => expect((screen.getByLabelText(/N° de título habilitante/) as HTMLInputElement).value).toBe("10-HUA-PUE/PER-FMP-2026-007"));
    expect((screen.getByLabelText(/Fecha de la resolución/) as HTMLInputElement).value).toBe("2026-03-20");
    expect(screen.getAllByText("Propuesto del plan").length).toBeGreaterThanOrEqual(3);
    // al tocar el campo deja de ser «propuesto»
    fireEvent.change(screen.getByLabelText(/N° de resolución/), { target: { value: "RDE 002-2026" } });
    expect(screen.getAllByText("Propuesto del plan")).toHaveLength(2);
  });

  it("existente con el paso 1 completo: abre directo en el paso 2", () => {
    render(
      <LothCaratulaForm
        current={{ id: "c1", registroNumber: null, tomo: null, titularName: "Blas SAC", tituloHabilitante: "17-CPO/C-J-001-02", resolucionNumber: "RDE 1", resolucionDate: "2026-03-20T00:00:00.000Z" }}
        {...base}
      />,
    );
    expect(screen.getByRole("button", { name: /^Paso 2:/ }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByLabelText(/^RUC/)).toBeTruthy();
  });

  it("titular del negocio propuesto en el paso 2, RUC malo bloquea y lo dice en texto", async () => {
    render(<LothCaratulaForm current={null} pasoInicial={2} {...base} />);
    await waitFor(() => expect((screen.getByLabelText(/Titular del título habilitante/) as HTMLInputElement).value).toBe("Inversiones Agroforestales Blas S.A."));
    // titular y RUC vienen del negocio
    expect(screen.getAllByText("Propuesto del negocio")).toHaveLength(2);
    const guardar = screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(false);

    fireEvent.change(screen.getByLabelText(/^RUC/), { target: { value: "20123456789" } });
    expect(screen.getByText(/dígito verificador/)).toBeTruthy();
    expect(screen.getByLabelText(/^RUC/).getAttribute("aria-invalid")).toBe("true");
    expect(guardar.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/DNI/), { target: { value: "123" } });
    expect(screen.getByText(/8 dígitos \(llevas 3\)/)).toBeTruthy();
  });

  it("guarda desde el paso 1 con sólo el titular propuesto, y manda la fecha", async () => {
    render(<LothCaratulaForm current={null} {...base} />);
    const guardar = screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true); // sin titular todavía
    expect(screen.getByText(/Falta el titular/)).toBeTruthy();
    await waitFor(() => expect(guardar.disabled).toBe(false));
    fireEvent.click(guardar);
    await waitFor(() => expect(base.onSaved).toHaveBeenCalled());
    const post = llamadas.find((l) => l.method === "POST" && l.url.endsWith("/loth/caratula"));
    expect(post?.body).toMatchObject({ titularName: "Inversiones Agroforestales Blas S.A.", resolucionDate: "2026-03-20", ruc: "20123456786", tomo: null });
  });
});

describe("LothFichaPermiso → «Completar carátula»", () => {
  it("sin carátula llama con el paso 1; con el paso 1 completo, con el 2", () => {
    const onCaratula = vi.fn();
    const { rerender } = render(<LothFichaPermiso caratula={null} plan={{ parcelaCorta: "P1", vigenciaDesde: "2026-01-01", vigenciaHasta: "2028-01-01", estado: "vigente" }} onCompletarCaratula={onCaratula} />);
    fireEvent.click(screen.getByRole("button", { name: /^Completar/ }));
    expect(onCaratula).toHaveBeenLastCalledWith(1);

    rerender(
      <LothFichaPermiso
        caratula={{ titularName: "Blas SAC", tituloHabilitante: "17-CPO/C-J-001-02", resolucionNumber: "RDE 1", resolucionDate: new Date("2026-03-20T00:00:00Z") }}
        plan={null}
        onCompletarCaratula={onCaratula}
      />,
    );
    // el paso 1 está completo: lo que falta (RUC, libro) empieza en el paso 2
    expect(screen.getByText(/Falta en la carátula: RUC, N° de registro del libro y 2 más/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Completar: Falta en la carátula/ }));
    expect(onCaratula).toHaveBeenLastCalledWith(2);
  });
});
