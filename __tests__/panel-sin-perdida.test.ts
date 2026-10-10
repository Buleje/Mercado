/**
 * Panel sin pérdida (plan «panel unificado», 2026-10-09).
 *
 * Brandon aprobó juntar 34 pestañas en 23 con una condición: nadie pierde una
 * pantalla y nadie gana una que su plan no paga. `reports/panel/visibilidad-antes.json`
 * guarda qué alcanzaba cada plan × rol × rubro × plantilla ANTES de mover nada
 * (lo escribe `scripts/matriz-pestanas.mjs` con la regla vieja de la barra,
 * portada a mano). Este test recalcula lo mismo con la regla de HOY
 * (`lib/admin/permiso-vista.ts`, armada como la arman la barra, el celular y
 * los hubs) y exige:
 *
 *   · después ⊇ antes — un par que se mudó cuenta si `resolverDestino` lo lleva
 *     a un par que se sigue alcanzando;
 *   · lo nuevo, sólo si figura en `reports/panel/altas-aprobadas.json`.
 *
 * En la ola 1 no se movió nada: tiene que dar idéntico.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdminTemplateOverlay } from "@/app/admin/_hooks/useAdminTemplateOverlay";
import { TAB_CATEGORIES } from "@/app/admin/_lib/tab-categories";
import { ALL_TABS } from "@/app/admin/_lib/tab-data";
import { VALID_TABS } from "@/app/admin/_lib/tabs.types";
import { SPEC_GATED_MODULE_IDS } from "@/hooks/use-enabled-specs";
import { useContextoPermiso, usePermisoDe, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import { ADMIN_MODULE_CATALOG, type AdminTemplateOverrides } from "@/lib/admin-template";
import { crearResolverDestino, resolverDestino } from "@/lib/admin/destino-tab";
import {
  SIN_FILTRO,
  estadoDePestana,
  estadoDelOrigen,
  etiquetaDeVista,
  idsDelPlan,
  idsDelRol,
  idsPermitidos,
  normalizarGuardadas,
  normalizarOcultas,
  ocultaPorPlantilla,
  pestanaPermitida,
  rubroDelPanel,
  vistaPermitida,
  vistasPropias,
  vistasVisibles,
  type ContextoPermiso,
} from "@/lib/admin/permiso-vista";
import { vistasDelModulo, type SubvistaModulo } from "@/lib/admin/subvistas-modulos";
import type { PlanTier } from "@/lib/billing/plan-tiers";
import { invalidateCachedJson } from "@/lib/client-cache-fetch";
import { logger } from "@/lib/logger";
import { MODULE_PERMISSIONS } from "@/lib/module-permissions";
import {
  PLANES,
  ROLES,
  RUTA_ALTAS,
  RUTA_ANTES,
  altaAprobada,
  compararPares,
  componentesDeTabRouter,
  crearHubDe,
  idsDelMenuDeUsuario,
  paresDe,
} from "../scripts/matriz-pestanas.mjs";

const RAIZ = join(__dirname, "..");
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8");

interface Combinacion {
  plan: PlanTier;
  rol: string;
  rubro: string;
  plantilla: string;
  barra: string;
  celular: string;
}

interface LineaBase {
  medido: string;
  dimensiones: { planes: string[]; roles: string[]; rubros: string[]; plantillas: string[] };
  plantillas: Record<string, AdminTemplateOverrides>;
  /** Pestaña → hub que abría en la línea base (`fiados` → `plata`), para mirar orígenes. */
  hubs: Record<string, string>;
  menu: string;
  contextos: Combinacion[];
  conjuntos: Record<string, string[]>;
}

interface Alta {
  par: string;
  superficie?: string;
  contexto?: Record<string, string>;
  porque: string;
  aprobo: string;
}

const antes = JSON.parse(leer(RUTA_ANTES)) as LineaBase;
const { altas } = JSON.parse(leer(RUTA_ALTAS)) as { altas: Alta[] };

const IDS = ALL_TABS.map((t) => t.id as string);
const CONOCIDAS = new Set(IDS);
const hubDe = crearHubDe(
  componentesDeTabRouter(leer("app/admin/_components/TabRouter.tsx")),
  (tab: string) => vistasDelModulo(tab).length > 0,
);
const MENU = idsDelMenuDeUsuario(leer("components/admin/AdminUserDropdown.tsx"));
/** Lo nuevo se mira por origen: el registro de hoy y el hub donde caía cada origen antes. */
const POR_ORIGEN = { vistasDe: vistasDelModulo, hubDeAntes: (tab: string) => antes.hubs[tab] ?? tab };

/** Lo que alcanza una combinación con la regla de hoy, compuesta como en el panel. */
function despuesDe(c: Combinacion): Record<"barra" | "celular" | "menu", string[]> {
  const rol = idsDelRol(c.rol, null);
  const plan = idsDelPlan(c.plan);
  const plantilla = ocultaPorPlantilla(antes.plantillas[c.plantilla]);
  const rubro = rubroDelPanel(c.rubro);
  const especialidades = SPEC_GATED_MODULE_IDS;
  // useAdminTabsDerived: `allowedTabs`, rol + plan POR ID.
  const permitidas = idsPermitidos({ ...SIN_FILTRO, rol, plan }, IDS);
  // AdminSidebar: `capaBarra`.
  const barra: ContextoPermiso = {
    rol: new Set(permitidas),
    plan: null,
    plantilla,
    rubro,
    especialidades,
    modoFacil: null,
  };
  // useAdminTabsDerived: `capaMovil` (el drawer lista categorías ∩ filteredTabs).
  const movil: ContextoPermiso = { ...SIN_FILTRO, rol, plan, plantilla, especialidades };
  // use-vistas-permitidas: lo que filtra cada hub por dentro.
  const hub: ContextoPermiso = { rol, plan, plantilla, rubro, especialidades, modoFacil: null };
  const filtrar = (h: string, vistas: readonly SubvistaModulo[]) => vistasVisibles(hub, h, vistas);

  const enBarra = TAB_CATEGORIES.flatMap((cat) => cat.tabs.filter((t) => estadoDePestana(barra, t) === "visible"));
  const enCelular = TAB_CATEGORIES.flatMap((cat) =>
    cat.tabs.filter((t) => CONOCIDAS.has(t) && pestanaPermitida(movil, t)),
  );
  return {
    barra: paresDe(enBarra, hubDe, vistasDelModulo, filtrar),
    celular: paresDe(enCelular, hubDe, vistasDelModulo, filtrar),
    menu: paresDe(MENU, hubDe, vistasDelModulo, filtrar),
  };
}

describe("panel sin pérdida: después ⊇ antes", () => {
  it("la línea base cubre plan × rol × rubro × plantilla", () => {
    const { planes, roles, rubros, plantillas } = antes.dimensiones;
    expect(planes).toEqual(PLANES);
    expect(roles).toEqual(ROLES);
    expect(plantillas).toContain("global");
    expect(antes.contextos).toHaveLength(planes.length * roles.length * rubros.length * plantillas.length);
    // Una línea base vacía compararía «nada contra nada» y pasaría siempre.
    const admin = antes.contextos.find((c) => c.rol === "admin" && c.plan === "max");
    expect(antes.conjuntos[admin!.barra].length).toBeGreaterThan(20);
    // Sin `hubs`, un origen como `fiados` se buscaría en su propio nombre y no en Mi Plata.
    expect(Object.keys(antes.hubs ?? {}).length, "línea base sin hubs").toBeGreaterThan(0);
  });

  it("nadie pierde un par (pestaña, vista) y nada aparece sin aprobar", () => {
    const perdidas: string[] = [];
    const sinAprobar: string[] = [];
    for (const c of antes.contextos) {
      const hoy = despuesDe(c);
      for (const superficie of ["barra", "celular"] as const) {
        const r = compararPares(antes.conjuntos[c[superficie]], hoy[superficie], resolverDestino, POR_ORIGEN);
        const donde = `${c.plan}·${c.rol}·${c.rubro}·${c.plantilla}·${superficie}`;
        for (const p of r.perdidas) perdidas.push(`${donde}: ${p}`);
        for (const p of r.nuevas) {
          if (!altaAprobada(altas, { contexto: c, superficie, par: p })) sinAprobar.push(`${donde}: ${p}`);
        }
      }
    }
    expect(perdidas.slice(0, 20), `${perdidas.length} pares perdidos`).toEqual([]);
    expect(sinAprobar.slice(0, 20), `${sinAprobar.length} pares nuevos sin aprobar`).toEqual([]);
  });

  it("el menú del usuario sigue llevando a lo mismo", () => {
    const hoy = despuesDe(antes.contextos[0]).menu;
    const r = compararPares(antes.conjuntos[antes.menu], hoy, resolverDestino, POR_ORIGEN);
    expect(r.perdidas).toEqual([]);
    expect(r.nuevas.filter((p: string) => !altaAprobada(altas, { contexto: {}, superficie: "menu", par: p }))).toEqual([]);
  });
});

describe("la comparación detecta lo que tiene que detectar", () => {
  const conFusion = crearResolverDestino({
    alias: { fiados: { tab: "ventas-caja", vista: "cuentas-cobrar" } },
    vistas: { "plata:fiados": { tab: "ventas-caja", vista: "cuentas-cobrar" } },
    validas: VALID_TABS,
  });

  it("un par que se mudó y se alcanza en su casa nueva no es pérdida", () => {
    const r = compararPares(["plata:fiados"], ["ventas-caja:cuentas-cobrar"], conFusion);
    expect(r).toEqual({ perdidas: [], nuevas: [] });
  });

  it("un par que ya no se alcanza en ningún lado es pérdida", () => {
    expect(compararPares(["plata:fiados", "pedidos"], ["pedidos"], resolverDestino).perdidas).toEqual(["plata:fiados"]);
  });

  it("una vista que no estaba es alta, salvo que la pestaña entera ya se viera", () => {
    expect(compararPares(["pedidos"], ["pedidos", "plata:adelantos"], resolverDestino).nuevas).toEqual([
      "plata:adelantos",
    ]);
    expect(compararPares(["documentos"], ["documentos:drive"], resolverDestino).nuevas).toEqual([]);
  });

  // Delivery (Enterprise/Max) se funde en Pedidos (Básico), que en la línea base no tenía vistas.
  const vistasDePedidos = (hub: string) =>
    hub === "pedidos"
      ? [{ key: "tablero" }, { key: "lista" }, { key: "reparto", origen: ["delivery-partners"] }]
      : [];
  const conDelivery = crearResolverDestino({
    alias: { "delivery-partners": { tab: "pedidos", vista: "reparto" } },
    vistas: {},
    validas: VALID_TABS,
  });
  const pedidosHoy = ["pedidos:lista", "pedidos:reparto", "pedidos:tablero"];

  it("lo que llega a una pestaña que antes se veía entera es alta si su origen no se alcanzaba", () => {
    const porOrigen = { vistasDe: vistasDePedidos };
    expect(compararPares(["pedidos"], pedidosHoy, conDelivery, porOrigen).nuevas).toEqual(["pedidos:reparto"]);
    // Quien ya veía Delivery no gana nada, con alias o sin él.
    expect(compararPares(["delivery-partners", "pedidos"], pedidosHoy, conDelivery, porOrigen).nuevas).toEqual([]);
    expect(compararPares(["delivery-partners", "pedidos"], pedidosHoy, resolverDestino, porOrigen).nuevas).toEqual(
      [],
    );
  });

  it("el origen se busca en el hub donde caía antes (`fiados` abría Mi Plata)", () => {
    const porOrigen = {
      vistasDe: (hub: string) => (hub === "pedidos" ? [{ key: "me-deben", origen: ["fiados"] }] : []),
      hubDeAntes: (tab: string) => (tab === "fiados" ? "plata" : tab),
    };
    const hoy = ["pedidos:me-deben"];
    expect(compararPares(["pedidos", "plata:resumen"], hoy, resolverDestino, porOrigen).nuevas).toEqual([]);
    expect(compararPares(["pedidos"], hoy, resolverDestino, porOrigen).nuevas).toEqual(["pedidos:me-deben"]);
  });

  it("un hub que ya tenía vistas no cubre una vista nueva, aunque sea propia", () => {
    expect(compararPares(["config:general"], ["config:general", "config:plan"], resolverDestino).nuevas).toEqual([
      "config:plan",
    ]);
  });

  it("una pestaña entera de antes se pierde si hoy sólo llega lo de otro lado", () => {
    const porOrigen = { vistasDe: vistasDePedidos };
    expect(compararPares(["pedidos"], ["pedidos:reparto"], conDelivery, porOrigen).perdidas).toEqual(["pedidos"]);
    expect(compararPares(["pedidos"], ["pedidos:lista"], conDelivery, porOrigen).perdidas).toEqual([]);
  });

  it("una alta aprobada vale sólo donde dice", () => {
    const lista = [{ par: "plata:adelantos", contexto: { plan: "basico" }, porque: "R2", aprobo: "test" }];
    expect(altaAprobada(lista, { contexto: { plan: "basico" }, superficie: "barra", par: "plata:adelantos" })).toBe(true);
    expect(altaAprobada(lista, { contexto: { plan: "pro" }, superficie: "barra", par: "plata:adelantos" })).toBe(false);
  });
});

describe("permiso por origen (regla R2)", () => {
  const basico: ContextoPermiso = { ...SIN_FILTRO, plan: idsDelPlan("basico") };

  it("basta con que pase UNO de los orígenes", () => {
    // Básico desbloquea `activos` pero no `plata`: lo que se mude a Mi Plata
    // desde Activos lo sigue viendo Básico, y lo de Mi Plata no.
    expect(vistaPermitida(basico, ["activos"])).toBe(true);
    expect(vistaPermitida(basico, ["plata"])).toBe(false);
    expect(vistaPermitida(basico, ["plata", "activos"])).toBe(true);
  });

  it("las especializaciones miran el rol y su bandera, no el plan ni la plantilla", () => {
    const ctp = "ctp-libro-operaciones";
    const todo = () => true;
    expect(estadoDelOrigen({ ...basico, plantilla: todo, especialidades: new Set([ctp]) }, ctp)).toBe("visible");
    expect(estadoDelOrigen({ ...basico, especialidades: new Set() }, ctp)).toBe("oculto");
    expect(estadoDelOrigen({ ...basico, rol: new Set(["pedidos"]), especialidades: new Set([ctp]) }, ctp)).toBe(
      "oculto",
    );
  });

  it("el rol: admin y los roles sin lista propia ven todo, como siempre", () => {
    expect(idsDelRol("admin", { admin: [] })).toBeNull();
    expect(idsDelRol("tienda_owner", null)).toBeNull();
    expect(idsDelRol("owner", { owner: ["pedidos"] })).toEqual(new Set(["pedidos"]));
    expect(idsDelRol("cajero", null)).toEqual(new Set(MODULE_PERMISSIONS.cajero));
  });

  it("Modo Fácil sólo filtra si alguien lo enciende (hoy nadie)", () => {
    expect(SIN_FILTRO.modoFacil).toBeNull();
    expect(estadoDelOrigen({ ...SIN_FILTRO, modoFacil: new Set(["pedidos"]) }, "plata")).toBe("oculto");
  });

  it("dentro de un hub ajeno (se llegó por URL) se ven todas, como antes", () => {
    const vistas = vistasDelModulo("plata");
    expect(vistasVisibles(basico, "plata", vistas)).toHaveLength(vistas.length);
  });

  it("sin rol confirmado el hub ofrece sólo lo propio, no lo que llegó de otra pestaña", () => {
    const vistas = [
      { key: "lista" },
      { key: "reparto", origen: ["delivery-partners"] },
      { key: "mapa", origen: ["pedidos", "delivery-partners"] },
    ];
    expect(vistasPropias("pedidos", vistas).map((v) => v.key)).toEqual(["lista", "mapa"]);
  });

  it("la plantilla le pone su rótulo a la vista donde se mudó el id", () => {
    const overrides: AdminTemplateOverrides = { fiados: { label: "Cuentas pendientes" } };
    const resolver = crearResolverDestino({
      alias: { fiados: { tab: "ventas-caja", vista: "cuentas-cobrar" } },
      vistas: {},
      validas: VALID_TABS,
    });
    expect(etiquetaDeVista("ventas-caja", "cuentas-cobrar", "Me deben", overrides, resolver)).toBe(
      "Cuentas pendientes",
    );
    // Hoy `fiados` sigue siendo pestaña: ninguna vista cambia de nombre.
    expect(etiquetaDeVista("ventas-caja", "cuentas-cobrar", "Me deben", overrides)).toBe("Me deben");
  });
});

describe("preferencias guardadas", () => {
  it("favoritos y recientes siguen el alias; los ocultos no", () => {
    expect(normalizarGuardadas(["pos-caja", "plata", "zzz", "plata"], CONOCIDAS)).toEqual(["ventas-caja", "plata"]);
    // Ocultar un pedazo viejo no puede esconder la pestaña entera que lo absorbió.
    expect([...normalizarOcultas(["arqueo-caja", "plata"], CONOCIDAS)]).toEqual(["plata"]);
  });
});

describe("la plantilla de la matriz es la del panel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("ocultaPorPlantilla dice lo mismo que useAdminTemplateOverlay en cada pestaña", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red en el test")));
    for (const [nombre, overrides] of Object.entries(antes.plantillas)) {
      localStorage.setItem("buleje-admin-template", JSON.stringify({ overrides, order: [], version: 2 }));
      const { result, unmount } = renderHook(() => useAdminTemplateOverlay());
      const pura = ocultaPorPlantilla(overrides);
      const ids = new Set([...IDS, ...ADMIN_MODULE_CATALOG.map((m) => m.id)]);
      for (const id of ids) expect(pura(id), `${nombre}: ${id}`).toBe(result.current.isHiddenByTemplate(id));
      unmount();
    }
  });
});

describe("use-vistas-permitidas en un hub (sin red)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    // `cachedJson` guarda /api/auth/me 60 s: sin esto, el rol de un test pasa al siguiente.
    invalidateCachedJson();
  });

  /** `/api/auth/me` con ese rol (`null` = sin sesión); lo demás, vacío. */
  const conSesion = (rol: string | null) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("/specializations")) return Response.json({ keys: [], moduleIds: [] });
        if (u.includes("/api/auth/me")) return Response.json({ role: rol });
        return Response.json({});
      }),
    );

  it("Mi Plata abierto por URL en Básico muestra todas sus pestañas, como antes", async () => {
    localStorage.setItem("buleje:vendor-plan-tier", "basico");
    conSesion("admin");
    const items = vistasDelModulo("plata").map((v) => ({ id: v.key, label: v.label }));
    const { result } = renderHook(() => ({ ctx: useContextoPermiso(), tabs: useVistasPermitidas("plata", items) }));
    await waitFor(() => expect(result.current.ctx).not.toBeNull());
    expect(result.current.tabs.map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it("<PermisoDe> deja pasar un bloque de Activos en Básico y no uno de Mi Plata", async () => {
    localStorage.setItem("buleje:vendor-plan-tier", "basico");
    conSesion("admin");
    const { result } = renderHook(() => ({
      ctx: useContextoPermiso(),
      activos: usePermisoDe(["activos"]),
      plata: usePermisoDe(["plata"]),
    }));
    // Hasta confirmar el rol no pasa nada (antes se tomaba «admin» y pasaba todo).
    expect(result.current.activos).toBe(false);
    await waitFor(() => expect(result.current.ctx).not.toBeNull());
    expect(result.current.activos).toBe(true);
    expect(result.current.plata).toBe(false);
  });

  it("el rol sale de /api/auth/me: el cajero no ve un bloque de Mi Plata ni en Max", async () => {
    localStorage.setItem("buleje:vendor-plan-tier", "max");
    conSesion("cajero");
    const { result } = renderHook(() => ({
      ctx: useContextoPermiso(),
      pedidos: usePermisoDe(["pedidos"]),
      plata: usePermisoDe(["plata"]),
    }));
    await waitFor(() => expect(result.current.ctx).not.toBeNull());
    expect(result.current.pedidos).toBe(true);
    expect(result.current.plata).toBe(false);
  });

  it("sin sesión (/api/auth/me sin rol) no pasa nada que dependa del rol", async () => {
    conSesion(null);
    const aviso = vi.spyOn(logger, "warn");
    const { result } = renderHook(() => ({ ctx: useContextoPermiso(), activos: usePermisoDe(["activos"]) }));
    await waitFor(() => expect(aviso).toHaveBeenCalledWith(expect.stringContaining("sin rol")));
    expect(result.current.ctx).toBeNull();
    expect(result.current.activos).toBe(false);
  });
});
