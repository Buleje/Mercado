"use client";

/**
 * Todo lo de una persona, en una pantalla.
 *
 * Antes sus datos estaban repartidos en tres modales que no se hablaban: la
 * ficha para editar, el estado de cuenta con el libro mayor, y el historial que
 * sólo se veía desde el alta de un adelanto. Para contestar «¿cómo se porta
 * este señor?» había que abrir los tres y sumar de cabeza.
 *
 * Acá arriba está el veredicto —cuánto debe, cuánto de lo que sacó devolvió,
 * cuánto margen le queda— y abajo la cuenta corriente movimiento por movimiento.
 */

import { useMemo, useState } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import {
  CheckCircle,
  Clock,
  FileText,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  TrendingDown,
  TrendingUp,
} from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { estadoDeCredito, requiereAtencion, saldoParaLimite } from "@/lib/adelantos/limite-credito";
import { cumplimientoDe } from "@/lib/adelantos/saldo-persona";
import { enlaceWhatsAppConTexto } from "@/lib/adelantos/contacto";
import { movimientosDePersona, saldoDeLaCuenta, textoEstadoDeCuenta } from "@/lib/adelantos/estado-cuenta";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { MODALIDAD_LABEL, ModalShell, STATUS_BADGE, fmtMon, fmtMonedas } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

const dia = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });

type Pestana = "cuenta" | "adelantos";

export default function FichaPersonaModal({
  persona,
  adelantos,
  onClose,
  onEditar,
  onNuevoAdelanto,
  onVerAdelanto,
}: {
  persona: BeneficiarioConSaldo;
  /** Todos los del tenant: acá se filtran los suyos. */
  adelantos: DbAdelanto[];
  onClose: () => void;
  onEditar: () => void;
  onNuevoAdelanto: () => void;
  onVerAdelanto: (a: DbAdelanto) => void;
}) {
  const [pestana, setPestana] = useState<Pestana>("cuenta");

  const suyos = useMemo(
    () =>
      adelantos
        .filter((a) => a.beneficiarioId === persona.id)
        .sort((x, y) => new Date(y.fechaAdelanto).getTime() - new Date(x.fechaAdelanto).getTime()),
    [adelantos, persona.id],
  );
  const movimientos = useMemo(() => movimientosDePersona(suyos), [suyos]);

  const credito = estadoDeCredito(persona.limiteCredito, saldoParaLimite(persona.saldoPendiente));
  const cumplimiento = cumplimientoDe(persona);
  const debeAlgo = Object.values(persona.saldoPendiente).some((v) => v > 0);
  /* Mismo texto que mensajeRecordatorio (lib/adelantos/contacto.ts), pero con
     el saldo real por moneda — esa función no sabe sumar más de una. */
  const wa = enlaceWhatsAppConTexto(
    persona.telefono,
    debeAlgo
      ? `Hola ${persona.nombre}, te recuerdo que tenés un saldo pendiente de ${fmtMonedas(persona.saldoPendiente)} por liquidar. ¡Gracias!`
      : `Hola ${persona.nombre}, ¿cómo estás?`,
  );
  const waCuenta = enlaceWhatsAppConTexto(persona.telefono, textoEstadoDeCuenta(persona.nombre, movimientos));

  const exportarPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Estado de cuenta", 14, 18);
    doc.setFontSize(11);
    doc.text(persona.nombre, 14, 26);
    let y = 32;
    if (persona.documento) { doc.text(`Doc: ${persona.documento}`, 14, y); y += 6; }
    if (persona.telefono) { doc.text(`Tel: ${persona.telefono}`, 14, y); y += 6; }
    autoTable(doc, {
      startY: y + 4,
      head: [["Fecha", "Concepto", "Monto", "Saldo"]],
      body: movimientos.map((m) => [
        dia(m.fecha),
        m.concepto,
        `${m.monto >= 0 ? "+" : "−"}${fmtMon(Math.abs(m.monto), m.moneda)}`,
        fmtMon(m.saldo, m.moneda),
      ]),
      foot: [["", "", "Saldo pendiente", fmtMonedas(saldoDeLaCuenta(movimientos))]],
    });
    doc.save(`estado-cuenta-${persona.nombre.replace(/\s+/g, "-")}.pdf`);
  };

  return (
    <ModalShell
      title={persona.nombre}
      subtitle={[persona.documento, persona.telefono].filter(Boolean).join(" • ") || "sin datos de contacto"}
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base text-[var(--text-secondary)]">
            {debeAlgo ? (
              <>
                Te debe <strong className="tabular-nums text-[var(--data-warning)]">{fmtMonedas(persona.saldoPendiente)}</strong>
                {" en "}
                {persona.adelantosAbiertos} adelanto{persona.adelantosAbiertos === 1 ? "" : "s"} abierto
                {persona.adelantosAbiertos === 1 ? "" : "s"}
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--data-success)]">
                <CheckCircle className="h-5 w-5" aria-hidden /> Está al día
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportarPdf}
              disabled={movimientos.length === 0}
              className="inline-flex h-11 items-center gap-1.5 rounded-2xl border-2 border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <FileText className="h-5 w-5" /> PDF
            </button>
            {waCuenta && (
              <a
                href={waCuenta}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-1.5 rounded-2xl border-2 border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary"
              >
                <MessageCircle className="h-5 w-5" /> Mandar la cuenta
              </a>
            )}
            <button
              onClick={onNuevoAdelanto}
              className="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-primary px-5 text-base font-bold text-white transition-colors hover:bg-primary-dark"
            >
              <Plus className="h-5 w-5" /> Nuevo adelanto
            </button>
          </div>
        </div>
      }
    >
      {/* ── El veredicto, arriba ─────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Debe hoy"
          valor={fmtMonedas(persona.saldoPendiente)}
          tono={debeAlgo ? "warning" : "success"}
          pie={`${persona.adelantosAbiertos} abierto${persona.adelantosAbiertos === 1 ? "" : "s"}`}
        />
        <Kpi
          label="Adelantado histórico"
          valor={fmtMonedas(persona.totalAdelantado)}
          pie={`${persona.adelantosLiquidados} liquidado${persona.adelantosLiquidados === 1 ? "" : "s"}`}
        />
        <Kpi
          label="Ya devolvió"
          valor={fmtMonedas(persona.totalEntregado)}
          tono="success"
          pie={cumplimiento == null ? "sin historial" : `${cumplimiento}% de lo que sacó`}
        />
        <Kpi
          label="Le queda de tope"
          valor={credito.estado === "sin-limite" ? "sin tope" : formatCurrency(Math.max(0, credito.disponible))}
          tono={credito.estado === "sin-limite" ? "neutro" : requiereAtencion(credito) ? "error" : "neutro"}
          pie={credito.estado === "sin-limite" ? "no tiene límite cargado" : `de ${formatCurrency(credito.limite)}`}
        />
      </div>

      {/* Lo que no cabe en un KPI pero cambia la decisión. */}
      <div className="flex flex-wrap items-center gap-2">
        {requiereAtencion(credito) && (
          <Aviso tono="error">{credito.aviso}</Aviso>
        )}
        {Object.values(persona.saldoAFavor).some((v) => v > 0) && (
          <Aviso tono="info">Te entregó {fmtMonedas(persona.saldoAFavor)} de más.</Aviso>
        )}
        {persona.adelantosCancelados > 0 && (
          <Aviso tono="neutro">
            {persona.adelantosCancelados} adelanto{persona.adelantosCancelados === 1 ? "" : "s"} cancelado
            {persona.adelantosCancelados === 1 ? "" : "s"} — no cuenta{persona.adelantosCancelados === 1 ? "" : "n"} en el saldo.
          </Aviso>
        )}
        {persona.ultimoRecordatorio && (
          <Aviso tono="neutro">
            <Clock className="h-4 w-4 shrink-0" aria-hidden /> Último recordatorio {dia(persona.ultimoRecordatorio)}
          </Aviso>
        )}
      </div>

      {persona.notas && (
        <div className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Notas de la ficha</p>
          <p className="mt-1 whitespace-pre-wrap text-base text-[var(--text-primary)]">{persona.notas}</p>
        </div>
      )}

      {/* ── Acciones de contacto y edición ───────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onEditar}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
        >
          <Pencil className="h-4 w-4" /> Editar ficha
        </button>
        {persona.telefono && (
          <a
            href={`tel:${persona.telefono.replace(/\D/g, "")}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          >
            <Phone className="h-4 w-4" /> Llamar
          </a>
        )}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        )}
      </div>

      {/* ── La cuenta ────────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 border-b border-[var(--rule-soft)]">
        {(
          [
            ["cuenta", `Cuenta corriente (${movimientos.length})`],
            ["adelantos", `Sus adelantos (${suyos.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPestana(id)}
            aria-pressed={pestana === id}
            className={`-mb-px border-b-2 px-3 py-2 text-base font-bold transition-colors ${
              pestana === id
                ? "border-primary text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {pestana === "cuenta" ? (
        movimientos.length === 0 ? (
          <p className="py-6 text-center text-base text-[var(--text-tertiary)]">
            Esta persona no tiene movimientos todavía.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
            {/* min-w-[560px] es clase muerta acá (memoria min-width-utilities-muertas). */}
            <DataTable className="w-full text-base" style={{ minWidth: 560 }}>
              <thead className="bg-[var(--surface-sunken)] text-sm text-[var(--text-tertiary)]">
                <tr className="text-left">
                  <th className="px-3 py-2 font-bold">Fecha</th>
                  <th className="px-3 py-2 font-bold">Concepto</th>
                  <th className="px-3 py-2 text-right font-bold">Monto</th>
                  <th className="px-3 py-2 text-right font-bold">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {movimientos.map((m, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--text-secondary)]">{dia(m.fecha)}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        {m.monto >= 0 ? (
                          <TrendingDown className="h-4 w-4 shrink-0 text-[var(--data-warning)]" aria-hidden />
                        ) : (
                          <TrendingUp className="h-4 w-4 shrink-0 text-[var(--data-success)]" aria-hidden />
                        )}
                        <span className="text-[var(--text-primary)]">{m.concepto}</span>
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums ${
                        m.monto >= 0 ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"
                      }`}
                    >
                      {m.monto >= 0 ? "+" : "−"}
                      {fmtMon(Math.abs(m.monto), m.moneda)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-[var(--text-primary)]">
                      {fmtMon(m.saldo, m.moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )
      ) : suyos.length === 0 ? (
        <p className="py-6 text-center text-base text-[var(--text-tertiary)]">Nunca le adelantaste plata.</p>
      ) : (
        <ul className="space-y-2">
          {suyos.map((a) => {
            const badge = STATUS_BADGE[a.status];
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onVerAdelanto(a)}
                  className="flex w-full items-center gap-3 rounded-2xl border-2 border-[var(--rule-soft)] px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-[var(--surface-sunken)]/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm font-bold text-[var(--text-primary)]">
                      {a.codigoOperacion ?? "— sin código —"}
                    </span>
                    <span className="block truncate text-sm text-[var(--text-tertiary)]">
                      {dia(a.fechaAdelanto)} · {MODALIDAD_LABEL[a.modalidad] ?? a.modalidad}
                      {a.notas ? ` · ${a.notas}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-extrabold tabular-nums text-[var(--text-primary)]">
                      {fmtMon(a.montoAdelantado, a.moneda)}
                    </span>
                    <span
                      className={`block text-sm font-semibold tabular-nums ${
                        a.saldoPendiente > 0 ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"
                      }`}
                    >
                      {a.saldoPendiente > 0 ? `debe ${fmtMon(a.saldoPendiente, a.moneda)}` : "sin saldo"}
                    </span>
                  </span>
                  <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${badge?.className ?? ""}`}>
                    {badge?.label ?? a.status}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ModalShell>
  );
}

function Kpi({
  label,
  valor,
  pie,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  pie?: string;
  tono?: "neutro" | "success" | "warning" | "error";
}) {
  const color =
    tono === "success"
      ? "text-[var(--data-success)]"
      : tono === "warning"
        ? "text-[var(--data-warning)]"
        : tono === "error"
          ? "text-[var(--data-error)]"
          : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${color}`}>{valor}</p>
      {pie && <p className="text-sm text-[var(--text-secondary)]">{pie}</p>}
    </div>
  );
}

function Aviso({ tono, children }: { tono: "error" | "info" | "neutro"; children: React.ReactNode }) {
  const cls =
    tono === "error"
      ? "bg-[var(--data-error)]/10 text-[var(--data-error)]"
      : tono === "info"
        ? "bg-[var(--data-info)]/10 text-[var(--data-info)]"
        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold ${cls}`}>{children}</div>
  );
}
