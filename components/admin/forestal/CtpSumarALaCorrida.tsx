"use client";

/**
 * Lo que le queda al lote, para elegir qué entra AHORA (ADR-364).
 *
 * El turno no entra entero de una vez: se carga el carro, se corta, y a media
 * mañana entran diez trozas más del mismo lote. Eso es la misma jornada, así que
 * hay dos caminos y el operador tiene que poder elegir cuál:
 *
 *   - **Sumar a esta corrida** — la madera nueva entra al asiento abierto, que
 *     cierra con un solo rendimiento sobre todo lo que realmente entró.
 *   - **Abrir una corrida nueva** — otra jornada, otro asiento.
 *
 * Antes acá había un solo botón que llevaba al panel del lote (y por lo tanto,
 * siempre a una corrida nueva): el turno que entraba en tandas quedaba partido
 * en dos líneas sin que nadie lo hubiera decidido.
 */

import { useEffect, useMemo, useState } from "react";
import { Layers, Loader2, PlusCircle } from "@buleje/design-system/icons";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import CtpTrozasDelLote from "./CtpTrozasDelLote";
import { Btn } from "./ctp-shared";

export default function CtpSumarALaCorrida({
  lineNo,
  loteCode,
  trozas,
  fechaConsumo,
  guardando,
  onSumar,
  onCorridaNueva,
}: {
  /** N° de la corrida abierta: el botón dice a cuál se suma, no «a esta». */
  lineNo: number;
  loteCode: string;
  /** Las piezas del lote que todavía no entraron a ninguna sierra. */
  trozas: TrozaConsumible[];
  fechaConsumo: string;
  guardando: boolean;
  onSumar: (trozaIds: string[]) => void;
  onCorridaNueva: () => void;
}) {
  /* Arranca en blanco, al revés que el panel del lote: sumar a una corrida en
     curso es la excepción, y una preselección invita a apretar sin mirar. */
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  /* Si una pieza deja de estar libre (la tomó otra corrida, se retrozó), su
     tilde se va con ella: mandar un id que ya no existe da un error del
     servidor por algo que la pantalla podía saber sola. */
  useEffect(() => {
    setSeleccion((prev) => {
      const vivas = new Set(trozas.map((t) => t.id));
      if ([...prev].every((id) => vivas.has(id))) return prev;
      return new Set([...prev].filter((id) => vivas.has(id)));
    });
  }, [trozas]);

  const elegidas = useMemo(() => trozas.filter((t) => seleccion.has(t.id)), [trozas, seleccion]);
  const volumen = useMemo(
    () => Math.round(elegidas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
    [elegidas],
  );

  if (trozas.length === 0) return null;

  return (
    <section className="space-y-2 rounded-xl border-2 border-dashed border-[var(--rule-base)] p-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Layers className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
          Al lote <b className="font-mono text-[var(--text-primary)]">{loteCode}</b> le quedan{" "}
          <b className="font-mono tabular-nums text-[var(--text-primary)]">{trozas.length}</b> troza
          {trozas.length === 1 ? "" : "s"} sin aserrar. Tildá las que entran ahora a{" "}
          <b>esta misma corrida</b>, o abrí una nueva si es otra jornada.
        </p>
        <Btn size="sm" variant="secondary" onClick={onCorridaNueva} disabled={guardando}>
          Producir en una corrida nueva
        </Btn>
      </header>

      <CtpTrozasDelLote
        trozas={trozas}
        seleccion={seleccion}
        onSeleccion={setSeleccion}
        fechaConsumo={fechaConsumo}
        titulo={`Trozas del lote ${loteCode} que todavía no entraron`}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        {elegidas.length > 0 && (
          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            {elegidas.length} pza · {volumen.toFixed(4)} m³ ·{" "}
            {pieTablarDe(volumen).toLocaleString("es-PE")} pt
          </span>
        )}
        <Btn
          variant="primary"
          disabled={elegidas.length === 0 || guardando}
          title={elegidas.length === 0 ? "Tildá las trozas que entran a la sierra" : undefined}
          onClick={() => onSumar(elegidas.map((t) => t.id))}
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
          Sumar a la corrida N° {lineNo}
        </Btn>
      </div>
    </section>
  );
}
