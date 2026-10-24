"use client";

/**
 * Cabecera compacta (Brandon 18-10, superadmin: «llevando el título y las
 * pestañas a su lado»). El layout del superadmin la enciende y todo
 * `AdminTabShell` de adentro dibuja la banda de UNA fila (`CabeceraConPestanas`):
 * sin el rótulo de arriba (su texto pasa al ⓘ) y con las pestañas al lado.
 * Fuera del proveedor (el panel admin) el valor es `false` y nada cambia.
 *
 * `PestanasDelModulo`: cuando la cabecera la dibuja un componente de cliente
 * (con varios `AdminTabShell`: cargando, error, vacío, lleno), la página de
 * servidor le pasa las pestañas por acá sin tocar sus props. El primer
 * `AdminTabShell` que las usa las corta para sus hijos: un shell anidado no
 * las repite.
 */
import { createContext, useContext, type ReactNode } from "react";

const CabeceraCompactaContext = createContext(false);
const PestanasContext = createContext<ReactNode>(null);

export function CabeceraCompactaProvider({ children }: { children: ReactNode }) {
  return <CabeceraCompactaContext.Provider value>{children}</CabeceraCompactaContext.Provider>;
}

export function useCabeceraCompacta(): boolean {
  return useContext(CabeceraCompactaContext);
}

export function PestanasDelModulo({ pestanas, children }: { pestanas: ReactNode; children: ReactNode }) {
  return <PestanasContext.Provider value={pestanas}>{children}</PestanasContext.Provider>;
}

export function usePestanasDelModulo(): ReactNode {
  return useContext(PestanasContext);
}
