"use client";

/**
 * Todo lo de Cámaras que cuelga de la cabecera (Brandon 2026-10-15: «al pasar
 * el mouse muestre diferentes opciones para escoger más rápido»), en un solo
 * objeto que dibujan igual el menú del botón (`MenuCamaras`, ≥ 56 rem) y las
 * filas del panel «Accesos» (celular): las opciones salen de `opcionesCamaras`.
 *
 * - «Ver todas en vivo» abre el mosaico global SIN pasar por la pantalla de
 *   Cámaras: pide la lista y el estado de Hik-Connect (lo mismo que pide la
 *   pantalla) y le pasa las enlazadas. Ya abierto, sólo lo expande.
 * - «Visitantes de hoy» abre Cámaras › Personas en el modal de accesos, que
 *   arranca en el día de hoy (hora de Lima).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useMosaicoGlobal } from "@/components/admin/forestal/camaras/MosaicoGlobalContexto";
import { anotarZonasDeLista } from "@/components/admin/forestal/camaras/zonas-detector";
import { API_HIK } from "@/components/admin/forestal/camaras/use-hik-connect";
import type { AccesoRapido } from "./accesos-rapidos";
import { camarasEnlazadas } from "./camaras-enlazadas";
import { useAvisosCamaras } from "./use-avisos-camaras";
import { useSonidoCamaras, type SonidoCamaras } from "./use-sonido-camaras";

const ID_MOSAICO = "camaras-abrir-mosaico";
/** `limite=1`: de las capturas no se necesita ninguna, sólo la lista. */
const API_LISTA = "/api/admin/camaras?limite=1";

export interface CamarasCabecera extends SonidoCamaras {
  sinVer: number;
  resumen: string | null;
  /** «Silenciar alarmas»: todo. */
  silencioHasta: number;
  /** El «Silenciar movimiento» del mensaje: sólo el movimiento. */
  silencioMovimientoHasta: number;
  abriendoMosaico: boolean;
  abrir: () => void;
  visitantes: () => void;
  verTodas: () => void;
  ajustesAbiertos: boolean;
  abrirAjustes: () => void;
  cerrarAjustes: () => void;
}

const avisarFallo = (err: unknown) =>
  logger.warn("[camaras] ver todas en vivo falló", { error: String(err) });

async function pedirJson(url: string): Promise<unknown> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

/**
 * @param camaras El acceso de Cámaras si el rol lo ve (`null`: nada escucha ni suena).
 * @param abrirEnModal Abre un acceso en el modal de la cabecera.
 */
export function useCamarasCabecera(
  camaras: AccesoRapido | null,
  abrirEnModal: (a: AccesoRapido) => void,
): CamarasCabecera {
  const activo = camaras !== null;
  const abrir = useCallback(() => {
    if (camaras) abrirEnModal(camaras);
  }, [camaras, abrirEnModal]);
  const avisos = useAvisosCamaras(activo, abrir);
  const global = useMosaicoGlobal();
  /* Algo puede sonar: el mosaico abierto (también en la burbuja) o avisos sin ver. */
  const sonido = useSonidoCamaras(activo, global?.abierto === true || avisos.sinVer > 0);
  const [abriendoMosaico, setAbriendo] = useState(false);
  const [ajustesAbiertos, setAjustes] = useState(false);
  /* El «Reintentar» del mensaje llama a la versión vigente. */
  const reintentar = useRef<() => void>(() => undefined);

  const visitantes = useCallback(() => {
    if (camaras) abrirEnModal({ ...camaras, vista: "personas", label: "Visitantes de hoy" });
  }, [camaras, abrirEnModal]);

  const verTodas = useCallback(async () => {
    /* Fuera del panel (sin proveedor) no hay mosaico global: la pantalla. */
    if (!global) return abrir();
    if (global.abierto) return global.abrir([]);
    setAbriendo(true);
    toast.loading("Abriendo las cámaras en vivo…", { id: ID_MOSAICO });
    try {
      const [lista, hik] = await Promise.all([pedirJson(API_LISTA), pedirJson(API_HIK)]);
      const e = camarasEnlazadas(lista, hik);
      if (e.mosaico.length === 0) {
        toast.info(e.vinculado ? "Ninguna cámara está enlazada a Hik-Connect" : "Hik-Connect no está vinculado", {
          id: ID_MOSAICO,
          description: "Enlázalas en Cámaras › Cámaras para verlas todas juntas",
        });
        if (camaras) abrirEnModal({ ...camaras, vista: "camaras" });
        return;
      }
      anotarZonasDeLista(e.crudas);
      global.abrir(e.mosaico);
      toast.dismiss(ID_MOSAICO);
    } catch (err) {
      logger.warn("[camaras] no se pudo abrir el mosaico desde la cabecera", { error: String(err) });
      toast.error("No se pudieron abrir las cámaras", {
        id: ID_MOSAICO,
        action: { label: "Reintentar", onClick: () => reintentar.current() },
      });
    } finally {
      setAbriendo(false);
    }
  }, [global, abrir, camaras, abrirEnModal]);
  const lanzarVerTodas = useCallback(() => {
    verTodas().catch(avisarFallo);
  }, [verTodas]);
  useEffect(() => {
    reintentar.current = lanzarVerTodas;
  }, [lanzarVerTodas]);

  return {
    ...sonido,
    sinVer: avisos.sinVer,
    resumen: avisos.resumen,
    silencioHasta: avisos.silencioHasta,
    silencioMovimientoHasta: avisos.silencioMovimientoHasta,
    abriendoMosaico,
    abrir,
    visitantes,
    verTodas: lanzarVerTodas,
    ajustesAbiertos,
    abrirAjustes: () => setAjustes(true),
    cerrarAjustes: () => setAjustes(false),
  };
}
