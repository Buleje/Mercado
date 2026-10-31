import { createContext, useContext } from "react";

/**
 * Dónde va el panel de Esenciales (Brandon 23-10 y 24-10: «la barra lateral de
 * Esenciales, que abarque hasta el header con su espacio»). `DocumentosHubModule`
 * pasa acá la columna de la derecha del panel (`layout/columna-derecha.tsx`) y
 * Esenciales manda ahí su panel por portal. `undefined` = no hay columna
 * (Esenciales montado en otro lado): el panel va al costado de las tarjetas.
 */
const HuecoLateral = createContext<HTMLElement | null | undefined>(undefined);

export const ProveedorHuecoLateral = HuecoLateral.Provider;

export function useHuecoLateral(): HTMLElement | null | undefined {
  return useContext(HuecoLateral);
}

