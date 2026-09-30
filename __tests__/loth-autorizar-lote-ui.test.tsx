/**
 * UI de «Cargar lo autorizado» (30-09).
 *
 * - «Cupo por especie»: cada especie medida contra el CENSO ofrece «Cargar lo
 *   autorizado»; la que ya tiene autorizado, no.
 * - El enlace lleva al plan con la especie, y el plan lo lee y lo borra.
 * - La tabla trae todas las especies del censo, resalta la pedida y guarda
 *   todo en UNA llamada con sólo las filas llenas.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LothCupoEspecies from "@/components/admin/forestal/LothCupoEspecies";
import LothTraceCupo from "@/components/admin/forestal/LothTraceCupo";
import LothPlanAutorizarLote from "@/components/admin/forestal/LothPlanAutorizarLote";
import { tomarPedidoAutorizar, urlCargarAutorizado } from "@/components/admin/forestal/loth-autorizar-url";
import { cupoPorEspecie } from "@/lib/forestal/loth-cupo-especie";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** Tornillo con autorizado (plan chico); Copaiba y Catahua sólo con censo. */
const FILAS = cupoPorEspecie({
  censo: [
    { treeCode: "85-TOR", speciesCommon: "Tornillo", volumenEstimadoM3: 2.9 },
    { treeCode: "111", speciesCommon: "Copaiba", volumenEstimadoM3: 126.9 },
    { treeCode: "501", speciesCommon: "Catahua", volumenEstimadoM3: 60 },
  ],
  talas: [{ treeCode: "111", speciesCommon: "Copaiba", volumeM3: 10.37 }],
  autorizadas: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 320, arbolesAutorizados: 45 }],
  soloCenso: true,
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("Cupo por especie → «Cargar lo autorizado»", () => {
  it("sólo en las especies medidas contra el censo, y avisa cuál", () => {
    const onCargar = vi.fn();
    const { container } = render(<LothCupoEspecies filas={FILAS} onCargarAutorizado={onCargar} />);
    const botones = container.querySelectorAll("[data-cargar-autorizado]");
    expect([...botones].map((b) => b.getAttribute("data-cargar-autorizado")).sort()).toEqual(["catahua", "copaiba"]);
    fireEvent.click(screen.getByRole("button", { name: "Cargar lo autorizado de Copaiba" }));
    expect(onCargar).toHaveBeenCalledWith("Copaiba");
  });

  it("sin la prop, la tabla no ofrece editar (se usa también donde no se edita)", () => {
    const { container } = render(<LothCupoEspecies filas={FILAS} />);
    expect(container.querySelector("[data-cargar-autorizado]")).toBeNull();
  });

  it("dentro del avance del permiso el botón está, al abrir el plegable", () => {
    const onCargar = vi.fn();
    render(<LothTraceCupo filas={FILAS} onCargarAutorizado={onCargar} />);
    fireEvent.click(screen.getByRole("button", { name: /Cupo por especie/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cargar lo autorizado de Catahua" }));
    expect(onCargar).toHaveBeenCalledWith("Catahua");
  });
});

describe("el enlace al plan", () => {
  it("lleva a la vista plan del libro con la especie", () => {
    const url = new URL(urlCargarAutorizado("Copaiba"), "http://x");
    expect(url.searchParams.get("tab")).toBe("loth-libro-operaciones");
    expect(url.searchParams.get("vista")).toBe("plan");
    expect(url.searchParams.get("autorizar")).toBe("Copaiba");
  });

  it("el plan lo toma UNA vez y lo borra de la URL (recargar no reabre)", () => {
    window.history.replaceState(null, "", "/admin?tab=loth-libro-operaciones&vista=plan&autorizar=Copaiba");
    expect(tomarPedidoAutorizar()).toBe("Copaiba");
    expect(window.location.search).toBe("?tab=loth-libro-operaciones&vista=plan");
    expect(tomarPedidoAutorizar()).toBeNull();
  });
});

describe("LothPlanAutorizarLote", () => {
  const CENSO = [
    { speciesCommon: "Copaiba", volumenEstimadoM3: "6.5" },
    { speciesCommon: "Copaiba", volumenEstimadoM3: "6.5" },
    { speciesCommon: "Lupuna", volumenEstimadoM3: "9.1" },
    { speciesCommon: "Quinilla", volumenEstimadoM3: "4.4" },
  ];

  it("todas las especies del censo, la pedida resaltada; guarda sólo las llenas en UNA llamada", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, creadas: 2, actualizadas: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onGuardado = vi.fn();
    const onClose = vi.fn();
    render(
      <LothPlanAutorizarLote open onClose={onClose} planId="plan-grande" censo={CENSO} species={[]} especiePedida="Lupuna" onGuardado={onGuardado} />,
    );
    const tabla = document.querySelector("[data-autorizar-lote]") as HTMLElement;
    const filas = tabla.querySelectorAll("[data-autorizar-fila]");
    expect([...filas].map((f) => f.getAttribute("data-autorizar-fila"))).toEqual(["copaiba", "lupuna", "quinilla"]);
    expect(tabla.querySelector("[data-pedida]")?.getAttribute("data-autorizar-fila")).toBe("lupuna");
    expect(within(tabla).getByText(/censo: 2 árb/)).toBeTruthy();
    // El foco cae en los m³ de la especie con la que se llegó.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Volumen autorizado de Lupuna (m³)")));

    fireEvent.change(screen.getByLabelText("Volumen autorizado de Copaiba (m³)"), { target: { value: "120,5" } });
    fireEvent.change(screen.getByLabelText("Número de árboles autorizados de Copaiba"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("Volumen autorizado de Lupuna (m³)"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar todo/ }));

    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/forestal/plan/species");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      planId: "plan-grande",
      especies: [
        { speciesCommon: "Copaiba", volumenAutorizadoM3: 120.5, arbolesAutorizados: 14 },
        { speciesCommon: "Lupuna", volumenAutorizadoM3: 80, arbolesAutorizados: null },
      ],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("una fila con árboles y sin m³ no deja guardar y dice por qué", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<LothPlanAutorizarLote open onClose={() => {}} planId="p" censo={CENSO} species={[]} onGuardado={() => {}} />);
    fireEvent.change(screen.getByLabelText("Número de árboles autorizados de Quinilla"), { target: { value: "3" } });
    expect(screen.getByRole("alert").textContent).toMatch(/falta el volumen/);
    expect((screen.getByRole("button", { name: /Guardar todo/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
