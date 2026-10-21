import { afterEach, describe, expect, it } from "vitest";
import {
  CLAVE_MODO_MENU,
  gruposDeEnlaces,
  guardarModoMenu,
  leerModoMenu,
} from "@/components/admin/layout/sidebar-enlaces";

// Simula `tabsDeCategoria` del sidebar: lo oculto no sale, lo «pronto» va aparte.
const ocultas = new Set(["oculta"]);
const pronto = new Set(["metas-logros"]);
const tabsDe = (c: { tabs: readonly string[] }) => ({
  visible: c.tabs.filter((t) => !ocultas.has(t) && !pronto.has(t)),
  comingSoon: c.tabs.filter((t) => pronto.has(t)),
});
const seccion = (id: string) => id === "ventas" || id === "config";

describe("gruposDeEnlaces (menú «sin categorías»)", () => {
  it("respeta el orden de las categorías y el de cada una, sin pseudo-categorías", () => {
    const grupos = gruposDeEnlaces(
      [
        { id: "inicio", tabs: ["vendor-dashboard", "asistente-ia", "metas-logros"] },
        { id: "ventas", tabs: ["pos", "pedidos"] },
      ],
      tabsDe,
      seccion,
    );
    expect(grupos.map((g) => g.categoriaId)).toEqual(["inicio", "ventas"]);
    expect(grupos[0].visibles).toEqual(["vendor-dashboard", "asistente-ia"]);
    expect(grupos[0].pronto).toEqual(["metas-logros"]);
    expect(grupos.every((g) => !g.categoriaId.startsWith("flat:"))).toBe(true);
  });

  it("salta la categoría que no tiene nada visible y no pone línea antes del primero", () => {
    const grupos = gruposDeEnlaces(
      [
        { id: "vacia", tabs: ["oculta"] },
        { id: "inicio", tabs: ["vendor-dashboard", "asistente-ia"] },
      ],
      tabsDe,
      seccion,
    );
    expect(grupos.map((g) => g.categoriaId)).toEqual(["inicio"]);
    expect(grupos[0].separadorAntes).toBe(false);
  });

  it("junta los de un solo enlace seguidos y separa los grupos de varios y las secciones", () => {
    const grupos = gruposDeEnlaces(
      [
        { id: "inicio", tabs: ["vendor-dashboard", "asistente-ia"] },
        { id: "camaras", tabs: ["camaras"] },
        { id: "a-medida", tabs: ["a-medida"] },
        { id: "config", tabs: ["config"] },
      ],
      tabsDe,
      seccion,
    );
    expect(grupos.map((g) => [g.categoriaId, g.separadorAntes])).toEqual([
      ["inicio", false],
      ["camaras", true], // termina un grupo de varios
      ["a-medida", false], // sigue la tira de enlaces sueltos
      ["config", true], // empieza una sección
    ]);
  });
});

describe("modo del menú guardado", () => {
  afterEach(() => localStorage.removeItem(CLAVE_MODO_MENU));

  it("por defecto es por categorías y un valor raro no lo rompe", () => {
    expect(leerModoMenu()).toBe("categorias");
    localStorage.setItem(CLAVE_MODO_MENU, "plano");
    expect(leerModoMenu()).toBe("categorias");
  });

  it("guardar persiste y avisa a los otros menús", () => {
    let aviso = "";
    const oir = (e: Event) => { aviso = (e as CustomEvent<{ modo: string }>).detail.modo; };
    window.addEventListener("admin-sidebar-nav-mode-change", oir);
    guardarModoMenu("enlaces");
    window.removeEventListener("admin-sidebar-nav-mode-change", oir);
    expect(leerModoMenu()).toBe("enlaces");
    expect(aviso).toBe("enlaces");
  });
});
