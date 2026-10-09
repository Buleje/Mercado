"use client";

/**
 * «Lo que hizo la IA» (Comandos IA, 2026-10-09): el medidor del mes, las
 * acciones del Chat IA que esperan tu OK y los recibos de todo lo que la IA
 * guardó por ti, con Deshacer en los cambios de precios.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  RefreshCw,
  ScanText,
  X,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { useMiRol } from "@/hooks/use-mi-rol";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ConsumoIA from "@/components/admin/comandos-ia/ConsumoIA";
import ReciboFila from "./ReciboFila";
import DeshacerModal from "./DeshacerModal";
import {
  agruparPorDia,
  listaCorta,
  usePendientesOK,
  useRecibos,
  type ReciboIA,
} from "./use-recibos";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "../papel/formato";

const HITLApprovalsBanner = dynamic(
  () => import("@/components/admin/ai-center/HITLApprovalsBanner"),
  {
    loading: () => null,
  },
);

type SubComandos = "papel" | "precios" | "mensajes" | "historial";

/** Quién puede deshacer precios: los mismos que pasan `requireAdmin` sin estar en la lista (admin/dueño/encargado). */
const ROLES_DESHACER = new Set(["admin", "owner", "manager"]);

/** Aviso tras deshacer: cuántos volvieron y cuáles se quedaron porque alguien los cambió después. */
interface Hecho {
  texto: string;
  aparte: string | null;
}

export default function LoQueHizoLaIA({ irA }: { irA: (sub: SubComandos) => void }) {
  const rol = useMiRol();
  const { recibos, cargando, error, recargar } = useRecibos();
  const pendientes = usePendientesOK();
  const [aDeshacer, setADeshacer] = useState<ReciboIA | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);

  const grupos = agruparPorDia(recibos);
  const puedeDeshacer = rol != null && ROLES_DESHACER.has(rol);

  return (
    <div className="space-y-4">
      <ConsumoIA />

      {pendientes > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <CardTitle>Esperando tu OK</CardTitle>
            <InfoTip
              title="Esperando tu OK"
              what="Acciones que el Chat IA preparó y no hace sin tu aprobación."
              affects="Nació en el Chat IA; vive 10 min en el servidor donde nació. Si vence, pídela de nuevo en el chat."
              example="«Sube el arroz a S/ 4.50» → Aprobar o Rechazar."
              side="bottom"
            />
          </div>
          <HITLApprovalsBanner />
        </section>
      )}

      <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="flex items-center gap-1.5 border-b border-[var(--rule-base)] px-4 py-3">
          <History className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
          <CardTitle>Recibos</CardTitle>
          <InfoTip
            title="Recibos de la IA"
            what="Cada cosa que la IA guardó por ti: qué hizo, quién lo pidió y cuánto costó."
            affects="Los cambios de precios se pueden deshacer mientras nadie los toque después."
            example="Hoy 10:42 · Subiste 5 % Abarrotes · 10 precios · qaadmin · IA $0.001"
            side="bottom"
          />
          <button
            type="button"
            onClick={() => void recargar()}
            disabled={cargando}
            aria-label="Recargar recibos"
            title="Recargar"
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
          </button>
        </div>

        <div className="px-4 py-2">
          {hecho && (
            <div
              role="status"
              className="my-2 flex items-start gap-2 rounded-lg bg-[var(--data-success-500)]/10 py-2 pl-3 pr-1 text-sm text-[var(--data-success)]"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1 break-words">
                {hecho.texto}
                {hecho.aparte && (
                  <span className="block text-xs text-[var(--text-secondary)]">{hecho.aparte}</span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setHecho(null)}
                aria-label="Cerrar aviso"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )}

          {error ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="flex items-center gap-2 text-sm text-[var(--data-error)]">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
              <button
                type="button"
                onClick={() => void recargar()}
                disabled={cargando}
                className={BOTON_SECUNDARIO}
              >
                <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
                Reintentar
              </button>
            </div>
          ) : cargando && recibos.length === 0 ? (
            <div className="space-y-2 py-3" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
              ))}
            </div>
          ) : grupos.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                aria-hidden
              >
                <History className="h-5 w-5" />
              </span>
              <p className="text-sm text-[var(--text-secondary)]">
                Todavía no le pediste nada a la IA.
              </p>
              <button type="button" onClick={() => irA("papel")} className={BOTON_PRIMARIO}>
                <ScanText className="h-4 w-4" aria-hidden />
                Lee un papel
              </button>
            </div>
          ) : (
            grupos.map((g) => (
              <div key={g.clave} className="py-1">
                <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  {g.etiqueta}
                </p>
                <ul className="divide-y divide-[var(--rule-base)]">
                  {g.recibos.map((r) => (
                    <ReciboFila
                      key={r.id}
                      recibo={r}
                      puedeDeshacer={puedeDeshacer}
                      onDeshacer={setADeshacer}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>

      <DeshacerModal
        recibo={aDeshacer}
        onClose={() => setADeshacer(null)}
        onDesactualizado={() => void recargar()}
        onHecho={(recibo, r) => {
          setADeshacer(null);
          const n = r.deshechas ?? recibo.filas;
          setHecho({
            texto: n
              ? `Listo: ${n === 1 ? "volvió 1 precio a como estaba" : `volvieron ${n} precios a como estaban`}.`
              : "Listo: se deshizo el cambio.",
            aparte: r.noDeshechas.length
              ? `Se quedaron como están porque alguien los cambió después: ${listaCorta(r.noDeshechas)}.`
              : null,
          });
          void recargar();
        }}
      />
    </div>
  );
}
