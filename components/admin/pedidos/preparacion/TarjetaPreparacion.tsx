"use client";

/**
 * Un pedido por preparar: su lista para ir marcando, y «Listo para salir».
 *
 *  - Cada línea se marca entera con el check; si pidieron más de uno, − y +
 *    anotan lo que sí se encontró (nunca más de lo pedido: lo rechaza el
 *    servidor también).
 *  - «Marcar listo» guarda quién, cuándo y cuántos bultos; con algo faltando
 *    queda «Listo con faltante» y el faltante no se borra.
 *  - Si el pedido seguía «Confirmado», «Marcar listo» lo pasa a «Preparando»
 *    con la transición de siempre (la del Tablero), sólo si tu rol mueve pedidos.
 */

import { useState } from "react";
import { Check, ExternalLink, Minus, MoreHorizontal, PackageCheck, Plus, RotateCcw, Undo2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { cn } from "@/lib/utils";
import { diaRelativo, textoFranja } from "@/lib/pedidos/franja-entrega";
import { textoDuracion } from "@/lib/pedidos/analisis-operativo";
import {
  avanceDeLineas,
  etapaDe,
  faltantesDe,
  numeroPedido,
  preparadaDe,
  type CambioPrep,
  type PedidoPrep,
} from "@/lib/pedidos/preparacion";
import { ChipEtapa } from "./piezas";

interface Props {
  pedido: PedidoPrep;
  ocupado: boolean;
  /** Puede anotar lo juntado (almacén, caja, gestión). */
  puedeAnotar: boolean;
  /** Puede mover el pedido de estado (caja, gestión). */
  puedeMover: boolean;
  ahora: number;
  onCambiar: (c: CambioPrep) => Promise<boolean>;
  onEmpezar: () => Promise<boolean>;
}

const PASO = "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-40";

const hora = (iso: string) =>
  new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(11, 16);

export function TarjetaPreparacion({ pedido: p, ocupado, puedeAnotar, puedeMover, ahora, onCambiar, onEmpezar }: Props) {
  const ficha = useFichaEnUrl("pedido");
  const [bultos, setBultos] = useState("");
  const etapa = etapaDe(p);
  const { listas, total } = avanceDeLineas(p);
  const listo = p.avance?.listo ?? null;
  const bloqueado = ocupado || !puedeAnotar || Boolean(listo);
  const faltantes = listo ? faltantesDe(p) : [];

  const marcarListo = async () => {
    const n = Number.parseInt(bultos, 10);
    const ok = await onCambiar({ accion: "listo", bultos: Number.isFinite(n) && n > 0 ? n : null });
    if (ok && p.estado === "confirmado" && puedeMover) await onEmpezar();
    if (ok) setBultos("");
  };

  const acciones: MenuAccion[] = [
    { id: "abrir", label: "Abrir el pedido", icon: ExternalLink, onSelect: () => ficha.abrir(p.id) },
    { id: "todo", label: "Juntar todo", hint: "Marca todas las líneas completas", icon: Check, disabled: bloqueado, onSelect: () => void onCambiar({ accion: "todo" }) },
    { id: "cero", label: "Empezar de cero", hint: "Borra lo marcado de este pedido", icon: RotateCcw, disabled: ocupado || !puedeAnotar || !p.avance, onSelect: () => void onCambiar({ accion: "reiniciar" }) },
  ];

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3" data-qa="tarjeta-preparacion">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={() => ficha.abrir(p.id)}
          className="min-w-0 truncate text-left text-base font-bold text-[var(--text-primary)] hover:underline"
          title="Abrir el pedido"
        >
          <span className="font-mono">{numeroPedido(p.id)}</span> · {p.cliente}
        </button>
        <ChipEtapa etapa={etapa} />
        <span className="text-xs text-[var(--text-tertiary)]">
          {p.estado === "confirmado" ? "Confirmado" : "Preparando"} hace {textoDuracion(ahora - Date.parse(p.enEstadoDesde))}
        </span>
        <div className="ml-auto">
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Abrir, juntar todo o empezar de cero" />
        </div>
      </header>

      {(p.entrega || p.notas || p.repartidor) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
          {p.entrega && (
            <span>
              Entrega: <b className="text-[var(--text-primary)]">{diaRelativo(p.entrega.fecha, new Date(ahora))}</b> · {textoFranja(p.entrega.franja)}
              {p.entrega.nota ? ` · ${p.entrega.nota}` : ""}
            </span>
          )}
          {p.repartidor && <span>Lo lleva: {p.repartidor}</span>}
          {p.notas && <span className="min-w-0 truncate" title={p.notas}>Nota: {p.notas}</span>}
        </div>
      )}

      <ul className="divide-y divide-[var(--rule-soft)]">
        {p.lineas.map((l) => {
          const hecha = preparadaDe(p, l);
          const completa = hecha >= l.cantidad;
          const stockCorto = l.stock != null && l.stock < l.cantidad - hecha;
          return (
            <li key={l.itemId} className="flex items-center gap-2 py-1">
              <label className={cn("flex min-h-12 min-w-0 flex-1 items-center gap-3", !bloqueado && "cursor-pointer")}>
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                  checked={completa}
                  disabled={bloqueado}
                  onChange={() => void onCambiar({ accion: "linea", itemId: l.itemId, preparada: completa ? 0 : l.cantidad })}
                />
                <span className="min-w-0">
                  <span className={cn("block text-sm text-[var(--text-primary)]", completa && "text-[var(--text-tertiary)] line-through")}>
                    <b className="tabular-nums">{l.cantidad} {l.unidad}</b> · {l.nombre}
                  </span>
                  {(l.detalle || stockCorto) && (
                    <span className="block text-xs text-[var(--text-secondary)]">
                      {l.detalle}
                      {l.detalle && stockCorto ? " · " : ""}
                      {stockCorto && <span className="font-semibold text-[var(--data-warning-ink)]">El sistema dice {l.stock} en stock</span>}
                    </span>
                  )}
                </span>
              </label>
              {l.cantidad > 1 && !completa && (
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" className={PASO} disabled={bloqueado || hecha === 0} aria-label={`Uno menos de ${l.nombre}`}
                    onClick={() => void onCambiar({ accion: "linea", itemId: l.itemId, preparada: hecha - 1 })}>
                    <Minus className="h-4 w-4" aria-hidden />
                  </button>
                  <span className="w-12 text-center text-sm tabular-nums text-[var(--text-secondary)]">{hecha}/{l.cantidad}</span>
                  <button type="button" className={PASO} disabled={bloqueado} aria-label={`Uno más de ${l.nombre}`}
                    onClick={() => void onCambiar({ accion: "linea", itemId: l.itemId, preparada: hecha + 1 })}>
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {listo ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2 text-sm">
          <PackageCheck className="h-5 w-5 shrink-0 text-[var(--data-success-500)]" aria-hidden />
          <span className="min-w-0 flex-1 text-[var(--text-secondary)]">
            Listo{listo.bultos ? ` · ${listo.bultos} ${listo.bultos === 1 ? "bulto" : "bultos"}` : ""} · {listo.por} a las {hora(listo.at)}
            {faltantes.length > 0 && (
              <span className="block font-semibold text-[var(--data-warning-ink)]">
                Falta: {faltantes.map((f) => `${f.falta} ${f.unidad} de ${f.nombre}`).join(" · ")}
              </span>
            )}
          </span>
          {puedeAnotar && (
            <button type="button" disabled={ocupado} onClick={() => void onCambiar({ accion: "deshacer-listo" })}
              className={button({ variant: "ghost", className: "gap-1.5 rounded-xl px-3" })}>
              <Undo2 className="h-4 w-4" aria-hidden /> Deshacer
            </button>
          )}
        </footer>
      ) : puedeAnotar ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2">
          <span className="mr-auto text-sm tabular-nums text-[var(--text-secondary)]">
            {listas} de {total} {total === 1 ? "línea" : "líneas"}
          </span>
          {p.estado === "confirmado" && puedeMover && (
            <button type="button" disabled={ocupado} onClick={() => void onEmpezar()} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>
              Empezar a preparar
            </button>
          )}
          <input
            type="text"
            inputMode="numeric"
            value={bultos}
            onChange={(e) => setBultos(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="Bultos"
            aria-label="Cuántos bultos salen"
            className="h-12 w-24 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none"
          />
          <button type="button" disabled={ocupado || etapa === "sin-empezar"} onClick={() => void marcarListo()}
            className={button({ variant: "primary", className: "gap-1.5 rounded-xl px-4" })} data-qa="marcar-listo">
            <PackageCheck className="h-4 w-4" aria-hidden /> Marcar listo
          </button>
        </footer>
      ) : null}
    </article>
  );
}
