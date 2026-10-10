"use client";

/**
 * Trámites › Pendientes — los avisos del catálogo en UN bloque (plan «panel
 * unificado», ola 2 — 2026-10-10).
 *
 * Antes eran hasta cuatro tipos de tarjeta apiladas arriba del catálogo, cada
 * una con su borde de color y su renglón: plazos que vencen (T-3, con el envío
 * por WhatsApp), plantaciones listas para presentar, la Ficha CTP sin membrete
 * y los tramos sin declarar (15+ días, ADR-364). Ahora: un título «Pendientes»
 * con su ⓘ y una línea por aviso. Nada se perdió: cada línea abre lo mismo que
 * abría su tarjeta (el trámite, la pestaña Plantaciones o el formato).
 */

import type { ReactNode } from "react";
import { Building2, CalendarClock, TreePine, type LucideIcon } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { diaConNombre } from "@/lib/forestal/arbol-de-troza";
import type { FormatoTramite } from "@/lib/forestal/tramites-catalogo";
import type { tramitesPorVencer, TramiteRegistro } from "@/lib/forestal/tramites-registro";
import type { avisoPlazoRelacion } from "@/lib/forestal/tramites-relacion-guias";
import TramiteAvisoWhatsApp from "./TramiteAvisoWhatsApp";

type PorVencer = ReturnType<typeof tramitesPorVencer>[number];
export interface AvisoPlazo {
  formato: FormatoTramite;
  aviso: NonNullable<ReturnType<typeof avisoPlazoRelacion>>;
}

type Tono = "error" | "warning" | "success";
const TINTA: Record<Tono, string> = {
  error: "text-[var(--data-error-ink)]",
  warning: "text-[var(--data-warning-ink)]",
  success: "text-[var(--data-success-ink)]",
};

function cuandoVence(dias: number): string {
  if (dias < 0) return `venció hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}`;
  if (dias === 0) return "vence hoy";
  return `vence en ${dias} ${dias === 1 ? "día" : "días"}`;
}

function Linea({ icon: Icon, tono, onClick, children }: { icon: LucideIcon; tono: Tono; onClick?: () => void; children: ReactNode }) {
  const cuerpo = (
    <>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TINTA[tono]}`} aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
    </>
  );
  const base = "flex w-full items-start gap-3 px-1 py-2.5 text-left text-sm text-[var(--text-primary)]";
  return (
    <li>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`${base} rounded-lg transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-sunken)]`}
        >
          {cuerpo}
        </button>
      ) : (
        <div className={base}>{cuerpo}</div>
      )}
    </li>
  );
}

export default function TramitesPendientes({
  porVencer,
  mensajeWhatsApp,
  plantacionesListas,
  fichaFloja,
  avisosPlazo,
  onAbrirTramite,
  onAbrirPlantaciones,
  onAbrirFormato,
}: {
  porVencer: readonly PorVencer[];
  /** El listado de lo que vence, armado por `tramites-aviso-mensaje` (single source). */
  mensajeWhatsApp: string;
  plantacionesListas: readonly { codigoInterno: string }[];
  fichaFloja: boolean;
  avisosPlazo: readonly AvisoPlazo[];
  onAbrirTramite: (t: TramiteRegistro) => void;
  onAbrirPlantaciones: () => void;
  onAbrirFormato: (formatoId: string) => void;
}) {
  const total = porVencer.length + (plantacionesListas.length > 0 ? 1 : 0) + (fichaFloja ? 1 : 0) + avisosPlazo.length;
  if (total === 0) return null;

  return (
    <section
      aria-label="Pendientes de trámites"
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3"
      data-tramites-pendientes
    >
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle as="h3">Pendientes</CardTitle>
        <span className="rounded-full bg-[var(--data-warning-500)]/10 px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-primary)]">
          {total}
        </span>
        <InfoTip
          title="Pendientes de trámites"
          what="Lo que pide acción antes de llenar otro formato: plazos que vencen (avisa 3 días antes, según la fecha límite que cargaste en cada trámite), tramos de un formato con correlativo sin declarar hace 15 días o más, plantaciones listas para presentar ante SERFOR y la Ficha CTP sin membrete."
          affects="Cada línea abre el trámite, el formato o la pestaña donde se resuelve. Un plazo legal va primero: pesa más que un membrete incompleto."
          example="«Visado de talonario de GTF: vence en 2 días» abre ese trámite."
        />
        {porVencer.length > 0 && (
          <div className="ml-auto">
            <TramiteAvisoWhatsApp mensaje={mensajeWhatsApp} />
          </div>
        )}
      </div>
      <ul className="mt-1 divide-y divide-[var(--rule-soft)]">
        {porVencer.map((t) => (
          <Linea key={t.id} icon={CalendarClock} tono={t.diasRestantes < 0 ? "error" : "warning"} onClick={() => onAbrirTramite(t)}>
            <strong>{t.formatoNombre}</strong>
            {t.expedienteAutoridad ? ` (${t.expedienteAutoridad})` : ""}: {cuandoVence(t.diasRestantes)}
          </Linea>
        ))}
        {plantacionesListas.length > 0 && (
          <Linea icon={TreePine} tono="success" onClick={onAbrirPlantaciones}>
            {plantacionesListas.length === 1 ? (
              <>
                <strong>{plantacionesListas[0].codigoInterno}</strong> está lista para presentar ante SERFOR
              </>
            ) : (
              <>
                <strong>{plantacionesListas.length} registros de plantación</strong> están listos para presentar ante SERFOR
              </>
            )}
          </Linea>
        )}
        {fichaFloja && (
          <Linea icon={Building2} tono="warning">
            <strong>Ficha CTP incompleta</strong>: los documentos saldrán sin membrete. Complétala en Libro CTP › Ficha CTP.
          </Linea>
        )}
        {avisosPlazo.map(({ formato: f, aviso }) => (
          <Linea key={f.id} icon={CalendarClock} tono="warning" onClick={() => onAbrirFormato(f.id)}>
            <strong>{f.nombre}</strong>: {aviso.dias} días sin declarar el siguiente tramo
            <span className="text-[var(--text-secondary)]">
              {" "}
              (la última {aviso.numeroDocumento ? `N° ${aviso.numeroDocumento} ` : ""}llegó hasta el {diaConNombre(aviso.periodoHasta)})
            </span>
          </Linea>
        ))}
      </ul>
    </section>
  );
}
