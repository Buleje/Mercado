/**
 * La banda de los códigos que amparan las trozas de abajo (ADR-459).
 *
 * Con un permiso elegido habla de ESE plan: tipo y código, título habilitante
 * (una plantación no tiene: tiene su registro), titular, resolución y cuánto
 * le queda de vigencia. Con «Todos», como antes, la carátula del libro.
 */

import type { BandaPermiso, TonoVigencia } from "@/lib/forestal/loth-tablero-permiso";

export interface CaratulaTablero {
  tituloHabilitante?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
  titularName?: string | null;
  docGestionType?: string | null;
  docGestionName?: string | null;
  resolucionNumber?: string | null;
}

const TONO_VIGENCIA: Record<TonoVigencia, string> = {
  ok: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  atencion: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  vencida: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  "sin-fecha": "text-[var(--text-secondary)]",
};

/* Grilla y no flex: con una resolución larga, el flex mandaba la vigencia a
   un segundo renglón; en la grilla cada dato se trunca (el completo, en el
   `title`) y la banda queda en una fila. */
const MARCO = "grid gap-x-6 gap-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3";

export default function LothTableroBanda({
  banda,
  caratula,
}: {
  banda: BandaPermiso | null;
  caratula?: CaratulaTablero | null;
}) {
  if (!banda) {
    return (
      <div className={`${MARCO} grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`} data-banda="caratula">
        <DatoPermiso label="Título habilitante" valor={caratula?.tituloHabilitante} mono />
        <DatoPermiso label="N° registro del libro" valor={caratula?.registroNumber} mono />
        <DatoPermiso label="Tomo" valor={caratula?.tomo} mono />
        <DatoPermiso
          label="Doc. de gestión"
          valor={[caratula?.docGestionType, caratula?.docGestionName].filter(Boolean).join(" ") || null}
        />
        <DatoPermiso label="Resolución" valor={caratula?.resolucionNumber} mono />
        <DatoPermiso label="Titular" valor={caratula?.titularName} />
      </div>
    );
  }
  return (
    <div className={`${MARCO} grid-cols-2 sm:grid-cols-3 ${banda.esPlantacion ? "lg:grid-cols-4" : "lg:grid-cols-5"}`} data-banda="permiso">
      <DatoPermiso label={banda.esPlantacion ? "Registro de plantación" : `Permiso · ${banda.tipo}`} valor={banda.nombre} mono />
      {!banda.esPlantacion && <DatoPermiso label="Título habilitante" valor={banda.tituloHabilitante} mono />}
      <DatoPermiso label="Titular" valor={banda.titular} />
      <DatoPermiso label={banda.esPlantacion ? "Resolución del registro" : "Resolución"} valor={banda.resolucion} />
      <div className="min-w-0">
        <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Vigencia
        </span>
        <span className={`block truncate text-sm font-bold ${TONO_VIGENCIA[banda.vigencia.tono]}`} title={banda.vigencia.rango ?? undefined}>
          {banda.vigencia.texto}
          {banda.vigencia.hasta && <span className="font-normal text-[var(--text-tertiary)]"> · al {banda.vigencia.hasta}</span>}
        </span>
      </div>
    </div>
  );
}

function DatoPermiso({ label, valor, mono }: { label: string; valor?: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className={`block truncate text-sm font-semibold text-[var(--text-primary)] ${mono ? "font-mono" : ""}`} title={valor ?? undefined}>
        {valor?.trim() || "—"}
      </span>
    </div>
  );
}
