"use client";

/**
 * Las plantillas de cotización (F28) en una ventana, en dos bloques que dicen
 * dónde vive cada una: «De tu empresa» (las ve todo el equipo, con dueño y
 * versión) y «En este navegador». Tocar una muestra lo que trae antes de
 * usarla. `aboveModals`: se abre también encima de «Nueva cotización».
 */
import { useState } from "react";
import { Building2, Monitor, Share2, Trash2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { MAX_MODELOS_EQUIPO, puedeCambiarModelo } from "@/lib/cotizaciones/modelos";
import { formatDate } from "@/lib/format";
import { MAX_TEMPLATES, type Plantilla } from "./tipos";
import { deEmpresa, deNavegador, type Duplicada, type PlantillaElegida, type Plantillas } from "./use-plantillas";
import { VistaPlantilla } from "./VistaPlantilla";

interface Props {
  plantillas: Plantillas;
  onUsar: (p: PlantillaElegida) => void;
}

const ROTULO = "flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]";
const BORRAR =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-ink)] dark:hover:bg-[var(--data-error-500)]/10 dark:hover:text-[var(--data-error-500)]";
const items = (n: number) => `${n} ítem${n !== 1 ? "s" : ""}`;

function Renglon({ titulo, meta, onVer, children }: { titulo: string; meta: string; onVer: () => void; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 rounded-xl bg-[var(--surface-sunken)] pr-1">
      <button type="button" onClick={onVer} className="min-h-12 min-w-0 flex-1 rounded-xl p-3 text-left hover:bg-[var(--surface-raised)]">
        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
        <span className="block truncate text-sm text-[var(--text-secondary)]">{meta}</span>
      </button>
      {children}
    </li>
  );
}

export function PlantillasModales({ plantillas, onUsar }: Props) {
  const { plantillas: locales, equipo, yo, estadoEquipo, ventana, setVentana, borrar, compartir, recargarEquipo } = plantillas;
  const [vista, setVista] = useState<PlantillaElegida | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [choque, setChoque] = useState<{ p: Plantilla; dup: Duplicada } | null>(null);
  const gestionar = ventana === "gestionar";
  const cerrar = () => { setVentana(null); setVista(null); setAviso(null); setChoque(null); };

  const quitar = async (p: PlantillaElegida) => setAviso((await borrar(p)) ?? `Se borró «${p.nombre}».`);
  const pasarAEmpresa = async (p: Plantilla, reemplazarId?: string) => {
    const r = await compartir(p, reemplazarId);
    setChoque(!r.ok && r.duplicada ? { p, dup: r.duplicada } : null);
    setAviso(r.ok ? r.mensaje : r.error);
  };

  return (
    <AdminModal
      open={ventana !== null}
      onClose={cerrar}
      title={vista ? vista.nombre : gestionar ? "Plantillas guardadas" : "Elegir una plantilla"}
      description={vista ? undefined : "Copian sólo ítems y condiciones, nunca el cliente ni la fecha"}
      aboveModals
    >
      <div className={MODAL_BODY}>
        {vista ? (
          <VistaPlantilla p={vista} onVolver={() => setVista(null)} onUsar={() => { onUsar(vista); setVista(null); }} />
        ) : (
          <div className="space-y-4">
            {aviso && <p role="status" className="rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-primary)]">{aviso}</p>}
            {choque && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 text-sm dark:bg-[var(--data-warning-500)]/10">
                <span className="min-w-0 flex-1 text-[var(--text-primary)]">La de la empresa va por la v{choque.dup.version} (de {choque.dup.propietario}).</span>
                <button type="button" onClick={() => void pasarAEmpresa(choque.p, choque.dup.id)} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>
                  Guardar como v{choque.dup.version + 1}
                </button>
              </div>
            )}

            <section className="space-y-2">
              <p className={ROTULO}>
                <Building2 className="h-4 w-4" aria-hidden /> De tu empresa
                <span className="font-normal">· {equipo.length} de {MAX_MODELOS_EQUIPO}</span>
                <InfoTip
                  title="Plantillas de la empresa"
                  what="Las ve todo el equipo, en cualquier computadora o celular. Cada una tiene dueño y número de versión."
                  affects="Sólo su dueño o el administrador la cambia o la borra. Guardar otra con el mismo nombre crea la versión siguiente (se guardan las 5 anteriores)."
                />
              </p>
              {estadoEquipo === "cargando" && <p className="text-sm text-[var(--text-secondary)]">Trayendo las de la empresa…</p>}
              {estadoEquipo === "error" && (
                <p className="text-sm text-[var(--text-secondary)]">
                  No se pudieron traer.{" "}
                  <button type="button" onClick={() => void recargarEquipo()} className="min-h-12 font-semibold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]">Reintentar</button>
                </p>
              )}
              {estadoEquipo === "listo" && equipo.length === 0 && (
                <p className="text-sm text-[var(--text-secondary)]">Ninguna todavía: guarda una desde una cotización eligiendo «Para la empresa».</p>
              )}
              <ul className="space-y-2">
                {equipo.map((m) => (
                  <Renglon key={m.id} titulo={m.nombre} meta={`v${m.version} · de ${m.propietario} · ${formatDate(m.actualizadoAt)} · ${items(m.items.length)}`} onVer={() => setVista(deEmpresa(m))}>
                    {gestionar && yo && puedeCambiarModelo(m, yo) && (
                      <button type="button" aria-label={`Borrar la plantilla ${m.nombre} de la empresa`} onClick={() => void quitar(deEmpresa(m))} className={BORRAR}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </Renglon>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <p className={ROTULO}>
                <Monitor className="h-4 w-4" aria-hidden /> En este navegador
                <span className="font-normal">· {locales.length} de {MAX_TEMPLATES}</span>
                <InfoTip
                  title="Plantillas de este navegador"
                  what="Sólo están en esta computadora o celular: nadie más del equipo las ve, y si borras los datos del navegador se pierden."
                  affects="«Compartir» la copia a la empresa con tu nombre como dueño."
                />
              </p>
              {locales.length === 0 && <p className="text-sm text-[var(--text-secondary)]">Ninguna en este navegador.</p>}
              <ul className="space-y-2">
                {locales.map((p) => (
                  <Renglon key={p.id} titulo={p.nombre} meta={`${formatDate(p.createdAt)} · ${items(p.items.length)}`} onVer={() => setVista(deNavegador(p))}>
                    {gestionar && (
                      <>
                        <button type="button" onClick={() => void pasarAEmpresa(p)} className={button({ variant: "ghost", className: "shrink-0 gap-1.5 rounded-xl px-3" })}>
                          <Share2 className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Compartir</span>
                        </button>
                        <button type="button" aria-label={`Borrar la plantilla ${p.nombre} de este navegador`} onClick={() => void quitar(deNavegador(p))} className={BORRAR}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </>
                    )}
                  </Renglon>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
