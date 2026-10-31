"use client";

/**
 * La columna izquierda de la libreta: buscador, orden y la lista de la
 * categoría. Un clic elige (la ficha se ve al lado); doble clic o Enter usa.
 * ↑ ↓ recorren la lista; desde el buscador, ↓ entra a la lista y Enter usa la
 * elegida (tipear «made» + Enter alcanza para el comprador de siempre).
 */

import { useRef, type KeyboardEvent } from "react";
import { AlertTriangle, Search } from "@buleje/design-system/icons";
import { ROL_LABEL, direccionCompleta, formatearPlaca, type RolParte } from "@/lib/forestal/directorio";
import { ORDENES_LIBRETA, fichaDeParte, fichaDeVehiculo, type EntradaLibreta, type OrdenLibreta } from "@/lib/forestal/libreta";
import { cn } from "@/lib/utils";
import { I } from "./ctp-shared";

/** Lo que se lee de una fila sin abrirla: documento, dirección o marca. */
function detalle(e: EntradaLibreta, conPapeles: boolean): string {
  if (e.tipo === "vehiculo") {
    const v = e.vehiculo;
    return [v.placaRemolque ? `Remolque ${formatearPlaca(v.placaRemolque)}` : null, v.marca, v.tipo, v.transportistaNombre].filter(Boolean).join(" · ");
  }
  const p = e.parte;
  return [
    conPapeles ? p.roles.map((r) => ROL_LABEL[r]).join(", ") : null,
    p.docNumero ? `${p.docTipo ?? ""} ${p.docNumero}`.trim() : null,
    direccionCompleta(p) || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function LibretaLista({
  lista,
  elegidaId,
  rolFicha,
  usables,
  q,
  onBuscar,
  orden,
  onOrden,
  vacia,
  onElegir,
  onUsar,
}: {
  lista: EntradaLibreta[];
  elegidaId: string | null;
  /** Con qué papel se juzga lo que falta (el del bloque, o el de la categoría). */
  rolFicha: RolParte | null;
  /** Las que se usan directo en este bloque; las demás muestran sus papeles. */
  usables: ReadonlySet<string>;
  q: string;
  onBuscar: (q: string) => void;
  orden: OrdenLibreta;
  onOrden: (o: OrdenLibreta) => void;
  /** Lo que se dice con la lista vacía. */
  vacia: React.ReactNode;
  onElegir: (id: string, abrirFicha?: boolean) => void;
  onUsar: (e: EntradaLibreta) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const i = lista.findIndex((e) => e.id === elegidaId);

  const enfocar = (id: string) =>
    requestAnimationFrame(() => caja.current?.querySelector<HTMLElement>(`[data-entrada="${CSS.escape(id)}"]`)?.focus());

  const mover = (destino: number) => {
    const e = lista[Math.max(0, Math.min(lista.length - 1, destino))];
    if (!e) return;
    onElegir(e.id);
    enfocar(e.id);
  };

  const alTeclearLista = (ev: KeyboardEvent<HTMLDivElement>) => {
    const destino =
      ev.key === "ArrowDown" ? i + 1 : ev.key === "ArrowUp" ? i - 1 : ev.key === "Home" ? 0 : ev.key === "End" ? lista.length - 1 : null;
    if (destino != null) {
      ev.preventDefault();
      mover(destino);
    } else if (ev.key === "Enter" && lista[i]) {
      ev.preventDefault();
      onUsar(lista[i]);
    }
  };

  const alTeclearBuscador = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "ArrowDown" && lista.length > 0) {
      ev.preventDefault();
      mover(Math.max(i, 0));
    } else if (ev.key === "Enter" && lista[Math.max(i, 0)]) {
      ev.preventDefault();
      onUsar(lista[Math.max(i, 0)]);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            ref={(el) => {
              /* Al abrir, el foco va al buscador (sólo con teclado físico: a
                 400 px abriría el teclado del celular tapando la lista). Un
                 cuadro después: el foco inicial de AdminModal (la X) corría
                 después del montaje y lo pisaba (medido 16-10: foco «Cerrar»). */
              if (el && !el.dataset.enfocado && window.matchMedia("(min-width: 640px)").matches) {
                el.dataset.enfocado = "1";
                requestAnimationFrame(() => el.focus());
              }
            }}
            type="search"
            aria-label="Buscar en la libreta por nombre, RUC, DNI, placa o dirección"
            className={`${I} pl-9`}
            placeholder="Nombre, RUC, DNI, placa…"
            value={q}
            onChange={(e) => onBuscar(e.target.value)}
            onKeyDown={alTeclearBuscador}
          />
        </div>
        <select aria-label="Orden de la lista" className={cn(I, "w-auto shrink-0")} value={orden} onChange={(e) => onOrden(e.target.value as OrdenLibreta)}>
          {ORDENES_LIBRETA.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">{vacia}</div>
      ) : (
        <div
          ref={caja}
          role="listbox"
          aria-label="Entradas de la libreta"
          onKeyDown={alTeclearLista}
          className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto overscroll-contain p-0.5"
        >
          {lista.map((e) => {
            const elegida = e.id === elegidaId;
            const faltan = e.tipo === "vehiculo" ? fichaDeVehiculo(e.vehiculo).faltan : rolFicha ? fichaDeParte(e.parte, rolFicha).faltan : [];
            const otroPapel = e.tipo === "parte" && !usables.has(e.id);
            return (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={elegida}
                tabIndex={elegida || (i < 0 && e === lista[0]) ? 0 : -1}
                data-entrada={e.id}
                onClick={() => onElegir(e.id, true)}
                onDoubleClick={() => onUsar(e)}
                className={`flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] ${
                  elegida
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/60"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-bold text-[var(--text-primary)] ${e.tipo === "vehiculo" ? "font-mono" : ""}`}>{e.nombre}</span>
                  <span className="block truncate text-xs text-[var(--text-tertiary)]">{detalle(e, otroPapel) || "Sin más datos"}</span>
                </span>
                {faltan.length > 0 && (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-label={`Le falta ${faltan.join(" y ")}`} />
                )}
                {e.usos > 0 && (
                  <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
                    {e.usos}×
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
