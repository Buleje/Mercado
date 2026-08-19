"use client";

/**
 * Cobranza — a quién hay que cobrarle y qué se hizo con cada uno.
 *
 * Antes eran cinco bloques apilados que se solapaban entre sí: los KPIs, los
 * tres cajones de antigüedad, las entregas pactadas (que listaba cuotas de
 * noviembre bajo un título de cobranza), y la lista de recordatorios. Cada uno
 * mostraba una parte de la misma cartera con criterios distintos.
 *
 * Ahora es UNA lista con los filtros arriba, en los tramos que usa un contador
 * (0-30 / 31-60 / 61-90 / +90, porque a los 90 días la deuda se da por
 * incobrable) y una fila que dice lo único que decide a quién llamar primero:
 * cuánto debe, qué prometió, y hace cuánto que nadie lo toca.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { CheckCircle, FileText, MessageCircle, Search, Settings2, Target } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { enlaceWhatsAppConTexto } from "@/lib/adelantos/contacto";
import { cumplimientoDe, resumirPersona } from "@/lib/adelantos/saldo-persona";
import {
  TRAMOS,
  avanceDeMeta,
  promesasVigentes,
  recuperadoDelMes,
  tramoDe,
  ultimaGestionPorPersona,
  type Gestion,
  type TramoId,
} from "@/lib/adelantos/gestion-cobranza";
import { armarMensaje, guardarPlantillas, leerPlantillas, type Plantillas } from "@/lib/adelantos/plantillas-cobranza";
import { deudoresDeCobranza, ordenarPorUrgencia, type DeudorCobranza } from "@/lib/adelantos/urgencia-cobranza";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { EmptyState, SkeletonGrid, sinTildes } from "../shared";
import ProximosVencimientos from "./ProximosVencimientos";
import FilaDeudor from "./FilaDeudor";
import AnotarGestion from "./AnotarGestion";
import PlantillasModal from "./PlantillasModal";
import MetaModal from "./MetaModal";
import ModoLlamada from "./ModoLlamada";

/** La meta vive en el navegador: es del negocio, no del sistema, y cambia mes a mes. */
const CLAVE_META = "buleje:cobranza-meta";

export default function CobranzaView({
  adelantos,
  loading,
  onRecordado,
}: {
  adelantos: DbAdelanto[];
  loading: boolean;
  onGoTab: (t: string) => void;
  onRecordado?: () => void;
}) {
  const [tramo, setTramo] = useState<TramoId | "todos">("todos");
  const [q, setQ] = useState("");
  const [tanda, setTanda] = useState<Set<string>>(new Set());
  const [gestiones, setGestiones] = useState<Gestion[]>([]);
  const [anotando, setAnotando] = useState<DeudorCobranza | null>(null);
  const [verPlantillas, setVerPlantillas] = useState(false);
  const [verMeta, setVerMeta] = useState(false);
  const [enLlamada, setEnLlamada] = useState(false);
  const [plantillas, setPlantillas] = useState<Plantillas>(leerPlantillas);
  const [meta, setMeta] = useState(0);
  const [enviandoRonda, setEnviandoRonda] = useState(false);

  useEffect(() => {
    try {
      setMeta(Number(window.localStorage.getItem(CLAVE_META)) || 0);
    } catch {
      /* sin persistencia, sin meta: la lista funciona igual */
    }
  }, []);

  const cargarGestiones = useCallback(async () => {
    try {
      const r = await fetch("/api/adelantos/gestiones", { credentials: "include" });
      setGestiones(r.ok ? await r.json() : []);
    } catch (e) {
      logger.warn("[cobranza] no se pudieron traer las gestiones", { error: String(e) });
    }
  }, []);
  useEffect(() => { void cargarGestiones(); }, [cargarGestiones]);

  const now = Date.now();
  const abiertos = useMemo(() => adelantos.filter((a) => a.status === "ABIERTO" && a.saldoPendiente > 0), [adelantos]);
  const deudores = useMemo(() => deudoresDeCobranza(abiertos, now), [abiertos, now]);
  const promesas = useMemo(() => promesasVigentes(gestiones, now), [gestiones, now]);
  const ultimas = useMemo(() => ultimaGestionPorPersona(gestiones), [gestiones]);

  /** El % histórico devuelto por cada persona, de sus adelantos de siempre. */
  const cumplimientos = useMemo(() => {
    const porPersona = new Map<string, DbAdelanto[]>();
    for (const a of adelantos) {
      const lista = porPersona.get(a.beneficiarioId) ?? [];
      lista.push(a);
      porPersona.set(a.beneficiarioId, lista);
    }
    const out = new Map<string, number | null>();
    for (const [id, lista] of porPersona) out.set(id, cumplimientoDe(resumirPersona(lista)));
    return out;
  }, [adelantos]);

  const totales = useMemo(() => {
    const porTramo = Object.fromEntries(TRAMOS.map((t) => [t.id, { total: 0, n: 0 }])) as Record<
      TramoId,
      { total: number; n: number }
    >;
    for (const d of deudores) {
      const t = porTramo[tramoDe(d.dias)];
      t.total += d.saldo;
      t.n += 1;
    }
    return porTramo;
  }, [deudores]);

  const totalPorCobrar = deudores.reduce((s, d) => s + d.saldo, 0);
  const vencido = deudores.filter((d) => d.dias > 0).reduce((s, d) => s + d.saldo, 0);
  const recuperado = useMemo(() => recuperadoDelMes(adelantos, now), [adelantos, now]);
  const avance = avanceDeMeta(meta, recuperado);
  const sinTelefono = deudores.filter((d) => !d.telefono).length;
  const prometieron = [...promesas.values()].filter((p) => p.estado !== "incumplio").length;

  const filtrados = useMemo(() => {
    const t = sinTildes(q);
    const base = deudores.filter((d) => {
      if (tramo !== "todos" && tramoDe(d.dias) !== tramo) return false;
      return !t || sinTildes(d.nombre).includes(t);
    });
    return ordenarPorUrgencia(base);
  }, [deudores, tramo, q]);

  useEffect(() => setTanda(new Set()), [tramo, q]);

  /** El texto que le toca a cada uno según su tramo de atraso. */
  const mensajeDe = useCallback(
    (d: DeudorCobranza) =>
      armarMensaje(plantillas[tramoDe(d.dias)], {
        nombre: d.nombre,
        saldo: formatCurrency(d.saldo),
        dias: d.dias,
      }),
    [plantillas],
  );

  /** Anota una gestión rápida sin abrir el modal (la usa la ronda). */
  const anotarRapido = async (beneficiarioId: string, tipo: string) => {
    try {
      await fetch("/api/adelantos/gestiones", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ beneficiarioId, tipo }),
      });
    } catch (e) {
      logger.error("[cobranza] no se pudo anotar la gestión", { error: String(e) });
    }
  };

  /**
   * Abre el chat de cada uno de la ronda y anota que se le escribió.
   *
   * De a uno con 400 ms de respiro: una ráfaga de `window.open` la bloquea el
   * navegador y quedarían la mitad sin mandar, sin que nadie se entere.
   */
  const mandarLaRonda = async () => {
    setEnviandoRonda(true);
    try {
      for (const d of filtrados.filter((x) => tanda.has(x.id))) {
        const url = enlaceWhatsAppConTexto(d.telefono, mensajeDe(d));
        if (!url) continue;
        window.open(url, "_blank", "noopener,noreferrer");
        await anotarRapido(d.id, "RECORDATORIO");
        await new Promise((r) => setTimeout(r, 400));
      }
      setTanda(new Set());
      await cargarGestiones();
      onRecordado?.();
    } finally {
      setEnviandoRonda(false);
    }
  };

  const exportarPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Lista de cobranza", 14, 18);
    doc.setFontSize(10);
    doc.text(
      `Por cobrar: ${formatCurrency(totalPorCobrar)} · ${deudores.length} deudores · ${new Date().toLocaleDateString("es-PE")}`,
      14,
      25,
    );
    autoTable(doc, {
      startY: 31,
      head: [["Persona", "Saldo", "Atraso", "Última gestión", "Prometió", "Teléfono"]],
      /* Mismo orden que la pantalla: el papel que se lleva el cobrador no puede
         priorizar distinto que la lista que se acaba de mirar. */
      body: filtrados.map((d) => {
        const u = ultimas.get(d.id);
        const p = promesas.get(d.id);
        return [
          d.nombre,
          formatCurrency(d.saldo),
          d.dias > 0 ? `${d.dias} días` : "al día",
          u ? `${u.tipo} ${new Date(u.fecha).toLocaleDateString("es-PE")}` : "—",
          p?.gestion.fechaPrometida ? new Date(p.gestion.fechaPrometida).toLocaleDateString("es-PE") : "—",
          d.telefono ?? "—",
        ];
      }),
    });
    doc.save(`cobranza-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (loading) return <SkeletonGrid />;
  if (deudores.length === 0 && abiertos.length === 0) {
    return <EmptyState icon={CheckCircle} title="Nada por cobrar" hint="No hay adelantos abiertos con saldo pendiente." />;
  }

  const chip = (activo: boolean) =>
    `h-10 rounded-xl px-3.5 text-sm font-bold transition-colors ${
      activo
        ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40 dark:text-[var(--accent)]"
        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
    }`;

  return (
    <div className="space-y-4">
      <ProximosVencimientos adelantos={adelantos} />

      {/* ── El estado de la cartera, en una línea ─────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Por cobrar" valor={formatCurrency(totalPorCobrar)} pie={`${deudores.length} deudores`} tono="warning" />
        <Kpi
          label="Vencido"
          valor={formatCurrency(vencido)}
          pie={totalPorCobrar > 0 ? `${Math.round((vencido / totalPorCobrar) * 100)}% de la cartera` : "—"}
          tono={vencido > 0 ? "error" : "success"}
        />
        <Kpi
          label="Prometieron pagar"
          valor={String(prometieron)}
          pie={prometieron > 0 ? "con fecha comprometida" : "nadie se comprometió"}
          tono={prometieron > 0 ? "info" : "neutro"}
        />
        <button onClick={() => setVerMeta(true)} className="rounded-xl bg-[var(--surface-sunken)] p-4 text-left transition-colors hover:bg-[var(--surface-sunken)]/60">
          <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            <Target className="h-3.5 w-3.5" aria-hidden /> Recuperado del mes
          </p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--data-success)]">{formatCurrency(recuperado)}</p>
          {avance.porcentaje == null ? (
            <p className="text-sm text-[var(--text-secondary)]">Tocá para poner una meta</p>
          ) : (
            <>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
                <div className="h-full rounded-full bg-[var(--data-success)]" style={{ width: `${avance.porcentaje}%` }} />
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {avance.porcentaje}% de {formatCurrency(avance.meta)}
              </p>
            </>
          )}
        </button>
      </div>

      {/* ── Tramos de antigüedad: los cortes que usa un contador ──────── */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTramo("todos")} className={chip(tramo === "todos")}>
          Todos {deudores.length}
        </button>
        {TRAMOS.filter((t) => totales[t.id].n > 0).map((t) => (
          <button key={t.id} onClick={() => setTramo(t.id)} className={chip(tramo === t.id)} title={t.detalle}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.tono }} />
              {t.label} {totales[t.id].n}
              <span className="font-semibold tabular-nums opacity-70">{formatCurrency(totales[t.id].total)}</span>
            </span>
          </button>
        ))}
      </div>

      {/* ── Buscar + herramientas ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar deudor…"
            aria-label="Buscar deudor"
            className="h-11 w-full rounded-xl bg-[var(--surface-sunken)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          onClick={() => {
            const conTelefono = filtrados.filter((d) => d.telefono).map((d) => d.id);
            setTanda((prev) => (prev.size >= conTelefono.length && prev.size > 0 ? new Set() : new Set(conTelefono)));
          }}
          className="h-11 rounded-xl bg-[var(--surface-sunken)] px-3.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          Marcar todos
        </button>
        <button
          onClick={() => setEnLlamada(true)}
          disabled={filtrados.length === 0}
          title="Una persona a la vez, en grande"
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--surface-sunken)] px-3.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <MessageCircle className="h-4 w-4" /> Modo llamada
        </button>
        <button
          onClick={() => setVerPlantillas(true)}
          title="Qué se le escribe a cada tramo"
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--surface-sunken)] px-3.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <Settings2 className="h-4 w-4" /> Mensajes
        </button>
        <button
          onClick={exportarPdf}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--surface-sunken)] px-3.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <FileText className="h-4 w-4" /> PDF
        </button>
        {sinTelefono > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--data-warning)]/10 px-3 py-1.5 text-sm font-semibold text-[var(--data-warning)]">
            {sinTelefono} sin teléfono
          </span>
        )}
      </div>

      {/* ── La lista ──────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[var(--surface-raised)] p-3 ring-1 ring-[var(--rule-soft)]">
        <CardTitle className="mb-1 px-1 text-base font-extrabold text-[var(--text-primary)]">
          {filtrados.length} deudor{filtrados.length === 1 ? "" : "es"}
          {tramo !== "todos" && <span className="font-semibold text-[var(--text-tertiary)]"> de {deudores.length}</span>}
        </CardTitle>
        {filtrados.length === 0 ? (
          <p className="py-8 text-center text-base text-[var(--text-tertiary)]">Nadie en este tramo.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {filtrados.map((d) => (
              <FilaDeudor
                key={d.id}
                deudor={d}
                promesa={promesas.get(d.id)}
                ultima={ultimas.get(d.id)}
                cumplimiento={cumplimientos.get(d.id) ?? null}
                enTanda={tanda.has(d.id)}
                onTanda={(v) =>
                  setTanda((prev) => {
                    const n = new Set(prev);
                    if (v) n.add(d.id); else n.delete(d.id);
                    return n;
                  })
                }
                onAnotar={() => setAnotando(d)}
                onCargarTelefono={() => setAnotando(d)}
                mensaje={mensajeDe(d)}
              />
            ))}
          </ul>
        )}

        {tanda.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/8 px-4 py-3 ring-1 ring-primary/25">
            <p className="text-base font-semibold text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">{tanda.size}</strong> en la ronda ·{" "}
              <strong className="tabular-nums text-[var(--data-warning)]">
                {formatCurrency(filtrados.filter((d) => tanda.has(d.id)).reduce((s, d) => s + d.saldo, 0))}
              </strong>{" "}
              por cobrar
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTanda(new Set())}
                className="h-10 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)]"
              >
                Vaciar
              </button>
              <button
                onClick={() => void mandarLaRonda()}
                disabled={enviandoRonda}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
              >
                <MessageCircle className="h-4 w-4" />
                {enviandoRonda ? "Abriendo chats…" : `Escribirle a los ${tanda.size}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {anotando && (
        <AnotarGestion
          beneficiarioId={anotando.id}
          nombre={anotando.nombre}
          saldo={anotando.saldo}
          onClose={() => setAnotando(null)}
          onGuardada={() => {
            setAnotando(null);
            void cargarGestiones();
            onRecordado?.();
          }}
        />
      )}
      {verPlantillas && (
        <PlantillasModal
          plantillas={plantillas}
          onClose={() => setVerPlantillas(false)}
          onGuardar={(p) => {
            setPlantillas(p);
            guardarPlantillas(p);
            setVerPlantillas(false);
          }}
        />
      )}
      {verMeta && (
        <MetaModal
          meta={meta}
          recuperado={recuperado}
          onClose={() => setVerMeta(false)}
          onGuardar={(m) => {
            setMeta(m);
            try {
              window.localStorage.setItem(CLAVE_META, String(m));
            } catch {
              /* sin persistencia, sin bug: la sesión igual la usa */
            }
            setVerMeta(false);
          }}
        />
      )}
      {enLlamada && (
        <ModoLlamada
          deudores={filtrados}
          promesas={promesas}
          ultimas={ultimas}
          mensajeDe={mensajeDe}
          onAnotar={(d) => { setEnLlamada(false); setAnotando(d); }}
          onGestionRapida={async (id, tipo) => { await anotarRapido(id, tipo); await cargarGestiones(); }}
          onClose={() => setEnLlamada(false)}
        />
      )}
    </div>
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
  pie: string;
  tono?: "neutro" | "success" | "warning" | "error" | "info";
}) {
  const color =
    tono === "success"
      ? "text-[var(--data-success)]"
      : tono === "warning"
        ? "text-[var(--data-warning)]"
        : tono === "error"
          ? "text-[var(--data-error)]"
          : tono === "info"
            ? "text-[var(--data-info)]"
            : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${color}`}>{valor}</p>
      <p className="text-sm text-[var(--text-secondary)]">{pie}</p>
    </div>
  );
}
