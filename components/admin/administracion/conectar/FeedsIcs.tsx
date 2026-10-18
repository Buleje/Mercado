"use client";

/**
 * FeedsIcs — el enlace para ver la agenda en Google Calendar, Outlook o el
 * calendario del iPhone (ADR-501 §5). Es un enlace secreto de sólo lectura:
 * se muestra UNA vez al crearlo y se puede revocar cuando quieras.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Plus, Trash2 } from "@buleje/design-system/icons";
import { CardTitle, LoadingState } from "@buleje/design-system";
import { toast } from "sonner";
import { TARJETA } from "@/components/admin/planificacion/piezas/clases";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { FeedIcsDTO } from "@/lib/agenda/tipos";
import { crearFeed, leerFeeds, revocarFeed } from "../agenda-api";
import { fechaCorta } from "../comun/fechas";

const PASOS = [
  { donde: "Google Calendar", como: "En la computadora: «Otros calendarios» › «+» › «Desde URL» y pega el enlace." },
  { donde: "Outlook", como: "«Agregar calendario» › «Suscribirse desde la web» y pega el enlace." },
  { donde: "iPhone", como: "Toca «Abrir en el iPhone» desde el celular, o Ajustes › Calendario › Cuentas › «Añadir calendario suscrito»." },
];

const diaDe = (iso: string | null) => (iso ? fechaCorta(iso.slice(0, 10)) : null);

export function FeedsIcs() {
  const { prompt, confirm } = useConfirm();
  const [feeds, setFeeds] = useState<FeedIcsDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<{ nombre: string; url: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await leerFeeds();
    setFeeds(r.ok ? (r.data?.feeds ?? []) : []);
    setError(r.ok || r.status === 404 ? null : r.error);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const crear = async () => {
    const nombre = await prompt({
      title: "Nuevo enlace de calendario",
      description: "Ponle un nombre para reconocerlo después (en qué celular o cuenta lo pusiste).",
      label: "Nombre",
      defaultValue: "Mi celular",
      confirmLabel: "Crear enlace",
      required: true,
    });
    if (!nombre?.trim()) return;
    setOcupado(true);
    const r = await crearFeed(nombre.trim().slice(0, 60));
    setOcupado(false);
    if (!r.ok) return void toast.error(r.error);
    setNuevo({ nombre: r.data.feed.nombre, url: r.data.url });
    setCopiado(false);
    void cargar();
  };

  const copiar = async () => {
    if (!nuevo) return;
    try {
      await navigator.clipboard.writeText(nuevo.url);
      setCopiado(true);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar: selecciona el enlace y cópialo a mano.");
    }
  };

  const revocar = async (f: FeedIcsDTO) => {
    const ok = await confirm({
      title: `¿Revocar «${f.nombre}»?`,
      description: "El calendario donde lo pusiste deja de recibir la agenda. No se puede deshacer: tendrías que crear otro enlace.",
      intent: "danger",
      confirmLabel: "Revocar",
    });
    if (!ok) return;
    const r = await revocarFeed(f.id);
    if (!r.ok && r.status !== 404) return void toast.error(r.error);
    toast.success(`«${f.nombre}» quedó revocado`);
    void cargar();
  };

  return (
    <section className={cn(TARJETA, "space-y-3 px-4 py-3")} aria-label="Enlace de calendario">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="size-5 text-[var(--text-secondary)]" aria-hidden="true" />
        <CardTitle>Enlace de calendario</CardTitle>
        <InfoTip
          title="Enlace de calendario (ICS)"
          what="Un enlace secreto que Google Calendar, Outlook o el iPhone leen solos: ven tus actividades, notas del día, tareas y vencimientos."
          affects="Es de sólo lectura: desde allá no se marca nada. Google lo vuelve a leer cuando quiere (cada algunas horas, a veces una vez al día); para verlo al instante conecta tu cuenta de Google abajo."
          example="Lo creas, lo copias y lo pegas en Google Calendar › Otros calendarios › Desde URL."
          side="bottom"
        />
        <button type="button" className={button({ variant: "secondary", className: "ml-auto" })} onClick={() => void crear()} disabled={ocupado}>
          <Plus className="size-4" aria-hidden="true" />
          {ocupado ? "Creando…" : "Crear enlace"}
        </button>
      </div>

      {nuevo && (
        <div className="space-y-3 rounded-lg border border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-3 dark:bg-[var(--data-success-500)]/10">
          <p className="text-sm font-semibold text-[var(--text-primary)]">«{nuevo.nombre}» está listo. Cópialo ahora: no se vuelve a mostrar.</p>
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={nuevo.url}
              aria-label="Enlace del calendario"
              onFocus={(e) => e.currentTarget.select()}
              className="h-12 min-w-0 flex-[1_1_16rem] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-[var(--text-primary)]"
            />
            <button type="button" className={button({ variant: "primary" })} onClick={() => void copiar()}>
              {copiado ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copiado ? "Copiado" : "Copiar"}
            </button>
            {/^https?:\/\//.test(nuevo.url) && (
              <a className={button({ variant: "secondary" })} href={nuevo.url.replace(/^https?:\/\//, "webcal://")}>
                Abrir en el iPhone
              </a>
            )}
          </div>
          <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
            {PASOS.map((p) => (
              <li key={p.donde}>
                <span className="font-semibold text-[var(--text-primary)]">{p.donde}:</span> {p.como}
              </li>
            ))}
          </ul>
        </div>
      )}

      {feeds === null ? (
        <LoadingState message="Mirando tus enlaces…" />
      ) : error ? (
        <p className="text-sm text-[var(--data-error-ink)]">{error}</p>
      ) : feeds.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Todavía no creaste ningún enlace.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)]" aria-label="Tus enlaces">
          {feeds.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-[var(--text-primary)]">{f.nombre}</span>
                <span className="block text-sm text-[var(--text-tertiary)]">
                  …{f.pista} · creado el {diaDe(f.creadoEn)}
                  {f.ultimoUso ? ` · leído el ${diaDe(f.ultimoUso)}` : " · nunca leído"}
                </span>
              </div>
              <button type="button" className={button({ variant: "ghost", className: "max-sm:w-12 max-sm:px-0" })} onClick={() => void revocar(f)} title={`Revocar «${f.nombre}»`}>
                <Trash2 className="size-4" aria-hidden="true" />
                <span className="max-sm:sr-only">Revocar</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
