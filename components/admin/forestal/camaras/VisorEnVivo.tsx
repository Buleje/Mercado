"use client";

/**
 * Ver la cámara AHORA (ADR-421).
 *
 * Dos formas de mirar, y la pantalla elige la mejor que pueda dar:
 *
 *  · **Video** — el servidor convierte el RTSP de la cámara a HLS con ffmpeg y
 *    el navegador lo reproduce. Es *ver* la cámara: entre foto y foto se pierde
 *    justo lo que uno quiere mirar, un camión entrando o alguien cruzando.
 *  · **Fotos** — se le piden cuadros sueltos y se encadenan. Funciona en
 *    cualquier lado y sin ffmpeg. No es el premio consuelo: para «¿está todavía
 *    el camión?» alcanza de sobra.
 *
 * Arranca con fotos —que salen al toque— y pasa solo al video si la instalación
 * puede darlo; preguntar por el video puede tardar unos segundos (ffmpeg tiene
 * que escribir el primer pedazo) y dejar la pantalla en blanco mientras tanto
 * sería peor. El botón de arriba manda: si la persona elige uno, se respeta.
 *
 * Y se pausa sola cuando nadie mira —pestaña de fondo, visor fuera de la
 * pantalla—: la cámara tiene un tope de conexiones simultáneas y gastarlas acá
 * es que el operario no la pueda ver desde el celular.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Camera, Cast, Image as ImageIcon, Loader2, Maximize2, Minimize2, Pause, Play, RefreshCw, Video,
} from "@buleje/design-system/icons";
import { useApiCamaras } from "./api-camaras";
import { useGuardarCuadro } from "./use-guardar-cuadro";
import { useTransmitir } from "./use-transmitir";
import { useDisponibilidadDeVideo, useFotosEncadenadas, useReproductorHls } from "./use-visor-camara";
import { formatTime } from "@/lib/format";

/** Cada cuánto se pide el cuadro siguiente. `0` = pausado por quien mira. */
const RITMOS = [
  { ms: 1000, etiqueta: "1 s" },
  { ms: 2000, etiqueta: "2 s" },
  { ms: 5000, etiqueta: "5 s" },
  { ms: 0, etiqueta: "Pausado" },
] as const;

const hora = (t: number) =>
  formatTime(t, { segundos: true });

const BOTON_CHICO =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50";

interface Props {
  camaraId: string;
  nombre: string;
  /** La puerta por la que ya entran las fotos (`…/webhooks/camara?k=token`). */
  direccionWebhook: string;
  /** Se guardó un cuadro en el historial: la lista de afuera se refresca. */
  onGuardada?: () => void;
  /** Base de la API (`TV_API_TV` en el televisor: sólo mirar, sin «Guardar esta foto»). */
  baseApi?: string;
}

export default function VisorEnVivo({ camaraId, nombre, direccionWebhook, onGuardada, baseApi }: Props) {
  const { base, soloMirar } = useApiCamaras(baseApi);
  const [ritmo, setRitmo] = useState<number>(1000);
  const [enPantalla, setEnPantalla] = useState(true);
  const [pestanaVisible, setPestanaVisible] = useState(true);
  /** `null` = todavía no eligió nadie: manda lo que la instalación pueda dar. */
  const [modoElegido, setModoElegido] = useState<"video" | "fotos" | null>(null);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  const cajaRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const mirando = enPantalla && pestanaVisible;
  const disponibilidad = useDisponibilidadDeVideo(camaraId, base);
  const hayVideo = disponibilidad.fase === "hay";
  const modo = modoElegido ?? (hayVideo ? "video" : "fotos");
  const falloVideo = useReproductorHls(
    videoRef,
    hayVideo ? disponibilidad.lista : null,
    modo === "video" && mirando,
  );
  const fotos = useFotosEncadenadas(camaraId, ritmo, modo === "fotos" && mirando, base);
  const g = useGuardarCuadro({ camaraId, direccionWebhook, modo, videoRef, imgRef, onGuardada });
  const tv = useTransmitir(videoRef, modo === "video" && mirando);

  /* Tercer escalón: si el video no se pudo mostrar, las fotos. */
  useEffect(() => { if (falloVideo) setModoElegido("fotos"); }, [falloVideo]);

  useEffect(() => {
    const alCambiar = () => setPestanaVisible(!document.hidden);
    alCambiar();
    document.addEventListener("visibilitychange", alCambiar);
    return () => document.removeEventListener("visibilitychange", alCambiar);
  }, []);

  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver((e) => setEnPantalla(e.some((x) => x.isIntersecting)), { threshold: 0.05 });
    obs.observe(caja);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const alCambiar = () => setPantallaCompleta(document.fullscreenElement === cajaRef.current);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);

  const pantalla = () => {
    const caja = cajaRef.current;
    if (!caja) return;
    if (document.fullscreenElement === caja) void document.exitFullscreen?.();
    else void caja.requestFullscreen?.();
  };

  /* Por qué no se está viendo nada, si es que no se está viendo. */
  const pausadoPor = fotos.detenido
    ? "Detenido"
    : !pestanaVisible
      ? "En pausa: la pestaña está en segundo plano"
      : !enPantalla
        ? "En pausa: el visor no está a la vista"
        : modo === "fotos" && ritmo === 0
          ? "Pausado"
          : null;
  const enVivo = !pausadoPor && (modo === "video" || fotos.ultimoAt !== null);
  /* La nota del pie: por qué se ven fotos y no video. Discreta a propósito. */
  const nota =
    falloVideo ?? (modo === "fotos" && disponibilidad.fase === "no" ? disponibilidad.motivo : null);
  const avisos = [nota, g.aviso, tv.aviso].filter(Boolean).join(" · ");

  return (
    <div ref={cajaRef} className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
      <div className="relative aspect-video w-full bg-[var(--surface-sunken)]">
        {modo === "video" ? (
          <video
            ref={videoRef}
            /* `muted` no es un gusto: sin eso el navegador bloquea el arranque
               solo y el operario ve un cuadro negro sin saber por qué. */
            muted
            playsInline
            autoPlay
            aria-label={`Video en vivo de ${nombre}`}
            className="h-full w-full object-contain"
          />
        ) : (
          fotos.src && (
            // eslint-disable-next-line @next/next/no-img-element -- cuadro en vivo de la cámara, sin tamaño conocido de antemano
            <img
              ref={imgRef}
              src={fotos.src}
              alt={`Cuadro en vivo de ${nombre}`}
              onLoad={fotos.alCargar}
              onError={fotos.alFallar}
              className="h-full w-full object-contain"
            />
          )
        )}
        {modo === "fotos" && !fotos.ultimoAt && !fotos.detenido && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Pidiéndole la primera foto a la cámara…
          </p>
        )}
        {modo === "fotos" && fotos.detenido && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--surface-canvas)]/85 px-4 text-center">
            <AlertTriangle className="h-6 w-6 text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" aria-hidden />
            <p className="text-sm font-bold text-[var(--text-primary)]">{fotos.detenido}</p>
            <button
              type="button"
              onClick={fotos.reintentar}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--accent)] px-3 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]" aria-live="polite">
          {enVivo ? (
            <>
              <Video className="h-4 w-4 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden />
              En vivo{modo === "fotos" && fotos.ultimoAt ? ` · ${hora(fotos.ultimoAt)}` : " · video"}
            </>
          ) : (
            <>
              <Pause className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
              {pausadoPor ?? "Conectando"}
              {fotos.ultimoAt ? ` · última ${hora(fotos.ultimoAt)}` : ""}
            </>
          )}
        </span>

        {/* Video o fotos, a mano. El estado se ve: nadie tiene que adivinar
            cuál de los dos está mirando. */}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setModoElegido("video")}
            disabled={!hayVideo}
            aria-pressed={modo === "video"}
            title={hayVideo ? "Video fluido" : (disponibilidad.fase === "no" ? disponibilidad.motivo : "Viendo si hay video…")}
            className={`${BOTON_CHICO} ${modo === "video" ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""}`}
          >
            <Video className="h-3.5 w-3.5" aria-hidden /> Video
          </button>
          <button
            type="button"
            onClick={() => setModoElegido("fotos")}
            aria-pressed={modo === "fotos"}
            className={`${BOTON_CHICO} ${modo === "fotos" ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""}`}
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Fotos
          </button>
        </span>

        {modo === "fotos" && (
          <span className="flex items-center gap-1">
            {RITMOS.map((r) => (
              <button
                key={r.ms}
                type="button"
                onClick={() => setRitmo(r.ms)}
                aria-pressed={ritmo === r.ms}
                className={`${BOTON_CHICO} ${ritmo === r.ms ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""}`}
              >
                {r.ms === 0 ? <Play className="h-3.5 w-3.5" aria-hidden /> : null}
                {r.etiqueta}
              </button>
            ))}
          </span>
        )}

        {!soloMirar && (
          <button type="button" onClick={() => void g.guardar()} disabled={g.guardando} className={BOTON_CHICO}>
            {g.guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
            Guardar esta foto
          </button>
        )}
        {/* Sólo si el navegador ve un Chromecast o un AirPlay en la red (`use-transmitir`). */}
        {tv.via && (
          <button type="button" onClick={tv.transmitir} className={BOTON_CHICO} title="Mandar este video a tu televisor">
            <Cast className="h-4 w-4" aria-hidden /> Transmitir al TV
          </button>
        )}
        <button
          type="button"
          onClick={pantalla}
          aria-label={pantallaCompleta ? "Salir de pantalla completa" : "Ver en pantalla completa"}
          className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          {pantallaCompleta ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
        </button>

        {avisos && (
          <span className="basis-full text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]" aria-live="polite">
            {avisos}
          </span>
        )}
      </div>
    </div>
  );
}
