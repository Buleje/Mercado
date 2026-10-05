"use client";

/**
 * La cuenta de Hik-Connect for Teams compartida por toda la pantalla de
 * Cámaras (ADR-471): «Vincular» la cambia y los botones «En vivo» de Fotos y de
 * Cámaras la leen para saber si abren el visor del panel o la app. El visor
 * vive acá, uno solo, encima de la vista que sea.
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
import VisorNube from "./VisorNube";

interface ValorVisorNube {
  hik: HikConnect;
  /** ¿Esta cámara del sistema está enlazada con una de Hikvision? */
  enlazada: (camaraId: string) => boolean;
  abrir: (camaraId: string, nombre: string) => void;
}

const Ctx = createContext<ValorVisorNube | null>(null);

/** `null` fuera de la pantalla de Cámaras: el botón sigue abriendo la app. */
export const useVisorNubeContexto = () => useContext(Ctx);

export function VisorNubeProvider({ children }: { children: ReactNode }) {
  const hik = useHikConnect();
  const { cargar, estado } = hik;
  const [abierta, setAbierta] = useState<{ id: string; nombre: string } | null>(null);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enlazada = useCallback(
    (camaraId: string) => !!estado?.vinculado && !!estado.enlaces[camaraId],
    [estado],
  );
  const abrir = useCallback((id: string, nombre: string) => setAbierta({ id, nombre }), []);
  const valor = useMemo(() => ({ hik, enlazada, abrir }), [hik, enlazada, abrir]);

  return (
    <Ctx.Provider value={valor}>
      {children}
      {abierta && (
        <VisorNube
          key={abierta.id}
          camaraId={abierta.id}
          nombre={abierta.nombre}
          conCodigo={!!estado?.enlaces[abierta.id]?.conCodigo}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </Ctx.Provider>
  );
}
