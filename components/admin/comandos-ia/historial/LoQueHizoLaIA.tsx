"use client";

/**
 * «Lo que hizo la IA» (Comandos IA, 2026-10-09): las acciones del Chat IA que
 * esperan tu OK y los recibos de todo lo que la IA guardó por ti, con Deshacer
 * en los cambios de precios. 10-10: el medidor grande del mes pasó a
 * «Indicadores» en la fila de «Recibos»; la lista muestra los últimos 10 y el
 * resto con «Ver los N anteriores» (1,74 → ~1,2 pantallas a 1280).
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
import ReciboFila from "./ReciboFila";
import { useIndicadoresIA } from "./IndicadoresIA";
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

/** Recibos a la vista antes de «Ver los N anteriores». */
const A_LA_VISTA = 10;

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
  const [todos, setTodos] = useState(false);
  const indicadores = useIndicadoresIA({ recibos, listo: !cargando || recibos.length > 0 });

  const ocultos = todos ? 0 : Math.max(0, recibos.length - A_LA_VISTA);
  const grupos = agruparPorDia(ocultos ? recibos.slice(0, A_LA_VISTA) : recibos);
  const puedeDeshacer = rol != null && ROLES_DESHACER.has(rol);

  return (
    <div className="space-y-3">

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

      {/* Título, «Indicadores» y «Actualizar» en UNA fila; el panel y la lista
          debajo, sin tarjeta dentro de tarjeta. */}
      <section aria-labelledby="ci-recibos-titulo" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <History className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <CardTitle id="ci-recibos-titulo">Recibos</CardTitle>
            <InfoTip
              title="Recibos de la IA"
              what="Cada cosa que la IA guardó por ti: qué hizo, quién lo pidió y cuánto costó."
              affects="Los cambios de precios se pueden deshacer mientras nadie los toque después."
              example="Hoy 10:42 · Subiste 5 % Abarrotes · 10 precios · qaadmin · IA $0.001"
              side="bottom"
            />
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {indicadores.boton}
            <button
              type="button"
              onClick={() => void recargar()}
              disabled={cargando}
              aria-label="Actualizar los recibos"
              title="Actualizar"
              className={`${BOTON_SECUNDARIO} shrink-0 max-sm:w-12 max-sm:px-0`}
            >
              <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
              <span className="max-sm:hidden">Actualizar</span>
            </button>
          </div>
        </div>

        {indicadores.panel}

        {hecho && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl bg-[var(--data-success-500)]/10 py-1 pl-3 pr-1 text-sm text-[var(--data-success)]"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 break-words py-2">
              {hecho.texto}
              {hecho.aparte && <span className="block text-[var(--text-secondary)]">{hecho.aparte}</span>}
            </p>
            <button
              type="button"
              onClick={() => setHecho(null)}
              aria-label="Cerrar aviso"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        {error ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[var(--data-error)]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
            <button type="button" onClick={() => void recargar()} disabled={cargando} className={BOTON_SECUNDARIO}>
              <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
              Reintentar
            </button>
          </div>
        ) : cargando && recibos.length === 0 ? (
          <div className="space-y-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
            ))}
          </div>
        ) : grupos.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-3">
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[var(--text-secondary)]">
              <History className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              Todavía no le pediste nada a la IA.
            </p>
            <button type="button" onClick={() => irA("papel")} className={BOTON_PRIMARIO}>
              <ScanText className="h-4 w-4" aria-hidden />
              Lee un papel
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 sm:px-4">
            {grupos.map((g) => (
              <div key={g.clave}>
                <p className="pt-3 text-sm font-semibold text-[var(--text-tertiary)]">{g.etiqueta}</p>
                <ul className="divide-y divide-[var(--rule-soft)]">
                  {g.recibos.map((r) => (
                    <ReciboFila key={r.id} recibo={r} puedeDeshacer={puedeDeshacer} onDeshacer={setADeshacer} />
                  ))}
                </ul>
              </div>
            ))}
            {ocultos > 0 && (
              <div className="border-t border-[var(--rule-soft)] py-2">
                <button
                  type="button"
                  onClick={() => setTodos(true)}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-lg text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
                >
                  Ver {ocultos === 1 ? "el anterior" : `los ${ocultos} anteriores`}
                </button>
              </div>
            )}
          </div>
        )}
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
