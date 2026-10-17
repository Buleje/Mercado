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
 *
 * Compactación del libro (17-10): eran ~470 px ARRIBA de las cifras del mes, y
 * el tablero es el movimiento del mes. Ahora es una línea plegable y recordada
 * (`ctp-puesta-en-marcha:abierta`): plegada sigue diciendo cuántas partes hay
 * en uso y nombra las que faltan, cada una con su atajo; desplegada, la lista
 * de siempre. Lo que antes eran renglones por fila (qué papel sale roto y por
 * qué campo) va en el ⓘ de la parte: la Ficha lo repite entero en Directorio ›
 * «Tu CTP», adonde lleva su atajo.
 */

import { CardTitle } from "@buleje/design-system";
import { ArrowRight, ChevronDown, Circle, CheckCircle2, CircleDot } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { usePuestaEnMarcha } from "@/hooks/use-puesta-en-marcha";
import type { Capacidad } from "@/lib/forestal/ctp-puesta-en-marcha";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

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
  const [abierta, setAbierta] = useLocalStorage<boolean>("ctp-puesta-en-marcha:abierta", false);

  if (cargando || !resumen || capacidades.length === 0) return null;

  /* Todo en uso: una línea. Un panel de diez filas verdes ocupa media pantalla
     para no pedir nada, y la próxima vez ya nadie lo lee. */
  if (resumen.sinEstrenar === 0 && resumen.aMedias === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        {resumen.frase} Las {resumen.total} partes del libro tienen datos.
      </p>
    );
  }

  /* Sin estrenar primero: es lo que nadie sabe que tiene. */
  const orden = { sin_estrenar: 0, a_medias: 1, en_uso: 2, no_aplica: 3 } as const;
  const filas = [...capacidades].sort((a, b) => orden[a.estado] - orden[b.estado]);

  const faltan = filas.filter((c) => c.estado === "sin_estrenar" || c.estado === "a_medias");

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          aria-controls="ctp-puesta-en-marcha-lista"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg text-left"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierta ? "" : "-rotate-90"}`} aria-hidden />
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
            Qué del libro está sin estrenar
          </CardTitle>
        </button>
        {/* La barra: cuánto del libro está funcionando de verdad. «A medias»
            vale medio — con uno el número miente hacia arriba, con cero
            castiga a quien ya arrancó. */}
        <span className="inline-flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <span className="h-2 w-20 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <span
              className="block h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${resumen.pct}%` }}
              role="progressbar"
              aria-valuenow={resumen.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Partes del libro en funcionamiento"
            />
          </span>
          <span className="font-mono tabular-nums">
            {resumen.enUso} de {resumen.total} en uso
          </span>
          <InfoTip title="Qué del libro está sin estrenar" what={resumen.frase} />
        </span>
        {/* Plegada, nombra lo que falta y lleva a cada parte: plegar no es esconder. */}
        {!abierta && onIr && (
          <span className="flex flex-wrap gap-1.5">
            {faltan.map((c) => {
              const t = TONO[c.estado as keyof typeof TONO] ?? TONO.sin_estrenar;
              return (
                <button
                  key={c.clave}
                  type="button"
                  onClick={() => onIr(c.vista)}
                  title={c.paso ?? c.medida}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--rule-base)] px-2.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-primary hover:bg-primary/10"
                >
                  <t.Icono className={`h-3.5 w-3.5 shrink-0 ${t.color}`} aria-label={t.rotulo} />
                  {c.titulo}
                </button>
              );
            })}
          </span>
        )}
      </div>

      {abierta && (
        <ul id="ctp-puesta-en-marcha-lista" className="divide-y divide-[var(--rule-soft)] border-t border-[var(--rule-base)]">
          {filas.map((c) => (
            <Fila key={c.clave} c={c} onIr={onIr} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Fila({ c, onIr }: { c: Capacidad; onIr?: (vista: string) => void }) {
  const t = TONO[c.estado as keyof typeof TONO] ?? TONO.sin_estrenar;
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-2.5">
      <t.Icono className={`mt-0.5 h-5 w-5 shrink-0 ${t.color}`} aria-label={t.rotulo} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-bold text-[var(--text-primary)]">{c.titulo}</span>
          {/* Qué te da y qué queda trabado, en el ⓘ (2026-09-24): eran dos
              renglones por fila en una lista de doce. */}
          <InfoTip
            title={c.titulo}
            ancho="w-80"
            what={c.queDa}
            affects={c.desbloquea && c.desbloquea.length > 0 ? `Mientras tanto no funciona: ${c.desbloquea.join(" · ")}` : undefined}
            /* Qué papel sale roto y por qué campo: sin esto, «completa la
               Ficha» manda a un formulario de dieciocho casilleros sin decir
               cuáles importan para qué. Iba en renglones debajo de la fila. */
            example={c.detalle && c.detalle.length > 0 ? c.detalle.join(" · ") : undefined}
          />
          {/* La medida al lado del nombre: sin el número esto es una opinión. */}
          <span className={`font-mono text-xs tabular-nums ${t.color}`}>{c.medida}</span>
        </p>
        {c.paso && <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">{c.paso}</p>}
      </div>
      {c.paso && onIr && (
        <button
          type="button"
          onClick={() => onIr(c.vista)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-primary hover:bg-primary/10"
        >
          Activar <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </li>
  );
}
