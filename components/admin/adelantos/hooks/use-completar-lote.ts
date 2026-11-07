"use client";

/**
 * «Completar datos» en lote (Brandon 30-10): en main 48 de 49 personas tenían
 * algo por completar y ninguna tenía tipo; había que abrir una ventana por
 * persona. Acá cada persona es una fila con el DNI/RUC, el celular y el tipo.
 *
 * Guarda fila por fila por la ruta de siempre (`PATCH …/beneficiarios/[id]`),
 * una detrás de otra: si una falla, las demás siguen y la fila dice por qué.
 * El cuerpo lo arma `cuerpoPatch` (la ficha entera con el cambio puesto): el
 * PATCH reemplaza nombre, documento, teléfono, notas y tope, y sólo toca el
 * tipo/Yape/referencia/nacimiento si la clave viaja. La foto no viaja nunca.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { normalizarNumero } from "@/lib/documento/tipos";
import { revisarDocumento } from "@/lib/adelantos/persona-validacion";
import { avisoCelular } from "@/lib/adelantos/recibo-whatsapp";
import {
  cambioDeLaFila,
  cuerpoPatch,
  faltaParaCompletar,
  filaCompletarDe,
  type CambioDatos,
  type FilaCompletar,
  type PersonaDatos,
} from "@/lib/adelantos/datos-persona";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

export type CampoCompletar = keyof FilaCompletar;
export type EstadoFilaCompletar = { fase: "guardando" } | { fase: "ok" } | { fase: "error"; mensaje: string };

export type FilaDelLote = {
  persona: BeneficiarioConSaldo;
  /** Lo que se ve en los campos: lo guardado con lo escrito encima. */
  valores: FilaCompletar;
  /** Lo que se mandaría; `null` = la fila no cambió. */
  cambio: CambioDatos | null;
  /** «Revisa el número» en vivo (no frena el guardado: el modal tampoco lo hace). */
  avisos: { documento: string | null; telefono: string | null };
  estado: EstadoFilaCompletar | null;
};

/**
 * La ficha se relee justo antes del PATCH: la lista puede tener minutos y el
 * PATCH pisa notas, tope, banco y «activo» con lo que mande el cliente (otra
 * pestaña que cambió el tope o dio de baja a la persona se perdía). Si no se
 * puede leer, la fila no se guarda: mejor un error que pisar con lo viejo.
 */
async function guardarUna(p: BeneficiarioConSaldo, cambio: CambioDatos): Promise<EstadoFilaCompletar> {
  const url = `/api/adelantos/beneficiarios/${encodeURIComponent(p.id)}`;
  try {
    const leida = await fetch(url, { credentials: "include", cache: "no-store" });
    if (leida.status === 404) return { fase: "error", mensaje: "Esta persona ya no está en la libreta." };
    const fresca = leida.ok ? await leerJson<PersonaDatos>(leida) : null;
    if (!fresca?.nombre) return { fase: "error", mensaje: "No se pudo leer su ficha para guardar. Prueba de nuevo." };
    const res = await fetch(url, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify(cuerpoPatch(fresca, cambio)),
    });
    if (res.ok) return { fase: "ok" };
    const j = await leerJson<{ error?: string }>(res);
    return { fase: "error", mensaje: j?.error ?? "No se pudo guardar." };
  } catch (e) {
    logger.error("[adelantos] completar en lote: no se pudo guardar la fila", { error: String(e) });
    return { fase: "error", mensaje: "No se pudo guardar. Revisa la conexión." };
  }
}

const porNombre = (a: BeneficiarioConSaldo, b: BeneficiarioConSaldo) => a.nombre.localeCompare(b.nombre, "es");

export function useCompletarLote(personas: readonly BeneficiarioConSaldo[], onGuardado: () => void) {
  /* La lista se fija al entrar: quien quedó completo sigue en su fila con ✓
     hasta salir (si no, la fila desaparecería bajo el cursor). */
  const [ids] = useState(() => personas.filter(faltaParaCompletar).sort(porNombre).map((p) => p.id));
  const [escrito, setEscrito] = useState<Record<string, Partial<FilaCompletar>>>({});
  const [estados, setEstados] = useState<Record<string, EstadoFilaCompletar>>({});
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);

  const filas = useMemo<FilaDelLote[]>(() => {
    const porId = new Map(personas.map((p) => [p.id, p]));
    return ids.flatMap((id) => {
      const persona = porId.get(id);
      if (!persona) return [];
      const valores = { ...filaCompletarDe(persona), ...escrito[id] };
      return [
        {
          persona,
          valores,
          cambio: cambioDeLaFila(persona, valores),
          avisos: { documento: revisarDocumento(valores.documento), telefono: avisoCelular(valores.telefono) },
          estado: estados[id] ?? null,
        },
      ];
    });
  }, [ids, personas, escrito, estados]);

  /* Guardada pero todavía sin la lista nueva del servidor: no cuenta de nuevo. */
  const pendientes = filas.filter((f) => f.cambio && f.estado?.fase !== "ok" && f.estado?.fase !== "guardando");
  const conAviso = pendientes.filter((f) => f.avisos.documento || f.avisos.telefono).length;

  const escribir = useCallback((id: string, campo: CampoCompletar, v: string) => {
    setEscrito((e) => ({ ...e, [id]: { ...e[id], [campo]: v } }));
    /* Volver a escribir en una fila guardada (o con error) la deja «sin guardar». */
    setEstados((e) => {
      if (!(id in e)) return e;
      const n = { ...e };
      delete n[id];
      return n;
    });
  }, []);

  /* Candado síncrono: dos clics antes de que se pinte el `disabled` lanzaban dos tandas. */
  const enCurso = useRef(false);

  const guardar = useCallback(async () => {
    const lote = pendientes.flatMap((f) => (f.cambio ? [{ persona: f.persona, valores: f.valores, cambio: f.cambio }] : []));
    if (lote.length === 0 || enCurso.current) return;
    enCurso.current = true;
    setProgreso({ hechas: 0, total: lote.length });
    let ok = 0;
    for (const [i, f] of lote.entries()) {
      setEstados((e) => ({ ...e, [f.persona.id]: { fase: "guardando" } }));
      const r = await guardarUna(f.persona, f.cambio);
      if (r.fase === "ok") {
        ok += 1;
        /* Lo que quedó en la base (DNI sin espacios, celular limpio): al llegar
           la lista nueva, la fila ya no se ve cambiada. */
        const { documento, telefono } = f.cambio;
        setEscrito((e) => ({
          ...e,
          [f.persona.id]: {
            ...f.valores,
            ...(documento !== undefined ? { documento: normalizarNumero(documento) } : {}),
            ...(telefono !== undefined ? { telefono } : {}),
          },
        }));
      }
      setEstados((e) => ({ ...e, [f.persona.id]: r }));
      setProgreso({ hechas: i + 1, total: lote.length });
    }
    setProgreso(null);
    enCurso.current = false;
    if (ok > 0) onGuardado();
    const mal = lote.length - ok;
    if (mal === 0) toast.success(ok === 1 ? "Se guardó 1 persona." : `Se guardaron ${ok} personas.`);
    else toast.error(`${ok > 0 ? `Se guardaron ${ok}. ` : ""}${mal === 1 ? "1 fila no se guardó" : `${mal} filas no se guardaron`}: el motivo está en cada una.`);
  }, [pendientes, onGuardado]);

  return { filas, pendientes: pendientes.length, conAviso, progreso, escribir, guardar };
}
