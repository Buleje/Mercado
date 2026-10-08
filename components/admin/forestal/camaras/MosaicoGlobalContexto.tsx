"use client";

/**
 * El mosaico «Ver todas en vivo» a nivel del PANEL, no de la pestaña Cámaras
 * (Brandon 2026-10-07: «minimizar… una burbuja… abrir la cámara de todas en
 * cualquier página que esté»).
 *
 * Vive en `app/admin/page.tsx`, envolviendo el contenido de las pestañas y la
 * capa de burbujas: así sigue montado al saltar de `?tab=` (los reproductores
 * de EZUIKit no se desmontan, el video y la detección de personas siguen).
 *
 * Es liviano a propósito: NO pide nada a Hik-Connect ni carga el mosaico al
 * entrar al panel. Sólo guarda qué cámaras abrir; el mosaico (`MosaicoNube`)
 * se baja recién cuando alguien toca «Ver todas en vivo» — que sólo existe en
 * la pantalla de Cámaras, así que un rol sin cámaras nunca pide nada.
 */

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CamaraMosaico } from "./MosaicoNubeCuadro";
import { navegarEnElPanel } from "./navegar-panel";

const MosaicoNube = dynamic(() => import("./MosaicoNube"), { ssr: false });

interface ValorMosaicoGlobal {
  /** ¿Hay un mosaico abierto (expandido o en la burbuja)? */
  abierto: boolean;
  /** Abre el mosaico; si ya estaba en la burbuja, lo expande. */
  abrir: (camaras: readonly CamaraMosaico[]) => void;
  cerrar: () => void;
  /**
   * «Verlo en el televisor» sólo existe con la pantalla de Cámaras montada
   * (su modal «Ver en otra pantalla» vive allá): se registra al montarse.
   */
  registrarVerEnTv: (fn: () => void) => () => void;
}

const Ctx = createContext<ValorMosaicoGlobal | null>(null);

/** `null` fuera del panel (Modo TV, tests): el mosaico vuelve a ser un modal de la pantalla. */
export const useMosaicoGlobal = () => useContext(Ctx);

const FOTOS_DE_CAMARAS = "/admin?tab=camaras&vista=fotos#camaras";

export function MosaicoGlobalProvider({ children }: { children: ReactNode }) {
  const [camaras, setCamaras] = useState<readonly CamaraMosaico[] | null>(null);
  const [minimizado, setMinimizado] = useState(false);
  const [verEnTv, setVerEnTv] = useState<(() => void) | null>(null);

  const abrir = useCallback((lista: readonly CamaraMosaico[]) => {
    setMinimizado(false);
    /* Ya abierto: se expande el mismo (no se cortan los videos que corren). */
    setCamaras((actual) => actual ?? lista);
  }, []);
  const cerrar = useCallback(() => {
    setCamaras(null);
    setMinimizado(false);
  }, []);
  const registrarVerEnTv = useCallback((fn: () => void) => {
    setVerEnTv(() => fn);
    return () => setVerEnTv((actual) => (actual === fn ? null : actual));
  }, []);

  const valor = useMemo(
    () => ({ abierto: camaras !== null, abrir, cerrar, registrarVerEnTv }),
    [camaras, abrir, cerrar, registrarVerEnTv],
  );

  /* «Ver en Fotos» del aviso de «Analizar»: el mosaico se minimiza (no se
     corta) y el panel va a Cámaras → Fotos, esté en la pestaña que esté. */
  const verFotos = useCallback(() => {
    setMinimizado(true);
    navegarEnElPanel(FOTOS_DE_CAMARAS);
  }, []);

  return (
    <Ctx.Provider value={valor}>
      {children}
      {camaras && (
        <MosaicoNube
          camaras={camaras}
          minimizado={minimizado}
          onMinimizar={() => setMinimizado(true)}
          onExpandir={() => setMinimizado(false)}
          onCerrar={cerrar}
          onVerFotos={verFotos}
          onVerEnTv={
            verEnTv
              ? () => {
                  cerrar();
                  verEnTv();
                }
              : undefined
          }
        />
      )}
    </Ctx.Provider>
  );
}
