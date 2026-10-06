"use client";

/**
 * La cuenta de Hik-Connect for Teams compartida por toda la pantalla de
 * Cámaras (ADR-471): «Vincular» la cambia y los botones «En vivo» de Fotos y de
 * Cámaras la leen para saber si abren el visor del panel o la app. El visor
 * vive acá, uno solo, encima de la vista que sea; el mosaico «Ver todas en
 * vivo» también, y abrir uno cierra el otro (nunca dos videos de la misma
 * cámara a la vez).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useHikConnect, type HikConnect } from "./use-hik-connect";
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

export function VisorNubeProvider({ children }: { children: ReactNode }) {
  const hik = useHikConnect();
  const { cargar, estado } = hik;
  const [abierta, setAbierta] = useState<CamaraAbierta | null>(null);
  const [mosaico, setMosaico] = useState<readonly CamaraAbierta[] | null>(null);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enlazada = useCallback(
    (camaraId: string) => !!estado?.vinculado && !!estado.enlaces[camaraId],
    [estado],
  );
  const abrir = useCallback((id: string, nombre: string) => {
    setMosaico(null);
    setAbierta({ id, nombre });
  }, []);
  const abrirMosaico = useCallback((camaras: readonly CamaraAbierta[]) => {
    setAbierta(null);
    setMosaico(camaras);
  }, []);
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
        />
      )}
      {mosaico && (
        <MosaicoNube
          camaras={mosaico.map((c) => ({ ...c, conCodigo: conCodigo(c.id) }))}
          onCerrar={() => setMosaico(null)}
          onVerFotos={verFotos}
        />
      )}
    </Ctx.Provider>
  );
}
