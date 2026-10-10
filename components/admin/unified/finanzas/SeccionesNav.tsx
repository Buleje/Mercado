"use client";

/**
 * El segundo nivel de Mi Plata, en la fila del título.
 *
 * ANTES era una segunda barra de pestañas metida arriba del contenido: 40 px de
 * botones + 16 px de aire en 14 de las 15 vistas, y el primer dato recién
 * aparecía a los 325 px (medido a 1280 px el 2026-09-21). Un control chico al
 * lado del título hace el mismo trabajo sin cobrar una fila entera.
 *
 * POR QUÉ NO `SegmentedControl` del ui-system: ahí la etiqueta es un `string`
 * fijo, y acá hace falta que en pantalla angosta sólo se lea la etiqueta de la
 * sección ACTIVA (las otras quedan en ícono + tooltip). Con cinco secciones,
 * escribirlas todas a 400 px empuja la fila del título fuera de la pantalla.
 * El resto —radiogroup, flechas, foco— sigue el mismo patrón que el primitivo.
 *
 * LO QUE ESTÁ EN CERO NO OCUPA LUGAR: una sección cuyo dato existe pero está
 * vacío (préstamos sin préstamos, tesorería sin cuentas por pagar) sale de la
 * fila y se pliega detrás de «+N sin usar». No se borra: se sigue pudiendo
 * entrar —por ahí se carga el primero— y un enlace directo la muestra siempre,
 * porque la sección activa nunca se esconde.
 */

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ClaveDeDato } from "./estructura";
import type { MapaDeDatos } from "@/hooks/use-secciones-con-datos";

/**
 * Una opción del segundo nivel: una sección de Mi Plata (`Seccion`) o una
 * pestaña propia de un módulo montado adentro (Préstamos, Adelantos, Activos),
 * que trae su contador (`badge`) y a veces no trae ícono.
 */
export interface ItemDeNivel {
  id: string;
  label: string;
  corto?: string;
  /**
   * Lo que se lee a menos de 640 px cuando ni el `corto` entra en la fila que
   * se desliza (46vw): «Resumen de adelantos» medía 194 px en una caja de 184.
   */
  angosto?: string;
  icon?: LucideIcon;
  dato?: ClaveDeDato;
  badge?: number | string;
}

interface Props {
  secciones: readonly ItemDeNivel[];
  /** La sección activa (una vista de `adentro` marca a su dueña). */
  activa: string;
  onIr: (id: string) => void;
  /** Qué áreas tienen algo cargado. `undefined` = todavía no se sabe → se muestra. */
  datos?: MapaDeDatos;
  /** Nombre accesible del grupo («Secciones de Movimientos»). */
  etiqueta: string;
}

export default function SeccionesNav({ secciones, activa, onIr, datos = {}, etiqueta }: Props) {
  const [mostrarVacias, setMostrarVacias] = useState(false);
  const grupo = useRef<HTMLDivElement>(null);

  const estaVacia = (s: ItemDeNivel) => Boolean(s.dato) && datos[s.dato!] === false && s.id !== activa;
  const vacias = secciones.filter(estaVacia);
  const visibles = secciones.filter((s) => !estaVacia(s));
  /** A 400 px, con cuatro o más secciones no entra ni la etiqueta de la activa. */
  const compacto = visibles.length > 3;
  /**
   * Con más de cinco (las siete pestañas de Adelantos) no entran escritas ni a
   * 1280 px: en la fila del título, junto a «Nuevo adelanto» y «Opciones», se
   * salían por la derecha (medido 2026-10-10). Ahí sólo se lee la activa —a
   * cualquier ancho: a 400 px eran siete íconos mudos y la pestaña del primer
   * nivel quedaba fuera de vista, así que nada decía dónde estabas—; el resto,
   * ícono + tooltip. El criterio es la cantidad, no una medición (igual que
   * AdminTabBar): medir el ancho para decidir el ancho oscila.
   */
  const muchas = visibles.length > 5;
  const claseEtiqueta = (s: ItemDeNivel, activo: boolean) =>
    !s.icon ? "inline"
    : muchas ? (activo ? "inline" : "hidden")
    : activo && !compacto ? "inline" : "hidden sm:inline";

  /* Angosto, la fila se desliza adentro: la activa tiene que quedar a la vista
     (al entrar por un enlace a la sexta pestaña, arrancaba tapada). Se corre
     sólo esta caja —nunca `scrollIntoView`, que también movería la página. */
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = caja.current;
    if (!c || c.scrollWidth <= c.clientWidth) return;
    const boton = c.querySelector<HTMLElement>(`[data-seccion="${activa}"]`);
    if (!boton) return;
    const r = c.getBoundingClientRect();
    const b = boton.getBoundingClientRect();
    if (b.left < r.left) c.scrollLeft -= r.left - b.left + 8;
    else if (b.right > r.right) c.scrollLeft += b.right - r.right + 8;
  }, [activa]);

  /** Flechas dentro del grupo, como manda el patrón de radiogroup de ARIA. */
  const teclas = (e: React.KeyboardEvent) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    const i = visibles.findIndex((s) => s.id === activa);
    if (i === -1 || visibles.length < 2) return;
    e.preventDefault();
    const destino =
      e.key === "Home" ? visibles[0]
      : e.key === "End" ? visibles[visibles.length - 1]
      : visibles[(i + (e.key === "ArrowRight" ? 1 : -1) + visibles.length) % visibles.length];
    onIr(destino.id);
    requestAnimationFrame(() => {
      grupo.current?.querySelector<HTMLButtonElement>(`[data-seccion="${destino.id}"]`)?.focus();
    });
  };

  return (
    /* El tope en `vw` es lo que le deja aire al título a 400 px: la banda de
       AdminTabBar pone las acciones en un contenedor `shrink-0`, así que sin
       un techo propio este control empuja «Mi Plata» hasta partirlo en dos
       líneas. Si aun así no entra, se desliza acá adentro — nunca la página. */
    <div
      ref={caja}
      data-secciones-nav=""
      className="flex min-w-0 flex-wrap items-center gap-1.5 max-sm:max-w-[46vw] max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[scrollbar-width:none]"
    >
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus --
          el grupo NO debe ser focusable: el foco vive en los botones con
          tabIndex roving (igual que AdminTabBar y que SegmentedControl del
          ui-system). Hacerlo focusable agrega una parada de Tab que no lleva
          a ningún lado. */}
      <div
        ref={grupo}
        role="radiogroup"
        aria-label={etiqueta}
        onKeyDown={teclas}
        className="inline-flex items-center gap-0.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-px"
      >
        {visibles.map((s) => {
          const activo = s.id === activa;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              data-seccion={s.id}
              aria-checked={activo}
              tabIndex={activo ? 0 : -1}
              title={s.label}
              aria-label={s.badge != null && s.badge !== "" ? `${s.label}, con pendientes` : s.label}
              onClick={() => onIr(s.id)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors max-sm:px-2",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                activo
                  ? "bg-[var(--surface-raised)] text-[var(--accent-ink)] shadow-sm dark:text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {s.icon && <s.icon className="h-4 w-4 shrink-0" aria-hidden />}
              {/* Angosto: sólo la sección activa se lee; el resto son ícono +
                  tooltip. Con cuatro o cinco ni eso entra a 400 px sin tapar
                  el «+N sin usar», así que ahí van todas en ícono (medido);
                  con más de cinco la fila ya se desliza y la activa se lee. */}
              <span className={cn("whitespace-nowrap", claseEtiqueta(s, activo))}>
                {s.angosto ? (
                  <>
                    <span className="sm:hidden">{s.angosto}</span>
                    <span className="max-sm:hidden">{s.corto ?? s.label}</span>
                  </>
                ) : (
                  s.corto ?? s.label
                )}
              </span>
              {s.badge != null && s.badge !== "" && (
                <span className="rounded-full bg-[var(--data-warning-500)]/15 px-1.5 text-xs font-bold tabular-nums text-[var(--data-warning-ink)]">
                  {s.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {vacias.length > 0 && !mostrarVacias && (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setMostrarVacias(true)}
          title={`Sin datos todavía: ${vacias.map((s) => s.label).join(", ")}`}
          className="inline-flex min-h-12 shrink-0 items-center gap-1 rounded-full border border-dashed border-[var(--rule-base)] px-3 max-sm:px-2 text-sm font-semibold text-[var(--text-tertiary)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text-secondary)]"
        >
          +{vacias.length}
          {/* En angosto alcanza el «+1»: el tooltip y el `aria-label` dicen el resto. */}
          <span className="hidden sm:inline">sin usar</span>
          <span className="sr-only">secciones sin datos todavía</span>
        </button>
      )}

      {mostrarVacias &&
        vacias.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onIr(s.id)}
            title={`${s.label} · sin datos todavía`}
            className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-tertiary)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text-secondary)]"
          >
            {s.icon && <s.icon className="h-4 w-4 shrink-0" aria-hidden />}
            <span className="whitespace-nowrap">{s.corto ?? s.label}</span>
            <span className="hidden text-[length:var(--ts-xs)] font-medium sm:inline">sin datos</span>
          </button>
        ))}
    </div>
  );
}
