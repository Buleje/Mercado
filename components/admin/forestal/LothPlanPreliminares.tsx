"use client";

/**
 * «GTF preliminares (hechas a mano, por enviar a SERFOR)» del plan (Brandon
 * 25-10): el botón «Registrar GTF preliminar» y la lista con su estado
 * y sus acciones en el ⋯ (Editar, Ya la registré, Volver a pendiente, Anular).
 *
 * El KPI va arriba, en «Saldo por especie» (uno solo, no repetido acá). Los
 * datos vienen con el saldo (`preliminares` de `/loth/saldo-plan`): lo que
 * descuenta lo calcula el servidor. Anular pide motivo y no borra nada.
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Ban, CheckCheck, ChevronDown, FileWarning, Pencil, Plus, Undo2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { resumenDeLineas, textoDeLts, type GtfPreliminarVista } from "@/lib/forestal/loth-plan-preliminares";
import type { SaldoPlanRespuesta } from "@/lib/forestal/loth-saldo-plan-tipos";
import { MENSAJE_MOTIVO, motivoSuficiente } from "@/lib/validations/motivo";
import { cambiarEstadoDeLaPreliminar, type CambioDeEstado } from "./hooks/plan-preliminares-api";
import LothPlanPreliminarModal from "./LothPlanPreliminarModal";
import { Btn } from "./ctp-shared";

export const ID_PRELIMINARES = "preliminares-del-plan";

const NUM = "font-mono tabular-nums";
const PILL: Record<GtfPreliminarVista["estado"], string> = {
  pendiente: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  registrada: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
  anulada: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

/** «2026-10-12» → «12/10/2026», sin pasar por `Date` (fecha sin hora). */
const fechaCorta = (f: string | null) => (f ? f.split("-").reverse().join("/") : null);

function Fila({ g, acciones, resaltada = false }: { g: GtfPreliminarVista; acciones: MenuAccion[]; resaltada?: boolean }) {
  const fecha = fechaCorta(g.fecha);
  return (
    <li
      data-testid="preliminar"
      data-estado={g.estado}
      data-preliminar-id={g.id}
      className={`flex items-start gap-2 py-2 ${resaltada ? "rounded-lg bg-[var(--data-error-50)] px-2 ring-2 ring-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/12" : ""}`}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-mono font-bold text-[var(--text-primary)]">GTF {g.numeroGtf}</span>
          <span className="text-[var(--text-secondary)]">LT {textoDeLts(g.numerosLt)}</span>
          {fecha && <span className={`${NUM} text-[var(--text-secondary)]`}>{fecha}</span>}
          <span className={`rounded-md px-1.5 text-xs font-semibold ${PILL[g.estado]}`}>{g.estado}</span>
          {g.estado === "pendiente" && g.enElLibro && (
            <span className="rounded-md bg-[var(--data-info-500)]/10 px-1.5 text-xs font-semibold text-[var(--data-info-ink)]">ya en el libro</span>
          )}
        </p>
        <p className={`text-sm ${g.estado === "anulada" ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-secondary)]"}`}>
          {resumenDeLineas(g.lineas, fmtM3)}
        </p>
        {g.estado === "anulada" && g.motivoAnulacion && <p className="text-sm text-[var(--text-tertiary)]">Motivo: {g.motivoAnulacion}</p>}
        {g.nota && g.estado !== "anulada" && <p className="text-sm text-[var(--text-tertiary)]">{g.nota}</p>}
      </div>
      {acciones.length > 0 && <ActionMenu label={`Acciones de la GTF ${g.numeroGtf}`} actions={acciones} soloIcono size="sm" />}
    </li>
  );
}

export default function LothPlanPreliminares({
  planId,
  dato,
  onCambio,
  resaltadas = [],
}: {
  planId: string;
  dato: SaldoPlanRespuesta | null;
  /** Las que hacen pasar un bloque, tras «Corregir» en su aviso. */
  resaltadas?: readonly string[];
  /** Se guardó algo: la vista relee el saldo (y con él, las preliminares). */
  onCambio: () => void;
}) {
  const rol = useMiRol();
  const { prompt } = useConfirm();
  /* Los roles que exige `/plan/preliminares` (rol desconocido: se ofrece y decide el servidor). */
  const puedeEscribir = rol == null || rol === "admin" || rol === "owner" || rol === "superadmin";
  const [editando, setEditando] = useState<GtfPreliminarVista | "nueva" | null>(null);
  const [verCerradas, setVerCerradas] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const pre = dato?.preliminares;
  if (!dato || pre === undefined) return null;

  const especies = [...new Map(dato.delPlan.map((e) => [claveEspecie(e.speciesCommon), e.speciesCommon.trim()])).values()];
  const pendientes = pre?.guias.filter((g) => g.estado === "pendiente") ?? [];
  const cerradas = pre?.guias.filter((g) => g.estado !== "pendiente") ?? [];

  const cambiar = async (g: GtfPreliminarVista, cambio: CambioDeEstado, hecho: string) => {
    setOcupada(g.id);
    setMsg(null);
    const r = await cambiarEstadoDeLaPreliminar(planId, g.id, cambio);
    setOcupada(null);
    setMsg(r.ok ? { ok: true, texto: hecho } : { ok: false, texto: r.mensaje });
    if (r.ok) onCambio();
  };
  const anular = async (g: GtfPreliminarVista) => {
    const motivo = await prompt({
      title: `Anular la GTF preliminar ${g.numeroGtf}`,
      description: "Deja de descontar en el saldo. No se borra: queda en la lista como anulada, con su motivo.",
      label: "Motivo (obligatorio)",
      placeholder: MENSAJE_MOTIVO,
      inputType: "textarea",
      required: true,
      validar: motivoSuficiente,
      intent: "danger",
      confirmLabel: "Anular",
    });
    if (motivo) await cambiar(g, { accion: "anular", motivo }, `GTF ${g.numeroGtf} anulada: ya no descuenta.`);
  };
  const accionesDe = (g: GtfPreliminarVista): MenuAccion[] => {
    if (!puedeEscribir || g.estado === "anulada") return [];
    const busy = ocupada === g.id;
    const a: MenuAccion[] = [];
    if (g.estado === "pendiente") {
      a.push({ id: "editar", label: "Editar", icon: Pencil, onSelect: () => setEditando(g), disabled: busy });
      a.push({
        id: "registrada",
        label: g.enElLibro ? "Marcar como registrada" : "Ya la registré",
        hint: g.enElLibro ? `Ya está en el libro como GTF ${g.enElLibro.gtfNumber}.` : "La registraste en SERFOR y en el libro: deja de descontar acá.",
        icon: CheckCheck,
        busy,
        onSelect: () => void cambiar(g, { accion: "registrada" }, `GTF ${g.numeroGtf} registrada: sale de los pendientes.`),
      });
    } else {
      a.push({
        id: "pendiente",
        label: "Volver a pendiente",
        hint: "Si la marcaste por error: vuelve a descontar.",
        icon: Undo2,
        busy,
        onSelect: () => void cambiar(g, { accion: "pendiente" }, `GTF ${g.numeroGtf} vuelve a pendiente.`),
      });
    }
    a.push({ id: "anular", label: "Anular", hint: "Con motivo; no se borra.", icon: Ban, tone: "danger", busy, onSelect: () => void anular(g) });
    return a;
  };

  return (
    <section id={ID_PRELIMINARES} data-testid="preliminares-del-plan" aria-labelledby="preliminares-titulo" className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
      {/* Una sola fila cuando no hay pendientes (26-10, «más compacto»): el
          título, «ninguna pendiente», las cerradas a un clic y el botón. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 grow basis-[16rem] items-center gap-1">
          <FileWarning className="h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden="true" />
          {/* «Hechas a mano, por enviar a SERFOR» al lado del título y no dentro:
              así se recorta (o pasa al ⓘ en angosto) antes que partir la fila. */}
          <CardTitle id="preliminares-titulo" className="shrink-0">GTF preliminares</CardTitle>
          <span className="min-w-0 truncate text-sm text-[var(--text-secondary)] max-lg:hidden">(hechas a mano, por enviar a SERFOR)</span>
          <InfoTip
            title="Qué es una preliminar"
            what="Una guía que ya hiciste en papel y todavía no registras en SERFOR ni en el libro. Anotas el N.º de GTF, el de la LT y cuánto trajo de cada especie."
            affects="Mientras esté pendiente, se resta en «Saldo si se registran» de cada especie. El freno del despacho no cambia: sigue midiendo sólo lo registrado."
            example="GTF 1 con LT 2: tornillo 30 trozas, 20 m³ (bloque 1). Quedan 120 m³ → si se registran quedan 100 m³."
          />
        </div>
        {pre !== null && pendientes.length === 0 && (
          <span data-preliminares-vacio className="text-sm text-[var(--text-secondary)]">Ninguna pendiente de registrar</span>
        )}
        {pre !== null && cerradas.length > 0 && (
          <Btn variant="ghost" size="sm" onClick={() => setVerCerradas((v) => !v)} aria-expanded={verCerradas}>
            <ChevronDown className={`h-4 w-4 transition-transform ${verCerradas ? "rotate-180" : ""}`} aria-hidden="true" />
            Registradas y anuladas ({cerradas.length})
          </Btn>
        )}
        {puedeEscribir && (
          <Btn variant="primary" onClick={() => setEditando("nueva")} data-testid="registrar-preliminar">
            <Plus className="h-4 w-4" aria-hidden="true" /> Registrar GTF preliminar
          </Btn>
        )}
      </div>
      {pre === null ? (
        <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">No se pudieron leer las preliminares de este plan. Recarga la página.</p>
      ) : (
        <>
          {pendientes.length > 0 && (
            <ul className="divide-y divide-[var(--rule-base)]">
              {pendientes.map((g) => (
                <Fila key={g.id} g={g} acciones={accionesDe(g)} resaltada={resaltadas.includes(g.id)} />
              ))}
            </ul>
          )}
          {verCerradas && cerradas.length > 0 && (
            <ul className="divide-y divide-[var(--rule-base)] border-t border-[var(--rule-base)]">
              {cerradas.map((g) => (
                <Fila key={g.id} g={g} acciones={accionesDe(g)} />
              ))}
            </ul>
          )}
        </>
      )}
      {msg && (
        <p
          role={msg.ok ? "status" : "alert"}
          className={`text-sm font-semibold ${msg.ok ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"}`}
        >
          {msg.texto}
        </p>
      )}
      {editando && pre && (
        <LothPlanPreliminarModal
          planId={planId}
          guia={editando === "nueva" ? null : editando}
          especies={especies}
          bloques={pre.bloques}
          porBloque={pre.porBloque}
          saldo={dato.saldo.especies}
          guias={pre.guias}
          onClose={() => setEditando(null)}
          onGuardado={(texto) => {
            setEditando(null);
            setMsg({ ok: true, texto });
            onCambio();
          }}
        />
      )}
    </section>
  );
}
