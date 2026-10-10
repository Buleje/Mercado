/**
 * Adónde lleva cada id de pestaña (ADR-490, plan «panel unificado» R3).
 *
 * Ningún id se retira: hay 271 avisos guardados con `tab=` en `/admin?…`
 * (medido 09-10), links de WhatsApp y atajos en cada navegador. Este test cuida la
 * receta única (par con vista → alias → cadena → pestaña conocida) y que la
 * URL corregida conserve los parámetros del contenido (`?lote=`, `?cliente=`).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { TAB_MIGRATION, VISTA_MIGRATION } from "@/app/admin/_lib/tab-migration";
import { VALID_TABS, type Tab } from "@/app/admin/_lib/tabs.types";
import { useAdminTabs } from "@/app/admin/_hooks/useAdminTabs";
import { atajosVigentes } from "@/app/admin/_hooks/useSidebarShortcuts";
import { crearResolverDestino, destinoDeUrl, resolverDestino, urlConDestino } from "@/lib/admin/destino-tab";
import { logger } from "@/lib/logger";

/**
 * Ids de pestaña en `Notification.actionUrl` de toda la base (09-10: 271 avisos
 * en 9 ids). `ordenes` (60) viene de `/admin?module=marketplace&tab=ordenes`:
 * `tab` no va primero y una búsqueda de `/admin?tab=` no lo veía.
 */
const IDS_EN_AVISOS = [
  "cacao-acopio", "cobranza", "ordenes", "demand-prediction", "camaras",
  "ctp-libro-operaciones", "documentos", "plata", "forestal-herramientas",
];

/** Un panel de juguete con lo que van a traer las olas 2-6 (alias con vista, pares, cadenas). */
const resolverDePrueba = crearResolverDestino({
  validas: ["vendor-dashboard", "ventas-caja", "inventario", "forecasting", "fiados", "ctp-libro-operaciones"],
  alias: {
    inventario: "inventario",
    pos: "ventas-caja",
    fiados: { tab: "ventas-caja", vista: "cuentas-cobrar" },
    "demand-prediction": "forecasting",
    forecasting: { tab: "vendor-dashboard", vista: "ventas" },
    "forestal-lotes": { tab: "ctp-libro-operaciones", vista: "despacho", sub: "lotes-qr" },
    ida: "vuelta" as Tab,
    vuelta: "ida" as Tab,
  },
  vistas: {
    "ventas-caja:arqueo": { tab: "ventas-caja", vista: "caja-registradora", sub: "cuadrar" },
    "fiados:historial": { tab: "ventas-caja", vista: "cuentas-cobrar", sub: "historial" },
  },
});

describe("resolverDestino — los mapas del panel", () => {
  it("los alias de los avisos rotos llevan a su pestaña", () => {
    expect(resolverDestino("demand-prediction")).toEqual({ tab: "forecasting" });
    expect(resolverDestino("subscription")).toEqual({ tab: "plan" });
    expect(resolverDestino("cobranza")).toEqual({ tab: "adelantos" });
    expect(resolverDestino("inicio")).toEqual({ tab: "vendor-dashboard" });
    // Formato viejo `?module=x&tab=y`: el `tab` era la sección del módulo.
    expect(resolverDestino("ordenes")).toEqual({ tab: "marketplace" });
    expect(resolverDestino("stock")).toEqual({ tab: "inventario", vista: "stock" });
  });

  it("cada id guardado en los avisos de la base sigue abriendo algo", () => {
    for (const id of IDS_EN_AVISOS) expect(resolverDestino(id), id).not.toBeNull();
  });

  it("un id de hoy pasa con su vista; uno sólo alcanzable por alias también", () => {
    expect(resolverDestino("ctp-libro-operaciones", "despacho")).toEqual({ tab: "ctp-libro-operaciones", vista: "despacho" });
    expect(resolverDestino("auditoria")).toEqual({ tab: "auditoria" });
    expect(resolverDestino("  Inventario ")).toEqual({ tab: "inventario" });
  });

  it("un id que no existe da null (nada de `Object.prototype`)", () => {
    for (const id of ["zzz", "", "   ", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(resolverDestino(id), id).toBeNull();
    }
  });

  it("todo alias y toda pestaña de la barra resuelven; ningún alias se apunta a sí mismo con vista", () => {
    for (const id of [...Object.keys(TAB_MIGRATION), ...VALID_TABS]) expect(resolverDestino(id), id).not.toBeNull();
    for (const [id, a] of Object.entries(TAB_MIGRATION)) {
      if (typeof a !== "string" && a.tab === id) expect(a.vista, id).toBeUndefined();
    }
  });

  it("los pares de VISTA_MIGRATION son `tab:vista` y resuelven", () => {
    for (const clave of Object.keys(VISTA_MIGRATION)) {
      const [tab, vista] = clave.split(":");
      expect(tab && vista, clave).toBeTruthy();
      expect(resolverDestino(tab, vista), clave).not.toBeNull();
    }
  });
});

describe("crearResolverDestino — la receta", () => {
  it("alias con vista: la suya gana y el sub viejo no viaja", () => {
    expect(resolverDePrueba("fiados")).toEqual({ tab: "ventas-caja", vista: "cuentas-cobrar" });
    expect(resolverDePrueba("fiados", "vieja")).toEqual({ tab: "ventas-caja", vista: "cuentas-cobrar" });
    expect(resolverDePrueba("forestal-lotes")).toEqual({ tab: "ctp-libro-operaciones", vista: "despacho", sub: "lotes-qr" });
  });

  it("nombre nuevo del mismo módulo: la vista del link viaja", () => {
    expect(resolverDePrueba("pos", "turnos")).toEqual({ tab: "ventas-caja", vista: "turnos" });
    expect(resolverDePrueba("inventario", "kardex")).toEqual({ tab: "inventario", vista: "kardex" });
  });

  it("el par (tab, vista) gana sobre el alias, con el id viejo o el de hoy", () => {
    expect(resolverDePrueba("ventas-caja", "arqueo")).toEqual({ tab: "ventas-caja", vista: "caja-registradora", sub: "cuadrar" });
    expect(resolverDePrueba("pos", "arqueo")).toEqual({ tab: "ventas-caja", vista: "caja-registradora", sub: "cuadrar" });
    expect(resolverDePrueba("fiados", "historial")).toEqual({ tab: "ventas-caja", vista: "cuentas-cobrar", sub: "historial" });
  });

  it("sigue la cadena y frena los ciclos", () => {
    expect(resolverDePrueba("demand-prediction")).toEqual({ tab: "vendor-dashboard", vista: "ventas" });
    expect(resolverDePrueba("ida")).toBeNull();
    expect(resolverDePrueba("nada")).toBeNull();
  });
});

describe("la URL corregida", () => {
  it("un alias cambia tab, vista y sub y conserva ?lote=, ?cliente= y el resto", () => {
    const leido = destinoDeUrl("https://x.pe/admin?tab=forestal-lotes&lote=L-7&cliente=c1&vista=vieja&sub=s#forestal-lotes", resolverDePrueba);
    expect(leido?.destino).toEqual({ tab: "ctp-libro-operaciones", vista: "despacho", sub: "lotes-qr" });
    const url = new URL(leido?.url ?? "");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tab: "ctp-libro-operaciones", lote: "L-7", cliente: "c1", vista: "despacho", sub: "lotes-qr",
    });
    expect(url.hash).toBe("#ctp-libro-operaciones");
  });

  it("un nombre nuevo conserva vista y sub; el hash solo también se corrige", () => {
    const porQuery = new URL(destinoDeUrl("https://x.pe/admin?tab=pos&vista=turnos&sub=a", resolverDePrueba)?.url ?? "");
    expect(Object.fromEntries(porQuery.searchParams)).toEqual({ tab: "ventas-caja", vista: "turnos", sub: "a" });
    const porHash = destinoDeUrl("https://x.pe/admin#fiados", resolverDePrueba);
    expect(porHash?.fuente).toBe("hash");
    expect(porHash?.url).toBe("https://x.pe/admin?tab=ventas-caja&vista=cuentas-cobrar#ventas-caja");
  });

  it("lo que ya está bien no se toca; lo que no existe tampoco", () => {
    expect(destinoDeUrl("https://x.pe/admin?tab=inventario&vista=kardex&fuentes=a,b", resolverDePrueba)?.url).toBeNull();
    expect(destinoDeUrl("https://x.pe/admin#inventario", resolverDePrueba)?.url).toBeNull();
    expect(destinoDeUrl("https://x.pe/admin", resolverDePrueba)).toBeNull();
    expect(destinoDeUrl("https://x.pe/admin?tab=zzz&lote=1", resolverDePrueba)).toEqual({
      crudo: "zzz", fuente: "query", destino: null, url: null,
    });
    expect(urlConDestino("https://x.pe/admin", { tab: "inventario" }, "inventario")).toBeNull();
  });

  it("formato viejo `?module=x&tab=y` (avisos de pedidos y push de stock): lee el tab aunque no vaya primero", () => {
    const pedidos = destinoDeUrl("https://x.pe/admin?module=marketplace&tab=ordenes");
    expect(pedidos?.destino).toEqual({ tab: "marketplace" });
    expect(Object.fromEntries(new URL(pedidos?.url ?? "").searchParams)).toEqual({ module: "marketplace", tab: "marketplace" });
    const stock = destinoDeUrl("https://x.pe/admin?module=inventario&tab=stock");
    expect(Object.fromEntries(new URL(stock?.url ?? "").searchParams)).toEqual({
      module: "inventario", tab: "inventario", vista: "stock",
    });
  });
});

describe("useAdminTabs con alias (camino del panel)", () => {
  const ir = (ruta: string) => window.history.replaceState(null, "", ruta);
  const esperarVuelta = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  let aviso: MockInstance<typeof logger.warn>;
  beforeEach(() => {
    localStorage.clear();
    aviso = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    aviso.mockRestore();
    ir("/");
  });

  it("?tab=demand-prediction abre Predicción y deja la URL con el id de hoy y sus parámetros", async () => {
    ir("/admin?tab=demand-prediction&lote=L1");
    const { result } = renderHook(() => useAdminTabs(() => undefined));
    expect(result.current.tab).toBe("forecasting");
    await esperarVuelta();
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({ tab: "forecasting", lote: "L1" });
  });

  it("si Next devuelve la entrada inicial al alias, se reafirma una vuelta después (con la vista que puso el módulo)", async () => {
    ir("/admin?tab=demand-prediction&lote=L2");
    renderHook(() => useAdminTabs(() => undefined));
    // Lo que hace el HistoryUpdater de Next 16 en el primer commit (su url = la del alias) y,
    // después, el `useVistaModulo` del módulo al montar (agrega su vista).
    window.history.replaceState({ __NA: true, marca: "x" }, "", "/admin?tab=demand-prediction&lote=L2&vista=forecast");
    await esperarVuelta();
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({
      tab: "forecasting", lote: "L2", vista: "forecast",
    });
    // Sin las claves de Next (con el parche puesto, Next copia las suyas); las propias se quedan.
    expect(window.history.state).toEqual({ marca: "x" });
  });

  it("un ?tab= que no existe avisa y cae en Inicio, sin tocar la URL", () => {
    ir("/admin?tab=zzz-test-url");
    const { result } = renderHook(() => useAdminTabs(() => undefined));
    expect(result.current.tab).toBe("vendor-dashboard");
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("no existe"), { id: "zzz-test-url", fuente: "?tab=" });
    expect(window.location.search).toBe("?tab=zzz-test-url");
  });

  it("admin_active_tab guardado con un id viejo abre su pestaña de hoy", () => {
    ir("/admin");
    localStorage.setItem("admin_active_tab", "kardex");
    const { result } = renderHook(() => useAdminTabs(() => undefined));
    expect(result.current.tab).toBe("inventario");
  });

  it("navigateTab: un alias llega a su pestaña; un id inexistente va a Inicio en vez de dejar el panel en blanco", () => {
    ir("/admin?tab=inventario");
    const recientes: string[] = [];
    const { result } = renderHook(() => useAdminTabs((id) => recientes.push(id)));
    act(() => result.current.navigateTab("demand-prediction" as Tab));
    expect(result.current.tab).toBe("forecasting");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("forecasting");
    act(() => result.current.navigateTab("zzz-test-nav" as Tab));
    expect(result.current.tab).toBe("vendor-dashboard");
    expect(recientes).toEqual(["forecasting", "vendor-dashboard"]);
    expect(aviso).toHaveBeenCalledWith(expect.any(String), { id: "zzz-test-nav", fuente: "navigateTab" });
  });

  it("popstate con un alias en la URL (lo escribe irAEnlace) corrige la entrada", () => {
    ir("/admin?tab=inventario");
    const { result } = renderHook(() => useAdminTabs(() => undefined));
    act(() => {
      ir("/admin?tab=demand-prediction&cliente=c9");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.tab).toBe("forecasting");
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({ tab: "forecasting", cliente: "c9" });
  });
});

describe("atajos guardados de la barra", () => {
  const Icono = () => null;
  const allTabs = [
    { id: "inventario", label: "Inventario", icon: Icono },
    { id: "pedidos", label: "Pedidos", icon: Icono },
  ];
  it("id viejo → id de hoy con su rótulo; repetidos y desconocidos fuera", () => {
    const guardados = [
      { id: "kardex", label: "Kardex" },
      { id: "inventario", label: "Stock" },
      { id: "zzz", label: "Nada" },
      { id: "pedidos", label: "Mis pedidos" },
      "basura",
    ];
    expect(atajosVigentes(guardados, allTabs)).toEqual([
      { id: "inventario", label: "Inventario" },
      { id: "pedidos", label: "Mis pedidos" },
    ]);
  });
});
