"use client";

/**
 * CtpPendientes — lo que falta hacer en el Libro, detrás de una campana.
 *
 * El Libro tiene doce pestañas y "¿qué tengo pendiente?" estaba repartido entre
 * ellas: los ingresos sin validar en una, las guías del monte sin ingresar en
 * otra, los despachos sin GTF o sin anexo en otras dos, los saldos negativos en
 * la quinta. Esto lo junta, lo ordena por lo que traba el cierre y cada línea
 * lleva al lugar donde se resuelve.
 *
 * 2026-07-26 — de panel de tarjetas (≈170 px) a una tira de chips (≈40 px).
 * 2026-09-02 — de tira a CAMPANA en la cabecera, junto a «Modo patio» (Brandon:
 * «un botón con icono de notificación y al presionar podré ver en un modal lo
 * que está en alerta»). La tira seguía costando uno o dos renglones en TODAS
 * las pestañas, y con seis avisos hacía wrap y empujaba la tabla fuera de la
 * pantalla. Son avisos: se miran cuando se quiere, no todo el tiempo.
 *
 * Lo que NO cambió: el número está siempre a la vista en el badge, y el tono
 * del botón dice si algo traba el cierre. Esconder un aviso detrás de un click
 * está bien; esconder que existe, no.
 */
import { useState } from "react";
import { AlertTriangle, ArrowRight, Bell, CalendarClock, CheckCircle2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { resumenPendientes, type Pendiente } from "@/lib/forestal/ctp-pendientes";
import type { AvisoAnticipado } from "@/lib/forestal/ctp-anticipa";
import type { CtpPendientesState } from "@/hooks/use-ctp-pendientes";

const TONO: Record<Pendiente["urgencia"], string> = {
  bloquea:
    "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-700)] hover:border-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
  atrasado:
    "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] hover:border-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  pendiente:
    "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]",
};

/** «Se viene» usa el mismo lenguaje de color, un escalón más suave: todavía no
 *  es un problema, es un problema que se puede evitar. */
const TONO_VIENE: Record<AvisoAnticipado["gravedad"], string> = {
  urgente:
    "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-700)] hover:border-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
  proximo:
    "border-[var(--data-info-500)]/40 bg-[var(--data-info-50)] text-[var(--data-info-700)] hover:border-[var(--data-info-500)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]",
};

/** El botón de la cabecera: mismo alto que «Buscar guía» y «Modo patio». */
const BOTON = "inline-flex h-10 items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold transition-colors";

export default function CtpPendientes({
  estado,
  onIr,
}: {
  estado: CtpPendientesState;
  /** Salta a la pestaña donde se resuelve ese pendiente, con su filtro puesto. */
  onIr: (vista: string, filtro?: Pendiente["filtro"]) => void;
}) {
  const { lista, seViene, cargando, falló, recargar } = estado;
  const [abierto, setAbierto] = useState(false);

  const total = lista.reduce((a, p) => a + p.cantidad, 0) + seViene.length;
  const traba = lista.some((p) => p.urgencia === "bloquea");
  /* Un plazo que vence mañana no traba el cierre pero es igual de urgente que
     uno que ya venció — y a diferencia de ése, todavía se puede evitar. */
  const urge = seViene.some((a) => a.gravedad === "urgente");
  const hayAlgo = lista.length > 0 || seViene.length > 0;
  /* `resumenPendientes` sólo sabe de lo pendiente: solo, diría «el libro está
     al día» con dos plazos venciéndose en pantalla. */
  const resumen = !hayAlgo
    ? resumenPendientes(lista)
    : [
        lista.length > 0 ? resumenPendientes(lista) : null,
        seViene.length > 0
          ? `${seViene.length} ${seViene.length === 1 ? "aviso" : "avisos"} de lo que se viene`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

  /* Mientras se revisa, el botón ocupa su lugar sin afirmar nada: sin esto la
     cabecera saltaba de ancho al llegar la respuesta. */
  const tono = cargando || falló
    ? "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]"
    : !hayAlgo
      ? "border-[var(--data-success-500)]/50 bg-[var(--surface-raised)] text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : traba || urge
        ? "border-[var(--data-error-500)] bg-[var(--surface-raised)] text-[var(--data-error-600)] dark:text-[var(--data-error-500)]"
        : "border-[var(--data-warning-500)] bg-[var(--surface-raised)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={
          cargando ? "Revisando qué falta en el libro"
            : falló ? "No se pudo revisar qué falta en el libro"
              : !hayAlgo ? "Sin pendientes en el libro"
                : `${total} avisos en el libro`
        }
        title={cargando ? "Revisando…" : falló ? "No se pudo revisar qué falta" : resumen}
        className={`${BOTON} ${tono}`}
      >
        <Bell className={`h-4 w-4 ${cargando ? "animate-pulse" : ""}`} aria-hidden />
        <span className="max-lg:sr-only">Avisos</span>
        {!cargando && !falló && hayAlgo && (
          <span className="rounded-full bg-current/15 px-1.5 font-mono text-xs tabular-nums">{total}</span>
        )}
      </button>

      <AdminModal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Avisos del libro"
        description={cargando ? "Revisando…" : falló ? undefined : resumen}
        icon={Bell}
      >
        {cargando ? (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => <span key={i} className="block h-12 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />)}
          </div>
        ) : falló ? (
          /* Falló la revisión: se dice, no se disfraza de «todo bien». */
          <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-tertiary)]">
            No se pudo revisar qué falta.
            <button type="button" onClick={recargar} className="font-bold text-primary hover:underline">
              Reintentar
            </button>
          </p>
        ) : !hayAlgo ? (
          <p className="flex items-center gap-2 rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] px-3 py-3 text-sm font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> {resumenPendientes(lista)}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Lo que se viene va ARRIBA: lo de abajo ya pasó y se corrige
                cuando se pueda; esto tiene fecha de vencimiento. */}
            {seViene.length > 0 && (
              <section>
                <p className="mb-2 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Se viene
                </p>
                <ul className="space-y-2">
                  {seViene.map((a) => (
                    <li key={a.clave}>
                      <button
                        type="button"
                        onClick={() => { setAbierto(false); onIr(a.vista); }}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${TONO_VIENE[a.gravedad]}`}
                      >
                        <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold">{a.titulo}</span>
                          <span className="block text-sm opacity-80">{a.detalle}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {lista.length > 0 && (
              <section>
                {seViene.length > 0 && (
                  <p className="mb-2 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Ahora
                  </p>
                )}
                <ul className="space-y-2">
                  {lista.map((p) => (
              <li key={p.clave}>
                <button
                  type="button"
                  onClick={() => { setAbierto(false); onIr(p.vista, p.filtro); }}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${TONO[p.urgencia]}`}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  <b className="font-mono text-lg tabular-nums">{p.cantidad}</b>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{p.titulo}</span>
                    {p.detalle && <span className="block text-sm opacity-80">{p.detalle}</span>}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </AdminModal>
    </>
  );
}
