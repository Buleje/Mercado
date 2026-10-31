"use client";

import { useState, type FormEvent } from "react";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import Plegable from "@/components/admin/shared/Plegable";
import { button } from "@/components/ui-system/button-variants";
import {
  ArrowRight, Check, FileText, Link2Off, Loader2, Pencil, Repeat, Ruler, ScrollText, TreePine, Wallet, X, type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fechaConDiaCorta } from "@/lib/documentos/enlace-varias-carpetas";
import { TIPO_TERCERO_LABEL, type TipoTercero } from "@/lib/documentos/terceros-vinculo";
import { TOPE_ALIAS, type TipoVinculoSistema, type VinculoSistema } from "@/lib/documentos/vinculos-sistema";
import EnElSistema from "../esenciales/EnElSistema";
import { CAMPO_BUSCAR, ICONO_TERCERO } from "./compartido";

const MODULO: Record<Exclude<TipoVinculoSistema, TipoTercero>, { icono: LucideIcon; rotulo: string }> = {
  plan: { icono: TreePine, rotulo: "Plan de manejo" },
  guias: { icono: FileText, rotulo: "Guías del Libro CTP" },
  permisos: { icono: ScrollText, rotulo: "Permisos y contratos" },
  cargas: { icono: Ruler, rotulo: "Cargas medidas" },
  equipo: { icono: Wallet, rotulo: "Pagos del equipo" },
};

function esTercero(t: TipoVinculoSistema): t is TipoTercero {
  return t in TIPO_TERCERO_LABEL;
}

/**
 * Un vínculo de la carpeta en «Vínculos con el sistema…»: a qué (nombre y
 * tipo), en qué página vive, el enlace para ir y desde cuándo. Lo ligado a mano
 * se renombra, se cambia o se quita (⋯); lo que puso un módulo es de lectura.
 */
export default function FilaVinculo({ v, carpetaId, nombre, nombreReal, alias, registro, conRegistro, puedeEditar, ocupado, onRenombrar, onCambiar, onQuitar }: {
  v: VinculoSistema;
  carpetaId: string;
  /** Lo que se muestra: el alias o el nombre real. */
  nombre: string;
  /** El nombre en su ficha, cuando hay alias (para no perderlo de vista). */
  nombreReal: string | null;
  alias: string | null;
  registro: { desde: string; por: string } | null;
  /** false = el registro todavía no llegó (no se dice «sin registro» antes de tiempo). */
  conRegistro: boolean;
  puedeEditar: boolean;
  ocupado: boolean;
  onRenombrar: (alias: string | null) => Promise<void>;
  onCambiar: () => void;
  onQuitar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ligado = v.origen === "ligado";
  const tercero = esTercero(v.tipo) ? v.tipo : null;
  const Icono = tercero ? ICONO_TERCERO[tercero] : MODULO[v.tipo as Exclude<TipoVinculoSistema, TipoTercero>].icono;
  const tipo = tercero ? TIPO_TERCERO_LABEL[tercero].uno : MODULO[v.tipo as Exclude<TipoVinculoSistema, TipoTercero>].rotulo;

  const guardar = async (valor: string | null, e?: FormEvent) => {
    e?.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await onRenombrar(valor?.trim() ? valor : null);
      setEditando(false);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo guardar. Prueba de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const acciones: MenuAccion[] = [
    { id: "renombrar", label: alias ? "Cambiar el nombre propio" : "Ponerle un nombre propio", icon: Pencil, onSelect: () => { setTexto(alias ?? nombre); setEditando(true); } },
    ...(alias ? [{ id: "sin-alias", label: "Volver al nombre del sistema", icon: X, onSelect: () => void guardar(null) }] : []),
    { id: "cambiar", label: "Cambiar a otro…", icon: Repeat, onSelect: onCambiar },
    { id: "quitar", label: "Quitar el vínculo", icon: Link2Off, tone: "danger", onSelect: onQuitar },
  ];

  const cuando = !ligado
    ? v.heredadoDe ? `Lo puso el sistema · viene de «${v.heredadoDe}»` : "Lo puso el sistema"
    : registro ? `Desde el ${fechaConDiaCorta(registro.desde)} · por ${registro.por}`
    : conRegistro ? "Sin registro de quién la ligó (antes del 24/10)" : "";

  return (
    <li className="space-y-2 px-3 py-3" data-qa="vinculo-fila" data-clave={v.clave}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
          <Icono aria-hidden className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-[1_1_12rem] space-y-0.5">
          {editando ? (
            <form onSubmit={(e) => void guardar(texto, e)} className="flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={texto}
                maxLength={TOPE_ALIAS}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditando(false); } }}
                aria-label="Nombre propio del vínculo"
                placeholder="Cómo lo llamas, ej: Santa Rosa"
                className={cn(CAMPO_BUSCAR, "min-w-0 flex-[1_1_10rem] pl-3")}
                data-qa="vinculo-alias"
              />
              <button type="submit" disabled={guardando} className={cn(button({ variant: "primary", size: "md" }), "gap-2")}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
              </button>
              <button type="button" onClick={() => setEditando(false)} className={button({ variant: "secondary", size: "md" })}>Cancelar</button>
            </form>
          ) : (
            <span className="block break-words text-sm font-bold text-[var(--text-primary)]" data-qa="vinculo-nombre">{nombre}</span>
          )}
          {alias && nombreReal && nombreReal !== nombre && (
            <span className="block break-words text-xs text-[var(--text-tertiary)]">En el sistema: {nombreReal}</span>
          )}
          <span className="block text-xs text-[var(--text-secondary)]">
            {tipo} · <span data-qa="vinculo-pagina">{v.pagina.join(" › ")}</span>
          </span>
          {cuando && <span className="block text-xs text-[var(--text-tertiary)]" data-qa="vinculo-desde">{cuando}</span>}
          {error && <span className="block text-xs text-[var(--data-error-ink)]" role="alert">{error}</span>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {v.href && (
            <EnlacePanel href={v.href} apariencia="heredada" title={`Ir a ${v.pagina.join(" › ")}`} className={cn(button({ variant: "secondary", size: "md" }), "gap-1.5 hover:no-underline")} data-qa="vinculo-ir">
              Ir <ArrowRight className="h-4 w-4" />
            </EnlacePanel>
          )}
          {ligado && puedeEditar && (
            ocupado
              ? <Loader2 className="mx-3 h-5 w-5 animate-spin text-[var(--accent)]" aria-label="Guardando" />
              : <ActionMenu label={`Opciones de ${nombre}`} soloIcono size="md" actions={acciones} />
          )}
        </div>
      </div>
      {ligado && tercero && tercero !== "otro" && (
        <Plegable clave="archivo:vinculos:que-trae" titulo="Qué trae del sistema">
          <EnElSistema carpetaId={carpetaId} clave={v.clave} />
        </Plegable>
      )}
    </li>
  );
}
