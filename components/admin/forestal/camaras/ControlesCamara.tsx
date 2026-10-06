"use client";

/**
 * Los controles del aparato encima del video de la nube (ADR-472): mover,
 * foto, detección, micrófono y alarma, más la batería y la microSD.
 *
 * Sólo se dibuja lo que la cámara sabe hacer (`capacity` de EZVIZ) y lo que
 * la persona puede tocar: detección, micrófono y alarma, sólo admin/dueño.
 * En la PC van ENCIMA del video y se esconden a los {@link SEGUNDOS_A_LA_VISTA} s
 * sin mover el mouse (vuelven al moverlo o al tocar); en el celular van debajo
 * del video, siempre a la vista y con botones de 44 px.
 *
 * Con la alarma sonando (o quizá sonando), «Apagar alarma» queda a la vista
 * aunque el video se caiga: es lo único que se dibuja sin video.
 */

import { useEffect, useState } from "react";
import {
  Battery,
  Camera,
  HardDrive,
  Loader2,
  Mic,
  MicOff,
  ShieldCheck,
  ShieldOff,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import ControlesCamaraAlarma from "./ControlesCamaraAlarma";
import ControlesCamaraJoystick from "./ControlesCamaraJoystick";
import { useControlesCamara } from "./use-controles-camara";

const SEGUNDOS_A_LA_VISTA = 3.5;

const BOTON =
  "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)]/85 px-3 text-sm font-bold text-[var(--text-primary)] shadow-[var(--shadow-sm)] backdrop-blur transition hover:border-[var(--accent)] disabled:opacity-50 aria-pressed:border-[var(--accent)]";

const CHIP =
  "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-bold text-[var(--text-primary)] backdrop-blur";

interface Props {
  camaraId: string;
  nombre: string;
  /** Id del marco (video + controles): de ahí se escucha el mouse para mostrar/esconder. */
  marcoId: string;
  /** El video ya se ve: recién ahí se pregunta qué sabe hacer la cámara. */
  viendo: boolean;
  teclado: "documento" | "grupo";
  /** Cuadro chico del mosaico: botones sólo con ícono. */
  compacto?: boolean;
  onVerFotos: () => void;
  /** El cuadro del video, por si la cámara no puede sacar la foto. */
  tomarCuadro?: () => Promise<string | null>;
}

export default function ControlesCamara({
  camaraId,
  nombre,
  marcoId,
  viendo,
  teclado,
  compacto = false,
  onVerFotos,
  tomarCuadro,
}: Props) {
  const c = useControlesCamara(camaraId, viendo, tomarCuadro);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const marco = document.getElementById(marcoId);
    if (!marco) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const mostrar = () => {
      setVisible(true);
      clearTimeout(t);
      t = setTimeout(() => setVisible(false), SEGUNDOS_A_LA_VISTA * 1000);
    };
    mostrar();
    marco.addEventListener("pointermove", mostrar);
    marco.addEventListener("pointerdown", mostrar);
    document.addEventListener("keydown", mostrar);
    return () => {
      clearTimeout(t);
      marco.removeEventListener("pointermove", mostrar);
      marco.removeEventListener("pointerdown", mostrar);
      document.removeEventListener("keydown", mostrar);
    };
  }, [marcoId]);

  const d = c.datos;
  if (!d || (!viendo && !c.alarmaActiva)) return null;
  const alarmaUI = (
    <ControlesCamaraAlarma
      nombre={nombre}
      habilitada={d.alarmaHabilitada === true}
      activa={c.alarmaActiva}
      quiza={c.alarmaQuiza}
      segundos={c.segundosAlarma}
      ocupado={c.ocupado === "alarma"}
      apagando={c.apagandoAlarma}
      onSonar={(s) => void c.sonarAlarma(s)}
      onApagar={() => void c.apagarAlarma()}
      boton={BOTON}
    />
  );
  if (!viendo)
    return (
      <div
        data-controles-camara={camaraId}
        className="mt-2 sm:absolute sm:bottom-2 sm:left-2 sm:z-20 sm:mt-0"
      >
        {alarmaUI}
      </div>
    );
  const cap = d.capacidades;
  const fijo = !!c.moviendo || !!c.ocupado || c.alarmaActiva;
  const oculto = !visible && !fijo;
  const etiqueta = (t: string) => <span className={cn(compacto && "sr-only")}>{t}</span>;

  return (
    <div
      data-controles-camara={camaraId}
      className={cn(
        "mt-2 space-y-2 transition-opacity duration-300 sm:pointer-events-none sm:absolute sm:inset-0 sm:mt-0",
        oculto && "sm:opacity-0 sm:focus-within:opacity-100",
      )}
    >
      {/* Arriba a la izquierda: batería y microSD. */}
      <div className="flex flex-wrap gap-1 sm:absolute sm:left-2 sm:top-2">
        {d.bateria !== null && (
          <span
            className={cn(
              CHIP,
              d.bateria < 25
                ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/25"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)]/80",
            )}
            title="Batería de la cámara solar"
          >
            <Battery className="h-3.5 w-3.5" aria-hidden /> {d.bateria} %
          </span>
        )}
        {d.tarjeta && d.tarjeta !== "ok" && (
          <span
            className={cn(
              CHIP,
              "border-[var(--data-error-500)] bg-[var(--surface-raised)]/90 text-[var(--data-error-ink)]",
            )}
            title={
              d.tarjeta === "sin_formato"
                ? "La microSD no está formateada: la cámara no graba. Formatéala en la app Hik-Connect: la cámara → Configuración → Estado de almacenamiento."
                : "La microSD da error: revísala o cámbiala."
            }
          >
            <HardDrive className="h-3.5 w-3.5" aria-hidden />
            {d.tarjeta === "sin_formato"
              ? "microSD sin formatear"
              : d.tarjeta === "formateando"
                ? "Formateando microSD"
                : "microSD con error"}
          </span>
        )}
      </div>

      {(c.aviso || c.fotoGuardada) && (
        <p
          role={c.aviso ? "alert" : "status"}
          className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/90 px-3 py-1.5 text-sm text-[var(--text-primary)] backdrop-blur sm:pointer-events-auto sm:absolute sm:right-2 sm:top-2 sm:max-w-[60%]"
        >
          {c.aviso ?? "Foto guardada en Fotos."}
          {!c.aviso && c.fotoGuardada && (
            <button
              type="button"
              onClick={onVerFotos}
              className="font-bold text-[var(--accent-ink)] underline"
            >
              Ver
            </button>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-2 sm:absolute sm:inset-x-2 sm:bottom-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:pointer-events-auto">
          {cap.foto && (
            <button
              type="button"
              onClick={() => void c.sacarFoto()}
              disabled={c.ocupado === "foto"}
              className={BOTON}
              title="La cámara saca una foto y queda en Fotos"
              aria-label={compacto ? `Foto de ${nombre} a Fotos` : undefined}
            >
              {c.ocupado === "foto" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Camera className="h-4 w-4" aria-hidden />
              )}
              {etiqueta("Foto")}
            </button>
          )}
          {d.puedeConfigurar && cap.deteccion && d.deteccion !== null && (
            <button
              type="button"
              onClick={c.alternarDeteccion}
              disabled={c.ocupado === "deteccion"}
              aria-pressed={d.deteccion}
              className={BOTON}
              title={
                d.deteccion
                  ? "Detección prendida: la cámara detecta movimiento y personas y avisa en Hik-Connect. Toca para apagarla."
                  : "Detección apagada: la cámara no detecta ni avisa (puede dejar de grabar por evento). Toca para prenderla."
              }
              data-control="deteccion"
            >
              {c.ocupado === "deteccion" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : d.deteccion ? (
                <ShieldCheck className="h-4 w-4 text-[var(--data-success-ink)]" aria-hidden />
              ) : (
                <ShieldOff className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
              )}
              {etiqueta(d.deteccion ? "Detección" : "Detección apagada")}
            </button>
          )}
          {d.puedeConfigurar && cap.microfono && d.microfono !== null && (
            <button
              type="button"
              onClick={c.alternarMicrofono}
              disabled={c.ocupado === "microfono"}
              aria-pressed={d.microfono}
              className={BOTON}
              title={
                d.microfono
                  ? "Micrófono de la cámara prendido: el vivo y la grabación traen sonido. Toca para apagarlo."
                  : "Micrófono de la cámara apagado: sin sonido. Toca para prenderlo."
              }
              data-control="microfono"
            >
              {c.ocupado === "microfono" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : d.microfono ? (
                <Mic className="h-4 w-4" aria-hidden />
              ) : (
                <MicOff className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
              )}
              {etiqueta(d.microfono ? "Micrófono" : "Micrófono apagado")}
            </button>
          )}
          {((d.puedeConfigurar && cap.alarma) || c.alarmaActiva) && alarmaUI}
        </div>
        {cap.mover && (
          <div className="sm:pointer-events-auto max-sm:mx-auto">
            <ControlesCamaraJoystick
              moviendo={c.moviendo}
              onMover={c.mover}
              onParar={c.parar}
              onFrenar={c.frenar}
              vertical={cap.moverVertical}
              teclado={teclado}
              nombre={nombre}
            />
          </div>
        )}
      </div>
    </div>
  );
}
