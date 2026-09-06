"use client";

/**
 * CtpPuestaEnMarcha — qué partes del libro están construidas y sin estrenar.
 *
 * El libro tiene veintitrés vistas. Enterarse de que una capacidad existe hoy
 * significa entrar a su pestaña y verla vacía —y si nunca entraste, nunca te
 * enterás—. Este panel lo dice de una: por cada parte, si está en uso, a medias
 * o sin estrenar, CON el número que lo prueba y el paso para activarla.
 *
 * Se dibuja sólo si hay algo que decir. Cuando el libro está entero en uso, una
 * línea y listo: el espacio es para lo que falta, no para felicitar.
 */

import { CardTitle } from "@buleje/design-system";
import { ArrowRight, Circle, CheckCircle2, CircleDot } from "@buleje/design-system/icons";
import { usePuestaEnMarcha } from "@/hooks/use-puesta-en-marcha";
import type { Capacidad } from "@/lib/forestal/ctp-puesta-en-marcha";

/**
 * Los tres estados con su forma, no sólo su color: en dark el ámbar y el verde
 * se acercan, y el ícono los distingue sin depender de la vista.
 */
const TONO = {
  en_uso: {
    Icono: CheckCircle2,
    color: "text-[var(--data-success-600)] dark:text-[var(--data-success-500)]",
    rotulo: "en uso",
  },
  a_medias: {
    Icono: CircleDot,
    color: "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]",
    rotulo: "a medias",
  },
  sin_estrenar: {
    Icono: Circle,
    color: "text-[var(--text-tertiary)]",
    rotulo: "sin estrenar",
  },
} as const;

export default function CtpPuestaEnMarcha({ onIr }: { onIr?: (vista: string) => void }) {
  const { capacidades, resumen, cargando } = usePuestaEnMarcha();

  if (cargando || !resumen || capacidades.length === 0) return null;

  /* Todo en uso: una línea. Un panel de diez filas verdes ocupa media pantalla
     para no pedir nada, y la próxima vez ya nadie lo lee. */
  if (resumen.sinEstrenar === 0 && resumen.aMedias === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        {resumen.frase} Las {resumen.total} partes del libro tienen datos.
      </p>
    );
  }

  /* Sin estrenar primero: es lo que nadie sabe que tiene. */
  const orden = { sin_estrenar: 0, a_medias: 1, en_uso: 2, no_aplica: 3 } as const;
  const filas = [...capacidades].sort((a, b) => orden[a.estado] - orden[b.estado]);

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Qué del libro está sin estrenar
        </CardTitle>
        <p className="text-xs text-[var(--text-tertiary)]">
          {resumen.enUso} de {resumen.total} en uso · {resumen.frase}
        </p>
      </div>

      {/* La barra: cuánto del libro está funcionando de verdad. «A medias» vale
          medio — con uno el número miente hacia arriba, con cero castiga a
          quien ya arrancó. */}
      <div className="px-4 pt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${resumen.pct}%` }}
            role="progressbar"
            aria-valuenow={resumen.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Partes del libro en funcionamiento"
          />
        </div>
      </div>

      <ul className="divide-y divide-[var(--rule-soft)]">
        {filas.map((c) => (
          <Fila key={c.clave} c={c} onIr={onIr} />
        ))}
      </ul>
    </section>
  );
}

function Fila({ c, onIr }: { c: Capacidad; onIr?: (vista: string) => void }) {
  const t = TONO[c.estado as keyof typeof TONO] ?? TONO.sin_estrenar;
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <t.Icono className={`mt-0.5 h-5 w-5 shrink-0 ${t.color}`} aria-label={t.rotulo} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-bold text-[var(--text-primary)]">{c.titulo}</span>
          {/* La medida al lado del nombre: sin el número esto es una opinión. */}
          <span className={`font-mono text-xs tabular-nums ${t.color}`}>{c.medida}</span>
        </p>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{c.queDa}</p>
        {c.paso && <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{c.paso}</p>}
        {c.detalle && c.detalle.length > 0 && (
          /* Qué papel sale roto y por qué campo. Sin esto, «completá la Ficha»
             manda a un formulario de dieciocho casilleros sin decir cuáles
             importan para qué. */
          <ul className="mt-1 space-y-0.5">
            {c.detalle.map((d) => (
              <li key={d} className="text-xs text-[var(--text-secondary)]">
                · {d}
              </li>
            ))}
          </ul>
        )}
        {c.desbloquea && c.desbloquea.length > 0 && (
          /* Lo que queda trabado por no arrancar esto. Es la diferencia entre
             «te falta cargar costos» y «sin eso ningún despacho puede decir
             cuánto dejó». */
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Mientras tanto no funciona: {c.desbloquea.join(" · ")}
          </p>
        )}
      </div>
      {c.paso && onIr && (
        <button
          type="button"
          onClick={() => onIr(c.vista)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] px-3 py-1.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-primary hover:bg-primary/10"
        >
          Activar <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </li>
  );
}
