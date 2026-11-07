"use client";

/**
 * useMedirPatio — el estado de «Medir escaneando» en el modo patio
 * (Brandon 2026-09-26).
 *
 * Tres cosas:
 *   1. El patio contra el que se escanea (`GET /trozas/patio`). Sin señal, el
 *      último que la tablet alcanzó a ver (`patio-cache`), diciendo de cuándo.
 *   2. Guardar la medida de UNA troza por `escribirDelPatio` (la misma puerta
 *      de la recepción, el consumo y el acta): con señal va directo a
 *      `PATCH /trozas/medidas` y vuelve la troza releída (con el pt que congeló
 *      el servidor) y lo que no se aceptó; sin señal queda en la cola del
 *      patio y se sube sola. Si esa troza ya tiene una medida esperando en la
 *      cola, la nueva va DETRÁS: subir antes que la vieja era que la vieja la
 *      pisara después.
 *   3. La tanda: lo medido en esta visita, guardado en la tablet por negocio y
 *      día (`localStorage`), para que una recarga no lo borre de la vista. Al
 *      releer el patio se cruza con el servidor Y con la cola: lo que subió
 *      pasa a «Guardada» y lo que el servidor rechazó, a «No se guardó».
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { guardar as guardarCache, leer as leerCache } from "@/lib/forestal/patio-cache";
import { escribirDelPatio, listar, resumenDeMedida } from "@/lib/forestal/patio-cola";
import { ptDeTroza } from "@/lib/forestal/cubicacion-oxapampa";
import { codigoDeTroza } from "@/lib/forestal/conteo-patio";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { CambioMedidaTroza } from "@/lib/forestal/medidas-troza";
import {
  borraLaMedida,
  conCambioLocal,
  leerTanda,
  medidasEnCola,
  mezclarCarga,
  ponerEnTanda,
  quedoLaMedida,
  reconciliarTanda,
  tandaParaGuardar,
  tocaLaCubicacion,
  type EstadoMedida,
  type MedidaDeLaTanda,
  type MedidasEnCola,
} from "@/lib/forestal/medir-patio";

const URL_PATIO = "/api/admin/forestal/trozas/patio";
const URL_MEDIDAS = "/api/admin/forestal/trozas/medidas";

function claveDeLaTanda(): string {
  let slug = "main";
  try {
    slug = window.localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    /* modo privado: la tanda vive sólo en memoria */
  }
  return `patio-medir-tanda:${slug}`;
}

function tandaGuardada(): MedidaDeLaTanda[] {
  if (typeof window === "undefined") return [];
  try {
    return leerTanda(window.localStorage.getItem(claveDeLaTanda()), limaDateKey());
  } catch {
    return [];
  }
}

/** Lo que la cola sabe de las medidas; `undefined` sin IndexedDB (no se cruza). */
async function leerCola(): Promise<MedidasEnCola | undefined> {
  try {
    return medidasEnCola(await listar());
  } catch {
    return undefined;
  }
}

export type ResultadoMedida =
  | { estado: EstadoMedida; pt: number | null; aviso: string | null }
  | { estado: "error"; mensaje: string };

interface RespuestaMedidas {
  trozas?: TrozaConsumible[];
  rechazadas?: { id: string; motivo: string }[];
}

export function useMedirPatio() {
  const [trozas, setTrozas] = useState<TrozaConsumible[]>([]);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [error, setError] = useState<string | null>(null);
  /** Cuándo se guardó el patio que se está usando. `null` = vino del servidor. */
  const [deCache, setDeCache] = useState<string | null>(null);
  const [tanda, setTanda] = useState<MedidaDeLaTanda[]>(tandaGuardada);
  const [guardando, setGuardando] = useState(false);
  /** Sólo la última carga pinta (doble montaje en dev, «Reintentar»). */
  const cargaRef = useRef(0);
  /**
   * Lo guardado en esta visita, numerado. Una carga que salió ANTES de un
   * guardado vuelve con esa troza vieja: `mezclarCarga` se queda con la local.
   */
  const guardadasRef = useRef<{ n: number; porId: Map<string, { n: number; troza: TrozaConsumible }> }>({
    n: 0,
    porId: new Map(),
  });

  const cargar = useCallback(async () => {
    const n = ++cargaRef.current;
    const desde = guardadasRef.current.n;
    setEstado((e) => (e === "listo" ? e : "cargando"));
    setError(null);
    try {
      const r = await fetch(URL_PATIO, { credentials: "include" });
      if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
      const d = (await r.json()) as { trozas?: TrozaConsumible[] };
      const cola = await leerCola();
      if (n !== cargaRef.current) return;
      const lista = mezclarCarga(d.trozas ?? [], guardadasRef.current.porId, desde);
      setTrozas(lista);
      /* Lo que la cola ya subió deja de figurar «en la tablet»; lo que el
         servidor rechazó pasa a «No se guardó». Contra lo que dijo el SERVIDOR,
         no contra la lista mezclada: una troza anotada sin señal mientras la
         carga viajaba se compararía con su propia copia y saldría «Guardada». */
      setTanda((prev) => reconciliarTanda(prev, d.trozas ?? [], cola));
      setDeCache(null);
      setEstado("listo");
      void guardarCache("trozas", lista);
    } catch (e) {
      const cache = await leerCache<TrozaConsumible>("trozas");
      if (n !== cargaRef.current) return;
      if (cache && cache.datos.length > 0) {
        setTrozas(mezclarCarga(cache.datos, guardadasRef.current.porId, desde));
        setDeCache(cache.guardadoEn);
        setEstado("listo");
        return;
      }
      setError(
        e instanceof TypeError
          ? "Sin señal y sin el patio guardado en esta tablet. Conéctate una vez para traerlo."
          : `No se pudo leer el patio: ${e instanceof Error ? e.message : String(e)}.`,
      );
      setEstado("error");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    try {
      if (tanda.length === 0) window.localStorage.removeItem(claveDeLaTanda());
      else window.localStorage.setItem(claveDeLaTanda(), tandaParaGuardar(limaDateKey(), tanda));
    } catch (err) {
      logger.warn("[medir-patio] no se pudo guardar la tanda en el equipo", { error: String(err) });
    }
  }, [tanda]);

  /** La troza como quedó: a la lista local y al registro de lo guardado. */
  const fijar = useCallback((t: TrozaConsumible) => {
    const g = guardadasRef.current;
    g.n += 1;
    g.porId.set(t.id, { n: g.n, troza: t });
    setTrozas((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  }, []);

  const guardar = useCallback(
    async (t: TrozaConsumible, cambio: CambioMedidaTroza, ptTablet: number | null): Promise<ResultadoMedida> => {
      setGuardando(true);
      const codigo = codigoDeTroza({ id: t.id, codigoPlanta: t.codigoPlanta ?? null, codificacion: t.codificacion });
      const fila = (
        o: Pick<MedidaDeLaTanda, "d1" | "d2" | "largo" | "pt" | "estado" | "aviso"> & { cambio?: CambioMedidaTroza },
      ): MedidaDeLaTanda => ({
        id: t.id,
        codigo,
        especie: t.especieComun ?? null,
        gtfNumber: t.gtfNumber ?? null,
        en: new Date().toISOString(),
        ...o,
      });
      try {
        const r = await escribirDelPatio({
          section: "medidas",
          url: URL_MEDIDAS,
          metodo: "PATCH",
          payload: { trozas: [cambio] },
          resumen: resumenDeMedida(codigo, cambio),
        });
        if (r.estado === "error") {
          return { estado: "error", mensaje: r.mensaje?.trim() || "El servidor no aceptó la medida." };
        }
        const borrada = borraLaMedida(t, cambio);

        if (r.estado === "encolada") {
          const local = conCambioLocal(t, cambio);
          fijar(local);
          const estadoTanda: EstadoMedida = borrada ? "borrada" : "en-equipo";
          setTanda((prev) =>
            ponerEnTanda(
              prev,
              fila({
                d1: local.oxD1Pulg ?? null,
                d2: local.oxD2Pulg ?? null,
                largo: local.oxLargoPies ?? null,
                pt: ptTablet,
                estado: estadoTanda,
                aviso: null,
              }),
            ),
          );
          const conSenal = typeof navigator === "undefined" || navigator.onLine;
          return {
            estado: estadoTanda,
            pt: ptTablet,
            aviso:
              r.detras && conSenal
                ? "Quedó detrás de la medida anterior de esta troza, que todavía no sube: se suben en orden."
                : null,
          };
        }

        invalidarCtp("trozas");
        const cuerpo = (r.cuerpo ?? {}) as RespuestaMedidas;
        const releida = cuerpo.trozas?.find((x) => x.id === t.id);
        const rechazos = (cuerpo.rechazadas ?? []).filter((x) => x.id === t.id).map((x) => x.motivo);
        const aviso = rechazos.length > 0 ? rechazos.join(" ") : null;
        /* Un rechazo TOTAL (guía anulada, no llegada, de otro negocio): el
           servidor no tiene esta cubicación. No se muestra como guardada: queda
           «No se guardó» con lo que se mandó, para reenviarlo. */
        if (aviso && tocaLaCubicacion(cambio) && !quedoLaMedida(cambio, releida)) {
          fijar(releida ? { ...t, ...releida } : t);
          const pedida = conCambioLocal(t, cambio);
          setTanda((prev) =>
            ponerEnTanda(
              prev,
              fila({
                d1: pedida.oxD1Pulg ?? null,
                d2: pedida.oxD2Pulg ?? null,
                largo: pedida.oxLargoPies ?? null,
                pt: null,
                estado: "rechazada",
                aviso,
                cambio,
              }),
            ),
          );
          return { estado: "rechazada", pt: null, aviso };
        }
        const final = releida ? { ...t, ...releida } : conCambioLocal(t, cambio);
        fijar(final);
        const pt = ptDeTroza(final);
        const estadoTanda: EstadoMedida = aviso ? "con-aviso" : borrada ? "borrada" : "guardada";
        setTanda((prev) =>
          ponerEnTanda(
            prev,
            fila({
              d1: final.oxD1Pulg ?? null,
              d2: final.oxD2Pulg ?? null,
              largo: final.oxLargoPies ?? null,
              pt,
              estado: estadoTanda,
              aviso,
            }),
          ),
        );
        return { estado: estadoTanda, pt, aviso };
      } catch (e) {
        /* `anotar` sin IndexedDB (modo privado, cuota llena): no se puede
           prometer que se sube después, así que se dice. */
        logger.warn("[medir-patio] no se pudo anotar en el equipo", { error: String(e) });
        return {
          estado: "error",
          mensaje: "Sin señal y esta tablet no pudo guardar la medida. Anótala a mano y vuelve a intentar.",
        };
      } finally {
        setGuardando(false);
      }
    },
    [fijar],
  );

  const vaciarTanda = useCallback(() => setTanda([]), []);

  return { trozas, estado, error, deCache, tanda, guardando, guardar, recargar: cargar, vaciarTanda };
}
