"use client";

/**
 * «Quién tocó la caja»: aperturas, cierres, arqueos, movimientos a mano y
 * correcciones con su usuario (registro de auditoría). M28: cada fila dice qué
 * cambió con ANTES → DESPUÉS (`lib/caja/bitacora-cambios.ts`), el motivo y
 * lleva a la caja.
 */
import { useEffect, useMemo, useState } from "react";
import { LoadingState } from "@buleje/design-system";
import { ArrowRight, Eye } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDateTime } from "@/lib/format";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { leerEntradaDeCaja, type CambioDeBitacora } from "@/lib/caja/bitacora-cambios";

interface EntradaRastro {
  id: string;
  action: string;
  entity: string;
  detail: string;
  user: string;
  createdAt: string;
  /** La caja de la fila (también la de un movimiento); null si ya no existe. */
  cajaId?: string | null;
}

const CHIP: Record<string, string> = { Abrir: "Apertura", Cerrar: "Cierre", Editar: "Corrección", Arquear: "Arqueo" };

/** «Medio  Efectivo → Yape»: el antes apagado, el después en negrita (faltante en rojo, sobrante en ámbar). */
function Cambio({ c }: { c: CambioDeBitacora }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-[var(--surface-sunken)] px-2 py-0.5 text-sm">
      <span className="text-[var(--text-secondary)]">{c.campo}</span>
      {c.antes && (
        <>
          <span className="text-[var(--text-secondary)] tabular-nums">{c.antes}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-label="pasó a" />
        </>
      )}
      <span
        className={cn(
          "font-semibold tabular-nums",
          c.tono === "faltante"
            ? "text-[var(--data-error-ink)]"
            : c.tono === "sobrante"
              ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              : "text-[var(--text-primary)]",
        )}
      >
        {c.despues}
      </span>
    </span>
  );
}

/** Las primeras que se dibujan; el resto sale con «Ver más» (nada se pierde). */
const PRIMERAS = 20;

export function CajaAuditoria({ onVerCaja }: { onVerCaja?: (cajaId: string) => void | Promise<unknown> } = {}) {
  const [rastro, setRastro] = useState<EntradaRastro[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibles, setVisibles] = useState(PRIMERAS);
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/cash-registers/historial?limit=100", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`error ${r.status}`);
        return r.json();
      })
      .then((j) => vivo && setRastro(j.entries ?? []))
      .catch((err) => {
        logger.warn("[caja] rastro de auditoría falló", { error: String(err) });
        if (vivo) {
          setError("No pudimos leer quién tocó la caja.");
          setRastro([]);
        }
      });
    return () => {
      vivo = false;
    };
  }, []);

  const leidas = useMemo(() => new Map((rastro ?? []).map((t) => [t.id, leerEntradaDeCaja(t.action, t.detail)])), [rastro]);

  if (rastro === null) return <LoadingState message="Cargando el historial…" size="sm" />;

  return (
    <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
      {error && (
        <p role="alert" className="px-5 py-3 text-sm font-semibold text-[var(--data-error-500)]">
          {error}
        </p>
      )}
      {/* Alcance a la vista (H11/M28) en una línea; el detalle, en la ⓘ. */}
      <div className="flex items-center gap-2 border-b border-[var(--rule-soft)] px-5 py-2 text-sm text-[var(--text-secondary)]">
        <span className="min-w-0 flex-1">Aperturas, cierres, arqueos, anotaciones a mano y correcciones, con quién las hizo.</span>
        <InfoTip
          title="Qué entra en esta lista"
          what="Sólo lo que hizo una persona en la caja. Las ventas y los adelantos están en Movimientos."
          affects="No hay forma de editar el monto ni el responsable de un movimiento: sólo se corrige el medio, y esa corrección queda aquí con el antes y el después."
          example="«Medio Efectivo → Yape · Esperado S/ 184.90 → S/ 162.90» y el motivo que se anotó."
        />
      </div>
      {rastro.length === 0 ? (
        !error && <p className="p-8 text-center text-sm text-[var(--text-secondary)]">Todavía nadie abrió, cerró ni anotó algo a mano en la caja.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-base)]" data-qa="bitacora-caja">
          {rastro.slice(0, visibles).map((t) => {
            const esApertura = t.action === "Abrir";
            const esCierre = t.action === "Cerrar";
            const leida = leidas.get(t.id);
            const abiertaEsta = abierta === t.id;
            const quienYCuando = (
              <>
                <span className="font-semibold">{t.user}</span> · {formatDateTime(t.createdAt)}
              </>
            );
            return (
              <li key={t.id} className="flex items-start gap-3 px-5 py-2">
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-sm font-semibold",
                    esApertura
                      ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : esCierre
                        ? "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                  )}
                >
                  {CHIP[t.action] ?? "Movimiento"}
                </span>
                <div className="min-w-0 flex-1">
                  {/* Qué y los cambios en una línea; el texto completo, el motivo y «Ver caja» al tocar la fila. */}
                  <button
                    type="button"
                    aria-expanded={abiertaEsta}
                    onClick={() => setAbierta(abiertaEsta ? null : t.id)}
                    title={t.detail}
                    className="block w-full min-h-7 text-left"
                  >
                    {leida && leida.cambios.length > 0 ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {leida.resumen && (
                          <span className={cn("text-sm text-[var(--text-primary)]", !abiertaEsta && "max-w-[18rem] truncate")}>{leida.resumen}</span>
                        )}
                        {leida.cambios.map((c) => (
                          <Cambio key={c.campo} c={c} />
                        ))}
                      </span>
                    ) : (
                      <span className={cn("block text-sm text-[var(--text-primary)]", !abiertaEsta && "truncate")}>{t.detail}</span>
                    )}
                    {/* En el celular quién y cuándo van debajo: es lo que esta lista responde. */}
                    <span className="block truncate text-sm text-[var(--text-secondary)] sm:hidden">{quienYCuando}</span>
                  </button>
                  {abiertaEsta && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
                      {leida?.motivo && (
                        <span>
                          Motivo: <span className="text-[var(--text-primary)]">{leida.motivo}</span>
                        </span>
                      )}
                      {leida && leida.cambios.length > 0 && <span className="min-w-0 break-words">{t.detail}</span>}
                      {t.cajaId && onVerCaja && (
                        <button
                          type="button"
                          data-qa="bitacora-ver-caja"
                          onClick={() => void onVerCaja(t.cajaId as string)}
                          className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
                        >
                          <Eye className="h-4 w-4" aria-hidden /> Ver caja
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <span className="shrink-0 pt-0.5 text-sm text-[var(--text-secondary)] max-sm:hidden">{quienYCuando}</span>
              </li>
            );
          })}
        </ul>
      )}
      {rastro.length > visibles && (
        <button
          type="button"
          onClick={() => setVisibles((v) => v + 40)}
          className="h-12 w-full border-t border-[var(--rule-base)] text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)]"
        >
          Ver más ({rastro.length - visibles})
        </button>
      )}
    </section>
  );
}
