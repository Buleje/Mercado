import { describe, expect, it } from "vitest";
import {
  avisosVisibles,
  conteos,
  gruposIncompletos,
  normalizar,
  type Filtros,
} from "@/components/superadmin/notificaciones/filtrar";
import {
  CATEGORIAS,
  nivelesVacios,
  type AvisoBandeja,
  type BandejaAvisos,
  type CategoriaAviso,
  type GrupoBandeja,
  type Nivel,
} from "@/lib/superadmin/nivel-aviso";

function aviso(id: string, categoria: CategoriaAviso, nivel: Nivel, extra: Partial<AvisoBandeja> = {}): AvisoBandeja {
  return {
    id,
    categoria,
    nivel,
    motivo: "",
    title: id,
    subtitle: "",
    tienda: null,
    status: "",
    createdAt: null,
    href: `/x/${id}`,
    ...extra,
  };
}

function grupo(count: number, niveles: Partial<Record<Nivel, number>>, items: AvisoBandeja[]): GrupoBandeja {
  return { count, niveles: { ...nivelesVacios(), ...niveles }, href: "/h", items };
}

/** Forma real del 18-10: 12 en riesgo, 8 errores, 83 pedidos de los que bajan 2. */
function bandeja(): BandejaAvisos {
  const buckets = Object.fromEntries(CATEGORIAS.map((c) => [c, grupo(0, {}, [])])) as BandejaAvisos["buckets"];
  buckets.atRisk = grupo(3, { urgente: 1, importante: 1, informativo: 1 }, [
    aviso("demo", "atRisk", "importante", { title: "Bodega Demo" }),
    aviso("buleje", "atRisk", "urgente", { title: "Buleje" }),
    aviso("esquina", "atRisk", "informativo", { title: "Bodega La Esquina" }),
  ]);
  buckets.panelErrors = grupo(2, { urgente: 1, leve: 1 }, [
    aviso("e1", "panelErrors", "leve", { title: "Hydration failed", createdAt: "2026-10-01T00:00:00Z" }),
    aviso("e2", "panelErrors", "urgente", { title: "accionesRef is not defined", tienda: "Frutería Ana", createdAt: "2026-10-17T19:00:00Z" }),
  ]);
  buckets.pendingOrders = grupo(83, { leve: 83 }, [
    aviso("o1", "pendingOrders", "leve", { createdAt: "2026-10-10T00:00:00Z" }),
    aviso("o2", "pendingOrders", "leve", { createdAt: "2026-10-12T00:00:00Z" }),
  ]);
  return { total: 88, niveles: { urgente: 2, importante: 1, leve: 84, informativo: 1 }, buckets };
}

const TODO: Filtros = { nivel: "todos", categoria: "todas", q: "" };

describe("centro de notificaciones · filtrar", () => {
  it("ordena urgente → informativo y, dentro del nivel, lo más reciente primero", () => {
    const ids = avisosVisibles(bandeja(), TODO).map((a) => a.id);
    expect(ids.slice(0, 2).sort()).toEqual(["buleje", "e2"]);
    expect(ids[2]).toBe("demo");
    expect(ids.slice(3, 6)).toEqual(["o2", "o1", "e1"]);
    expect(ids.at(-1)).toBe("esquina");
  });

  it("sin búsqueda, los chips cuentan los TOTALES del servidor (83 pedidos aunque bajen 2)", () => {
    const c = conteos(bandeja(), TODO);
    expect(c.porNivel).toEqual({ todos: 88, urgente: 2, importante: 1, leve: 84, informativo: 1 });
    expect(c.porCategoria.pendingOrders).toBe(83);
    expect(c.porCategoria.todas).toBe(88);
  });

  it("filtrar Urgente cambia la lista y los conteos de cada categoría", () => {
    const f: Filtros = { ...TODO, nivel: "urgente" };
    expect(avisosVisibles(bandeja(), f).map((a) => a.id).sort()).toEqual(["buleje", "e2"]);
    const c = conteos(bandeja(), f);
    expect(c.porCategoria).toMatchObject({ todas: 2, atRisk: 1, panelErrors: 1, pendingOrders: 0 });
  });

  it("elegir categoría acota los chips de nivel a esa categoría", () => {
    const c = conteos(bandeja(), { ...TODO, categoria: "panelErrors" });
    expect(c.porNivel).toEqual({ todos: 2, urgente: 1, importante: 0, leve: 1, informativo: 0 });
  });

  it("la búsqueda ignora tildes y cuenta sólo lo que coincide entre lo que bajó", () => {
    expect(normalizar("  Frutería ")).toBe("fruteria");
    const f: Filtros = { ...TODO, q: "fruteria" };
    expect(avisosVisibles(bandeja(), f).map((a) => a.id)).toEqual(["e2"]);
    const c = conteos(bandeja(), f);
    expect(c.porNivel.todos).toBe(1);
    expect(c.porCategoria).toMatchObject({ todas: 1, panelErrors: 1, pendingOrders: 0 });
  });

  it("avisa de los grupos que traen más de lo que se ve; con búsqueda no", () => {
    expect(gruposIncompletos(bandeja(), TODO)).toEqual([{ categoria: "pendingOrders", total: 83, enLista: 2 }]);
    expect(gruposIncompletos(bandeja(), { ...TODO, nivel: "urgente" })).toEqual([]);
    expect(gruposIncompletos(bandeja(), { ...TODO, q: "x" })).toEqual([]);
  });
});
