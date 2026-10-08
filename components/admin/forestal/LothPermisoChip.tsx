"use client";

/**
 * LothPermisoChip — con qué permiso se mira TODO el Libro TH, en la banda, al
 * lado de la carátula.
 *
 * Pedido de Brandon (02-10-2026): «al lado de configurar carátula, que se ponga
 * para cambiar de permiso; que funcione como un filtro y acceso directo al
 * crear registros, en todas las pestañas del libro». Antes cada vista tenía su
 * selector (seis sueltos) y el de la banda era el permiso de TRABAJO del CTP,
 * que no filtraba nada del libro. Ahora este chip escribe en el permiso del
 * libro (`LothPermisoContext`) y cada vista lo lee: Secciones, Plan de manejo,
 * Mapa, Trazabilidad, el Excel, el PDF y los formularios de alta.
 *
 * Si el plan elegido está atado a un permiso del Directorio (`contratoId`), el
 * permiso de trabajo del panel lo sigue (`useContratoDelPlan`): el Libro CTP
 * abre con el mismo papel. Con «Todos» no se toca: soltarlo sería borrar una
 * elección hecha en el CTP.
 *
 * Copia los tres arreglos de `ContratoActivoChip`: el menú va en un portal (la
 * tarjeta del libro tiene `overflow-hidden`), el ancla se acota al ancho de la
 * ventana (a 400 px se salía por la izquierda) y el click-afuera mira también
 * el menú (si no, el mousedown sobre una opción lo cerraba antes del click).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Check, ChevronDown, Filter, TriangleAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useContratoActivo } from "@/contexts/contrato-activo-context";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { Contrato } from "@/lib/forestal/contratos";
import { PERMISO_SIN_PLAN } from "@/lib/forestal/loth-filtro-permiso";
import {
  bandaDelPlan,
  nombreDelPlan,
  type PlanTablero,
  type TonoVigencia,
} from "@/lib/forestal/loth-tablero-permiso";
import { usePublicarFranjaLibro } from "@/components/admin/shared/libro-franja-permiso";
import { useLothPermiso } from "./hooks/use-loth-libro-permiso";

const TONO_VIGENCIA: Record<TonoVigencia, string> = {
  ok: "text-[var(--text-tertiary)]",
  "sin-fecha": "text-[var(--text-tertiary)]",
  atencion: "font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  vencida: "font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
};

const OPCION =
  "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

/**
 * Deja como permiso de TRABAJO del panel (el que propone el Libro CTP) el del
 * Directorio al que está atado el plan. Sólo si lo está y si ese permiso sigue
 * vivo en la lista: un papel que no se pudo leer no se fija a ciegas.
 */
export function useContratoDelPlan() {
  const { activo, fijar } = useContratoActivo();
  const activoId = activo?.id ?? null;
  return useCallback(
    async (plan: Pick<PlanTablero, "contratoId"> | null) => {
      const cid = plan?.contratoId ?? null;
      if (!cid || cid === activoId) return;
      try {
        const r = await fetch("/api/admin/forestal/contratos", {
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const c = (await leerJson<{ contratos?: Contrato[] }>(r))?.contratos?.find(
          (x) => x.id === cid,
        );
        if (c) fijar({ id: c.id, codigo: c.codigo, titular: c.alias ?? c.titularNombre ?? null });
      } catch (err) {
        logger.warn("[loth-permiso] no se pudo seguir el permiso del Directorio", {
          error: String(err),
        });
      }
    },
    [activoId, fijar],
  );
}

export default function LothPermisoChip() {
  const libro = useLothPermiso();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight: number;
  } | null>(null);

  const ubicar = useCallback(() => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const MARGEN = 12;
    const abajo = window.innerHeight - r.bottom - MARGEN;
    const arriba = r.top - MARGEN;
    const haciaArriba = abajo < 220 && arriba > abajo;
    const ancho = Math.min(384, window.innerWidth - 16); // 24rem, o lo que haya
    const right = Math.min(
      Math.max(8, window.innerWidth - r.right),
      Math.max(8, window.innerWidth - ancho - 8),
    );
    setPos(
      haciaArriba
        ? { bottom: window.innerHeight - r.top + 4, right, maxHeight: Math.max(160, arriba) }
        : { top: r.bottom + 4, right, maxHeight: Math.max(160, abajo) },
    );
  }, []);

  useLayoutEffect(() => {
    if (!abierto) return;
    ubicar();
    window.addEventListener("resize", ubicar);
    // Captura: el scroll que importa es el del contenedor del panel, que no burbujea.
    window.addEventListener("scroll", ubicar, true);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
    };
  }, [abierto, ubicar]);

  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (caja.current?.contains(t) || menu.current?.contains(t)) return;
      setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setAbierto(false);
      boton.current?.focus();
    };
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  /* La franja «Viendo solo …» del chrome: con un permiso elegido el libro está filtrado. */
  const planVisto = libro?.listo ? libro.plan : null;
  const textoFranja = planVisto
    ? `el permiso ${nombreDelPlan(planVisto)}${planVisto.titularName && planVisto.titularName !== nombreDelPlan(planVisto) ? ` · ${planVisto.titularName}` : ""}`
    : libro?.listo && libro.planSel === PERMISO_SIN_PLAN
      ? "las líneas sin permiso"
      : null;
  usePublicarFranjaLibro(textoFranja, () => libro?.elegirPlan(null));

  if (!libro) return null;
  if (!libro.listo) {
    // Reserva el alto exacto: sin esto la banda salta cuando llega el valor.
    return <div className="h-10 w-[11rem]" aria-hidden="true" />;
  }

  const { planes, planSel, plan, seCayo, elegirPlan, errorLista, reintentar } = libro;
  const sinPlan = planSel === PERMISO_SIN_PLAN;
  const elegir = (id: string | null) => {
    if (id !== planSel) {
      /* Un aviso breve: el cambio filtra TODAS las vistas del libro, no sólo la que estás mirando. */
      const p = planes.find((x) => x.id === id);
      toast(
        id == null
          ? "Ahora ves todos los permisos"
          : id === PERMISO_SIN_PLAN
            ? "Ahora ves sólo las líneas sin permiso"
            : `Ahora ves sólo el permiso ${p ? nombreDelPlan(p) : ""}`.trim(),
        { duration: 2500 },
      );
    }
    elegirPlan(id);
    setAbierto(false);
  };
  const titulo = plan
    ? `Viendo el permiso ${nombreDelPlan(plan)}${plan.titularName ? ` · ${plan.titularName}` : ""}. Filtra todas las vistas del libro y se propone al registrar. Clic para cambiarlo.`
    : sinPlan
      ? "Viendo sólo las líneas que no citan un plan de manejo. Clic para cambiarlo."
      : "Viendo todos los permisos del libro. Clic para elegir uno.";

  return (
    <div ref={caja} className="relative flex min-w-0">
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        title={titulo}
        /* Con un permiso elegido el libro está FILTRADO: eso se tiene que ver de
           lejos (Brandon 08-10: el punteado de 2 px de «Todos» se veía más
           fuerte que el filtro). Elegido = fondo lleno de acento; «Todos» = un
           borde fino y callado, porque no filtra nada. El titular cede primero
           cuando la banda aprieta (mismo criterio que la carátula). */
        className={`inline-flex h-10 min-w-0 max-w-[24rem] items-center gap-2 rounded-xl px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${
          plan || sinPlan
            ? "border border-[var(--accent-dark)] bg-[var(--accent-dark)] font-semibold text-white hover:brightness-90"
            : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
        }`}
      >
        <Filter className={`h-4 w-4 shrink-0 ${plan || sinPlan ? "text-white" : "text-[var(--accent-ink)]"}`} aria-hidden="true" />
        {plan ? (
          <>
            <span className="min-w-0 shrink truncate font-mono text-xs font-bold tabular-nums">
              {nombreDelPlan(plan)}
            </span>
            {plan.titularName && plan.titularName !== nombreDelPlan(plan) && (
              <span className="min-w-0 flex-1 basis-0 truncate font-normal text-white/85 max-lg:hidden @max-[46rem]/acciones:hidden">
                {plan.titularName}
              </span>
            )}
          </>
        ) : (
          <span className="truncate">{sinPlan ? "Líneas sin permiso" : "Todos los permisos"}</span>
        )}
        {seCayo && (
          <span
            role="img"
            aria-label="El permiso que elegiste se dio de baja"
            className="h-2 w-2 shrink-0 rounded-full bg-[var(--data-warning-500)] ring-2 ring-white"
          />
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {abierto &&
        pos &&
        createPortal(
          <div
            ref={menu}
            style={{ top: pos.top, bottom: pos.bottom, right: pos.right, maxHeight: pos.maxHeight }}
            className="fixed z-[70] w-[24rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-lg"
          >
            <div className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-1">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Permiso del libro
              </span>
              <InfoTip
                title="Permiso del libro"
                what="Filtra todas las vistas del libro por el plan de manejo elegido: secciones, plan de manejo, mapa, trazabilidad, el Excel y el PDF."
                affects="Al registrar una tala, un trozado o un despacho se propone este plan. Si el plan está atado a un permiso del Directorio, el Libro CTP abre con ese permiso."
                example="Con «PO 12», el mapa pinta su censo y el PDF dice arriba «Permiso PO 12»."
              />
            </div>

            {seCayo && (
              <p className="mx-1 mb-1.5 flex items-start gap-2 rounded-lg bg-[var(--data-warning-50)] px-2.5 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                El permiso que elegiste se dio de baja: ves todos.
              </p>
            )}

            <div role="listbox" aria-label="Permiso del libro">
              <Opcion
                elegida={planSel == null}
                onClick={() => elegir(null)}
                titulo="Todos los permisos"
                detalle="el libro entero"
              />

              {planes.length === 0 &&
                (errorLista ? (
                  <p
                    role="status"
                    className="flex flex-wrap items-center gap-2 px-2.5 py-3 text-sm text-[var(--data-warning-ink)]"
                  >
                    No se pudo traer la lista de permisos.
                    <button
                      type="button"
                      onClick={reintentar}
                      className="font-semibold text-[var(--accent-ink)] underline underline-offset-2"
                    >
                      Reintentar
                    </button>
                  </p>
                ) : (
                  <p className="px-2.5 py-3 text-sm text-[var(--text-tertiary)]">
                    Todavía no hay planes de manejo. Créalos en Trazabilidad › Plan de manejo.
                  </p>
                ))}

              {planes.map((p) => {
                const b = bandaDelPlan(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={p.id === planSel}
                    onClick={() => elegir(p.id)}
                    className={OPCION}
                  >
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${p.id === planSel ? "opacity-100" : "opacity-0"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="shrink-0 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
                          {b.tipo}
                        </span>
                        <span className="min-w-0 truncate font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                          {b.nombre}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]">
                        {b.titular ?? "Sin titular"}
                        {" · "}
                        <span className={TONO_VIGENCIA[b.vigencia.tono]}>{b.vigencia.texto}</span>
                      </span>
                    </span>
                  </button>
                );
              })}

              <Opcion
                elegida={sinPlan}
                onClick={() => elegir(PERMISO_SIN_PLAN)}
                titulo="Líneas sin permiso"
                detalle="las que no citan un plan"
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Opcion({
  elegida,
  onClick,
  titulo,
  detalle,
}: {
  elegida: boolean;
  onClick: () => void;
  titulo: string;
  detalle: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={elegida}
      onClick={onClick}
      className={`${OPCION} items-center`}
    >
      <Check
        className={`h-4 w-4 shrink-0 ${elegida ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      />
      <span className="text-sm text-[var(--text-primary)]">{titulo}</span>
      <span className="ml-auto text-xs text-[var(--text-tertiary)]">{detalle}</span>
    </button>
  );
}
