"use client";

/**
 * Datos INTERNOS de la tala y del trozado: quién tuvo la motosierra (y, en la
 * tala, a qué hora). No salen en el libro que se imprime para SERFOR (la
 * Sección 1 de la RDE 264-2019 no tiene esas columnas); sirven para la
 * operación —pagar por árbol, saber quién estaba con la motosierra— y se ven
 * en el detalle de la línea.
 *
 * El motosierrista se elige de Recursos Humanos, de los nombres que ya están
 * en el libro o del Directorio (personas con DNI), o se escribe otro: en el
 * monte trabajan también terceros que nunca pasaron por la planilla. No es
 * obligatorio, pero el semáforo del plan avisa de los árboles sin él.
 *
 * Qué se propone si el campo llega vacío:
 *   · Tala: el último que se anotó en el libro (Brandon 24-10), una vez.
 *   · Trozado: el que TALÓ ese árbol (B4, 25-10), y sigue al árbol elegido; si
 *     ese árbol no tiene tala con motosierrista, nada (proponer «el último»
 *     del libro le ponía a otro árbol un nombre que no era). Lo que la persona
 *     escribió no se toca.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { logger } from "@/lib/logger";
import { claveDeNombre, esMotosierristaNuevo, opcionesMotosierrista } from "@/lib/forestal/loth-motosierrista";
import { claveArbolTala, motosierristaDeLaTala } from "@/lib/forestal/loth-plan-semaforo-libro";
import type { ColaboradorMinDTO } from "@/lib/rrhh/tipos";
import { useSemaforoDelLibro } from "./hooks/use-loth-semaforo-libro";

type Colaborador = Pick<ColaboradorMinDTO, "id" | "nombre" | "apodo" | "puesto" | "estado">;

interface Props {
  motosierrista: string;
  onMotosierrista: (nombre: string, colaboradorId: string | null) => void;
  /** La hora sólo se pide en la tala. */
  hora?: string;
  onHora?: (hora: string) => void;
  seccion?: "tala" | "trozado";
  /** Proponer un motosierrista si el campo llega vacío (no cuando la línea copia otra ni al corregir). */
  proponerUltimo?: boolean;
  /** En el trozado: el árbol que se troza, para proponer a quien lo taló. */
  arbol?: { planId: string | null; treeCode: string | null };
}

const INPUT =
  "h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20";

/** El colaborador cuyo nombre (o apodo) es exactamente lo tipeado. */
export function colaboradorPorNombre(lista: readonly Colaborador[], texto: string): Colaborador | null {
  const t = texto.trim().toLowerCase();
  if (!t) return null;
  return lista.find((c) => c.nombre.trim().toLowerCase() === t || (c.apodo ?? "").trim().toLowerCase() === t) ?? null;
}

/** Personal activo de RRHH; `listo` = la lectura terminó (bien o sin permiso). */
function usePersonal(): { colaboradores: Colaborador[]; listo: boolean } {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [listo, setListo] = useState(false);
  useEffect(() => {
    let cancel = false;
    fetch("/api/rrhh/colaboradores?campos=min", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { colaboradores?: Colaborador[] } | null) => {
        if (cancel || !j) return;
        setColaboradores((j.colaboradores ?? []).filter((c) => c.estado !== "CESADO"));
      })
      // Sin permiso de RRHH o sin red: el campo se tipea igual.
      .catch((err) => logger.error("[LothTalaDatosInternos] colaboradores failed", { error: String(err) }))
      .finally(() => {
        if (!cancel) setListo(true);
      });
    return () => {
      cancel = true;
    };
  }, []);
  return { colaboradores, listo };
}

export default function LothTalaDatosInternos({
  motosierrista,
  onMotosierrista,
  hora = "",
  onHora,
  seccion = "tala",
  proponerUltimo = false,
  arbol,
}: Props) {
  const { colaboradores, listo } = usePersonal();
  const libro = useSemaforoDelLibro();
  /* El Directorio se lee recién al tocar el campo: la mayoría de las talas usa al de siempre. */
  const [buscando, setBuscando] = useState(false);
  const { partes } = useDirectorioForestal({ activo: buscando });
  const idLista = useId();
  const opciones = useMemo(
    () => opcionesMotosierrista({ personal: colaboradores, usados: libro?.motosierristas.usados ?? [], directorio: partes }),
    [colaboradores, libro, partes],
  );

  const enTala = seccion === "tala";
  /* Las propuestas esperan al personal para atar el nombre a su ficha de RRHH
     si es de la planilla. */
  const propuesto = useRef<string | null>(null);

  /* Tala: el de la última línea, una sola vez y sólo si el campo está vacío. */
  const ultimo = libro?.motosierristas.ultimo ?? null;
  useEffect(() => {
    if (!enTala || !proponerUltimo || propuesto.current != null || !ultimo || !listo || motosierrista.trim()) return;
    propuesto.current = ultimo;
    onMotosierrista(ultimo, colaboradorPorNombre(colaboradores, ultimo)?.id ?? null);
  }, [enTala, proponerUltimo, ultimo, listo, motosierrista, colaboradores, onMotosierrista]);

  /* Trozado: el que taló ESE árbol, cada vez que cambia el árbol. Si el campo
     tiene lo que se propuso antes, se cambia (o se vacía si el nuevo árbol no
     tiene tala); si lo escribió la persona, no se toca. */
  const claveArbol = enTala ? null : claveArbolTala(arbol?.planId, arbol?.treeCode);
  const delArbol = enTala ? null : motosierristaDeLaTala(libro, arbol?.planId, arbol?.treeCode);
  const atendido = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (enTala || !proponerUltimo || !listo || !libro || atendido.current === claveArbol) return;
    atendido.current = claveArbol;
    const anterior = propuesto.current;
    const esElAnterior = anterior != null && claveDeNombre(anterior) === claveDeNombre(motosierrista);
    if (motosierrista.trim() && !esElAnterior) return;
    if (delArbol) {
      propuesto.current = delArbol;
      onMotosierrista(delArbol, colaboradorPorNombre(colaboradores, delArbol)?.id ?? null);
    } else if (esElAnterior) {
      propuesto.current = null;
      onMotosierrista("", null);
    }
  }, [enTala, proponerUltimo, listo, libro, claveArbol, delArbol, motosierrista, colaboradores, onMotosierrista]);

  const esPropuesto = propuesto.current != null && claveDeNombre(propuesto.current) === claveDeNombre(motosierrista);
  const nuevo = esMotosierristaNuevo(motosierrista, opciones);

  return (
    <section aria-label={enTala ? "Datos internos de la tala" : "Datos internos del trozado"} className="space-y-2 border-t border-[var(--rule-soft)] pt-3">
      <div className="flex items-center gap-1">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Datos internos
        </CardTitle>
        <InfoTip
          title="Datos internos"
          what="No salen en el libro que se imprime para SERFOR: son para tu operación."
          affects="Se ven en el detalle de la línea. Sirven para pagar por árbol y saber quién tuvo la motosierra. No es obligatorio, pero el semáforo del plan avisa de los árboles sin motosierrista."
          example="Elige de tu personal, de los que ya anotaste en el libro o del Directorio, o escribe otro nombre."
        />
      </div>
      <div className="grid grid-cols-6 gap-3 [&>*]:min-w-0">
        <label className={`col-span-6 block ${enTala ? "sm:col-span-4" : ""}`}>
          <span className="mb-1 flex min-h-6 items-center text-sm font-medium text-[var(--text-primary)]">
            {enTala ? "Motosierrista" : "Motosierrista (quien trozó)"}
          </span>
          <input
            type="text"
            list={opciones.length > 0 ? idLista : undefined}
            value={motosierrista}
            onFocus={() => setBuscando(true)}
            onChange={(e) => {
              const v = e.target.value;
              onMotosierrista(v, colaboradorPorNombre(colaboradores, v)?.id ?? null);
            }}
            maxLength={120}
            placeholder={
              opciones.length > 0
                ? "Elige de tu personal o del Directorio, o escribe otro nombre"
                : enTala
                  ? "Nombre de quien tumbó el árbol"
                  : "Nombre de quien trozó"
            }
            className={INPUT}
          />
          {opciones.length > 0 && (
            <datalist id={idLista}>
              {opciones.map((o) => (
                <option key={o.nombre} value={o.nombre}>
                  {o.nota}
                </option>
              ))}
            </datalist>
          )}
          {esPropuesto ? (
            <span className="mt-1 block text-sm text-[var(--text-secondary)]">
              {enTala ? "El de la última línea del libro: cámbialo si hoy fue otro." : "El que taló este árbol: cámbialo si trozó otro."}
            </span>
          ) : nuevo ? (
            <span className="mt-1 block text-sm text-[var(--text-secondary)]">Nombre nuevo: no está en tu personal, el libro ni el Directorio. Se guarda igual.</span>
          ) : null}
        </label>
        {enTala && onHora && (
          <label className="col-span-6 block sm:col-span-2">
            <span className="mb-1 flex min-h-6 items-center text-sm font-medium text-[var(--text-primary)]">Hora de tala</span>
            <input type="time" value={hora} onChange={(e) => onHora(e.target.value)} className={`${INPUT} font-mono tabular-nums`} />
          </label>
        )}
      </div>
    </section>
  );
}
