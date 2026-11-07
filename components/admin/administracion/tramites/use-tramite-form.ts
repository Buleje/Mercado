"use client";

/**
 * useTramiteForm — el borrador de la ventana de un trámite. Crear manda todo
 * (con la plantilla, si se eligió); editar manda SÓLO lo que cambió: el PATCH
 * es parcial (ausente = no se toca, `null` = se borra), así dos personas que
 * corrigen campos distintos no se pisan.
 */
import { useState } from "react";
import type { CanalTramite, EntidadTramite, EstadoTramite, TramiteDto } from "@/lib/admin/fichas-tramites-alquileres";
import type { ValorFicha } from "../comun/ElegirFicha";
import { crearTramite, editarTramite, type DatosTramite } from "./tramites-api";
import { PLANTILLAS_TRAMITE } from "./tramites-ui";

export interface BorradorTramite {
  plantilla: string;
  entidad: EntidadTramite;
  entidadNombre: string;
  asunto: string;
  persona: ValorFicha;
  estado: EstadoTramite;
  iniciadoEl: string;
  enviadoEl: string;
  venceEl: string;
  proximoPaso: string;
  proximoPasoEl: string;
  canal: CanalTramite | "";
  contacto: string;
  notas: string;
}

export const MAX_ASUNTO = 200;

function aBorrador(t: TramiteDto | null, plantilla: string | undefined, hoy: string): BorradorTramite {
  const p = PLANTILLAS_TRAMITE.find((x) => x.id === plantilla);
  return {
    plantilla: p?.id ?? "",
    entidad: t?.entidad ?? p?.entidad ?? "banco",
    entidadNombre: t?.entidadNombre ?? p?.entidadNombre ?? "",
    asunto: t?.asunto ?? p?.asunto ?? "",
    persona: { parteId: t?.parteId ?? null, texto: t?.personaNombre ?? "" },
    estado: t?.estado ?? "preparando",
    iniciadoEl: t ? (t.iniciadoEl ?? "") : hoy,
    enviadoEl: t?.enviadoEl ?? "",
    venceEl: t?.venceEl ?? "",
    proximoPaso: t?.proximoPaso ?? "",
    proximoPasoEl: t?.proximoPasoEl ?? "",
    canal: t?.canal ?? "",
    contacto: t?.contacto ?? "",
    notas: t?.notas ?? "",
  };
}

const texto = (s: string): string | null => (s.trim() ? s.trim() : null);

function aDatos(b: BorradorTramite, alquilerId: string | null): DatosTramite {
  return {
    entidad: b.entidad,
    entidadNombre: texto(b.entidadNombre),
    asunto: b.asunto.trim(),
    parteId: b.persona.parteId,
    personaNombre: b.persona.parteId ? null : texto(b.persona.texto),
    alquilerId,
    estado: b.estado,
    iniciadoEl: b.iniciadoEl || null,
    enviadoEl: b.enviadoEl || null,
    venceEl: b.venceEl || null,
    proximoPaso: texto(b.proximoPaso),
    proximoPasoEl: b.proximoPasoEl || null,
    canal: b.canal || null,
    contacto: texto(b.contacto),
    notas: texto(b.notas),
  };
}

/** Las claves cuyo valor cambió entre lo guardado y lo escrito. */
export function cambiosDelTramite(antes: DatosTramite, ahora: DatosTramite): Partial<DatosTramite> {
  const out: Partial<DatosTramite> = {};
  for (const k of Object.keys(ahora) as (keyof DatosTramite)[]) {
    if (antes[k] !== ahora[k]) (out as Record<string, unknown>)[k] = ahora[k];
  }
  return out;
}

export function useTramiteForm(
  tramite: TramiteDto | null,
  plantilla: string | undefined,
  hoy: string,
  onGuardado: (t: TramiteDto, eraNuevo: boolean) => void,
  onCerrar: () => void,
) {
  const [b, setB] = useState<BorradorTramite>(() => aBorrador(tramite, plantilla, hoy));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar = <K extends keyof BorradorTramite>(k: K, v: BorradorTramite[K]) => {
    setError(null);
    setB((x) => ({ ...x, [k]: v }));
  };

  /** Elegir una plantilla llena entidad y asunto sólo si estaban vacíos o eran los de otra plantilla. */
  const elegirPlantilla = (id: string) => {
    const p = PLANTILLAS_TRAMITE.find((x) => x.id === id);
    setB((x) => {
      const previa = PLANTILLAS_TRAMITE.find((y) => y.id === x.plantilla);
      const asuntoLibre = !x.asunto.trim() || x.asunto === previa?.asunto;
      return {
        ...x,
        plantilla: id,
        ...(p ? { entidad: p.entidad } : {}),
        ...(p && asuntoLibre ? { asunto: p.asunto } : {}),
        ...(p?.entidadNombre && !x.entidadNombre.trim() ? { entidadNombre: p.entidadNombre } : {}),
      };
    });
  };

  const guardar = async () => {
    if (!b.asunto.trim()) return setError("Escribe de qué es el trámite (el asunto).");
    if (b.proximoPasoEl && !b.proximoPaso.trim()) return setError("Escribe cuál es el próximo paso, o borra su fecha.");
    setGuardando(true);
    const datos = aDatos(b, tramite?.alquilerId ?? null);
    if (!tramite) {
      const r = await crearTramite({ ...datos, ...(b.plantilla ? { plantilla: b.plantilla } : {}) });
      setGuardando(false);
      if (!r.ok) return setError(r.error);
      onGuardado(r.data.tramite, true);
      return;
    }
    const cambios = cambiosDelTramite(aDatos(aBorrador(tramite, undefined, hoy), tramite.alquilerId), datos);
    if (Object.keys(cambios).length === 0) {
      setGuardando(false);
      return onCerrar();
    }
    const r = await editarTramite(tramite.id, cambios);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    onGuardado(r.data.tramite, false);
    onCerrar();
  };

  return { b, cambiar, elegirPlantilla, guardar, error, guardando };
}
