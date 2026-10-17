"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import {
  planTodaLaProduccion,
  type AvanceDeTanda,
  type EntradaDeProduccion,
  type PasoDeProduccion,
  type PlanDeProduccion,
  type RecorridoDeTanda,
} from "@/lib/forestal/toda-la-produccion";
import RepartoRegistrarTodo, { ID_SECCION_ANEXO } from "../reparto-registrar-todo";
import { BarraRegistrarTodo, BotonRegistrarBloque } from "../reparto-registrar-todo-partes";

/**
 * use-tanda-del-libro — «Registrar toda la producción» y «Registrar sus N
 * días» (ADR-464, Brandon 2026-10-03). Arma el plan con `planTodaLaProduccion`
 * (puro), lo muestra para confirmar y lo recorre con `registrarTodo` (el mismo
 * escritor del botón de cada día, un día por vez).
 *
 * El plan del resumen es una FOTO al abrir: lo que se confirma es lo que se
 * escribe. Reintentar saca una foto nueva (lo escrito ya figura «en el libro»).
 */

type RegistrarTodo = (
  pasos: readonly PasoDeProduccion[],
  bloqueDe: (id: string) => BloqueRolliza | undefined,
  opciones: { onAvance?: (a: AvanceDeTanda<PasoDeProduccion>) => void; detener?: () => boolean },
) => Promise<RecorridoDeTanda<PasoDeProduccion> | null>;

export const MOTIVO_ROL =
  "Registrar la producción en el Libro es de admin o dueño: tu rol puede consumir, pero no declarar lo que salió.";

export function useTandaDelLibro({
  entradas,
  hoy,
  puedeDeclarar,
  leyendo,
  ocupado,
  registrarTodo,
  bloqueDe,
  alEscribir,
}: {
  entradas: readonly EntradaDeProduccion[];
  hoy: string;
  puedeDeclarar: boolean;
  /** El Libro (lotes) se está leyendo: el plan todavía no es confiable. */
  leyendo: boolean;
  /** Otra escritura en curso (un día suelto o «Completar»). */
  ocupado: boolean;
  registrarTodo: RegistrarTodo;
  bloqueDe: (id: string) => BloqueRolliza | undefined;
  /** Los días que quedaron declarados: la pantalla tilda su «Distribuido». */
  alEscribir: (pasos: PasoDeProduccion[]) => void;
}) {
  const planVivo = useMemo(() => planTodaLaProduccion(entradas, hoy), [entradas, hoy]);
  const [abierta, setAbierta] = useState<{ bloqueId: string | null; plan: PlanDeProduccion } | null>(null);
  const [avance, setAvance] = useState<AvanceDeTanda<PasoDeProduccion> | null>(null);
  const [recorrido, setRecorrido] = useState<RecorridoDeTanda<PasoDeProduccion> | null>(null);
  const [deteniendo, setDeteniendo] = useState(false);
  const detener = useRef(false);

  const abrir = useCallback(
    (bloqueId: string | null) => {
      setRecorrido(null);
      setAvance(null);
      const de = bloqueId ? entradas.filter((e) => e.bd.bloque.id === bloqueId) : entradas;
      setAbierta({ bloqueId, plan: planTodaLaProduccion(de, hoy) });
    },
    [entradas, hoy],
  );

  const confirmar = async () => {
    if (!abierta || abierta.plan.pasos.length === 0 || !puedeDeclarar) return;
    detener.current = false;
    setDeteniendo(false);
    setAvance({ hechos: 0, total: abierta.plan.pasos.length, paso: abierta.plan.pasos[0] ?? null });
    const r = await registrarTodo(abierta.plan.pasos, bloqueDe, { onAvance: setAvance, detener: () => detener.current });
    setAvance(null);
    if (!r) return;
    setRecorrido(r);
    if (r.escritos.length > 0) alEscribir(r.escritos.map((e) => e.paso));
  };

  const irAlAnexo = () => {
    setAbierta(null);
    const el = document.getElementById(ID_SECCION_ANEXO);
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
  };

  const motivoApagado = !puedeDeclarar ? MOTIVO_ROL : leyendo ? "Leyendo el Libro…" : ocupado ? "Hay una escritura en curso: espera a que termine." : null;
  const pasosDe = (bloqueId: string) => planVivo.pasos.filter((p) => p.bloqueId === bloqueId).length;

  /** La barra de arriba de los bloques: se oculta si no hay rolliza que registrar ni registrada. */
  const barra: ReactNode =
    planVivo.dias + planVivo.noEntran.length + planVivo.yaEnLibro === 0 ? null : (
      <BarraRegistrarTodo plan={planVivo} leyendo={leyendo} motivoApagado={motivoApagado} onAbrir={() => abrir(null)} onIrAlAnexo={irAlAnexo} />
    );

  /** En la cabecera del bloque, sólo si tiene 2 o más días listos (uno solo ya tiene su botón). */
  const botonBloque = (b: BloqueRolliza): ReactNode => {
    const n = pasosDe(b.id);
    return n < 2 ? null : <BotonRegistrarBloque dias={n} motivoApagado={motivoApagado} onAbrir={() => abrir(b.id)} />;
  };

  const etiquetaAbierta = abierta?.bloqueId ? (bloqueDe(abierta.bloqueId)?.etiqueta || "sin etiqueta") : null;
  const nodo: ReactNode = abierta ? (
    <RepartoRegistrarTodo
      plan={abierta.plan}
      bloque={etiquetaAbierta}
      avance={avance}
      recorrido={recorrido}
      deteniendo={deteniendo}
      motivoApagado={puedeDeclarar ? null : MOTIVO_ROL}
      leyendo={leyendo}
      onConfirmar={() => void confirmar()}
      onDetener={() => {
        detener.current = true;
        setDeteniendo(true);
      }}
      onReintentar={() => abrir(abierta.bloqueId)}
      onIrAlAnexo={irAlAnexo}
      onCerrar={() => {
        if (!avance) setAbierta(null);
      }}
    />
  ) : null;

  return { barra, botonBloque, nodo };
}
