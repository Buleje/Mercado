"use client";

/**
 * La cuenta de Hik-Connect for Teams desde la pantalla (ADR-471): estado,
 * vincular/desvincular, la lista de cámaras de Hikvision y los enlaces.
 * Las claves viajan sólo de ida (al vincular); nunca vuelven.
 */

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export const API_HIK = "/api/admin/camaras/hik-connect";

export interface EnlacePantalla {
  nombreHik: string;
  serieFinal: string;
  conCodigo: boolean;
}

export interface EstadoHik {
  vinculado: boolean;
  region: string | null;
  regionNombre: string | null;
  ultimos4: string | null;
  vinculadoAt: string | null;
  enlaces: Record<string, EnlacePantalla>;
}

export interface CamaraHikPantalla {
  resourceId: string;
  nombre: string;
  serieFinal: string;
  enLinea: boolean | null;
  /** Cámara del sistema que ya la usa. */
  enlazadaA: string | null;
}

export type RegionElegida = "auto" | "sa" | "us" | "eu" | "sgp";

type Respuesta = { ok: boolean; status: number; json: Record<string, unknown> };

async function pedir(url: string, init?: RequestInit): Promise<Respuesta> {
  try {
    const r = await fetch(url, {
      credentials: "include",
      ...init,
      headers:
        init?.method && init.method !== "GET"
          ? csrfHeaders({ "Content-Type": "application/json" })
          : undefined,
    });
    const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, status: r.status, json };
  } catch {
    return {
      ok: false,
      status: 0,
      json: { message: "Sin conexión con el panel. Revisa el internet y vuelve a intentar." },
    };
  }
}

const mensaje = (r: Respuesta, porDefecto: string) =>
  typeof r.json.message === "string" && r.json.message ? r.json.message : porDefecto;

const esEstado = (j: Record<string, unknown>): j is Record<string, unknown> & EstadoHik =>
  typeof j.vinculado === "boolean" && !!j.enlaces && typeof j.enlaces === "object";

export function useHikConnect() {
  const [estado, setEstado] = useState<EstadoHik | null>(null);
  const [camarasHik, setCamarasHik] = useState<CamaraHikPantalla[] | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /** 403 (un rol que no ve cámaras) = sin nube, en silencio: el botón sigue abriendo la app. */
  const cargar = useCallback(async () => {
    const r = await pedir(API_HIK);
    if (r.ok && esEstado(r.json)) setEstado(r.json);
  }, []);

  const correr = useCallback(
    async (
      que: string,
      hacer: () => Promise<Respuesta>,
      porDefecto: string,
    ): Promise<Respuesta | null> => {
      setTrabajando(que);
      setError(null);
      setAviso(null);
      try {
        const r = await hacer();
        if (!r.ok) {
          setError(mensaje(r, porDefecto));
          return null;
        }
        if (esEstado(r.json)) setEstado(r.json);
        if (typeof r.json.mensaje === "string") setAviso(r.json.mensaje);
        return r;
      } finally {
        setTrabajando(null);
      }
    },
    [],
  );

  const vincular = useCallback(
    async (appKey: string, secretKey: string, region: RegionElegida) =>
      !!(await correr(
        "vincular",
        () =>
          pedir(API_HIK, {
            method: "POST",
            body: JSON.stringify({ appKey: appKey.trim(), secretKey: secretKey.trim(), region }),
          }),
        "No se pudo vincular.",
      )),
    [correr],
  );

  const desvincular = useCallback(async () => {
    const r = await correr(
      "desvincular",
      () => pedir(API_HIK, { method: "DELETE" }),
      "No se pudo desvincular.",
    );
    if (r) setCamarasHik(null);
    return !!r;
  }, [correr]);

  const listar = useCallback(async () => {
    const r = await correr(
      "lista",
      () => pedir(`${API_HIK}/camaras`),
      "No se pudo traer la lista de Hikvision.",
    );
    if (r && Array.isArray(r.json.camaras)) setCamarasHik(r.json.camaras as CamaraHikPantalla[]);
  }, [correr]);

  const patch = useCallback(
    async (que: string, cuerpo: Record<string, unknown>) => {
      const r = await correr(
        que,
        () => pedir(API_HIK, { method: "PATCH", body: JSON.stringify(cuerpo) }),
        "No se pudo guardar.",
      );
      return !!r;
    },
    [correr],
  );

  const enlazar = useCallback(
    async (camaraId: string, resourceId: string, codigo?: string) => {
      const ok = await patch(`enlazar:${resourceId}`, {
        accion: "enlazar",
        camaraId,
        resourceId,
        ...(codigo ? { codigo } : {}),
      });
      if (ok) {
        setCamarasHik(
          (l) =>
            l?.map((c) =>
              c.resourceId === resourceId
                ? { ...c, enlazadaA: camaraId }
                : c.enlazadaA === camaraId
                  ? { ...c, enlazadaA: null }
                  : c,
            ) ?? l,
        );
        setAviso("Enlazada: «En vivo» de esa cámara ya abre el video acá.");
      }
      return ok;
    },
    [patch],
  );

  const guardarCodigo = useCallback(
    (camaraId: string, codigo: string | null) =>
      patch(`codigo:${camaraId}`, { accion: "codigo", camaraId, codigo }),
    [patch],
  );

  const desenlazar = useCallback(
    async (camaraId: string) => {
      const ok = await patch(`desenlazar:${camaraId}`, { accion: "desenlazar", camaraId });
      if (ok)
        setCamarasHik(
          (l) => l?.map((c) => (c.enlazadaA === camaraId ? { ...c, enlazadaA: null } : c)) ?? l,
        );
      return ok;
    },
    [patch],
  );

  return {
    estado,
    camarasHik,
    trabajando,
    error,
    aviso,
    setError,
    cargar,
    vincular,
    desvincular,
    listar,
    enlazar,
    guardarCodigo,
    desenlazar,
  };
}

export type HikConnect = ReturnType<typeof useHikConnect>;
