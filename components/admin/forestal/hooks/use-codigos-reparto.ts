/**
 * El registro de códigos del reparto de rolliza («1-03»). Ver `lib/forestal/reparto-codigos.ts`.
 *
 * Con `reparto`, el registro es el del NEGOCIO en el servidor (oficina y monte
 * ven los mismos códigos, Brandon 2026-10-19): los códigos nuevos salen de sus
 * contadores y se encolan; si dos dispositivos dieron el mismo a la vez, el
 * servidor le da otro al segundo (`fusionarRegistros`). El navegador guarda
 * una copia para pintar al instante y para trabajar sin señal.
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
import type { RepartoServidor } from "./use-reparto-servidor";

const almacen = (): Storage | null => (typeof window === "undefined" ? null : window.localStorage);

export function useCodigosReparto(
  clave: string,
  ordenBloques: readonly string[],
  lineas: readonly LineaConBloque[],
  reparto?: RepartoServidor,
) {
  /* La clave va con lo leído: si cambiara, lo de la otra hoja no se escribe en ésta. */
  const [leido, setLeido] = useState<{ clave: string; r: RegistroCodigos } | null>(null);
  useEffect(() => {
    setLeido({ clave, r: leerRegistro(almacen(), clave) });
  }, [clave]);
  const remoto = reparto?.estado?.codigos ?? null;
  const local = leido?.clave === clave ? leido.r : null;
  const base = remoto ?? local;

  const registro = useMemo(() => (base ? asignarCodigos(base, ordenBloques, lineas) : null), [base, ordenBloques, lineas]);

  /* Lo del servidor queda de copia en el navegador. */
  useEffect(() => {
    if (remoto) guardarRegistro(almacen(), clave, remoto);
  }, [remoto, clave]);

  const encolar = reparto?.encolar;
  useEffect(() => {
    if (!base || !registro || registro === base) return;
    guardarRegistro(almacen(), clave, registro);
    /* Sin servidor todavía (cargando o sin señal): se sigue en local y la cola
       lo sube después. Con servidor, la cola actualiza `remoto` y se corta solo. */
    if (!remoto) setLeido({ clave, r: registro });
    encolar?.({ codigos: registro });
  }, [base, registro, remoto, clave, encolar]);

  const codigoDe = useCallback((k: string): string | null => registro?.lineas[k] ?? null, [registro]);
  const numeroDe = useCallback((bloqueId: string): number | undefined => registro?.bloques[bloqueId], [registro]);
  return { registro, codigoDe, numeroDe };
}
