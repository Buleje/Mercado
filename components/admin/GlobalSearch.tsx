"use client";

/**
 * El buscador del panel, EN LÍNEA en la cabecera (Brandon 20-10: «quita este
 * modal de buscar en todo el panel y solo el campo de buscar módulos ahí mismo
 * se pueda buscar sin que aparezca otro modal de búsqueda»).
 *
 * Antes era un botón con forma de campo que abría una ventana centrada
 * («Buscar en todo el panel»). Ahora es el campo: se escribe ahí y los
 * resultados salen en un desplegable pegado debajo, con lo mismo que traía la
 * ventana — módulos, productos, clientes, pedidos, lo que abriste hace poco y
 * comandos («nueva venta», «cobrar a Juan»). Qué encuentra y con qué permiso:
 * `buscador/use-busqueda-panel`; teclado y destino: `buscador/use-buscador-en-linea`.
 *
 * En celular no entra en la barra: la lupa despliega el campo sobre la misma
 * cabecera (no una ventana) y la X lo pliega. Ctrl/⌘+K enfoca el campo.
 */

import { useEffect, useId } from "react";
import { Loader2, Search, X } from "@buleje/design-system/icons";
import { AtajoMod } from "@/components/admin/shared/AtajoMod";
import { cn } from "@/lib/utils";
import { PieBuscador } from "./buscador/PieBuscador";
import { ResultadosBuscador, idOpcion } from "./buscador/ResultadosBuscador";
import { useBuscadorEnLinea, type NavegarAlModulo } from "./buscador/use-buscador-en-linea";

interface Props {
  /** Ir a un módulo (por defecto, el evento `admin:navigate` que escucha el panel). */
  onNavigate?: NavegarAlModulo;
}

const BOTON_CELULAR = cn(
  "sm:hidden inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
  "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] ring-[color-mix(in_oklab,var(--accent)_18%,transparent)]",
  "hover:bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface-raised))]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
);

export default function GlobalSearch({ onNavigate }: Props) {
  const b = useBuscadorEnLinea(onNavigate);
  const idLista = `${useId()}-resultados`;
  const { mostrarLista, activo } = b;

  /* La fila elegida con el teclado no queda fuera de la vista de la lista. */
  useEffect(() => {
    if (!mostrarLista || activo < 0) return;
    document.getElementById(idOpcion(idLista, activo))?.scrollIntoView?.({ block: "nearest" });
  }, [mostrarLista, activo, idLista]);

  return (
    <div
      ref={b.raizRef}
      onBlur={b.alSalirDelFoco}
      data-buscador-panel-raiz=""
      className={cn(
        "relative flex shrink-0 items-center sm:min-w-11 sm:flex-1 sm:shrink sm:max-w-[var(--panel-search-max,30rem)]",
        // Celular desplegado: el campo tapa la cabecera entera (que es `sticky`, su caja de referencia).
        b.expandido && "max-sm:absolute max-sm:inset-0 max-sm:z-20 max-sm:gap-2 max-sm:bg-[var(--surface-raised)] max-sm:px-3",
      )}
    >
      {!b.expandido && (
        <button type="button" onClick={b.enfocar} aria-label="Buscar en el panel" className={BOTON_CELULAR}>
          <Search className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </button>
      )}

      {/* Un solo juego de clases para los dos temas: superficie y regla son
          tokens que cambian con `.dark`, también sobre la cabecera oscura de
          los temas Buleje/Ejecutivo (el campo lleva su propio fondo). */}
      {/* `div` y no `label`: adentro va el botón de borrar, y un botón no puede
          ir dentro de un label. Un clic en el borde, la lupa o la X deja el foco
          en el campo (la X igual recibe su clic). */}
      <div
        onMouseDown={(e) => {
          if (e.target === b.inputRef.current) return;
          e.preventDefault();
          b.inputRef.current?.focus();
        }}
        className={cn(
          "group min-w-0 flex-1 cursor-text items-center gap-2.5 rounded-xl border px-3.5 h-11 sm:h-10",
          b.expandido ? "flex" : "hidden sm:flex",
          // `[color:…]` y no `bg-[var(--surface-sunken)]`/`border-[var(--rule-base)]`:
          // globals.css fija esas dos clases exactas con !important en oscuro, y
          // el borde de foco y el fondo del hover no se veían (medido 20-10).
          "bg-[color:var(--surface-sunken)] border-[color:var(--rule-base)]",
          "transition-[background-color,border-color,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-editorial)]",
          // `not-focus-within`: con el mouse encima, el hover pisaba el borde de foco (medido 20-10).
          "hover:bg-[var(--surface-raised)] hover:not-focus-within:border-[color-mix(in_oklab,var(--accent)_45%,var(--rule-base))] hover:shadow-[var(--shadow-sm)]",
          "focus-within:bg-[var(--surface-raised)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]",
        )}
      >
        {b.loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
        ) : (
          <Search
            className="h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-colors group-hover:text-[var(--accent-ink)] group-focus-within:text-[var(--accent-ink)] dark:group-hover:text-[var(--accent)] dark:group-focus-within:text-[var(--accent)]"
            strokeWidth={2.25}
            aria-hidden
          />
        )}
        <input
          ref={b.inputRef}
          type="text"
          role="combobox"
          data-buscador-panel=""
          value={b.query}
          onChange={(e) => b.escribir(e.target.value)}
          onFocus={b.abrirLista}
          onKeyDown={b.alTeclear}
          placeholder="Buscar módulos, productos, clientes…"
          aria-label="Buscar en el panel: módulos, productos, clientes, pedidos y acciones"
          aria-keyshortcuts="Control+K Meta+K"
          aria-autocomplete="list"
          aria-expanded={mostrarLista}
          aria-controls={mostrarLista ? idLista : undefined}
          aria-activedescendant={mostrarLista && activo >= 0 ? idOpcion(idLista, activo) : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          // `text-base` en celular: con menos de 16 px Safari agranda la página al enfocar.
          // El foco lo marca el borde del campo: sin el `!`, el anillo global de
          // `[data-admin-shell] input:focus-visible` dibuja un segundo anillo adentro.
          className="min-w-0 flex-1 bg-transparent text-base font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus-visible:outline-none! focus-visible:ring-0! focus-visible:ring-offset-0! sm:text-sm"
        />
        {b.query ? (
          <button
            type="button"
            onClick={b.limpiar}
            aria-label="Borrar lo escrito"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          /* `--text-secondary`: terciario sobre `--surface-sunken` daba 3,51:1 en claro (AA pide 4,5). */
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-secondary)] transition-colors group-hover:border-[color-mix(in_oklab,var(--accent)_35%,var(--rule-base))]">
            <AtajoMod tecla="K" claseSimbolo="text-base leading-none" />
          </kbd>
        )}
      </div>

      {b.expandido && (
        <button type="button" onClick={b.soltar} aria-label="Cerrar el buscador" className={BOTON_CELULAR}>
          <X className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </button>
      )}

      {mostrarLista && (
        <div
          data-buscador-panel-lista=""
          // El foco se queda en el campo al hacer clic en una fila (si no, la lista se cierra antes del clic).
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "absolute left-0 top-full z-50 mt-3 w-[max(100%,min(36rem,calc(100vw-2rem)))] overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]",
            "max-sm:left-2 max-sm:right-2 max-sm:mt-0 max-sm:w-auto",
          )}
        >
          <div className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain">
            <ResultadosBuscador
              idLista={idLista}
              query={b.query}
              grouped={b.grouped}
              orden={b.orden}
              loading={b.loading}
              activo={activo}
              onElegir={b.elegir}
              onResaltar={b.setSeleccion}
            />
          </div>
          <PieBuscador />
        </div>
      )}
    </div>
  );
}
