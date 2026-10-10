"use client";

/**
 * La cuenta de Hik-Connect for Teams compartida por toda la pantalla de
 * Cámaras (ADR-471): «Vincular» la cambia y los botones «En vivo» de Fotos y de
 * Cámaras la leen para saber si abren el visor del panel o la app. El visor
 * vive acá, uno solo, encima de la vista que sea; el mosaico «Ver todas en
 * vivo» también, y abrir uno cierra el otro (nunca dos videos de la misma
 * cámara a la vez).
 *
 * Dentro del panel, el mosaico NO vive acá sino en `MosaicoGlobalProvider`
 * (2026-10-07): se puede minimizar a una burbuja y sigue vivo al cambiar de
 * pestaña. Este proveedor sólo le pasa las cámaras; el mosaico local queda
 * para cuando no hay panel alrededor.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useHikConnect, type HikConnect } from "./use-hik-connect";
import { useMosaicoGlobal } from "./MosaicoGlobalContexto";
import MosaicoNube from "./MosaicoNube";
import VisorNube from "./VisorNube";

type CamaraAbierta = { id: string; nombre: string };

interface ValorVisorNube {
  hik: HikConnect;
  /** ¿Esta cámara del sistema está enlazada con una de Hikvision? */
  enlazada: (camaraId: string) => boolean;
  abrir: (camaraId: string, nombre: string) => void;
  /** «Ver todas en vivo»: las enlazadas, en el orden de la lista. */
  abrirMosaico: (camaras: readonly CamaraAbierta[]) => void;
}

/**
 * «Ver en Fotos» desde el aviso de «Analizar»: la vista vive en
 * `useVistaModulo` de la pantalla; se cambia la URL y se avisa por `popstate`,
 * como `irAlArbolEnElMapa`.
 */
function irAFotos() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("vista") === "fotos") return;
  url.searchParams.set("vista", "fotos");
  window.history.pushState(null, "", url.toString());
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const Ctx = createContext<ValorVisorNube | null>(null);

/** `null` fuera de la pantalla de Cámaras: el botón sigue abriendo la app. */
export const useVisorNubeContexto = () => useContext(Ctx);

export function VisorNubeProvider({
  children,
  onVerEnTv,
}: {
  children: ReactNode;
  /** «Verlo en el televisor» del visor y del mosaico: cierra el video y abre «Ver en otra pantalla». */
  onVerEnTv?: () => void;
}) {
  const hik = useHikConnect();
  const { cargar, estado } = hik;
  const global = useMosaicoGlobal();
  const [abierta, setAbierta] = useState<CamaraAbierta | null>(null);
  const [mosaico, setMosaico] = useState<readonly CamaraAbierta[] | null>(null);

  /* «Verlo en el televisor» del mosaico global: sólo mientras esta pantalla
     está montada (su modal vive acá). Un ref: `onVerEnTv` llega inline. */
  const verEnTvRef = useRef(onVerEnTv);
  useEffect(() => {
    verEnTvRef.current = onVerEnTv;
  });
  const hayVerEnTv = !!onVerEnTv;
  const registrarVerEnTv = global?.registrarVerEnTv;
  useEffect(() => {
    if (!registrarVerEnTv || !hayVerEnTv) return;
    return registrarVerEnTv(() => verEnTvRef.current?.());
  }, [registrarVerEnTv, hayVerEnTv]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enlazada = useCallback(
    (camaraId: string) => !!estado?.vinculado && !!estado.enlaces[camaraId],
    [estado],
  );
  const cerrarGlobal = global?.cerrar;
  const abrirGlobal = global?.abrir;
  const abrir = useCallback(
    (id: string, nombre: string) => {
      setMosaico(null);
      cerrarGlobal?.();
      setAbierta({ id, nombre });
    },
    [cerrarGlobal],
  );
  const abrirMosaico = useCallback(
    (camaras: readonly CamaraAbierta[]) => {
      setAbierta(null);
      if (!abrirGlobal) {
        setMosaico(camaras);
        return;
      }
      const enlaces = estado?.enlaces ?? {};
      abrirGlobal(camaras.map((c) => ({ ...c, conCodigo: !!enlaces[c.id]?.conCodigo })));
    },
    [abrirGlobal, estado],
  );
  const verFotos = useCallback(() => {
    setAbierta(null);
    setMosaico(null);
    irAFotos();
  }, []);
  const valor = useMemo(
    () => ({ hik, enlazada, abrir, abrirMosaico }),
    [hik, enlazada, abrir, abrirMosaico],
  );
  const conCodigo = (id: string) => !!estado?.enlaces[id]?.conCodigo;
  /* Nunca dos modales de video a la vez: se cierra el visor antes de abrir el otro. */
  const verEnTv = onVerEnTv
    ? () => {
        setAbierta(null);
        setMosaico(null);
        onVerEnTv();
      }
    : undefined;

  return (
    <Ctx.Provider value={valor}>
      {children}
      {abierta && (
        <VisorNube
          key={abierta.id}
          camaraId={abierta.id}
          nombre={abierta.nombre}
          conCodigo={conCodigo(abierta.id)}
          onCerrar={() => setAbierta(null)}
          onVerFotos={verFotos}
          onVerEnTv={verEnTv}
        />
      )}
      {mosaico && (
        <MosaicoNube
          camaras={mosaico.map((c) => ({ ...c, conCodigo: conCodigo(c.id) }))}
          onCerrar={() => setMosaico(null)}
          onVerFotos={verFotos}
          onVerEnTv={verEnTv}
        />
      )}
    </Ctx.Provider>
  );
}
