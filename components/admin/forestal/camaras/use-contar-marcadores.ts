"use client";
/**
 * «Contar ahora» y «Probar con una foto» de Trozas a la vista (ADR-480).
 *
 * - Contar ahora: pide `FOTOS_CONTAR` fotos a la propia cámara (Hik-Connect,
 *   en HD; ~3,7 s cada una), las lee en el worker de OpenCV y cuenta como
 *   vistos los marcadores que salen en al menos 2 (uno solo puede ser ruido o
 *   alguien tapándolo). Guarda la pasada del día.
 * - Probar con una foto: lee un archivo y muestra qué leyó, con sus px por
 *   celda. No guarda nada: es para la prueba de 3/5/8 m y para revisar una
 *   foto que alguien sacó.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmarMarcadores, type LecturaMarcador } from "@/lib/camaras/marcadores";
import { csrfHeaders } from "@/lib/csrf-client";
import { cargarMotorMarcadores, leerMarcadoresDe, retenerMotorMarcadores } from "./motor-marcadores";

export const FOTOS_CONTAR = 3;
const ANCHO_HD = 1280;

export interface CamaraQueCuenta {
  id: string;
  nombre: string;
  leeMarcadores: boolean;
  sacaFoto: boolean;
}

export interface MarcadorLeido {
  id: number;
  /** En cuántas fotos salió. */
  cuadros: number;
  ladoPx: number;
  /** Cuenta como visto (≥2 fotos al contar; en «probar», cualquiera). */
  confirmado: boolean;
}

export interface ResultadoConteo {
  origen: "camara" | "foto";
  fotos: number;
  ancho: number;
  alto: number;
  marcadores: MarcadorLeido[];
  /** La pasada quedó anotada en el día. */
  guardada: boolean;
}

export type FaseConteo = "quieto" | "motor" | "fotos" | "guardando";

async function mensajeDe(r: Response, defecto: string): Promise<string> {
  const j = (await r.json().catch(() => ({}))) as { message?: unknown };
  return typeof j.message === "string" && j.message ? j.message : defecto;
}

function agrupar(lecturas: readonly LecturaMarcador[], confirmados: ReadonlySet<number>): MarcadorLeido[] {
  const por = new Map<number, LecturaMarcador[]>();
  for (const l of lecturas) por.set(l.id, [...(por.get(l.id) ?? []), l]);
  return [...por.entries()]
    .map(([id, ls]) => ({
      id,
      cuadros: new Set(ls.map((l) => l.at)).size,
      ladoPx: Math.round(Math.max(...ls.map((l) => l.ladoPx))),
      confirmado: confirmados.has(id),
    }))
    .sort((a, b) => a.id - b.id);
}

export function useContarMarcadores(activo: boolean) {
  const [camaras, setCamaras] = useState<CamaraQueCuenta[] | null>(null);
  const [fase, setFase] = useState<FaseConteo>("quieto");
  const [hechas, setHechas] = useState(0);
  const [resultado, setResultado] = useState<ResultadoConteo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    void fetch("/api/admin/camaras/marcadores", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await mensajeDe(r, "No se pudieron leer las cámaras."));
        const j = (await r.json()) as { camaras?: CamaraQueCuenta[] };
        if (vigente) setCamaras(Array.isArray(j.camaras) ? j.camaras : []);
      })
      .catch((e: unknown) => {
        if (vigente) {
          setCamaras([]);
          setError(e instanceof Error ? e.message : "No se pudieron leer las cámaras.");
        }
      });
    return () => {
      vigente = false;
    };
  }, [activo]);

  const contar = useCallback(async (camaraId: string): Promise<boolean> => {
    const soltar = retenerMotorMarcadores();
    setError(null);
    setResultado(null);
    setHechas(0);
    setFase("fotos");
    const motor = cargarMotorMarcadores();
    /* Que un fallo de carga no quede sin escuchar mientras bajan las fotos. */
    motor.catch(() => undefined);
    const lecturas: LecturaMarcador[] = [];
    let ancho = 0;
    let alto = 0;
    let fotos = 0;
    let ultimoError: string | null = null;
    try {
      for (let i = 0; i < FOTOS_CONTAR; i++) {
        const r = await fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/marcadores`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) {
          ultimoError = await mensajeDe(r, `La cámara no mandó la foto (${r.status}).`);
          if (r.status === 404 || r.status === 409) break;
          continue;
        }
        const foto = await r.blob();
        if (!vivo.current) return false;
        setFase("motor");
        await motor;
        const leido = await leerMarcadoresDe(foto, Date.now());
        lecturas.push(...leido.lecturas);
        ancho = Math.max(ancho, leido.ancho);
        alto = Math.max(alto, leido.alto);
        fotos++;
        if (vivo.current) {
          setHechas(fotos);
          setFase("fotos");
        }
      }
      if (fotos < 2) throw new Error(ultimoError ?? "Hacen falta al menos 2 fotos de la cámara para contar.");
      const confirmados = confirmarMarcadores(lecturas, Date.now(), { cuadros: 2, ms: 0, ventanaMs: 10 * 60_000 });
      if (vivo.current) setFase("guardando");
      const g = await fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/marcadores`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          en: new Date().toISOString(),
          origen: "pasada",
          calidad: ancho >= ANCHO_HD ? "hd" : "sd",
          marcadores: confirmados.map((c) => ({ id: c.id, cuadros: c.cuadros, ladoPx: c.ladoPx })),
        }),
      });
      if (!g.ok) throw new Error(await mensajeDe(g, "No se pudo guardar el conteo."));
      if (vivo.current)
        setResultado({
          origen: "camara",
          fotos,
          ancho,
          alto,
          marcadores: agrupar(lecturas, new Set(confirmados.map((c) => c.id))),
          guardada: true,
        });
      return true;
    } catch (e) {
      if (vivo.current) setError(e instanceof Error ? e.message : "No se pudo contar.");
      return false;
    } finally {
      soltar();
      if (vivo.current) setFase("quieto");
    }
  }, []);

  const probarFoto = useCallback(async (archivo: File) => {
    const soltar = retenerMotorMarcadores();
    setError(null);
    setResultado(null);
    setFase("motor");
    try {
      const leido = await leerMarcadoresDe(archivo, Date.now());
      const ids = new Set(leido.lecturas.map((l) => l.id));
      if (vivo.current)
        setResultado({
          origen: "foto",
          fotos: 1,
          ancho: leido.ancho,
          alto: leido.alto,
          marcadores: agrupar(leido.lecturas, ids),
          guardada: false,
        });
    } catch (e) {
      if (vivo.current) setError(e instanceof Error ? e.message : "No se pudo leer la foto.");
    } finally {
      soltar();
      if (vivo.current) setFase("quieto");
    }
  }, []);

  return { camaras, fase, hechas, resultado, error, contar, probarFoto };
}
