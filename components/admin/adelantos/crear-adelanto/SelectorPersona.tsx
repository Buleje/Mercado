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
    <div className="space-y-2.5">
      {persona && <PersonaElegida persona={persona} onCambiar={() => setBuscando(true)} />}

      {sugeridas.length > 0 && (
        <div>
          {persona && (
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">O elegí a una recurrente</p>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            {sugeridas.map((p) => (
              <TarjetaRecurrente key={p.id} persona={p} onElegir={() => onElegir(p.id)} />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setBuscando(true)}
        className="flex h-12 w-full items-center gap-2.5 rounded-xl bg-[var(--surface-sunken)] px-4 text-left text-base font-bold text-[var(--text-secondary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
      >
        <Search className="h-4.5 w-4.5 shrink-0" aria-hidden />
        <span className="flex-1">{persona ? "Elegir otra persona" : "Buscar o crear una persona"}</span>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      </button>

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
  const debe = Object.values(persona.saldoPendiente).some((v) => v > 0);
  return (
    <div className="flex items-center gap-3 rounded-xl bg-primary/8 px-3.5 py-2.5 ring-1 ring-primary/25">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
        {persona.nombre.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-[var(--text-primary)]">{persona.nombre}</span>
        <span className={`block text-sm font-semibold tabular-nums ${debe ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"}`}>
          {debe ? `debe ${fmtMonedas(persona.saldoPendiente)}` : "al día"}
          {requiereAtencion(credito) && <span className="text-[var(--data-warning)]"> · cerca del tope</span>}
        </span>
      </span>
      <button
        type="button"
        onClick={onCambiar}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/15 dark:text-[var(--accent)]"
      >
        Cambiar
      </button>
    </div>
  );
}

/** Un acceso directo a una persona recurrente: nombre + si debe o está al día,
 *  en el mínimo espacio — son 3 en fila, no hay lugar para más que eso. */
function TarjetaRecurrente({ persona, onElegir }: { persona: BeneficiarioConSaldo; onElegir: () => void }) {
  const debe = Object.values(persona.saldoPendiente).some((v) => v > 0);
  return (
    <button
      type="button"
      onClick={onElegir}
      title={persona.nombre}
      className="flex flex-col items-center gap-1 rounded-xl bg-[var(--surface-sunken)] px-2 py-2.5 text-center transition-colors hover:bg-primary/10"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
        {persona.nombre.charAt(0).toUpperCase()}
      </span>
      <span className="w-full truncate text-xs font-bold text-[var(--text-primary)]">{persona.nombre.split(" ")[0]}</span>
      <span className={`text-[length:var(--ts-2xs)] font-bold ${debe ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"}`}>
        {debe ? "debe" : "al día"}
      </span>
    </button>
  );
}
