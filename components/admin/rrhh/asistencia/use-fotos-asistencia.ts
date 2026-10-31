"use client";

/**
 * «Marcar con foto» (Brandon 2026-10-09): con el mosaico de cámaras abierto
 * —al lado o en la burbuja—, marcar a alguien presente guarda el cuadro que
 * se ve en ese momento, como respaldo («Juan · 07:42» con su foto de la
 * entrada). Contrato: `lib/rrhh/asistencia-fotos.ts`.
 *
 * Cuándo se toma: sólo HOY (el cuadro de ahora no respalda una marca de ayer)
 * y sólo al PASAR a un estado de presencia (Presente, Tardanza, Medio día)
 * desde otro o desde «sin marcar». Tipear la hora o la nota vuelve a llamar
 * `marcar` con el mismo estado, y eso no es otra llegada: no saca foto. Una
 * misma persona, a lo sumo una foto por minuto (marcar y desmarcar al toque).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMosaicoGlobal } from "@/components/admin/forestal/camaras/MosaicoGlobalContexto";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { FotoAsistencia, RespuestaFotoAsistencia, RespuestaFotosAsistencia } from "@/lib/rrhh/asistencia-fotos";
import type { EstadoAsistencia } from "@/lib/rrhh/tipos";

const PRESENCIA: ReadonlySet<EstadoAsistencia> = new Set(["PRESENTE", "TARDANZA", "MEDIO_DIA"]);
const UNA_POR_PERSONA_MS = 60_000;

interface Preferencia {
  activo: boolean;
  camaraId: string | null;
}

/** `true` = hay que sacar foto en este cambio de estado. */
export function tocaFoto(antes: EstadoAsistencia | null, despues: EstadoAsistencia | null): boolean {
  return despues !== null && PRESENCIA.has(despues) && !(antes !== null && PRESENCIA.has(antes));
}

export function useFotosAsistencia(fecha: string, esHoy: boolean) {
  const mosaico = useMosaicoGlobal();
  const camaras = mosaico?.conCuadro ?? [];
  const [pref, setPref] = useLocalStorage<Preferencia>("rrhh-asistencia:foto-camara", { activo: true, camaraId: null });
  const camara = camaras.find((c) => c.id === pref.camaraId) ?? camaras[0] ?? null;
  /* Se ofrece sólo hoy y con alguna cámara del mosaico dando video. */
  const disponible = esHoy && camara !== null;
  const [fotos, setFotos] = useState<FotoAsistencia[]>([]);
  const ultimaPorPersona = useRef(new Map<string, number>());

  useEffect(() => {
    let vigente = true;
    setFotos([]);
    fetch(`/api/rrhh/asistencia/fotos?fecha=${encodeURIComponent(fecha)}`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<RespuestaFotosAsistencia>) : null))
      .then((j) => {
        if (vigente && j?.ok) setFotos(j.fotos);
      })
      .catch((err) => logger.warn("[rrhh.asistencia] no se leyeron las fotos del día", { error: String(err) }));
    return () => {
      vigente = false;
    };
  }, [fecha]);

  const tomarCuadro = mosaico?.tomarCuadro;
  const alMarcar = useCallback(
    async (colaboradorId: string, antes: EstadoAsistencia | null, despues: EstadoAsistencia | null) => {
      if (!disponible || !pref.activo || !camara || !tomarCuadro || !tocaFoto(antes, despues)) return;
      const ahora = Date.now();
      if (ahora - (ultimaPorPersona.current.get(colaboradorId) ?? 0) < UNA_POR_PERSONA_MS) return;
      ultimaPorPersona.current.set(colaboradorId, ahora);

      /* Nunca rechaza: la marca ya se hizo y quien llama no espera la foto. */
      try {
        const cuadro = await tomarCuadro(camara.id);
        if (!cuadro) {
          toast.warning(`Marcado sin foto: ${camara.nombre} no está mostrando video.`);
          ultimaPorPersona.current.delete(colaboradorId);
          return;
        }
        const fd = new FormData();
        fd.append("file", new File([cuadro], `asistencia-${ahora}.jpg`, { type: cuadro.type || "image/jpeg" }));
        fd.append("colaboradorId", colaboradorId);
        fd.append("fecha", fecha);
        fd.append("camaraId", camara.id);
        const r = await fetch("/api/rrhh/asistencia/foto", {
          method: "POST",
          headers: csrfHeaders(),
          credentials: "include",
          body: fd,
        });
        const j = (await r.json().catch(() => null)) as RespuestaFotoAsistencia | null;
        if (j?.ok) {
          setFotos((prev) => [...prev, j.foto]);
          return;
        }
        logger.warn("[rrhh.asistencia] la foto de la marca no se guardó", { status: r.status, error: j && !j.ok ? j.error : null });
      } catch (err) {
        logger.warn("[rrhh.asistencia] la foto de la marca no se subió", { error: String(err) });
      }
      /* Se puede volver a intentar al toque: desmarcar y marcar. */
      ultimaPorPersona.current.delete(colaboradorId);
      toast.error("La marca quedó, pero la foto de la cámara no se guardó.");
    },
    [disponible, pref.activo, camara, tomarCuadro, fecha],
  );

  const fotosDe = useCallback((colaboradorId: string) => fotos.filter((f) => f.colaboradorId === colaboradorId), [fotos]);

  return {
    disponible,
    activo: pref.activo,
    setActivo: (activo: boolean) => setPref((p) => ({ ...p, activo })),
    camaras,
    camara,
    setCamara: (camaraId: string) => setPref((p) => ({ ...p, camaraId })),
    fotosDe,
    alMarcar,
  };
}

export type FotosAsistencia = ReturnType<typeof useFotosAsistencia>;
