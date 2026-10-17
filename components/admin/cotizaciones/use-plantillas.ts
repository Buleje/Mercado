"use client";

/**
 * Plantillas de cotización (F28), de dos lados y siempre dicho cuál:
 *  - «En este navegador»: localStorage, hasta 10, sólo en esta computadora;
 *  - «De tu empresa»: el KV del negocio, las ve todo el equipo, con dueño y
 *    versiones (guardar con el mismo nombre pide confirmar la versión nueva).
 * Una plantilla copia SÓLO ítems y condiciones: nunca cliente, fecha ni número.
 */
import { useCallback, useEffect, useState } from "react";
import type { ItemModelo, ModeloCotizacion } from "@/lib/cotizaciones/modelos";
import { nombreClave } from "@/lib/cotizaciones/modelos";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { loadTemplates, MAX_TEMPLATES, saveTemplates, type Cotizacion, type Plantilla } from "./tipos";

export type DondePlantilla = "navegador" | "empresa";
export type Duplicada = { id: string; nombre: string; version: number; propietario: string };
export type ResultadoGuardar = { ok: true; mensaje: string } | { ok: false; error: string; duplicada?: Duplicada };
/** Lo que se previsualiza y se usa, venga de donde venga. */
export type PlantillaElegida = { origen: DondePlantilla; id: string; nombre: string; items: ItemModelo[]; notas?: string; version?: number; propietario?: string };
export type Quien = { usuario: string; rol: string };

const itemsDe = (c: Cotizacion): ItemModelo[] =>
  (c.items ?? []).map((it) => ({
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    precioUnit: it.precioUnit,
    ...(it.descuento ? { descuento: it.descuento } : {}),
    ...(it.productoId ? { productoId: it.productoId } : {}),
  }));

export const deNavegador = (p: Plantilla): PlantillaElegida => ({ origen: "navegador", id: p.id, nombre: p.nombre, items: p.items });
export const deEmpresa = (m: ModeloCotizacion): PlantillaElegida => ({
  origen: "empresa", id: m.id, nombre: m.nombre, items: m.items, notas: m.notas, version: m.version, propietario: m.propietario,
});

async function errorDe(res: Response, porDefecto: string): Promise<{ error: string; duplicada?: Duplicada }> {
  const j = (await res.json().catch(() => ({}))) as { error?: unknown; motivo?: unknown; existente?: Duplicada };
  return { error: typeof j.error === "string" ? j.error : porDefecto, ...(j.motivo === "duplicado" && j.existente ? { duplicada: j.existente } : {}) };
}

export function usePlantillas() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [equipo, setEquipo] = useState<ModeloCotizacion[]>([]);
  const [yo, setYo] = useState<Quien | null>(null);
  const [estadoEquipo, setEstadoEquipo] = useState<"cargando" | "listo" | "error">("cargando");
  /** `elegir` = desde el formulario (usar una) · `gestionar` = desde «Más» (usar, compartir o borrar). */
  const [ventana, setVentana] = useState<"elegir" | "gestionar" | null>(null);

  useEffect(() => setPlantillas(loadTemplates()), []);

  const recargarEquipo = useCallback(async () => {
    try {
      const res = await fetch("/api/cotizaciones/modelos");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { modelos?: ModeloCotizacion[]; yo?: Quien };
      setEquipo(Array.isArray(j.modelos) ? j.modelos : []);
      setYo(j.yo ?? null);
      setEstadoEquipo("listo");
    } catch (err) {
      logger.warn("[cotizaciones] plantillas de la empresa no disponibles", { error: String(err) });
      setEstadoEquipo("error");
    }
  }, []);
  useEffect(() => { void recargarEquipo(); }, [recargarEquipo]);

  const guardarLocal = useCallback((nombre: string, items: ItemModelo[], reemplazarId?: string): ResultadoGuardar => {
    const actuales = loadTemplates();
    const igual = actuales.find((t) => t.id !== reemplazarId && nombreClave(t.nombre) === nombreClave(nombre));
    if (igual) return { ok: false, error: `Ya tienes «${igual.nombre}» en este navegador.`, duplicada: { id: igual.id, nombre: igual.nombre, version: 1, propietario: "tú" } };
    const nueva: Plantilla = { id: reemplazarId ?? `tpl_${Date.now()}`, nombre: nombre.trim(), items, createdAt: new Date().toISOString() };
    const lista = [nueva, ...actuales.filter((t) => t.id !== reemplazarId)].slice(0, MAX_TEMPLATES);
    saveTemplates(lista);
    setPlantillas(lista);
    return { ok: true, mensaje: reemplazarId ? `Se reemplazó «${nueva.nombre}» en este navegador.` : `«${nueva.nombre}» quedó en este navegador.` };
  }, []);

  const guardarEmpresa = useCallback(async (nombre: string, items: ItemModelo[], notas?: string, reemplazarId?: string): Promise<ResultadoGuardar> => {
    try {
      const res = await fetch("/api/cotizaciones/modelos", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ nombre: nombre.trim(), items, ...(notas?.trim() ? { notas: notas.trim() } : {}), ...(reemplazarId ? { reemplazarId } : {}) }),
      });
      if (!res.ok) return { ok: false, ...(await errorDe(res, "No se pudo guardar la plantilla")) };
      const j = (await res.json()) as { modelo: ModeloCotizacion; nuevaVersion: boolean };
      setEquipo((prev) => [j.modelo, ...prev.filter((m) => m.id !== j.modelo.id)]);
      return { ok: true, mensaje: j.nuevaVersion ? `«${j.modelo.nombre}» va por la versión ${j.modelo.version}; la ve todo el equipo.` : `«${j.modelo.nombre}» ya la ve todo el equipo.` };
    } catch (err) {
      logger.warn("[cotizaciones] guardar plantilla de la empresa falló", { error: String(err) });
      return { ok: false, error: "Sin conexión: no se guardó." };
    }
  }, []);

  /** Desde una cotización: ítems y condiciones (las notas), nada más. */
  const guardarDesde = useCallback(
    (c: Cotizacion, nombre: string, donde: DondePlantilla, reemplazarId?: string): Promise<ResultadoGuardar> => {
      const items = itemsDe(c);
      if (!nombre.trim() || items.length === 0) return Promise.resolve({ ok: false, error: "Ponle un nombre (y que tenga ítems)." });
      return donde === "empresa" ? guardarEmpresa(nombre, items, c.notas, reemplazarId) : Promise.resolve(guardarLocal(nombre, items, reemplazarId));
    },
    [guardarEmpresa, guardarLocal],
  );

  /** Pasa una del navegador a la empresa; la del navegador queda (se borra aparte). */
  const compartir = useCallback((p: Plantilla, reemplazarId?: string) => guardarEmpresa(p.nombre, p.items, undefined, reemplazarId), [guardarEmpresa]);

  /** Borra; devuelve el error a mostrar o null. */
  const borrar = useCallback(async (p: PlantillaElegida): Promise<string | null> => {
    if (p.origen === "navegador") {
      setPlantillas((prev) => {
        const nuevas = prev.filter((t) => t.id !== p.id);
        saveTemplates(nuevas);
        return nuevas;
      });
      return null;
    }
    try {
      const res = await fetch(`/api/cotizaciones/modelos?id=${encodeURIComponent(p.id)}`, { method: "DELETE", headers: csrfHeaders() });
      if (!res.ok && res.status !== 404) return (await errorDe(res, "No se pudo borrar")).error;
      setEquipo((prev) => prev.filter((m) => m.id !== p.id));
      return null;
    } catch (err) {
      logger.warn("[cotizaciones] borrar plantilla de la empresa falló", { error: String(err) });
      return "Sin conexión: no se borró.";
    }
  }, []);

  return { plantillas, equipo, yo, estadoEquipo, recargarEquipo, total: plantillas.length + equipo.length, ventana, setVentana, guardarDesde, compartir, borrar };
}

export type Plantillas = ReturnType<typeof usePlantillas>;
