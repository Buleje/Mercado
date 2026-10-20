/**
 * El registro de códigos del reparto de rolliza («1-03»), guardado en el
 * navegador junto a las casillas que identifica. Ver `lib/forestal/reparto-codigos.ts`.
 *
 * Lee una vez al montar y SÓLO después escribe: si guardara antes de leer,
 * pisaría los códigos ya dados con unos nuevos y dejarían de ser estables.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  asignarCodigos,
  guardarRegistro,
  leerRegistro,
  type LineaConBloque,
  type RegistroCodigos,
} from "@/lib/forestal/reparto-codigos";

const almacen = (): Storage | null => (typeof window === "undefined" ? null : window.localStorage);

export function useCodigosReparto(clave: string, ordenBloques: readonly string[], lineas: readonly LineaConBloque[]) {
  /* La clave va con lo leído: si cambiara, lo de la otra hoja no se escribe en ésta. */
  const [leido, setLeido] = useState<{ clave: string; r: RegistroCodigos } | null>(null);
  useEffect(() => {
    setLeido({ clave, r: leerRegistro(almacen(), clave) });
  }, [clave]);
  const base = leido?.clave === clave ? leido.r : null;

  const registro = useMemo(() => (base ? asignarCodigos(base, ordenBloques, lineas) : null), [base, ordenBloques, lineas]);

  useEffect(() => {
    if (!base || !registro || registro === base) return;
    guardarRegistro(almacen(), clave, registro);
    setLeido({ clave, r: registro });
  }, [base, registro, clave]);

  const codigoDe = useCallback((k: string): string | null => registro?.lineas[k] ?? null, [registro]);
  const numeroDe = useCallback((bloqueId: string): number | undefined => registro?.bloques[bloqueId], [registro]);
  return { registro, codigoDe, numeroDe };
}
