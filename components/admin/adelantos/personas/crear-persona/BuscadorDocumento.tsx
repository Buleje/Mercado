"use client";

/**
 * Lo primero del alta: el DNI o el RUC, grande. Al completar 8 dígitos se
 * consulta RENIEC y al completar 11, SUNAT, sin botón ni selector previo —
 * quien atiende escribe el número que le dictaron, no elige un padrón. Debajo,
 * la tarjeta de lo que contestó y, si ya hay alguien con ese número, el aviso
 * con el botón para abrirlo en vez de cargarlo dos veces.
 */
import type { Ref } from "react";
import { CheckCircle2, Loader2, Search } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { avisoDeDuplicado, type Duplicado } from "@/lib/adelantos/persona-validacion";
import type { EstadoLookup } from "@/hooks/use-lookup-documento";
import TarjetaPadron from "./TarjetaPadron";
import { AvisoDuplicado } from "./AvisoDuplicado";
import { PieRevision } from "./piezas";
import { TARJETA, campo } from "./clases";
import { revisarDocumentoEnVivo } from "./validacion";

const ID = "alta-persona-documento";

export default function BuscadorDocumento(p: {
  /** React 19: el ref llega como prop (el modal enfoca el número al abrir). */
  ref?: Ref<HTMLInputElement>;
  documento: string;
  onDocumento: (v: string) => void;
  estado: EstadoLookup;
  onReintentar: () => void;
  nombreEscrito: string;
  onUsarNombre: (nombre: string) => void;
  duplicado: Duplicado | null;
  onAbrirExistente: (id: string) => void;
}) {
  const revision = revisarDocumentoEnVivo(p.documento);
  const encontrado = p.estado.fase === "listo" && p.estado.resultado.encontrado;
  return (
    <section className={cn(TARJETA, "space-y-3 p-5")} aria-label="Buscar por DNI o RUC">
      <span className="flex items-center gap-1.5">
        <label htmlFor={ID} className="text-sm font-semibold text-[var(--text-secondary)]">
          DNI o RUC
        </label>
        <InfoTip
          title="DNI o RUC"
          what="Con 8 dígitos se consulta RENIEC; con 11, SUNAT. El nombre, la dirección y el ubigeo se llenan solos."
          affects="Lo que ya escribiste a mano no se pisa. Si no tiene documento, déjalo vacío y escribe el nombre."
          example="45678912 → RENIEC · 20601234567 → SUNAT"
        />
      </span>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]"
          aria-hidden
        />
        <input
          id={ID}
          ref={p.ref}
          value={p.documento}
          onChange={(e) => p.onDocumento(e.target.value)}
          /* Enter acá no crea: el número recién se está consultando. */
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Escribe el número"
          aria-describedby={`${ID}-pie`}
          aria-invalid={revision.estado === "mal" || undefined}
          className={campo(revision.estado === "mal", "pl-12 pr-12 text-lg font-semibold tabular-nums tracking-wide")}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2">
          {p.estado.fase === "consultando" ? (
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" aria-label="Consultando" />
          ) : encontrado ? (
            <CheckCircle2 className="h-5 w-5 text-[var(--data-success-ink)]" aria-label="Encontrado" />
          ) : null}
        </span>
      </div>
      <PieRevision id={`${ID}-pie`} revision={revision} ayuda="Con el número se llenan los datos solos." />
      <TarjetaPadron
        estado={p.estado}
        nombreEscrito={p.nombreEscrito}
        onReintentar={p.onReintentar}
        onUsarNombre={p.onUsarNombre}
      />
      {p.duplicado?.motivo === "documento" && (
        <AvisoDuplicado texto={avisoDeDuplicado(p.duplicado)} onAbrir={() => p.duplicado && p.onAbrirExistente(p.duplicado.persona.id)} />
      )}
    </section>
  );
}
