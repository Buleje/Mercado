"use client";

/**
 * Lo que se dibuja dentro de un cuadro del TV, por tipo de visor. Son los
 * MISMOS hooks que los visores del panel (`use-visor-camara`, `use-visor-nube`,
 * `use-puente-pc`), con la base `/api/tv/camaras` que pone `ApiCamarasProvider`.
 * Sólo mirar: ni guardar foto, ni mover, ni micrófono, ni analizar.
 */

import { useEffect, useRef } from "react";
import { AlertTriangle, ImageOff, Loader2, Pause } from "@buleje/design-system/icons";
import { textoSenal } from "@/components/admin/forestal/camaras/puente-pc";
import { useCuadroPuente } from "@/components/admin/forestal/camaras/use-puente-pc";
import {
  useDisponibilidadDeVideo,
  useFotosEncadenadas,
  useReproductorHls,
} from "@/components/admin/forestal/camaras/use-visor-camara";
import { useVisorNube, type Calidad } from "@/components/admin/forestal/camaras/use-visor-nube";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BOTON_TV_CHICO } from "./tv-estilos";

/** El estado al pie del cuadro: «En vivo», «12:04:31», «Sin señal…». */
export type AlInformar = (estado: string, enVivo: boolean) => void;

const MEDIO = "h-full w-full object-contain";

/** Un mensaje encima del cuadro, grande y centrado. */
export function Cartel({ icono, texto }: { icono: "carga" | "error" | "pausa" | "sin"; texto: string }) {
  const Icono = { carga: Loader2, error: AlertTriangle, pausa: Pause, sin: ImageOff }[icono];
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-xl font-bold text-[var(--text-secondary)]">
      <Icono className={cn("h-10 w-10", icono === "carga" && "animate-spin")} aria-hidden />
      {texto}
    </span>
  );
}

/** Conexión directa: video HLS si la instalación puede; si no, fotos encadenadas cada 2 s. */
export function MedioPropio({ camaraId, nombre, alInformar }: { camaraId: string; nombre: string; alInformar: AlInformar }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const disp = useDisponibilidadDeVideo(camaraId);
  const lista = disp.fase === "hay" ? disp.lista : null;
  const falloVideo = useReproductorHls(videoRef, lista, !!lista);
  const video = !!lista && !falloVideo;
  const fotos = useFotosEncadenadas(camaraId, 2000, !video && disp.fase !== "consultando");

  useEffect(() => {
    if (video) alInformar("En vivo", true);
    else if (fotos.ultimoAt) alInformar(formatTime(fotos.ultimoAt, { segundos: true }), true);
    else alInformar(fotos.detenido ? "Sin respuesta" : "Conectando…", false);
  }, [video, fotos.ultimoAt, fotos.detenido, alInformar]);

  if (video) {
    return <video ref={videoRef} muted playsInline autoPlay aria-label={`Video en vivo de ${nombre}`} className={MEDIO} />;
  }
  return (
    <>
      {fotos.src && (
        // eslint-disable-next-line @next/next/no-img-element -- cuadro en vivo de la cámara
        <img src={fotos.src} alt={`Cuadro en vivo de ${nombre}`} onLoad={fotos.alCargar} onError={fotos.alFallar} className={MEDIO} />
      )}
      {fotos.detenido ? (
        <Cartel icono="error" texto={fotos.detenido} />
      ) : (
        !fotos.ultimoAt && <Cartel icono="carga" texto="Conectando con la cámara…" />
      )}
    </>
  );
}

/** Puente de la PC: el último cuadro que mandó, cada ~1 s. */
export function MedioPuente({ camaraId, nombre, alInformar }: { camaraId: string; nombre: string; alInformar: AlInformar }) {
  const c = useCuadroPuente(camaraId, { activo: true, modo: "imagen" });
  const texto = textoSenal(c.senal, c.edadMs);
  useEffect(() => alInformar(texto, c.senal === "vivo"), [texto, c.senal, alInformar]);
  return (
    <>
      {c.src && (
        // eslint-disable-next-line @next/next/no-img-element -- cuadro en vivo del puente (blob local)
        <img src={c.src} alt={`Lo que la PC mira de ${nombre}`} className={cn(MEDIO, c.senal !== "vivo" && "opacity-60")} />
      )}
      {!c.src && <Cartel icono={c.senal === "esperando" ? "carga" : "sin"} texto={texto} />}
    </>
  );
}

/** Sin corte propio de 5 min: en el TV lo lleva `useInactividadTv` (30 min sin tocar el control). */
const SIN_CORTE_PROPIO = () => undefined;

interface PropsNube {
  camaraId: string;
  conCodigo: boolean;
  activo: boolean;
  /** Ampliada: con SD/HD. En el mosaico, siempre SD (los navegadores de TV son lentos). */
  grande: boolean;
  alInformar: AlInformar;
  /** Ya mostró video o falló: el mosaico arranca la siguiente (de a una). */
  onArranco?: () => void;
}

/** Hik-Connect: EZUIKit dibuja en un canvas dentro de la caja (React no le pone hijos). */
export function MedioNube({ camaraId, conCodigo, activo, grande, alInformar, onArranco }: PropsNube) {
  const v = useVisorNube(camaraId, { activo, onActividad: SIN_CORTE_PROPIO });
  const arranco = useRef(onArranco);
  useEffect(() => {
    arranco.current = onArranco;
  }, [onArranco]);
  useEffect(() => {
    if (v.estado === "viendo" || v.estado === "error") arranco.current?.();
    alInformar(
      v.estado === "viendo" ? "En vivo" : v.estado === "detenido" ? "En pausa" : v.estado === "error" ? "Sin video" : "Despertando…",
      v.estado === "viendo",
    );
  }, [v.estado, alInformar]);

  return (
    <>
      <div id={v.contenedorId} className="flex h-full w-full items-center justify-center" data-visor-nube={camaraId} />
      {(v.estado === "pidiendo" || v.estado === "cargando") && (
        <Cartel icono="carga" texto={activo ? "Despertando la cámara…" : "En espera de su turno…"} />
      )}
      {v.estado === "detenido" && <Cartel icono="pausa" texto="En espera" />}
      {v.estado === "error" && (
        <Cartel
          icono="error"
          texto={v.error ?? (conCodigo ? "La cámara no mandó video." : "Falta el código de verificación de la cámara.")}
        />
      )}
      {grande && (
        <span className="absolute right-4 top-4 flex gap-2" role="group" aria-label="Calidad del video">
          {(["sd", "hd"] as const satisfies readonly Calidad[]).map((c) => (
            <button
              key={c}
              type="button"
              data-tv-foco
              aria-pressed={v.calidad === c}
              onClick={() => v.setCalidad(c)}
              className={cn(BOTON_TV_CHICO, v.calidad === c && "border-[var(--accent)] text-[var(--accent)]")}
            >
              {c.toUpperCase()}
            </button>
          ))}
        </span>
      )}
    </>
  );
}
