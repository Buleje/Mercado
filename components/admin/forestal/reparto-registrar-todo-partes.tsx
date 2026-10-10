"use client";

/**
 * Las piezas de «Registrar toda la producción» (ADR-464, Brandon 2026-10-03):
 * la barra de la Distribución, el botón del bloque, el resumen previo y la
 * lista de avance. El modal que las junta vive en `reparto-registrar-todo.tsx`.
 */

import { AlertTriangle, BookOpen, CheckCircle2, Circle, FileText, Loader2, XCircle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { fechaConDia } from "@/lib/forestal/loth-tablero-reporte";
import {
  textoDias,
  type AvanceDeTanda,
  type PasoDeProduccion,
  type PlanDeProduccion,
  type RecorridoDeTanda,
} from "@/lib/forestal/toda-la-produccion";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const BTN_PRIMARIO =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
const BTN =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50";
const AYUDA = {
  what: "Registra en el Libro todos los días listos de la Distribución, uno por vez y en orden: bloque por bloque y día por día. Cada día consume sus trozas desde el lote del bloque y declara lo que salió en la línea principal (LP), igual que su botón «Registrar en el Libro».",
  affects: "Si un día falla, se detiene ahí: lo ya escrito queda en el Libro (no se deshace) y puedes reintentar lo pendiente. Después se pasa el Anexo 04 de cada permiso al libro (despacho), que descuenta del patio.",
  example: "3 bloques de 2 días = 6 corridas nuevas en el Libro, una por jornada.",
};

/** La línea de arriba de los bloques: cuánto hay listo y el botón. */
export function BarraRegistrarTodo({
  plan,
  leyendo,
  motivoApagado,
  onAbrir,
  onIrAlAnexo,
}: {
  plan: PlanDeProduccion;
  /** El Libro se está leyendo: las cifras todavía no valen. */
  leyendo: boolean;
  motivoApagado: string | null;
  onAbrir: () => void;
  onIrAlAnexo: () => void;
}) {
  const fuera = plan.noEntran.filter((n) => n.tipo !== "abierta").reduce((a, n) => a + n.dias, 0);
  const todoEscrito = plan.dias === 0 && plan.noEntran.length === 0 && plan.yaEnLibro > 0;
  const dato = leyendo
    ? "Leyendo el Libro…"
    : todoEscrito
      ? `Toda la producción está en el Libro · ${plural(plan.yaEnLibro, "día", "días")}`
      : [
          plan.dias > 0 ? `${plural(plan.dias, "día listo", "días listos")} en ${plural(plan.bloques, "bloque", "bloques")}` : "Ningún día listo",
          fuera > 0 ? `${plural(fuera, "no entra", "no entran")}` : null,
          plan.yaEnLibro > 0 ? `${plan.yaEnLibro} ya en el Libro` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 print:hidden">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <BookOpen className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        <span className="text-sm font-bold text-[var(--text-primary)]">Producción al Libro</span>
        <InfoTip title="Registrar toda la producción" what={AYUDA.what} affects={AYUDA.affects} example={AYUDA.example} />
        <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
          {leyendo && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {dato}
        </span>
      </span>
      {todoEscrito ? (
        <button type="button" onClick={onIrAlAnexo} className={BTN}>
          <FileText className="h-4 w-4" aria-hidden /> Ir al Anexo 04 por permiso
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <button type="button" onClick={onAbrir} disabled={Boolean(motivoApagado)} className={plan.dias > 0 ? BTN_PRIMARIO : BTN}>
            <BookOpen className="h-4 w-4" aria-hidden /> {plan.dias > 0 ? "Registrar toda la producción" : "Ver qué falta"}
          </button>
          {motivoApagado && !leyendo && <InfoTip title="Todavía no se puede" what={motivoApagado} />}
        </span>
      )}
    </div>
  );
}

/** «Registrar sus N días» en la cabecera del bloque. */
export function BotonRegistrarBloque({ dias, motivoApagado, onAbrir }: { dias: number; motivoApagado: string | null; onAbrir: () => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onAbrir}
        disabled={Boolean(motivoApagado)}
        title={motivoApagado ?? `Registrar en el Libro los ${dias} días listos de este bloque, en orden`}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] px-2 py-1 text-xs font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-[var(--accent)]"
      >
        <BookOpen className="h-4 w-4" aria-hidden /> Registrar sus {dias} días
      </button>
    </span>
  );
}

function Cifra({ titulo, valor, sub }: { titulo: string; valor: string; sub: string }) {
  return (
    <div className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{titulo}</div>
      <div className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">{valor}</div>
      <div className="text-xs text-[var(--text-secondary)]">{sub}</div>
    </div>
  );
}

/** Lo que se va a escribir, por bloque, y lo que no entra con su motivo. */
export function ResumenDeTanda({ plan }: { plan: PlanDeProduccion }) {
  const porBloque = [...new Set(plan.pasos.map((p) => p.bloqueId))].map((id) => plan.pasos.filter((p) => p.bloqueId === id));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cifra titulo="Bloques" valor={String(plan.bloques)} sub={plural(plan.dias, "día en orden", "días en orden")} />
        <Cifra titulo="Corridas nuevas" valor={String(plan.dias)} sub="una por día, línea LP" />
        <Cifra titulo="Rolliza" valor={`${fmtM3(plan.rollizaM3)} m³`} sub={plural(plan.trozas, "troza", "trozas")} />
        <Cifra titulo="Aserrada" valor={`${fmtPt(plan.pieTablar)} PT`} sub={`${fmtM3(plan.m3)} m³ · ${fmtPiezas(plan.piezas)} pzas`} />
      </div>
      {porBloque.length > 0 && (
        <ul className="divide-y divide-[var(--rule-soft)] rounded-lg border border-[var(--rule-base)]">
          {porBloque.map((pasos) => {
            const p0 = pasos[0]!;
            const ult = pasos[pasos.length - 1]!;
            const trozas = pasos.reduce((a, p) => a + p.jornada.trozaIds.length, 0);
            const rolliza = pasos.reduce((a, p) => a + p.jornada.rollizaM3, 0);
            const pt = pasos.reduce((a, p) => a + p.jornada.pieTablar, 0);
            const m3 = pasos.reduce((a, p) => a + p.jornada.m3, 0);
            const pzas = pasos.reduce((a, p) => a + p.jornada.piezas, 0);
            const fechas = p0 === ult ? fechaConDia(p0.jornada.fecha) : `${fechaConDia(p0.jornada.fecha)} a ${fechaConDia(ult.jornada.fecha)}`;
            return (
              <li key={p0.bloqueId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <b className="text-[var(--text-primary)]">{p0.etiqueta}</b>
                  <span className="text-[var(--text-secondary)]"> · {p0.especie || "sin especie"} · {textoDias(pasos.map((p) => p.jornada.dia))} · {fechas}</span>
                </span>
                <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                  {plural(trozas, "troza", "trozas")} ({fmtM3(rolliza)} m³) → {fmtPt(pt)} PT · {fmtM3(m3)} m³ · {fmtPiezas(pzas)} pzas
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {plan.noEntran.length > 0 && (
        <div className="rounded-lg border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> No entran
          </p>
          <ul className="mt-1 space-y-1">
            {plan.noEntran.map((n) => (
              <li key={`${n.bloqueId}-${n.tipo}-${n.dia ?? "todo"}`} className="text-sm text-[var(--text-secondary)]">
                <b className="text-[var(--text-primary)]">
                  {n.etiqueta}
                  {n.dia == null ? ` · ${plural(n.dias, "día", "días")}` : ` · día ${n.dia}${n.dias > 1 ? ` y ${plural(n.dias - 1, "día", "días")} detrás` : ""}`}
                  {n.tipo === "abierta" ? " · corrida sin declarar" : ""}
                </b>
                : {n.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.yaEnLibro > 0 && (
        <p className="text-xs text-[var(--text-tertiary)]">{plural(plan.yaEnLibro, "día ya estaba", "días ya estaban")} en el Libro: no se repiten.</p>
      )}
    </div>
  );
}

type EstadoPaso = { tipo: "ok"; lineNo: number | null } | { tipo: "curso" } | { tipo: "fallo" } | { tipo: "pendiente" };

function estadoDe(p: PasoDeProduccion, i: number, avance: AvanceDeTanda<PasoDeProduccion> | null, rec: RecorridoDeTanda<PasoDeProduccion> | null): EstadoPaso {
  if (rec) {
    const e = rec.escritos.find((x) => x.paso === p);
    if (e) return { tipo: "ok", lineNo: e.resultado.lineNo ?? null };
    return rec.fallo?.paso === p ? { tipo: "fallo" } : { tipo: "pendiente" };
  }
  if (avance) return i < avance.hechos ? { tipo: "ok", lineNo: null } : i === avance.hechos ? { tipo: "curso" } : { tipo: "pendiente" };
  return { tipo: "pendiente" };
}

/** Día por día: escrito, en curso, el que falló y lo que no se intentó. */
export function ListaDeAvance({
  pasos,
  avance,
  recorrido,
}: {
  pasos: readonly PasoDeProduccion[];
  avance: AvanceDeTanda<PasoDeProduccion> | null;
  recorrido: RecorridoDeTanda<PasoDeProduccion> | null;
}) {
  return (
    <ol className="max-h-64 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-base)]">
      {pasos.map((p, i) => {
        const e = estadoDe(p, i, avance, recorrido);
        return (
          <li key={`${p.bloqueId}#${p.jornada.dia}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            {e.tipo === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-label="Escrito" />
            ) : e.tipo === "curso" ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" aria-label="Escribiendo" />
            ) : e.tipo === "fallo" ? (
              <XCircle className="h-4 w-4 shrink-0 text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" aria-label="Falló" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-label="Pendiente" />
            )}
            <span className={`min-w-0 flex-1 truncate ${e.tipo === "pendiente" ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>
              {p.etiqueta} · día {p.jornada.dia} · {fechaConDia(p.jornada.fecha)}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
              {e.tipo === "ok" && e.lineNo != null ? `corrida N° ${e.lineNo}` : `${fmtPiezas(p.jornada.piezas)} pzas · ${fmtM3(p.jornada.m3)} m³`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
