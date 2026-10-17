"use client";

/**
 * Recientes del panel (M06): `useRegistrarRecientes` anota cada lugar al que
 * llegas (un solo montaje, en la cabecera) y `useRecientes` los lee (el menú
 * del reloj y el buscador). Se guardan por persona y negocio en este navegador
 * (`useClaveDeUsuario`), con try/catch: sin espacio o en modo privado no se
 * anota y nada se rompe. También suben al servidor unos segundos después
 * (`lib/admin/guardado-servidor`): al entrar desde otra computadora se juntan
 * los de las dos, sin repetir.
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
  unirRecientes,
  type Reciente,
} from "@/lib/admin/recientes-panel";
import { escribirGuardado, leerGuardado, useClaveDeUsuario } from "@/hooks/use-clave-de-usuario";
import { leerDelServidor, subirAlServidor } from "@/lib/admin/guardado-servidor";

const PREFIJO = "admin-recientes";
/** Avisa a los que leen (menú y buscador) que la lista cambió en esta pestaña. */
const EVENTO = "admin:recientes";
/** Nombre en el servidor; sube cuando dejas de moverte un rato. */
const EN_SERVIDOR = "recientes";
const DEMORA_SUBIR = 4000;
const quienDe = (clave: string) => clave.slice(PREFIJO.length + 1);

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

function escribir(clave: string, cambio: (lista: Reciente[]) => Reciente[], demora = DEMORA_SUBIR) {
  const nueva = cambio(leerRecientes(leerGuardado(clave)));
  /* Sin navegador donde guardar no se sube: la lista partiría de cero y pisaría la del servidor. */
  if (!escribirGuardado(clave, nueva)) return;
  window.dispatchEvent(new CustomEvent(EVENTO));
  subirAlServidor(quienDe(clave), EN_SERVIDOR, nueva, demora);
}

/** Anota los lugares a los que llegas. Montar UNA vez (la cabecera del panel). */
export function useRegistrarRecientes(): void {
  const clave = useClaveDeUsuario(PREFIJO);
  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    /* Los de otra computadora se juntan con los de acá (una vez por carga). */
    void leerDelServidor(quienDe(clave), EN_SERVIDOR).then((valor) => {
      if (!vivo || valor === undefined) return;
      const delServidor = leerRecientes(JSON.stringify(valor ?? []));
      if (valor === null && leerRecientes(leerGuardado(clave)).length === 0) return;
      escribir(clave, (locales) => unirRecientes(locales, delServidor), 0);
    });
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
      vivo = false;
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
    escribir(clave, () => [], 0);
  }, [clave]);
  return { recientes, listo: clave !== null, borrar };
}
