/**
 * Tests — «Unir el plan con su permiso» en un clic (29-09).
 *
 * En Blas hay un plan y un permiso con el mismo código
 * (19-SEC/REG-PLT-2025-096) sin enlace: hoy sólo se atan si el permiso se elige
 * del Directorio al dar de alta el plan. Lo que se prueba:
 *   - la regla: un solo candidato, por código normalizado, y nunca un permiso
 *     que ya es de otro plan; con 2+ no se sugiere;
 *   - el aviso sale, y «Unirlos» hace las DOS escrituras existentes (PATCH del
 *     plan con `contratoId`, PATCH del permiso con `planId`) y recarga el plan;
 *   - un plan ya unido no pregunta ni consulta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LothPlanAvisos from "@/components/admin/forestal/LothPlanAvisos";
import { codigoComparable, permisoGemeloDelPlan } from "@/lib/forestal/loth-plan-permiso";

const CODIGO = "19-SEC/REG-PLT-2025-096";
const PLAN = { id: "plan-blas", contratoId: null, planNumber: CODIGO, tituloHabilitante: null };
const permiso = (id: string, codigo: string, planId: string | null = null) => ({
  id,
  codigo,
  codigoNorm: codigo.toUpperCase(),
  planId,
});

describe("permisoGemeloDelPlan", () => {
  it("Blas: un plan y un permiso con el mismo código → ese permiso", () => {
    const otros = [permiso("a", "19-SEC/REG-PLT-2018-020"), permiso("b", CODIGO), permiso("c", "10-HUA-PUE/PER-FMP-2026-007")];
    expect(permisoGemeloDelPlan(PLAN, otros)?.id).toBe("b");
  });

  it("normaliza: minúsculas y espacios sueltos son el mismo papel", () => {
    expect(codigoComparable("  19-sec/ reg-plt-2025-096 ")).toBe(CODIGO);
    const p = { ...permiso("b", "19-sec/reg-plt-2025-096"), codigoNorm: "" };
    expect(permisoGemeloDelPlan({ ...PLAN, planNumber: " 19-SEC/REG-PLT-2025-096" }, [p])?.id).toBe("b");
  });

  it("también mira el título habilitante del plan", () => {
    expect(permisoGemeloDelPlan({ ...PLAN, planNumber: "PO-12", tituloHabilitante: CODIGO }, [permiso("b", CODIGO)])?.id).toBe("b");
  });

  it("2+ candidatos: no sugiere (se elige en el Directorio)", () => {
    const plan = { ...PLAN, tituloHabilitante: "17-CPO/C-J-045-26" };
    expect(permisoGemeloDelPlan(plan, [permiso("b", CODIGO), permiso("c", "17-CPO/C-J-045-26")])).toBeNull();
  });

  it("no sugiere si el plan ya tiene permiso, si no hay coincidencia o si el permiso es de OTRO plan", () => {
    expect(permisoGemeloDelPlan({ ...PLAN, contratoId: "x" }, [permiso("b", CODIGO)])).toBeNull();
    expect(permisoGemeloDelPlan(PLAN, [permiso("a", "19-SEC/REG-PLT-2018-020")])).toBeNull();
    expect(permisoGemeloDelPlan(PLAN, [permiso("b", CODIGO, "otro-plan")])).toBeNull();
    // Atado sólo del lado del permiso a ESTE plan: unir completa el otro lado.
    expect(permisoGemeloDelPlan(PLAN, [permiso("b", CODIGO, "plan-blas")])?.id).toBe("b");
  });
});

describe("LothPlanAvisos — unir con el permiso", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function servidor(contratos: ReturnType<typeof permiso>[]) {
    const llamadas: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        llamadas.push({ url, method, body });
        if (url === "/api/admin/forestal/contratos" && method === "GET") {
          return new Response(JSON.stringify({ contratos }), { status: 200 });
        }
        if (url === "/api/admin/forestal/plan" && method === "PATCH") {
          return new Response(JSON.stringify({ plan: { id: body.id, contratoId: body.contratoId } }), { status: 200 });
        }
        if (url.startsWith("/api/admin/forestal/contratos/") && method === "PATCH") {
          const c = contratos.find((x) => url.endsWith(encodeURIComponent(x.id)));
          return new Response(JSON.stringify({ contrato: { ...c, ...body } }), { status: 200 });
        }
        return new Response("{}", { status: 404 });
      }),
    );
    return llamadas;
  }

  it("un clic: une el plan con su permiso desde los dos lados y recarga", async () => {
    const llamadas = servidor([permiso("a", "19-SEC/REG-PLT-2018-020"), permiso("ctr-096", CODIGO)]);
    const recargar = vi.fn();
    render(<LothPlanAvisos rows={[]} plan={{ ...PLAN, codigo: CODIGO }} onPlanUnido={recargar} />);

    const aviso = await waitFor(() => {
      const el = document.querySelector(`[data-aviso-unir="${CODIGO}"]`);
      expect(el).toBeTruthy();
      return el!;
    });
    expect(aviso.textContent).toContain(`Este plan y el permiso ${CODIGO} tienen el mismo código: ¿los unimos?`);
    // Info por token del DS, no por hex.
    expect(aviso.className).toContain("--data-info-500");

    fireEvent.click(screen.getByRole("button", { name: "Unirlos" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain(`Plan unido al permiso ${CODIGO}`));

    const escrituras = llamadas.filter((l) => l.method === "PATCH");
    expect(escrituras).toEqual([
      { url: "/api/admin/forestal/plan", method: "PATCH", body: { id: "plan-blas", contratoId: "ctr-096" } },
      { url: "/api/admin/forestal/contratos/ctr-096", method: "PATCH", body: { planId: "plan-blas" } },
    ]);
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(document.querySelector(`[data-aviso-unir="${CODIGO}"]`)).toBeNull();
  });

  it("la respuesta sobrevive a la recarga del plan (la vista se vuelve a montar)", async () => {
    servidor([permiso("ctr-096", CODIGO)]);
    const plan = { ...PLAN, id: "plan-remonta", codigo: CODIGO };
    const { unmount } = render(<LothPlanAvisos rows={[]} plan={plan} onPlanUnido={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Unirlos" }));
    await screen.findByRole("status");
    unmount();
    // Lo que devuelve la recarga: el plan ya con su permiso.
    render(<LothPlanAvisos rows={[]} plan={{ ...plan, contratoId: "ctr-096" }} />);
    expect(screen.getByRole("status").textContent).toContain(`Plan unido al permiso ${CODIGO}`);
    expect(screen.queryByRole("button", { name: "Unirlos" })).toBeNull();
  });

  it("si el plan no se pudo unir, lo dice y el botón vuelve", async () => {
    const llamadas = servidor([permiso("ctr-096", CODIGO)]);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, method: init?.method ?? "GET", body: null });
      if (init?.method === "PATCH") return new Response(JSON.stringify({ error: "contrato_ajeno", message: "Ese permiso no es de esta empresa." }), { status: 400 });
      return new Response(JSON.stringify({ contratos: [permiso("ctr-096", CODIGO)] }), { status: 200 });
    });
    const recargar = vi.fn();
    render(<LothPlanAvisos rows={[]} plan={{ ...PLAN, id: "plan-falla", codigo: CODIGO }} onPlanUnido={recargar} />);
    fireEvent.click(await screen.findByRole("button", { name: "Unirlos" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Ese permiso no es de esta empresa.");
    expect(recargar).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Unirlos" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("2 candidatos: no pregunta nada", async () => {
    const llamadas = servidor([permiso("b", CODIGO), permiso("c", "17-CPO/C-J-045-26")]);
    render(<LothPlanAvisos rows={[]} plan={{ ...PLAN, id: "plan-dos", tituloHabilitante: "17-CPO/C-J-045-26", codigo: CODIGO }} />);
    await waitFor(() => expect(llamadas.some((l) => l.url === "/api/admin/forestal/contratos")).toBe(true));
    expect(document.querySelector("[data-aviso-unir]")).toBeNull();
  });

  it("un plan ya unido no consulta los permisos", () => {
    const llamadas = servidor([permiso("ctr-096", CODIGO)]);
    const { container } = render(<LothPlanAvisos rows={[]} plan={{ ...PLAN, id: "plan-ya-unido", contratoId: "ctr-096", codigo: CODIGO }} />);
    expect(llamadas).toHaveLength(0);
    expect(container.innerHTML).toBe("");
  });
});
