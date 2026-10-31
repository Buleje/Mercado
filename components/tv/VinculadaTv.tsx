"use client";

/**
 * El TV vinculado: arriba, el nombre de la pantalla, el reloj y dos botones
 * discretos (pantalla completa, desconectar); abajo, el mosaico o la cámara
 * ampliada. OK sobre un cuadro lo amplía; «Atrás» del control vuelve.
 */

import { useCallback, useState } from "react";
import { ArrowLeft, LogOut, Maximize2, Pause, Tv } from "@buleje/design-system/icons";
import type { TvCamarasRespuesta } from "@/lib/camaras/pantallas-tv";
import { formatTime } from "@/lib/format";
import CuadroTv from "./CuadroTv";
import HoraTv from "./HoraTv";
import MosaicoTv from "./MosaicoTv";
import { BOTON_TV_CHICO } from "./tv-estilos";
import { TV_MINUTOS_NUBE, type CamaraTv } from "./tv-ui";
import { useInactividadTv, useNavegacionTv } from "./use-navegacion-tv";

interface Props {
  pantalla: TvCamarasRespuesta["pantalla"] | null;
  camaras: readonly CamaraTv[];
  onSalir: () => Promise<void>;
}

function pantallaCompleta() {
  if (document.fullscreenElement) void document.exitFullscreen?.();
  else void document.documentElement.requestFullscreen?.();
}

export default function VinculadaTv({ pantalla, camaras, onSalir }: Props) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [ultima, setUltima] = useState<string | null>(null);
  const [confirmarSalir, setConfirmarSalir] = useState(false);
  const { pausado } = useInactividadTv(TV_MINUTOS_NUBE);
  const camara = abierta ? (camaras.find((c) => c.id === abierta) ?? null) : null;

  const volver = useCallback(() => {
    setConfirmarSalir(false);
    if (abierta) setUltima(abierta);
    setAbierta(null);
  }, [abierta]);
  useNavegacionTv(
    camara ? `una:${camara.id}` : confirmarSalir ? "salir" : "mosaico",
    camara || confirmarSalir ? volver : undefined,
  );

  const hayNube = camaras.some((c) => c.tipo === "nube");

  return (
    <main className="flex h-full flex-col gap-3 p-[2vh]" data-tv-vinculada>
      <header className="flex shrink-0 items-center gap-4">
        {camara ? (
          <button type="button" data-tv-foco onClick={volver} className={BOTON_TV_CHICO}>
            <ArrowLeft className="h-6 w-6" aria-hidden /> Todas
          </button>
        ) : (
          <Tv className="h-8 w-8 text-[var(--accent)]" aria-hidden />
        )}
        <p className="min-w-0 flex-1 truncate text-2xl font-bold text-[var(--text-secondary)]">
          {camara ? camara.nombre : (pantalla?.nombre ?? "Televisor")}
          {pantalla?.expiraEn && !camara && (
            <span className="ml-3 text-lg font-normal text-[var(--text-tertiary)]">
              ve hasta las {formatTime(pantalla.expiraEn)}
            </span>
          )}
        </p>
        <HoraTv className="text-4xl font-bold tabular-nums text-[var(--text-primary)]" />
        <button type="button" data-tv-foco onClick={pantallaCompleta} className={BOTON_TV_CHICO} aria-label="Pantalla completa">
          <Maximize2 className="h-6 w-6" aria-hidden />
        </button>
        {confirmarSalir ? (
          <button type="button" data-tv-foco data-tv-inicial onClick={() => void onSalir()} className={BOTON_TV_CHICO}>
            <LogOut className="h-6 w-6" aria-hidden /> ¿Seguro? OK para desconectar
          </button>
        ) : (
          <button type="button" data-tv-foco onClick={() => setConfirmarSalir(true)} className={BOTON_TV_CHICO}>
            <LogOut className="h-6 w-6" aria-hidden /> Desconectar este TV
          </button>
        )}
      </header>

      {pausado && hayNube && (
        <p role="status" className="flex shrink-0 items-center gap-3 rounded-2xl border-2 border-[var(--data-warning-500)] px-4 py-2 text-xl font-bold text-[var(--text-primary)]">
          <Pause className="h-6 w-6 text-[var(--data-warning-500)]" aria-hidden />
          Pausé las cámaras de Hik-Connect tras {TV_MINUTOS_NUBE} min sin usar el control, para cuidar su batería.
          Presiona cualquier botón para seguir.
        </p>
      )}

      <div className="min-h-0 flex-1">
        {camara ? (
          <CuadroTv key={camara.id} camara={camara} grande activoNube={!pausado} />
        ) : camaras.length === 0 ? (
          <p className="flex h-full items-center justify-center px-[10vw] text-center text-3xl text-[var(--text-secondary)]">
            Esta pantalla no tiene cámaras para mostrar. Elige cuáles desde el panel: Cámaras → Ver en otra pantalla.
          </p>
        ) : (
          <MosaicoTv camaras={camaras} pausadoNube={pausado} onAbrir={setAbierta} focoId={ultima} />
        )}
      </div>
    </main>
  );
}
