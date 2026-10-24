"use client";
/**
 * Datos y acciones del editor de categorías.
 *
 * La lista sale de GET /api/admin/categorias: lo guardado en Settings.categoryOrder
 * unido con las categorías que USAN los productos, con su cuenta (10-10: antes
 * leía sólo categoryOrder y en main —NULL— decía «Todavía no tienes
 * categorías» con 24 en uso). Guardar hace dos cosas, en este orden:
 *  1. renombra en los productos las categorías cuyo nombre cambió;
 *  2. guarda la lista (orden, visibles, SEO) en /api/settings.
 * Si el 2 falla después del 1, al recargar la lista ya trae el nombre nuevo
 * (sale de los productos): no queda nada a medias que se vea distinto.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import {
  aFila, aGuardada, claveDeInventario, seoPorDefecto, slugify,
  type CategoriaDelServidor, type CategoriaGuardada, type FilaCategoria, type SeoCategoria,
} from "./tipos";

const nombreComparable = (label: string) => slugify(label) || label.trim().toLowerCase();
const fueRenombrada = (c: FilaCategoria) => c.valores.length > 0 && c.label.trim() !== c.labelOriginal;

async function mensajeDeError(r: Response): Promise<string> {
  if (r.status === 403) return "solo el dueño o el encargado pueden cambiar las categorías";
  const data = (await r.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? `error ${r.status}`;
}

export function useCategorias() {
  const { confirm } = useConfirm();
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [cats, setCats] = useState<FilaCategoria[]>([]);
  const [originalJson, setOriginalJson] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("tu tienda");
  const pedido = useRef(0);

  // Nombre real del comercio para las plantillas SEO (useSettings no vive en el
  // árbol del admin). Si falla, «tu tienda».
  useEffect(() => {
    let cancelado = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const tema = data?.storeTheme?.storeName || data?.storeTheme?.name;
        const nombre = (typeof tema === "string" && tema.trim())
          || (typeof data?.businessName === "string" && data.businessName.trim());
        if (!cancelado && nombre) setStoreName(nombre);
      })
      .catch(() => { /* se queda «tu tienda» */ });
    return () => { cancelado = true; };
  }, []);

  const cargar = useCallback(async () => {
    const mio = ++pedido.current;
    setErrorCarga(null);
    try {
      const r = await fetch("/api/admin/categorias", { cache: "no-store" });
      if (!r.ok) throw new Error(await mensajeDeError(r));
      const data = (await r.json()) as { categorias: CategoriaDelServidor[] };
      if (mio !== pedido.current) return; // una carga vieja no pisa a la nueva
      const filas = data.categorias.map(aFila);
      setCats(filas);
      setOriginalJson(JSON.stringify(filas));
    } catch (e) {
      if (mio === pedido.current) setErrorCarga(e instanceof Error ? e.message : String(e));
    } finally {
      if (mio === pedido.current) setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const hayCambios = !cargando && JSON.stringify(cats) !== originalJson;

  const cambiar = useCallback((clave: string, f: (c: FilaCategoria) => FilaCategoria) => {
    setCats((prev) => prev.map((c) => (c.clave === clave ? f(c) : c)));
  }, []);

  const mover = useCallback((desde: number, hasta: number) => {
    setCats((prev) => {
      if (desde === hasta || hasta < 0 || hasta >= prev.length) return prev;
      const next = [...prev];
      const [movida] = next.splice(desde, 1);
      next.splice(hasta, 0, movida);
      return next.map((c, i) => ({ ...c, order: i }));
    });
  }, []);

  const alternarVisible = useCallback((clave: string) => cambiar(clave, (c) => ({ ...c, visible: !c.visible })), [cambiar]);
  const cambiarNombre = useCallback((clave: string, label: string) => cambiar(clave, (c) => ({ ...c, label })), [cambiar]);
  const cambiarSeo = useCallback(
    (clave: string, campo: keyof SeoCategoria, valor: string | string[]) =>
      cambiar(clave, (c) => ({ ...c, seo: { ...c.seo, [campo]: valor } })),
    [cambiar],
  );
  const generarSeo = useCallback(
    (clave: string) => cambiar(clave, (c) => ({ ...c, seo: seoPorDefecto(c.label, storeName, c.seo) })),
    [cambiar, storeName],
  );
  const generarSeoTodas = useCallback(() => {
    setCats((prev) => prev.map((c) => ({ ...c, seo: seoPorDefecto(c.label, storeName, c.seo) })));
  }, [storeName]);

  /** Agrega al final. Devuelve el error a mostrar, o null si se creó. */
  const crear = useCallback((label: string): string | null => {
    const nombre = label.trim();
    const base = slugify(nombre);
    if (!base) return "Escribe un nombre con letras o números.";
    const existente = cats.find((c) => nombreComparable(c.label) === base);
    if (existente) return `Ya tienes «${existente.label}».`;
    const ids = new Set(cats.map((c) => c.id));
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    const nueva: FilaCategoria = {
      id, label: nombre, emoji: "", visible: true, order: cats.length,
      seo: seoPorDefecto(nombre, storeName),
      productos: 0, activos: 0, valores: [], guardada: false,
      clave: `${id}#nueva-${Date.now()}`, labelOriginal: nombre,
    };
    setCats((prev) => [...prev, nueva]);
    return null;
  }, [cats, storeName]);

  const eliminar = useCallback(async (clave: string) => {
    const cat = cats.find((c) => c.clave === clave);
    if (!cat || cat.productos > 0) return;
    const ok = await confirm({
      title: `¿Quitar la categoría «${cat.label}»?`,
      description: "No tiene productos. Se quita de la lista al guardar.",
      intent: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (!ok) return;
    setCats((prev) => prev.filter((c) => c.clave !== clave).map((c, i) => ({ ...c, order: i })));
  }, [cats, confirm]);

  const guardar = useCallback(async () => {
    setErrorGuardar(null);
    if (cats.some((c) => !c.label.trim())) {
      setErrorGuardar("Ponle nombre a todas las categorías antes de guardar.");
      return;
    }
    // Dos con el mismo nombre = se juntan (sus productos quedan en una sola).
    const porNombre = new Map<string, FilaCategoria[]>();
    for (const c of cats) porNombre.set(nombreComparable(c.label), [...(porNombre.get(nombreComparable(c.label)) ?? []), c]);
    const choque = [...porNombre.values()].find((g) => g.length > 1);
    if (choque) {
      const productos = choque.reduce((s, c) => s + c.productos, 0);
      const ok = await confirm({
        title: `¿Juntar las categorías «${choque[0].label.trim()}»?`,
        description: `Hay ${choque.length} con el mismo nombre. Quedan en una sola, con sus ${productos} productos.`,
        confirmLabel: "Sí, juntarlas",
      });
      if (!ok) return;
    }

    setGuardando(true);
    try {
      const renombres = cats.filter(fueRenombrada).map((c) => ({ valores: c.valores, nuevo: c.label.trim() }));
      if (renombres.length > 0) {
        const r = await fetch("/api/admin/categorias", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ renombres }),
        });
        if (!r.ok) throw new Error(await mensajeDeError(r));
      }
      const vistos = new Set<string>();
      const categoryOrder: CategoriaGuardada[] = [];
      for (const c of cats) {
        const nombre = nombreComparable(c.label);
        if (vistos.has(nombre)) continue;
        vistos.add(nombre);
        // Renombrada con productos: el id pasa a la clave del nombre nuevo, que
        // es como Productos y stock la busca para rotular.
        categoryOrder.push(aGuardada(c, categoryOrder.length, fueRenombrada(c) ? claveDeInventario(c.label) : c.id));
      }
      const r2 = await fetch("/api/settings", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ categoryOrder }),
      });
      if (!r2.ok) throw new Error(await mensajeDeError(r2));
      await cargar();
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    } catch (e) {
      setErrorGuardar(`No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGuardando(false);
    }
  }, [cats, cargar, confirm]);

  const recargar = useCallback(async () => {
    if (hayCambios && !(await confirm({ title: "¿Descartar los cambios sin guardar?", confirmLabel: "Sí, descartar" }))) return;
    setCargando(true);
    await cargar();
  }, [hayCambios, cargar, confirm]);

  return {
    cargando, errorCarga, cats, hayCambios, guardando, guardado, errorGuardar, storeName,
    cargar, recargar, mover, alternarVisible, cambiarNombre, cambiarSeo, generarSeo, generarSeoTodas,
    crear, eliminar, guardar,
  };
}

export type EditorCategorias = ReturnType<typeof useCategorias>;
