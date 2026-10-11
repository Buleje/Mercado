/**
 * Mi Plata › Gastos y presupuesto, por rol (plan «panel unificado», ola 3).
 *
 * La vista `gastos` nombra también a `compras` en su `origen`: el catálogo de
 * fijos y el Historial de gastos se mudaron desde Compras y quien los veía allá
 * los sigue viendo acá. Revisión 10-10: con eso el almacenero (Enterprise y
 * Max) estrenaba además los gastos y el presupuesto PROPIOS de Mi Plata, que en
 * HEAD no veía en ningún lado. `panel-sin-perdida` no lo ve: mira la vista, no
 * lo que el componente monta adentro.
 *
 * Lo propio pasa con Mi Plata o Activos, o si no pasa ningún origen (como el
 * motor de Compras › Sugerencias). El permiso es el motor de verdad (`vistaPermitida` con la capa de rol y de
 * plan); cada `dynamic()` dibuja el nombre de lo que importa.
 *
 * Desde el 11-10 la vista va en secciones (`?sub=`): se monta UNA a la vez, así
 * que lo que se le ofrece a cada rol se lee en la barra (los `tab`) y lo que se
 * monta es la primera que le toca.
 *
 * Ejecutar: npx vitest run __tests__/gastos-con-presupuesto-permiso.test.tsx
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ContextoPermiso } from "@/lib/admin/permiso-vista";

const estado = vi.hoisted(() => ({ ctx: null as ContextoPermiso | null }));

vi.mock("next/dynamic", () => ({
  default: (cargar: () => Promise<unknown>) => {
    const fuente = String(cargar);
    const nombre = fuente.includes("ExpensesTab")
      ? "gastos"
      : fuente.includes("BudgetVsRealTab")
        ? "presupuesto-real"
        : fuente.includes("PresupuestoMensualTab")
          ? "presupuesto-mes"
          : fuente.includes("CatalogoDeGastosFijos")
            ? "catalogo-fijos"
            : fuente.includes("HistorialGastosTab")
              ? "historial-compras"
              : "otro";
    /* Las secciones van en la cabecera de cada bloque (la prop `barra`): el
       doble la dibuja para que la barra se pueda leer. */
    return function Dinamico({ barra }: { barra?: import("react").ReactNode }) {
      return <div data-testid={`bloque-${nombre}`}>{barra}</div>;
    };
  },
}));

vi.mock("@/hooks/use-vistas-permitidas", async () => {
  const { vistaPermitida } = await import("@/lib/admin/permiso-vista");
  return {
    usePermisoDe: (origen: readonly string[]) => estado.ctx !== null && vistaPermitida(estado.ctx, origen),
  };
});

import GastosConPresupuesto from "@/components/admin/unified/finanzas/GastosConPresupuesto";
import { idsDelPlan, origenesDeVista, SIN_FILTRO, vistaPermitida } from "@/lib/admin/permiso-vista";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import { tabsDelRol } from "@/lib/module-permissions";
import type { PlanTier } from "@/lib/billing/plan-tiers";

// La barra de secciones mide su carril con ResizeObserver: jsdom no lo trae.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  estado.ctx = null;
  window.localStorage.clear();
  /* El hook escribe `?sub=` al montar: sin limpiar, el caso siguiente abriría
     en la sección del anterior. */
  window.history.replaceState(null, "", "/");
});

/** Las secciones que la barra le ofrece. */
const secciones = () => screen.queryAllByRole("tab").map((t) => t.textContent?.trim() ?? "");
const SECCIONES_PROPIAS = ["Anotados", "Presupuesto", "Metas"];

function contexto(rol: string, plan: PlanTier, idsReales: boolean): ContextoPermiso {
  const ids = tabsDelRol(rol, null, { idsReales });
  return { ...SIN_FILTRO, rol: ids === null ? null : new Set(ids), plan: idsDelPlan(plan) };
}

const vistaGastos = vistasDelModulo("plata").find((v) => v.key === "gastos");

/** ¿La barra le ofrece Mi Plata › Gastos y presupuesto? */
function veLaVista(ctx: ContextoPermiso): boolean {
  if (!vistaGastos) throw new Error("plata sin la vista «gastos»");
  return vistaPermitida(ctx, origenesDeVista("plata", vistaGastos));
}

function montados(ctx: ContextoPermiso): string[] {
  estado.ctx = ctx;
  render(<GastosConPresupuesto pedidoPorUrl={false} hayPresupuesto={undefined} />);
  return screen
    .queryAllByTestId(/^bloque-/)
    .map((n) => n.dataset.testid ?? "")
    .sort();
}

const PROPIOS = ["bloque-gastos", "bloque-presupuesto-real", "bloque-presupuesto-mes"];

describe.each([true, false])("Gastos y presupuesto por rol (ids reales: %s)", (idsReales) => {
  it.each<PlanTier>(["enterprise", "max"])("almacenero en %s: sólo lo que llegó de Compras", (plan) => {
    const ctx = contexto("almacenero", plan, idsReales);
    // La vista se le ofrece (por Compras): por eso el componente tiene que filtrar.
    expect(veLaVista(ctx)).toBe(true);
    const bloques = montados(ctx);
    for (const propio of PROPIOS) expect(bloques).not.toContain(propio);
    // Ni se le ofrecen sus secciones: abre en lo que llegó de Compras.
    expect(secciones()).toEqual(["Fijos", "Compras"]);
    expect(bloques).toEqual(["bloque-catalogo-fijos"]);
  });

  it.each<PlanTier>(["basico", "pro", "enterprise", "max"])("admin en %s: todo lo propio", (plan) => {
    const ctx = contexto("admin", plan, idsReales);
    expect(veLaVista(ctx)).toBe(true);
    montados(ctx);
    expect(screen.getByTestId("bloque-gastos")).toBeTruthy();
    for (const propia of SECCIONES_PROPIAS) expect(secciones()).toContain(propia);
  });

  it.each<PlanTier>(["basico", "pro", "enterprise", "max"])("cajero en %s: sin los gastos del negocio", (plan) => {
    const ctx = contexto("cajero", plan, idsReales);
    if (!veLaVista(ctx)) return; // si la barra no se la ofrece, no hay nada que filtrar
    const bloques = montados(ctx);
    for (const propio of PROPIOS) expect(bloques).not.toContain(propio);
    for (const propia of SECCIONES_PROPIAS) expect(secciones()).not.toContain(propia);
  });
});

/* Lo propio es el contenido de la vista: si no pasa NINGÚN origen (un enlace en
   un negocio cuya plantilla oculta Mi Plata, Activos y Compras, o el rol que no
   llegó), se ve como antes —la regla del hub—, no una vista en blanco. */
describe("si no pasa ningún origen, se ve como antes", () => {
  it("plantilla que oculta plata, activos y compras (admin por enlace)", () => {
    const ocultas = new Set(["plata", "activos", "compras"]);
    const bloques = montados({ ...contexto("admin", "max", true), plantilla: (id) => ocultas.has(id) });
    expect(bloques).toContain("bloque-gastos");
    expect(bloques).not.toContain("bloque-historial-compras");
    expect(secciones()).toEqual(SECCIONES_PROPIAS);
  });

  it("rol sin confirmar: lo propio sí, lo que llegó de Compras no", () => {
    render(<GastosConPresupuesto pedidoPorUrl={false} hayPresupuesto={undefined} />);
    expect(screen.getByTestId("bloque-gastos")).toBeTruthy();
    expect(secciones()).not.toContain("Compras");
  });
});
