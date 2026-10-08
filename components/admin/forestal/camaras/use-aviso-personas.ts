"use client";

/**
 * El aviso «apareció alguien» del mosaico (Brandon 2026-10-08: «que detecte…
 * y avise»): un mensaje abajo a la derecha y un pitido de dos tonos.
 *
 * Vive en el MOSAICO, no en cada cuadro: minimizado en la burbuja el mosaico
 * sigue montado (invisible), así que el aviso suena igual, y el tope de UN
 * aviso por cámara cada 20 s es uno solo para todas. Por qué 20 s: el
 * detector avisa cada vez que un cuadro pasa de «nadie» a «alguien»; alguien
 * que entra y sale del borde del cuadro haría sonar el pitido cada dos
 * segundos, y en una hora nadie le haría caso.
 *
 * El cuadro, por su lado (`useAparicionReciente`), se resalta mientras la
 * aparición es nueva (`PERSONA_NUEVA_MS`) y le pasa la aparición al mosaico.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { PERSONA_NUEVA_MS, type AparicionPersona } from "@/lib/camaras/vigia";
import { pitidoAviso, prepararPitido } from "@/lib/forestal/pitido";

export const AVISO_POR_CAMARA_CADA_MS = 20_000;

/** «Apareció 1 persona en Patio de trozas» / «Aparecieron 2 personas en …». */
export function textoAparicion(a: AparicionPersona): string {
  const n = Math.max(1, Math.round(a.personas));
  return n === 1 ? `Apareció 1 persona en ${a.nombre}` : `Aparecieron ${n} personas en ${a.nombre}`;
}

export interface AvisoPersonas {
  /** «Aviso con sonido» (recordado; prendido por defecto). */
  sonido: boolean;
  cambiarSonido: (v: boolean) => void;
  /** Lo que cada cuadro llama al ver gente nueva (estable entre renders). */
  avisar: (a: AparicionPersona) => void;
}

/**
 * @param onVer «Ver» dentro del mensaje: sólo con el mosaico minimizado (lo
 *   expande). Se lee al avisar, no al crear `avisar`, para que éste no cambie.
 */
export function useAvisoPersonas(onVer?: () => void): AvisoPersonas {
  const [sonido, setSonido] = useLocalStorage<boolean>("camaras-mosaico:aviso-sonido", true);
  const ultimo = useRef(new Map<string, number>());
  const sonidoRef = useRef(sonido);
  const verRef = useRef(onVer);
  useEffect(() => {
    sonidoRef.current = sonido;
    verRef.current = onVer;
  });

  const avisar = useCallback((a: AparicionPersona) => {
    const antes = ultimo.current.get(a.camaraId);
    if (antes !== undefined && a.at - antes < AVISO_POR_CAMARA_CADA_MS) return;
    ultimo.current.set(a.camaraId, a.at);
    const ver = verRef.current;
    toast.warning(textoAparicion(a), {
      /* Uno por cámara: el siguiente de la misma cámara reemplaza al anterior. */
      id: `persona-en-vivo-${a.camaraId}`,
      duration: 8_000,
      action: ver ? { label: "Ver", onClick: ver } : undefined,
    });
    if (sonidoRef.current) pitidoAviso();
  }, []);

  const cambiarSonido = useCallback(
    (v: boolean) => {
      setSonido(v);
      /* Es un toque (gesto): despierta el audio y suena una vez de muestra. */
      if (v) {
        prepararPitido();
        pitidoAviso();
      }
    },
    [setSonido],
  );

  return { sonido, cambiarSonido, avisar };
}

/**
 * Del lado del cuadro: avisa al mosaico UNA vez por aparición (por su `at`) y
 * dice si sigue siendo reciente, para el anillo coral. Una aparición vieja
 * (montar el cuadro con una de hace rato) ni resalta ni avisa.
 */
export function useAparicionReciente(
  aparicion: AparicionPersona | null,
  onAparicion?: (a: AparicionPersona) => void,
): boolean {
  const [hasta, setHasta] = useState(0);
  const ultimoAt = useRef(0);

  useEffect(() => {
    if (!aparicion || aparicion.at === ultimoAt.current) return;
    ultimoAt.current = aparicion.at;
    const fin = aparicion.at + PERSONA_NUEVA_MS;
    if (fin <= Date.now()) return;
    onAparicion?.(aparicion);
    setHasta(fin);
  }, [aparicion, onAparicion]);

  /* El reloj aparte: si cambiara `onAparicion`, la limpieza del efecto de arriba lo cortaba y el anillo quedaba pegado. */
  useEffect(() => {
    if (!hasta) return;
    const t = setTimeout(() => setHasta(0), Math.max(0, hasta - Date.now()));
    return () => clearTimeout(t);
  }, [hasta]);

  return hasta > 0;
}
