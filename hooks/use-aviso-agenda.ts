"use client";

/**
 * use-aviso-agenda — la configuración del aviso en pantalla de la agenda
 * (`lib/agenda/aviso-pantalla.ts`) de ESTA persona, y su reloj.
 *
 * La configuración pinta ya desde el navegador y se guarda también en el
 * servidor (`aviso-agenda` de `/api/admin/preferences/panel`): te sigue a otra
 * computadora o al celular. El reloj (cuándo toca el próximo, «no más por
 * hoy») es de este navegador y lo comparten sus pestañas por `localStorage`:
 * dos pestañas del panel no avisan dos veces.
 *
 * La usan dos lados a la vez (el que avisa, montado en todo el panel, y la
 * ventana de configuración): un cambio se reparte por un evento de la ventana
 * y, a las otras pestañas, por `storage`.
 */
import { useCallback, useEffect, useState } from "react";
import { escribirGuardado, leerGuardado, useClaveDeUsuario } from "@/hooks/use-clave-de-usuario";
import { leerDelServidor, subirAlServidor } from "@/lib/admin/guardado-servidor";
import {
  AVISO_POR_DEFECTO,
  RELOJ_INICIAL,
  normalizarAviso,
  normalizarReloj,
  type AvisoPantalla,
  type RelojAviso,
} from "@/lib/agenda/aviso-pantalla";

const PREFIJO = "aviso-agenda";
const EN_SERVIDOR = "aviso-agenda";
const EVENTO_CONFIG = "agenda-aviso:config";
const EVENTO_ABRIR = "agenda-aviso:abrir";

/** Abre el aviso ya («Probar ahora», «Ver el aviso»): lo escucha `AvisoAgendaProgramado`. */
export function abrirAvisoAgenda(): void {
  window.dispatchEvent(new Event(EVENTO_ABRIR));
}

export function alPedirAbrirAviso(fn: () => void): () => void {
  window.addEventListener(EVENTO_ABRIR, fn);
  return () => window.removeEventListener(EVENTO_ABRIR, fn);
}

function json(texto: string | null): unknown {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

export interface ConfigAviso {
  config: AvisoPantalla;
  /** Ya se sabe quién es: hay dónde leer y guardar. */
  listo: boolean;
  guardar: (c: AvisoPantalla) => void;
  /** Lee siempre lo último: otra pestaña pudo moverlo. */
  leerReloj: () => RelojAviso;
  escribirReloj: (r: RelojAviso) => void;
}

export function useConfigAviso(): ConfigAviso {
  const clave = useClaveDeUsuario(PREFIJO);
  const [config, setConfig] = useState<AvisoPantalla>(AVISO_POR_DEFECTO);

  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    const local = json(leerGuardado(clave));
    setConfig(normalizarAviso(local));
    const quien = clave.slice(PREFIJO.length + 1);
    void leerDelServidor(quien, EN_SERVIDOR).then((valor) => {
      if (!vivo || valor === undefined) return;
      /* Nunca la guardó en el servidor: sube la de este navegador, si tiene. */
      if (valor === null) {
        if (local) subirAlServidor(quien, EN_SERVIDOR, [normalizarAviso(local)]);
        return;
      }
      const c = normalizarAviso(valor[0]);
      escribirGuardado(clave, c);
      setConfig(c);
    });
    const alCambiar = (e: Event) => {
      const d = (e as CustomEvent<{ clave: string; config: AvisoPantalla }>).detail;
      if (d?.clave === clave) setConfig(d.config);
    };
    const alCambiarOtraPestana = (e: StorageEvent) => {
      if (e.key === clave) setConfig(normalizarAviso(json(e.newValue)));
    };
    window.addEventListener(EVENTO_CONFIG, alCambiar);
    window.addEventListener("storage", alCambiarOtraPestana);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_CONFIG, alCambiar);
      window.removeEventListener("storage", alCambiarOtraPestana);
    };
  }, [clave]);

  const guardar = useCallback(
    (c: AvisoPantalla) => {
      if (!clave) return;
      escribirGuardado(clave, c);
      subirAlServidor(clave.slice(PREFIJO.length + 1), EN_SERVIDOR, [c]);
      window.dispatchEvent(new CustomEvent(EVENTO_CONFIG, { detail: { clave, config: c } }));
    },
    [clave],
  );

  /* `aviso-agenda-reloj:<negocio>:<usuario>`: el reloj de la misma persona. */
  const claveReloj = clave ? `${PREFIJO}-reloj${clave.slice(PREFIJO.length)}` : null;
  const leerReloj = useCallback(
    () => (claveReloj ? normalizarReloj(json(leerGuardado(claveReloj))) : RELOJ_INICIAL),
    [claveReloj],
  );
  const escribirReloj = useCallback(
    (r: RelojAviso) => {
      if (claveReloj) escribirGuardado(claveReloj, r);
    },
    [claveReloj],
  );

  return { config, listo: !!clave, guardar, leerReloj, escribirReloj };
}
