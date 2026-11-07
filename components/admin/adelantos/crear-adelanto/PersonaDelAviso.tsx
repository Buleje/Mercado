"use client";

/**
 * La persona en el aviso de «Llenar desde» (foto o dictado): si calzaron
 * varias, un toque elige; si no está, «Crear a «Wasaco»» abre el alta de
 * persona con ese nombre ya escrito, o «Buscar» abre la lista con lo leído en
 * el buscador. Si calzó una sola ya quedó elegida y esto no muestra nada.
 */

import { useState } from "react";
import { Search, UserPlus } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { PersonaLeida } from "./persona-leida";
import SeleccionarPersonaModal from "./SeleccionarPersonaModal";
import type { BeneficiarioConSaldo } from "./tipos";

const BOTON = button({ variant: "secondary", className: "rounded-xl" });

export default function PersonaDelAviso({
  persona,
  beneficiarios,
  beneficiarioId,
  onElegir,
  onPersonaCreada,
}: {
  persona: PersonaLeida | null;
  beneficiarios: BeneficiarioConSaldo[];
  beneficiarioId: string;
  onElegir: (id: string, nombre: string) => void;
  onPersonaCreada?: () => void;
}) {
  const [abierto, setAbierto] = useState<null | "crear" | "buscar">(null);
  if (!persona || persona.tipo === "una") return null;

  /* La recién creada todavía no está en la lista (se recarga después): su nombre es el leído. */
  const nombreDe = (id: string) => beneficiarios.find((b) => b.id === id)?.nombre ?? persona.dicho;

  return (
    <div className="space-y-1.5" data-persona-leida={persona.tipo}>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {persona.tipo === "varias" ? `«${persona.dicho}»: ¿cuál es?` : `«${persona.dicho}» no está entre tus personas.`}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {persona.tipo === "varias" ? (
          persona.opciones.slice(0, 4).map((o) => (
            <button key={o.id} type="button" onClick={() => onElegir(o.id, o.nombre)} className={BOTON}>
              {o.nombre}
            </button>
          ))
        ) : (
          <button type="button" onClick={() => setAbierto("crear")} className={BOTON}>
            <UserPlus className="h-4 w-4" aria-hidden /> Crear a «{persona.dicho}»
          </button>
        )}
        <button type="button" onClick={() => setAbierto("buscar")} className={BOTON}>
          <Search className="h-4 w-4" aria-hidden /> {persona.tipo === "varias" ? "Otra" : "Buscar"}
        </button>
      </div>
      {abierto && (
        <SeleccionarPersonaModal
          beneficiarios={beneficiarios}
          beneficiarioId={beneficiarioId}
          qInicial={abierto === "crear" || persona.tipo === "ninguna" ? persona.dicho : ""}
          crearInicial={abierto === "crear"}
          onElegir={(id) => onElegir(id, nombreDe(id))}
          onPersonaCreada={onPersonaCreada}
          onClose={() => setAbierto(null)}
        />
      )}
    </div>
  );
}
