"use client";

/**
 * PonermeAlDia — pasar lo atrasado de UNO en uno (Brandon, 20-10): una tarjeta
 * grande con la actividad y cinco salidas: Ir a hacerlo, Ya lo hice, No tocaba,
 * Pasar a mañana o Saltar. Al marcar, pasa sola a la siguiente.
 *
 * La cola es una FOTO de lo atrasado al abrir: lo marcado desaparece de la
 * agenda al refrescar, pero el índice recorre la foto y no se salta ninguna.
 * Solo recorre lo atrasado; lo de hoy sigue en su lista. Atajos: H = ya lo
 * hice, M = pasar a mañana, flecha derecha = saltar. Va dentro de una ventana
 * (`AdminModal`) que pone quien lo monta.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Ban, Check, CheckCircle2, SkipForward, ArrowRight } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { button } from "@/components/ui-system/button-variants";
import { useAgenda } from "@/hooks/use-agenda";
import type { EstadoManual, OcurrenciaDTO } from "@/lib/agenda/tipos";
import { cn } from "@/lib/utils";
import { PUNTO_COLOR } from "../comun/estado-ocurrencia";
import { fechaLarga, fechaRelativa, hoyKey } from "../comun/fechas";
import { Detalle } from "../comun/ListaOcurrencias";
import { diaParaPosponer } from "../comun/MarcarModal";

interface Props {
  /** Lo atrasado al abrir (solo se lee la primera vez). */
  ocurrencias: readonly OcurrenciaDTO[];
  /** «Ir a hacerlo» y el botón final: quien lo monta cierra su ventana. */
  onCerrar: () => void;
  /** «Ir a hacerlo» sin cerrar (el panel del costado se queda): si falta, cierra. */
  onIr?: () => void;
}

const BOTON_ALTO = "h-12 w-full justify-center";

export default function PonermeAlDia({ ocurrencias, onCerrar, onIr }: Props) {
  const { marcar, colorDe } = useAgenda();
  const [cola] = useState(() => [...ocurrencias]);
  const [indice, setIndice] = useState(0);
  const [resueltas, setResueltas] = useState(0);
  const [ocupada, setOcupada] = useState(false);
  const total = cola.length;
  const actual = cola[indice] as OcurrenciaDTO | undefined;
  const hoy = hoyKey();

  const marcarYPasar = useCallback(
    async (estado: EstadoManual) => {
      if (!actual || ocupada) return;
      setOcupada(true);
      const manana = diaParaPosponer(actual.fecha, hoy);
      const ok = await marcar(
        { actividadId: actual.actividadId, fecha: actual.fecha, estado, posponerA: estado === "pospuesta" ? manana : null },
        estado === "hecha" ? `«${actual.nombre}» quedó hecha` : estado === "omitida" ? `«${actual.nombre}» no tocaba` : `Pasó al ${fechaLarga(manana)}`,
      );
      setOcupada(false);
      if (!ok) return;
      setResueltas((n) => n + 1);
      setIndice((i) => i + 1);
    },
    [actual, ocupada, marcar, hoy],
  );
  const saltar = useCallback(() => setIndice((i) => i + 1), []);

  /* Atajos con el foco fuera de un campo; el último los lee sin re-suscribirse. */
  const ultimo = useRef({ marcarYPasar, saltar, hay: false });
  ultimo.current = { marcarYPasar, saltar, hay: Boolean(actual) };
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !ultimo.current.hay) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='menu'], [role='combobox']")) return;
      if (e.key === "h" || e.key === "H") void ultimo.current.marcarYPasar("hecha");
      else if (e.key === "m" || e.key === "M") void ultimo.current.marcarYPasar("pospuesta");
      else if (e.key === "ArrowRight") ultimo.current.saltar();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  if (!actual) return <Final resueltas={resueltas} saltadas={total - resueltas} onCerrar={onCerrar} />;

  const ir = () => {
    (onIr ?? onCerrar)();
    void irAEnlace(actual.href);
  };

  return (
    <div className="space-y-4" aria-busy={ocupada} data-qa="poner-al-dia">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-sm font-semibold text-[var(--text-secondary)]">
          <span data-qa="poner-al-dia-cuenta">
            {indice + 1} de {total}
          </span>
          <span className="tabular-nums text-[var(--text-tertiary)]">{resueltas} {resueltas === 1 ? "resuelta" : "resueltas"}</span>
        </div>
        <div
          role="progressbar"
          aria-label={`${indice} de ${total} revisadas`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={indice}
          className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        >
          <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.round((indice / total) * 100)}%` }} />
        </div>
      </div>

      <article className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold text-[var(--data-error-700)]">{fechaRelativa(actual.fecha, hoy)}</span>
          {fechaRelativa(actual.fecha, hoy) !== fechaLarga(actual.fecha) && <span className="text-[var(--text-tertiary)]">{fechaLarga(actual.fecha)}</span>}
          {actual.hora && <span className="tabular-nums text-[var(--text-tertiary)]">{actual.hora}</span>}
        </div>
        <CardTitle>
          <span className={cn("mr-2 inline-block size-2.5 rounded-full align-middle", PUNTO_COLOR[colorDe(actual.actividadId)])} aria-hidden="true" />
          {actual.nombre}
        </CardTitle>
        <Detalle o={actual} />
      </article>

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className={button({ variant: "secondary", className: BOTON_ALTO })} onClick={ir} disabled={ocupada}>
          <ArrowUpRight className="size-4" aria-hidden="true" />
          Ir a hacerlo
        </button>
        <button type="button" data-qa="poner-al-dia-hecha" className={button({ variant: "primary", className: BOTON_ALTO })} onClick={() => void marcarYPasar("hecha")} disabled={ocupada} title="Atajo: H">
          <Check className="size-4" aria-hidden="true" />
          Ya lo hice
        </button>
        <button type="button" data-qa="poner-al-dia-omitida" className={button({ variant: "secondary", className: BOTON_ALTO })} onClick={() => void marcarYPasar("omitida")} disabled={ocupada}>
          <Ban className="size-4" aria-hidden="true" />
          No tocaba
        </button>
        <button type="button" data-qa="poner-al-dia-manana" className={button({ variant: "secondary", className: BOTON_ALTO })} onClick={() => void marcarYPasar("pospuesta")} disabled={ocupada} title="Atajo: M">
          <SkipForward className="size-4" aria-hidden="true" />
          Pasar a mañana
        </button>
      </div>
      <button type="button" data-qa="poner-al-dia-saltar" className={button({ variant: "ghost", className: BOTON_ALTO })} onClick={saltar} disabled={ocupada} title="Atajo: flecha derecha">
        <ArrowRight className="size-4" aria-hidden="true" />
        Saltar por ahora
      </button>
      <p className="text-center text-xs text-[var(--text-tertiary)] max-sm:hidden">Atajos: H = ya lo hice · M = pasar a mañana · → = saltar</p>
    </div>
  );
}

function Final({ resueltas, saltadas, onCerrar }: { resueltas: number; saltadas: number; onCerrar: () => void }) {
  const todo = saltadas === 0;
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center" data-qa="poner-al-dia-final">
      <CheckCircle2 className="size-12 text-[var(--data-success-500)]" aria-hidden="true" />
      <CardTitle>{todo ? "Te pusiste al día" : "Listo por ahora"}</CardTitle>
      <p className="text-sm text-[var(--text-secondary)]">
        {resueltas === 0 ? "No resolviste ninguna." : `Resolviste ${resueltas} ${resueltas === 1 ? "actividad" : "actividades"}.`}
        {!todo && ` Quedan ${saltadas} que saltaste; las ves en la lista.`}
      </p>
      <button type="button" data-qa="poner-al-dia-cerrar" className={button({ variant: "primary", className: "mt-2 h-12 min-w-40" })} onClick={onCerrar}>
        Cerrar
      </button>
    </div>
  );
}
