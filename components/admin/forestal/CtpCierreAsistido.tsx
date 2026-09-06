"use client";

/**
 * CtpCierreAsistido — cerrar el mes de punta a punta, sin recorrer 12 pestañas.
 *
 * Tres pasos: revisar qué queda pendiente (y qué de eso impide cerrar), cerrar,
 * y llevarse el paquete que se presenta (libro oficial + informe ARFFS + los
 * ANEXOS N° 04 del mes en un PDF). El cierre en sí lo hace el endpoint de
 * siempre: acá no se duplica lógica, se ordena el trabajo.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Loader2, Lock,
} from "@buleje/design-system/icons";
import { exportarLibroCtpOficial } from "@/lib/forestal/ctp-export";
import { printInformePeriodo } from "@/lib/forestal/ctp-informe";
import { exportarAnexosPDF } from "@/lib/forestal/anexo04-pdf";
import { DATOS_ANEXO04_DEFAULT } from "@/lib/forestal/anexo04-serfor";
import type { AnexoEmitido } from "@/lib/forestal/anexo04-registro";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { monthRange } from "@/lib/forestal/ctp-cierre-types";
import { revisarCierre } from "@/lib/forestal/ctp-cierre-checklist";
import { useCtpPendientes } from "@/hooks/use-ctp-pendientes";
import type { CtpCierresState } from "@/hooks/use-ctp-cierres";

const BTN = "inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50";

const TONO = {
  no_conviene: "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
  con_observaciones: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  listo: "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
} as const;

/**
 * Meses cerrables: del anterior hacia atrás (un mes se cierra terminado), igual
 * que el panel de abajo. El asistente NO usa el período de la vista: mirando
 * "todo el histórico" propondría cerrar un mes que nadie revisó.
 */
function mesesCerrables(): { key: string; label: string; year: number; month: number }[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (i + 1), 1);
    const r = monthRange(d.getFullYear(), d.getMonth());
    return { key: r.periodKey, label: r.label, year: d.getFullYear(), month: d.getMonth() + 1 };
  });
}

export default function CtpCierreAsistido({ onIr, cierres }: {
  onIr: (vista: string) => void;
  /** Estado compartido con el historial de abajo (un solo fetch, un solo cerrar). */
  cierres: CtpCierresState;
}) {
  const meses = useMemo(mesesCerrables, []);
  const [mesKey, setMesKey] = useState("");
  // Arranca en el mes más reciente que todavía se pueda cerrar.
  const abierto = meses.find((m) => !cierres.closedKeys.has(m.key)) ?? meses[0];
  const mes = meses.find((m) => m.key === mesKey) ?? abierto;
  const yaCerrado = cierres.closedKeys.has(mes.key);

  /** Se revisa EXACTAMENTE el mes que se va a cerrar, no lo que muestra la vista. */
  const periodoDelMes: CtpPeriod = useMemo(() => {
    const r = monthRange(mes.year, mes.month - 1);
    return { key: "custom", label: r.label, from: r.from.toISOString(), to: r.to.toISOString() };
  }, [mes]);

  const { datos, lista, cargando, falló, recargar } = useCtpPendientes(periodoDelMes);
  const [cerrando, setCerrando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);
  const [bajando, setBajando] = useState<string | null>(null);

  const revision = useMemo(() => revisarCierre(datos, mes.label), [datos, mes.label]);

  const cerrar = async () => {
    setCerrando(true);
    setResultado(null);
    const r = await cierres.cerrar(mes.year, mes.month);
    setResultado({ ok: r.ok, msg: r.ok ? `${mes.label} cerrado · ${r.msg}` : `No se pudo cerrar: ${r.msg}` });
    if (r.ok) recargar();
    setCerrando(false);
  };

  /** El paquete que se presenta: libro oficial, informe y los anexos del mes. */
  const bajar = async (kind: "oficial" | "informe" | "anexos") => {
    setBajando(kind);
    try {
      if (kind === "oficial") await exportarLibroCtpOficial(periodoDelMes);
      else if (kind === "informe") await printInformePeriodo(periodoDelMes);
      else {
        const r = await fetch("/api/admin/forestal/anexos", { credentials: "include", cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as { anexos?: AnexoEmitido[] };
        const delMes = (j.anexos ?? []).filter((a) => a.fecha?.startsWith(`${mes.year}-${String(mes.month).padStart(2, "0")}`));
        if (delMes.length === 0) { setResultado({ ok: false, msg: "No hay anexos emitidos en ese mes." }); return; }
        await exportarAnexosPDF(
          delMes.map((a) => ({ piezas: a.piezas, datos: { ...DATOS_ANEXO04_DEFAULT, ...a }, especieGlobal: a.especieGlobal })),
          `anexos-04-${mes.year}-${String(mes.month).padStart(2, "0")}.pdf`,
        );
      }
    } catch {
      setResultado({ ok: false, msg: "No se pudo generar el archivo." });
    } finally {
      setBajando(null);
    }
  };

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Lock className="h-4 w-4 text-[var(--accent)]" /> Cerrar el mes paso a paso
        </span>
        <span className="flex items-center gap-2">
          {cargando && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />}
          <select
            value={mes.key}
            onChange={(e) => { setMesKey(e.target.value); setResultado(null); }}
            aria-label="Mes a cerrar"
            className="h-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            {meses.map((m) => (
              <option key={m.key} value={m.key} disabled={cierres.closedKeys.has(m.key)}>
                {m.label}{cierres.closedKeys.has(m.key) ? " — cerrado" : ""}
              </option>
            ))}
          </select>
        </span>
      </div>

      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        Cerrar congela el costo de las corridas del mes, guarda la existencia de cierre (la apertura del
        siguiente) y <strong>bloquea</strong> el período: no se agregan, anulan ni reatribuyen líneas de ese mes.
      </p>

      {/* 1 · Revisión */}
      {falló ? (
        <p className="flex items-center justify-between gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
          No se pudo revisar el período.
          <button type="button" onClick={recargar} className="font-bold text-[var(--accent)] hover:underline">Reintentar</button>
        </p>
      ) : (
        <div className={`rounded-xl border-2 px-3 py-2 ${TONO[revision.veredicto]}`}>
          <p className="flex items-center gap-2 text-xs font-bold">
            {revision.veredicto === "listo" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            {revision.titulo}
          </p>
          <ul className="mt-1.5 space-y-1 text-[length:var(--ts-2xs)]">
            {revision.impedimentos.map((t) => <li key={t}>· {t}</li>)}
            {revision.observaciones.map((t) => <li key={t}>· {t}</li>)}
            {revision.nota.map((t) => <li key={t} className="opacity-75">· {t}</li>)}
          </ul>
          {lista.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {lista.slice(0, 4).map((p) => (
                <button key={p.clave} type="button" onClick={() => onIr(p.vista)} className="rounded-lg border-2 border-current px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold hover:brightness-110">
                  Resolver: {p.titulo.toLowerCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2 · Cerrar */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void cerrar()}
          disabled={cerrando || cargando || yaCerrado || revision.veredicto === "no_conviene"}
          title={yaCerrado ? "Ese mes ya está cerrado" : revision.veredicto === "no_conviene" ? "Resolvé lo que impide cerrar" : `Congela costos y bloquea ${mes.label}`}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {cerrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {cerrando ? "Cerrando…" : yaCerrado ? `${mes.label} ya está cerrado` : `Cerrar ${mes.label}`}
        </button>
        {resultado && (
          <span className={`text-xs font-bold ${resultado.ok
            ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
            : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"}`}>
            {resultado.msg}
          </span>
        )}
      </div>

      {/* 3 · El paquete que se presenta */}
      <div className="mt-4 border-t-2 border-[var(--rule-soft)] pt-3">
        <p className="mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Llevate el paquete del mes</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void bajar("oficial")} disabled={bajando !== null} className={BTN}>
            {bajando === "oficial" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Libro oficial (LO-CTP)
          </button>
          <button type="button" onClick={() => void bajar("informe")} disabled={bajando !== null} className={BTN}>
            {bajando === "informe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Informe ARFFS
          </button>
          <button type="button" onClick={() => void bajar("anexos")} disabled={bajando !== null} className={BTN}>
            {bajando === "anexos" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Anexos N° 04 del mes
          </button>
        </div>
      </div>
    </section>
  );
}
