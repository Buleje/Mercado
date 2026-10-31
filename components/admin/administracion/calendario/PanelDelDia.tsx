"use client";

/**
 * PanelDelDia — el día que tocaste en el calendario: sus actividades (con
 * «Hecha» y «Ir a hacerlo», igual que en Hoy), las tareas que vencen, los
 * vencimientos de adelantos y entregas, y las notas del día.
 */
import { useState, type MouseEvent, type ReactNode } from "react";
import { ArrowUpRight, Bell, ListChecks, Plus, StickyNote } from "@buleje/design-system/icons";
import { CardTitle, LoadingState } from "@buleje/design-system";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { TARJETA } from "@/components/admin/planificacion/piezas/clases";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { DiaAgenda, FechaKey, NotaDelDia } from "@/lib/agenda/tipos";
import { colorNota, PALETA_NOTA } from "../comun/colores-nota";
import { fechaLarga, fechaRelativa, hoyKey } from "../comun/fechas";
import { ListaOcurrencias } from "../comun/ListaOcurrencias";
import { NotaDelDiaModal } from "./NotaDelDiaModal";

const HREF_TAREAS = "/admin?tab=administracion&vista=tareas";

const ORIGEN_VENCIMIENTO: Record<string, string> = {
  adelanto: "Adelanto",
  entrega_pactada: "Entrega pactada",
  promesa_adelanto: "Promesa de pago",
  recordatorio: "Recordatorio",
  seguimiento_clienta: "Seguimiento a clientes",
};

function irSinRecargar(e: MouseEvent<HTMLAnchorElement>, href: string) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  void irAEnlace(href);
}

interface Props {
  fecha: FechaKey;
  dia: DiaAgenda | undefined;
  cargando: boolean;
}

export function PanelDelDia({ fecha, dia, cargando }: Props) {
  const [nota, setNota] = useState<{ nota: NotaDelDia | null } | null>(null);
  const hoy = hoyKey();
  const relativa = fechaRelativa(fecha, hoy);
  const ocurrencias = dia?.ocurrencias ?? [];
  const tareas = dia?.tareas ?? [];
  const vencimientos = dia?.vencimientos ?? [];
  const notas = dia?.notas ?? [];
  const vacio = ocurrencias.length + tareas.length + vencimientos.length + notas.length === 0;

  return (
    <aside className={cn(TARJETA, "flex min-w-0 flex-col gap-3 px-4 py-3")} aria-label={`Lo del ${fechaLarga(fecha)}`} aria-busy={cargando}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CardTitle className="capitalize">{fechaLarga(fecha)}</CardTitle>
          {relativa !== fechaLarga(fecha) && <span className="text-sm text-[var(--text-tertiary)]">{relativa}</span>}
        </div>
        <button type="button" className={button({ variant: "secondary", className: "shrink-0" })} onClick={() => setNota({ nota: null })}>
          <Plus className="size-4" aria-hidden="true" />
          Nota
        </button>
      </div>

      {cargando && !dia ? (
        <LoadingState message="Mirando el día…" />
      ) : vacio ? (
        <p className="py-2 text-sm text-[var(--text-secondary)]">Este día no hay nada. Puedes dejarle una nota.</p>
      ) : (
        <>
          {ocurrencias.length > 0 && <ListaOcurrencias etiqueta="Actividades del día" ocurrencias={ocurrencias} />}

          {tareas.length > 0 && (
            <Bloque icono={ListChecks} titulo="Tareas que vencen">
              {tareas.map((t) => (
                <li key={t.id}>
                  <a href={HREF_TAREAS} onClick={(e) => irSinRecargar(e, HREF_TAREAS)} className={FILA_ENLACE}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[var(--text-primary)]">{t.titulo}</span>
                      {t.asignadoA && <span className="block text-sm text-[var(--text-tertiary)]">{t.asignadoA}</span>}
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </Bloque>
          )}

          {vencimientos.length > 0 && (
            <Bloque icono={Bell} titulo="Vencimientos">
              {vencimientos.map((v) => (
                <li key={`${v.origen}-${v.id}`}>
                  <a href={v.href} onClick={(e) => irSinRecargar(e, v.href)} className={FILA_ENLACE}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[var(--text-primary)]">{v.titulo}</span>
                      <span className="block text-sm text-[var(--text-tertiary)]">{ORIGEN_VENCIMIENTO[v.origen] ?? "Vence"}</span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </Bloque>
          )}

          {notas.length > 0 && (
            <Bloque icono={StickyNote} titulo="Notas">
              {notas.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => setNota({ nota: n })}
                    className={cn(
                      "block w-full rounded-lg border px-3 py-2 text-left transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:hover:brightness-110",
                      PALETA_NOTA[colorNota(n.color)].tarjeta,
                    )}
                  >
                    <span className="block font-medium text-[var(--text-primary)]">{n.titulo}</span>
                    {n.contenido && <span className="line-clamp-3 block whitespace-pre-line text-sm text-[var(--text-secondary)]">{n.contenido}</span>}
                  </button>
                </li>
              ))}
            </Bloque>
          )}
        </>
      )}

      {nota && <NotaDelDiaModal fecha={fecha} nota={nota.nota} onCerrar={() => setNota(null)} />}
    </aside>
  );
}

const FILA_ENLACE =
  "flex min-h-12 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

function Bloque({ icono: Icono, titulo, children }: { icono: typeof Bell; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-1 border-t border-[var(--rule-soft)] pt-3">
      <CardTitle as="h4" className="flex items-center gap-1.5 text-sm font-bold">
        <Icono className="size-4" aria-hidden="true" />
        {titulo}
      </CardTitle>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}
