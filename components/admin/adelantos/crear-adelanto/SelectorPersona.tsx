"use client";

/**
 * A quién le estás dando la plata.
 *
 * Rediseño 2026-08-28 (Brandon: "un botón para abrir un modal... y antes que
 * aparezcan los 3 más recurrentes como acceso directo"). La lista buscable
 * completa (antes siempre desplegada acá, compitiendo por espacio con la
 * ficha de la persona y su historial) pasó a `SeleccionarPersonaModal` — el
 * caso frecuente, elegir entre quien más se repite, ahora es un toque directo
 * sin abrir nada.
 */

import { useMemo, useState } from "react";
import { ChevronRight, Search } from "@buleje/design-system/icons";
import { estadoDeCredito, requiereAtencion, saldoParaLimite } from "@/lib/adelantos/limite-credito";
import { cuentaDePersona, hayDeuda } from "@/lib/adelantos/modos-alta";
import { fmtMonedas } from "../shared";
import SeleccionarPersonaModal from "./SeleccionarPersonaModal";
import type { BeneficiarioConSaldo } from "./tipos";

export default function SelectorPersona({
  beneficiarios,
  beneficiarioId,
  recurrentes,
  onElegir,
  onPersonaCreada,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  beneficiarioId: string;
  /** Las 3 personas a las que más se les dio plata — calculado por el modal
   *  padre a partir del historial de adelantos (más barato hacerlo una vez
   *  arriba que recorrer todo acá en cada render). */
  recurrentes: BeneficiarioConSaldo[];
  onElegir: (id: string) => void;
  onPersonaCreada?: () => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const persona = beneficiarios.find((b) => b.id === beneficiarioId);

  /* Recurrentes SIN la que ya está elegida: repetirla ahí es un toque que no
     hace nada — ya se ve más abajo en la ficha de la persona. */
  const sugeridas = useMemo(
    () => recurrentes.filter((r) => r.id !== beneficiarioId).slice(0, 3),
    [recurrentes, beneficiarioId],
  );

  return (
    <div className="space-y-3">
      {persona ? (
        <PersonaElegida persona={persona} onCambiar={() => setBuscando(true)} />
      ) : (
        /* Con la persona ya elegida, «Cambiar» abre este mismo buscador: dos
           botones para lo mismo, uno debajo del otro, era ruido. */
        <button
          type="button"
          onClick={() => setBuscando(true)}
          className="flex h-12 w-full items-center gap-2.5 rounded-xl bg-[var(--surface-sunken)] px-4 text-left text-base font-semibold text-[var(--text-secondary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent-ink)]"
        >
          <Search className="h-4.5 w-4.5 shrink-0" aria-hidden />
          <span className="flex-1">Buscar o crear una persona</span>
          <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </button>
      )}

      {sugeridas.length > 0 && (
        <div>
          {/* Nombre entero y lo que debe: «QA · al día» con el primer nombre
              solo no decía a quién se elegía (Brandon 28-09). */}
          <p className="mb-1.5 text-sm font-semibold text-[var(--text-secondary)]">Frecuentes</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {sugeridas.map((p) => (
              <TarjetaRecurrente key={p.id} persona={p} onElegir={() => onElegir(p.id)} />
            ))}
          </div>
        </div>
      )}

      {buscando && (
        <SeleccionarPersonaModal
          beneficiarios={beneficiarios}
          beneficiarioId={beneficiarioId}
          onElegir={onElegir}
          onPersonaCreada={onPersonaCreada}
          onClose={() => setBuscando(false)}
        />
      )}
    </div>
  );
}

/** La persona ya elegida, como una tira compacta — reemplaza a la lista
 *  entera desplegada: acá sólo hace falta CONFIRMAR quién es, no volver a
 *  buscarla. */
function PersonaElegida({ persona, onCambiar }: { persona: BeneficiarioConSaldo; onCambiar: () => void }) {
  const credito = estadoDeCredito(persona.limiteCredito, saldoParaLimite(persona.saldoPendiente));
  return (
    <div className="flex items-center gap-3 rounded-xl bg-primary/8 px-3.5 py-3 ring-1 ring-primary/25">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-extrabold text-[var(--accent-ink)]">
        {persona.nombre.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-snug text-[var(--text-primary)] [overflow-wrap:anywhere]">{persona.nombre}</span>
        <span className="block text-sm font-semibold tabular-nums">
          <LoQueDebe persona={persona} />
          {requiereAtencion(credito) && <span className="text-[var(--data-warning-ink)]"> · cerca del tope</span>}
        </span>
      </span>
      <button
        type="button"
        onClick={onCambiar}
        aria-label="Cambiar de persona"
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/15 sm:px-3"
      >
        <Search className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Cambiar</span>
      </button>
    </div>
  );
}

/** «te debe S/ 573 · le debes S/ 3 031» — las dos direcciones, cada una con su color. */
function LoQueDebe({ persona }: { persona: BeneficiarioConSaldo }) {
  const c = cuentaDePersona(persona);
  const te = hayDeuda(c.teDebe);
  const le = hayDeuda(c.leDebes);
  if (!te && !le) return <span className="text-[var(--data-success-ink)]">al día</span>;
  return (
    <>
      {te && <span className="whitespace-nowrap text-[var(--data-warning-ink)]">te debe {fmtMonedas(c.teDebe)}</span>}
      {te && le && <span className="text-[var(--text-tertiary)]"> · </span>}
      {le && <span className="whitespace-nowrap text-[var(--data-info-ink)]">le debes {fmtMonedas(c.leDebes)}</span>}
    </>
  );
}

/** Un acceso directo a una persona frecuente: nombre entero y cómo está su cuenta. */
function TarjetaRecurrente({ persona, onElegir }: { persona: BeneficiarioConSaldo; onElegir: () => void }) {
  return (
    <button
      type="button"
      onClick={onElegir}
      title={persona.nombre}
      className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[var(--rule-base)] px-3 py-2.5 text-left transition-[border-color,background-color] hover:border-primary/50 hover:bg-primary/5"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-extrabold text-[var(--accent-ink)]">
        {persona.nombre.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{persona.nombre}</span>
        <span className="block truncate text-sm font-semibold tabular-nums">
          <LoQueDebe persona={persona} />
        </span>
      </span>
    </button>
  );
}
