"use client";

import { useState, useEffect } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { ListaPublicar } from "@/lib/marketplace/lista-publicar";

/** Horario semanal de la tienda (Store.hoursJson), forma que valida el PUT. */
export type DiaSemana = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type HorarioSemana = Partial<Record<DiaSemana, { open?: string; close?: string; closed?: boolean }>>;

export interface CustomSubcategoryEntry {
  id: string;
  label: string;
  imageUrl: string | null;
}

export interface CustomCategoryEntry {
  id: string;
  label: string;
  imageUrl: string | null;
  subcategories: CustomSubcategoryEntry[];
}

export interface MarketplaceStoreData {
  id?: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string;
  category: string;
  zone: string;
  commissionRate: number;
  isActive: boolean;
  vacationMode?: boolean;
  vacationMessage?: string;
  /** Campos "extras" persistidos en store-extras.json (no en Prisma). */
  subcategory?: string | null;
  coverageZones?: string[];
  customCategories?: CustomCategoryEntry[];
  /** Store.hoursJson. null = sin horario configurado. */
  hours?: HorarioSemana | null;
}

/** El PUT valida `hours` como objeto {mon..sun}: null o un array legacy lo tumban con 400. */
function esHorarioObjeto(h: unknown): h is HorarioSemana {
  return typeof h === "object" && h !== null && !Array.isArray(h);
}

const DEFAULT_STORE: MarketplaceStoreData = {
  slug: "",
  name: "",
  description: "",
  logoUrl: "",
  category: "",
  zone: "",
  commissionRate: 5,
  isActive: false,
  subcategory: null,
  coverageZones: [],
  customCategories: [],
};

export function useMarketplaceTienda() {
  const [store, setStore] = useState<MarketplaceStoreData>(DEFAULT_STORE);
  const storeActual = store;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [listaPublicar, setListaPublicar] = useState<ListaPublicar | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/marketplace/stores?my=true")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.listaPublicar) setListaPublicar(d.listaPublicar as ListaPublicar);
        if (d && (d.slug || d.name)) {
          // El endpoint ya devuelve subcategory/coverageZones/customCategories
          // (ver app/api/marketplace/stores/route.ts ?my=true). Normalizamos.
          setStore({
            ...(d as MarketplaceStoreData),
            subcategory: d.subcategory ?? null,
            coverageZones: Array.isArray(d.coverageZones) ? d.coverageZones : [],
            customCategories: Array.isArray(d.customCategories) ? d.customCategories : [],
          });
        }
      })
      .catch(() => setError("Error al cargar datos de la tienda."))
      .finally(() => setLoading(false));
  }, []);

  /** Relee solo la lista «para publicar» (tras guardar cambia logo/horario). */
  const recargarLista = () =>
    fetch("/api/marketplace/stores?my=true")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setListaPublicar((d?.listaPublicar as ListaPublicar | undefined) ?? null))
      .catch((err) => window.console.warn("[useMarketplaceTienda] recargarLista failed", err));

  /** `cambios` se aplican encima del estado (p. ej. «Publicar» = isActive:true). */
  const handleSave = async (cambios: Partial<MarketplaceStoreData> = {}) => {
    const store = { ...storeActual, ...cambios };
    if (!store.name?.trim()) {
      setError("El nombre de la tienda es obligatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { hours, ...resto } = store;
      const res = await fetch("/api/marketplace/stores", {
        method: store.id ? "PUT" : "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(esHorarioObjeto(hours) ? { ...resto, hours } : resto),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || "Error al guardar");
      }
      const data = await res.json();

      // Guardar los extras (subcategory + coverageZones + customCategories) en
      // su endpoint paralelo. No es crítico para Store.category — si falla,
      // mostramos warning pero no rompemos el flujo.
      try {
        const exRes = await fetch("/api/admin/marketplace/store-extras", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            subcategory: store.subcategory ?? null,
            coverageZones: store.coverageZones ?? [],
            customCategories: store.customCategories ?? [],
          }),
        });
        if (!exRes.ok && typeof window !== "undefined") {
          window.console.warn("[useMarketplaceTienda] store-extras PUT non-ok", exRes.status);
        }
      } catch (err) {
        if (typeof window !== "undefined") {
          window.console.warn("[useMarketplaceTienda] store-extras PUT failed", err);
        }
      }

      setStore({
        ...(data as MarketplaceStoreData),
        hours: esHorarioObjeto((data as { hours?: unknown }).hours)
          ? (data as { hours: HorarioSemana }).hours
          : (store.hours ?? null),
        subcategory: store.subcategory ?? null,
        coverageZones: store.coverageZones ?? [],
        customCategories: store.customCategories ?? [],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      void recargarLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la tienda. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  return { store, setStore, loading, saving, error, saved, handleSave, listaPublicar };
}
