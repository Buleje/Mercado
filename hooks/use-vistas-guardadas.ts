"use client";

/**
 * `useVistasGuardadas` — las vistas guardadas de UNA pantalla (M07): las del
 * sistema, las tuyas (por persona y negocio, en este navegador) y cuál se ve
 * ahora. La pantalla dice qué es su estado (`estado`) y cómo ponerlo
 * (`aplicar`); el menú es `components/admin/shared/MenuVistasGuardadas`.
 * Se guardan también en el servidor (`lib/admin/guardado-servidor`): en otra
 * computadora aparecen igual; el navegador queda de caché para pintar ya.
 * Reglas (nombre, tope, reemplazo): `lib/admin/vistas-guardadas.ts`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { escribirGuardado, leerGuardado, useClaveDeUsuario } from "@/hooks/use-clave-de-usuario";
import { leerDelServidor, subirAlServidor } from "@/lib/admin/guardado-servidor";
import {
  borrarVista,
  firmaEstable,
  guardarVista,
  leerVistas,
  vistaActual,
  type VistaDelSistema,
  type VistaGuardada,
} from "@/lib/admin/vistas-guardadas";

export interface OpcionesVistas<T> {
  /** Única por pantalla: `vistas:<modulo>` en localStorage y en el servidor (letras, números, `.` `_` `-`; hasta 48). */
  modulo: string;
  /** Lo que se ve ahora. */
  estado: T;
  aplicar: (estado: T) => void;
  /** Las del sistema; la PRIMERA es la estándar. */
  sistema: readonly VistaDelSistema<T>[];
  valida: (estado: unknown) => estado is T;
  /** Cuándo dos estados son la misma vista (por defecto, el JSON con claves en orden). */
  firma?: (estado: T) => string;
}

export interface VistasGuardadas<T> {
  sistema: readonly VistaDelSistema<T>[];
  guardadas: VistaGuardada<T>[];
  /** La que coincide con lo que se ve; `null` = puesto a mano. */
  actual: { id: string; nombre: string } | null;
  /** Lo que se ve es la estándar. */
  esEstandar: boolean;
  aplicar: (v: { estado: T }) => void;
  /** `null` si se guardó; si no, por qué no. */
  guardar: (nombre: string) => string | null;
  borrar: (id: string) => void;
  /** Se sabe quién es y hay dónde guardar. */
  listo: boolean;
}

export function useVistasGuardadas<T>(o: OpcionesVistas<T>): VistasGuardadas<T> {
  const prefijo = `vistas:${o.modulo}`;
  const clave = useClaveDeUsuario(prefijo);
  const [guardadas, setGuardadas] = useState<VistaGuardada<T>[]>([]);
  const validaRef = useRef(o.valida);
  validaRef.current = o.valida;
  /** Guardaste o borraste antes de que respondiera el servidor: lo tuyo manda. */
  const tocado = useRef(false);

  useEffect(() => {
    if (!clave) {
      setGuardadas([]);
      return;
    }
    let vivo = true;
    const leer = () => setGuardadas(leerVistas(leerGuardado(clave), validaRef.current));
    /* Guardada en otra pestaña del mismo navegador: aparece acá también. */
    const otraPestana = (e: StorageEvent) => {
      if (e.key === clave) leer();
    };
    leer();
    /* Lo del servidor manda (pudiste guardarla en otra computadora); si nunca
       guardaste ahí, sube lo de este navegador. Sin servidor, queda lo local. */
    const quien = clave.slice(prefijo.length + 1);
    void leerDelServidor(quien, prefijo).then((valor) => {
      if (!vivo || valor === undefined || tocado.current) return;
      if (valor === null) {
        const locales = leerVistas(leerGuardado(clave), validaRef.current);
        if (locales.length > 0) subirAlServidor(quien, prefijo, locales);
        return;
      }
      const lista = leerVistas(JSON.stringify(valor), validaRef.current);
      escribirGuardado(clave, lista);
      setGuardadas(lista);
    });
    window.addEventListener("storage", otraPestana);
    return () => {
      vivo = false;
      window.removeEventListener("storage", otraPestana);
    };
  }, [clave, prefijo]);

  const persistir = useCallback(
    (lista: VistaGuardada<T>[]) => {
      if (!clave) return false;
      /* Sin espacio en el navegador igual queda en el servidor. */
      escribirGuardado(clave, lista);
      tocado.current = true;
      subirAlServidor(clave.slice(prefijo.length + 1), prefijo, lista);
      setGuardadas(lista);
      return true;
    },
    [clave, prefijo],
  );

  const { estado, sistema, aplicar: aplicarEstado } = o;
  const guardar = useCallback(
    (nombre: string) => {
      const r = guardarVista(guardadas, nombre, estado, sistema);
      if (r.error !== null) return r.error;
      return persistir(r.lista) ? null : "Todavía no se sabe quién eres: espera un segundo e inténtalo otra vez";
    },
    [guardadas, estado, sistema, persistir],
  );
  const borrar = useCallback((id: string) => void persistir(borrarVista(guardadas, id)), [guardadas, persistir]);
  const aplicar = useCallback((v: { estado: T }) => aplicarEstado(v.estado), [aplicarEstado]);

  const actual = vistaActual(sistema, guardadas, estado, o.firma ?? firmaEstable);
  return {
    sistema,
    guardadas,
    actual,
    esEstandar: actual !== null && actual.id === sistema[0]?.id,
    aplicar,
    guardar,
    borrar,
    listo: Boolean(clave),
  };
}
