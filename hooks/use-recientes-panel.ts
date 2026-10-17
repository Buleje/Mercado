"use client";

/**
 * Recientes del panel (M06): `useRegistrarRecientes` anota cada lugar al que
 * llegas (un solo montaje, en la cabecera) y `useRecientes` los lee (el menú
 * del reloj y el buscador). Se guardan por persona y negocio en este navegador
 * (`useClaveDeUsuario`), con try/catch: sin espacio o en modo privado no se
 * anota y nada se rompe.
 *
 * Cómo se entera de que cambió la URL sin volver a parchear `history`
 * (NavProgress ya lo hace): `popstate` (lo dispara `irAEnlace`), la pestaña
 * que se activa (`admin-tab-activated`) y un vistazo a `location` cada segundo
 * con la pestaña visible (comparar dos textos: no pide nada al servidor). Se
 * anota cuando la URL se queda quieta 0,9 s: un cambio de módulo escribe la
 * vista y la sección en varios pasos.
 */

import { useCallback, useEffect, useState } from "react";
import { ALL_TABS } from "@/app/admin/_lib/tab-data";
import { intervaloVisible } from "@/lib/client-cache-fetch";
import {
  entradaDeUrl,
  leerRecientes,
  retitular,
  sumarReciente,
  type Reciente,
} from "@/lib/admin/recientes-panel";
import { escribirGuardado, leerGuardado, useClaveDeUsuario } from "@/hooks/use-clave-de-usuario";

const PREFIJO = "admin-recientes";
/** Avisa a los que leen (menú y buscador) que la lista cambió en esta pestaña. */
const EVENTO = "admin:recientes";

const ROTULOS = new Map<string, string>(ALL_TABS.map((t) => [t.id as string, t.label]));
const etiquetaTab = (tab: string) => ROTULOS.get(tab) ?? null;

/** El título de la ventana de arriba (la ficha), si hay una abierta. */
function tituloDeLaVentana(): string | null {
  const ventanas = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(
    (d) => d.offsetParent !== null || d.getClientRects().length > 0,
  );
  const arriba = ventanas[ventanas.length - 1];
  if (!arriba) return null;
  const idTitulo = arriba.getAttribute("aria-labelledby");
  const titulo = idTitulo ? document.getElementById(idTitulo.split(" ")[0])?.textContent : null;
  return titulo ?? arriba.getAttribute("aria-label") ?? arriba.querySelector("h1, h2, h3")?.textContent ?? null;
}

function escribir(clave: string, cambio: (lista: Reciente[]) => Reciente[]) {
  const nueva = cambio(leerRecientes(leerGuardado(clave)));
  if (escribirGuardado(clave, nueva)) window.dispatchEvent(new CustomEvent(EVENTO));
}

/** Anota los lugares a los que llegas. Montar UNA vez (la cabecera del panel). */
export function useRegistrarRecientes(): void {
  const clave = useClaveDeUsuario(PREFIJO);
  useEffect(() => {
    if (!clave) return;
    let ultima = "";
    let quieta: ReturnType<typeof setTimeout> | undefined;
    let titulo: ReturnType<typeof setTimeout> | undefined;

    const anotar = () => {
      const entrada = entradaDeUrl(window.location.pathname + window.location.search, etiquetaTab, null);
      if (!entrada) return;
      escribir(clave, (lista) => sumarReciente(lista, entrada));
      if (!entrada.tipo) return;
      /* La ficha tarda en traer su nombre: se lee la ventana un rato después. */
      titulo = setTimeout(() => {
        const visto = tituloDeLaVentana();
        if (visto) escribir(clave, (lista) => retitular(lista, entrada.href, visto));
      }, 1500);
    };
    const revisar = () => {
      const ahora = window.location.pathname + window.location.search;
      if (ahora === ultima) return;
      ultima = ahora;
      clearTimeout(quieta);
      clearTimeout(titulo);
      quieta = setTimeout(anotar, 900);
    };

    revisar();
    window.addEventListener("popstate", revisar);
    window.addEventListener("admin-tab-activated", revisar);
    const parar = intervaloVisible(revisar, 1000);
    return () => {
      window.removeEventListener("popstate", revisar);
      window.removeEventListener("admin-tab-activated", revisar);
      parar();
      clearTimeout(quieta);
      clearTimeout(titulo);
    };
  }, [clave]);
}

/** Los recientes de esta persona (más nuevo primero) y cómo borrarlos. */
export function useRecientes(): { recientes: Reciente[]; listo: boolean; borrar: () => void } {
  const clave = useClaveDeUsuario(PREFIJO);
  const [recientes, setRecientes] = useState<Reciente[]>([]);
  useEffect(() => {
    if (!clave) return;
    const leer = () => setRecientes(leerRecientes(leerGuardado(clave)));
    const otraPestana = (e: StorageEvent) => {
      if (e.key === clave) leer();
    };
    leer();
    window.addEventListener(EVENTO, leer);
    window.addEventListener("storage", otraPestana);
    return () => {
      window.removeEventListener(EVENTO, leer);
      window.removeEventListener("storage", otraPestana);
    };
  }, [clave]);
  const borrar = useCallback(() => {
    if (!clave) return;
    escribir(clave, () => []);
  }, [clave]);
  return { recientes, listo: clave !== null, borrar };
}
