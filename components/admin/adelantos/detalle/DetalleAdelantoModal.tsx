"use client";

/**
 * La ficha de un adelanto ya dado.
 *
 * Salió de `AdelantosModule` porque creció: además de registrar entregas, ahora
 * tiene que RESPONDER las preguntas que llegan por teléfono («¿de cuándo es?»,
 * «¿para qué era?», «¿cómo quedamos?»). Antes mostraba sólo el código, tres
 * cifras y el historial: la fecha, la modalidad, el motivo escrito al darlo y el
 * plan pactado estaban en la base y no se veían en ninguna pantalla.
 */

import { useCallback, useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ArrowDownToLine, Ban, CheckCircle, FileSignature, FileText, Package, Pencil } from "@buleje/design-system/icons";
import { ETIQUETA_CONCEPTO, quienDebe } from "@/lib/adelantos/direccion";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import { esReciboFirmado, srcDelComprobante } from "@/lib/adelantos/recibo-firmado";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { formatDate } from "@/lib/format";
import { MODALIDAD_LABEL, MiniStat, ModalShell, STATUS_BADGE, SkeletonGrid, fmtMon } from "../shared";
import { imprimirComprobante } from "./comprobante-del-adelanto";
import ControlarAdelanto from "./ControlarAdelanto";
import CorregirDireccion from "./CorregirDireccion";
import RegistrarEntrega from "./RegistrarEntrega";
import { useRegistrarEntrega } from "./use-registrar-entrega";
import AnularAdelantoModal from "../lista/AnularAdelantoModal";
import EditarNotasModal from "../lista/EditarNotasModal";
import FirmarReciboModal from "../firma/FirmarReciboModal";
import FichaAdelanto from "./FichaAdelanto";
import PlanPactado from "./PlanPactado";
import CamposPersonalizados from "@/components/admin/shared/CamposPersonalizados";

/** Id estable de este formulario para los campos personalizados (ADR-427):
 *  el mismo que el alta (`CrearAdelantoModal`). */
const FORMULARIO = "adelantos.adelanto";

export default function DetalleAdelantoModal({
  adelantoId,
  onClose,
  onChange,
}: {
  adelantoId: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const [a, setA] = useState<DbAdelanto | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/adelantos/${adelantoId}`, { credentials: "include" });
    setA(res.ok ? await res.json() : null);
    setLoading(false);
  }, [adelantoId]);

  useEffect(() => { load(); }, [load]);

  const entrega = useRegistrarEntrega(adelantoId, async () => {
    await load();
    onChange();
  });

  /** Un solo modal secundario a la vez, sobre este mismo. */
  const [anulando, setAnulando] = useState(false);
  const [editandoNotas, setEditandoNotas] = useState(false);
  const [firmando, setFirmando] = useState(false);
  /** Lo que dejó la corrección de dirección para leer (la caja no se movió, el tope). */
  const [avisoCorreccion, setAvisoCorreccion] = useState<string | null>(null);

  const badge = a ? STATUS_BADGE[a.status] : null;
  const firmado = esReciboFirmado(a?.comprobanteUrl);
  /* El recibo firmado es privado: se ve por la puerta del servidor, no por el bucket. */
  const srcComprobante = a ? srcDelComprobante(a) : null;
  const bloqueado = !a || a.status === "CANCELADO";
  /* ADR-448: en lo RECIBIDO el que entrega es el negocio; los textos se dan vuelta. */
  const dir = a ? leerDireccion(a) : { direccion: "DADO" as const, concepto: null };
  const recibido = dir.direccion === "RECIBIDO";
  /* El signo lo dice el rótulo: «Le debes −S/ 50» en un recibido excedido era al revés. */
  const q = a ? quienDebe({ direccion: dir.direccion, status: a.status, saldoPendiente: a.saldoPendiente }) : null;
  /* WASACO: su aserrío ya se cobra solo en cada corrida (ADR-448 §2.7). */
  const aserrioSeCobraSolo = recibido && dir.concepto === "SERVICIO" && !!a?.beneficiario?.forestPartyId;

  return (
    <ModalShell
      title={a ? `Adelanto · ${a.beneficiario?.nombre ?? ""}` : "Adelanto"}
      subtitle={a ? `${a.codigoOperacion ?? "sin código"} · ${MODALIDAD_LABEL[a.modalidad] ?? a.modalidad}` : undefined}
      onClose={onClose}
      size="lg"
    >
      {loading || !a ? (
        <SkeletonGrid />
      ) : (
        <div className="space-y-5">
          {/* Lo que se pide por teléfono, arriba de todo — a lo ancho de las
              dos columnas: es lo primero que se busca en la pantalla. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
            <div className="min-w-0">
              <p className="font-mono text-base font-extrabold text-[var(--text-primary)]">
                {a.codigoOperacion ?? "— sin código —"}
              </p>
              {a.reciboManual && (
                <p className="font-mono text-sm text-[var(--text-tertiary)]">Recibo de papel {a.reciboManual}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Firmar en la pantalla (08-10): la hoja firmada queda como foto del adelanto. */}
              {a.status !== "CANCELADO" && (
                <button
                  type="button"
                  onClick={() => setFirmando(true)}
                  data-abrir-firma
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary/12 px-4 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/20 dark:text-[var(--accent)]"
                >
                  <FileSignature className="h-4 w-4" aria-hidden /> {firmado ? "Firmar de nuevo" : "Firmar recibo"}
                </button>
              )}
              <button
                type="button"
                onClick={() => void imprimirComprobante(a)}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
              >
                <FileText className="h-4 w-4" /> {firmado ? "Recibo firmado (PDF)" : "Comprobante para firmar"}
              </button>
            </div>
          </div>

          {/* Rediseño horizontal (Brandon 2026-08-28): era una sola columna
              angosta que obligaba a bajar mucho para llegar al historial. Acá
              izquierda = quién/cuánto/estado (lo que se responde por teléfono),
              derecha = la ACCIÓN de hoy (registrar entrega) + el historial —
              las dos cosas visibles a la vez desde `lg:`, sin competir por el
              mismo scroll. */}
          <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
            <div className="space-y-4">
              {/* Fecha, modalidad, persona, Pt y el motivo con el que se dio. */}
              <FichaAdelanto adelanto={a} />

              <div className="grid grid-cols-3 gap-3">
                <MiniStat label={recibido ? "Te dio" : "Adelantado"} value={fmtMon(a.montoAdelantado, a.moneda)} />
                <MiniStat label={recibido ? "Ya le diste" : "Entregado"} value={fmtMon(a.totalEntregado, a.moneda)} tone="success" />
                <MiniStat
                  label={q === "te-debe" ? "Te debe" : q === "le-debes" ? "Le debes" : "Saldo"}
                  value={fmtMon(Math.abs(a.saldoPendiente), a.moneda)}
                  tone={q ? "warning" : "neutral"}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${badge?.className ?? ""}`}>{badge?.label}</span>
                {recibido && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-info-500)]/12 px-3 py-1 text-sm font-bold text-[var(--data-info-ink)]">
                    <ArrowDownToLine className="h-4 w-4" aria-hidden /> {dir.concepto ? ETIQUETA_CONCEPTO[dir.concepto] : "Plata que recibiste"}
                  </span>
                )}
                {srcComprobante && (
                  <a href={srcComprobante} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
                    {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail comprobante */}
                    <img src={srcComprobante} alt="comprobante" className="h-7 w-7 rounded-md border border-[var(--rule-base)] object-cover" /> {firmado ? "Recibo firmado" : "Comprobante"}
                  </a>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <button onClick={() => setEditandoNotas(true)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)] hover:underline">
                    <Pencil className="h-4 w-4" /> Editar
                  </button>
                  {/* Liquidado: se corrige anulando la liquidación (ADR-413); el servidor lo rechaza. */}
                  {a.status !== "CANCELADO" && a.status !== "LIQUIDADO" && (
                    <button onClick={() => setAnulando(true)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-error)] hover:underline">
                      <Ban className="h-4 w-4" /> Anular
                    </button>
                  )}
                </div>
              </div>

              {/* La fecha para devolverlo y el permiso, también después del alta.
                  Sólo abierto: el servidor rechaza el resto. */}
              {a.status === "ABIERTO" && (
                <ControlarAdelanto
                  adelantoId={a.id}
                  fechaVencimiento={a.fechaVencimiento}
                  contratoId={a.contratoId}
                  onGuardado={() => { void load(); onChange(); }}
                />
              )}

              <PlanPactado pactadas={a.entregasPactadas} moneda={a.moneda} bloqueado={bloqueado} onCumplir={entrega.cumplirCuota} />

              {/* Cargado del lado equivocado (ADL-0003/4 de Wasaco): se da vuelta
                  sólo sin entregas, y sin tocar la caja. */}
              {a.status !== "CANCELADO" && a.entregas.length === 0 && (
                <CorregirDireccion
                  adelantoId={a.id}
                  direccion={dir.direccion}
                  onCorregido={(aviso) => { setAvisoCorreccion(aviso); void load(); onChange(); }}
                />
              )}
              {avisoCorreccion && (
                <p role="status" className="text-sm font-semibold text-[var(--data-warning-ink)]">
                  {avisoCorreccion}
                </p>
              )}
            </div>

            <div className="space-y-4">
              {a.status !== "CANCELADO" && <RegistrarEntrega entrega={entrega} recibido={recibido} aserrioSeCobraSolo={aserrioSeCobraSolo} />}

              <div>
                <CardTitle className="mb-2 text-base font-extrabold text-[var(--text-primary)]">
                  {recibido ? "Lo que le diste" : "Historial de entregas"} ({a.entregas.length})
                </CardTitle>
                {a.entregas.length === 0 ? (
                  <p className="text-base text-[var(--text-tertiary)]">Todavía no hay entregas.</p>
                ) : (
                  <ul className="space-y-2">
                    {a.entregas.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 rounded-2xl border border-[var(--rule-soft)] px-4 py-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--data-success)]/10 text-[var(--data-success)]">
                          {e.tipo === "PRODUCTO" ? <Package className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-bold text-[var(--text-primary)]">
                            {e.descripcion || (e.tipo === "PRODUCTO" ? `Producto #${e.productId}` : "Entrega")}
                          </p>
                          <p className="text-sm tabular-nums text-[var(--text-tertiary)]">
                            {formatDate(e.fecha)}
                            {e.cantidad != null && ` · ${e.cantidad} u.`}
                            {e.sumadoAStock && " · sumado al stock"}
                          </p>
                        </div>
                        {e.comprobanteUrl && (
                          <a href={e.comprobanteUrl} target="_blank" rel="noopener noreferrer" title="Ver comprobante" className="shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail comprobante */}
                            <img src={e.comprobanteUrl} alt="comprobante" className="h-9 w-9 rounded-lg border border-[var(--rule-base)] object-cover" />
                          </a>
                        )}
                        <span className="shrink-0 text-base font-extrabold tabular-nums text-[var(--data-success)]">{fmtMon(e.valor, a.moneda)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Lo que este negocio anota de un adelanto y la ficha no pregunta
              (ADR-427). Acá se lee lo que se escribió al darlo, y se puede
              completar después: el adelanto ya existe, se guarda solo. */}
          <CamposPersonalizados
            formulario={FORMULARIO}
            registroId={adelantoId}
            etiquetaFormulario="adelantos"
          />
        </div>
      )}

      {a && anulando && (
        <AnularAdelantoModal
          adelantoId={a.id}
          persona={a.beneficiario?.nombre ?? "—"}
          monto={a.montoAdelantado}
          moneda={a.moneda}
          recibido={recibido}
          onClose={() => setAnulando(false)}
          onAnulado={() => { setAnulando(false); void load(); onChange(); }}
        />
      )}
      {a && firmando && (
        <FirmarReciboModal
          adelantoId={a.id}
          adelanto={a}
          onClose={() => setFirmando(false)}
          onGuardado={() => { void load(); onChange(); }}
        />
      )}
      {a && editandoNotas && (
        <EditarNotasModal
          adelantoId={a.id}
          notasActuales={a.notas ?? null}
          onClose={() => setEditandoNotas(false)}
          onGuardado={() => { setEditandoNotas(false); void load(); onChange(); }}
        />
      )}
    </ModalShell>
  );
}
