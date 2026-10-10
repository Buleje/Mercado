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
 *
 * «Marcar con foto» (2026-10-09): cada cuadro del mosaico anota acá cómo sacar
 * el cuadro que muestra (`conCuadro` + `tomarCuadro`), y la hoja de asistencia
 * —que vive dentro de este proveedor— lo usa al marcar a alguien presente.
 * Sirve también minimizado: los videos siguen montados en la burbuja.
 */

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CamaraMosaico } from "./MosaicoNubeCuadro";
import { navegarEnElPanel } from "./navegar-panel";
import { comoImagen, type TomarCuadro } from "./use-personas-mosaico";

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
  /** Las cámaras del mosaico que pueden dar su cuadro (abierto o en la burbuja). */
  conCuadro: readonly { id: string; nombre: string }[];
  /** El cuadro que muestra ahora esa cámara, o `null` si no hay video. */
  tomarCuadro: (camaraId: string) => Promise<Blob | null>;
}

const Ctx = createContext<ValorMosaicoGlobal | null>(null);

/** `null` fuera del panel (Modo TV, tests): el mosaico vuelve a ser un modal de la pantalla. */
export const useMosaicoGlobal = () => useContext(Ctx);

const FOTOS_DE_CAMARAS = "/admin?tab=camaras&vista=fotos#camaras";

export function MosaicoGlobalProvider({ children }: { children: ReactNode }) {
  const [camaras, setCamaras] = useState<readonly CamaraMosaico[] | null>(null);
  const [minimizado, setMinimizado] = useState(false);
  const [verEnTv, setVerEnTv] = useState<(() => void) | null>(null);
  const tomadores = useRef(new Map<string, TomarCuadro>());
  const [idsConCuadro, setIdsConCuadro] = useState<readonly string[]>([]);

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

  /** Lo llama cada cuadro al montarse (y con `null` al irse). */
  const registrarCuadro = useCallback((id: string, tomar: TomarCuadro | null) => {
    if (tomar) tomadores.current.set(id, tomar);
    else tomadores.current.delete(id);
    const ids = [...tomadores.current.keys()];
    setIdsConCuadro((prev) => (prev.length === ids.length && prev.every((x, i) => x === ids[i]) ? prev : ids));
  }, []);
  const tomarCuadro = useCallback(async (id: string) => {
    const tomar = tomadores.current.get(id);
    const b64 = tomar ? await tomar() : null;
    if (!b64) return null;
    return (await fetch(comoImagen(b64))).blob();
  }, []);
  const conCuadro = useMemo(
    () => (camaras ?? []).filter((c) => idsConCuadro.includes(c.id)).map(({ id, nombre }) => ({ id, nombre })),
    [camaras, idsConCuadro],
  );

  const valor = useMemo(
    () => ({ abierto: camaras !== null, abrir, cerrar, registrarVerEnTv, conCuadro, tomarCuadro }),
    [camaras, abrir, cerrar, registrarVerEnTv, conCuadro, tomarCuadro],
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
          onCuadro={registrarCuadro}
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
