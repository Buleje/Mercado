"use client";

/**
 * ActividadView — feed de movimientos del módulo Adelantos.
 *
 * Extraída de `AdelantosModule.tsx` (era una función interna, ~150 líneas) el
 * 2026-09-28 para poder cablearle lo RECIBIDO (ADR-448) sin seguir engordando
 * el módulo. Hasta acá sólo veía lo que el negocio DIO — el módulo le pasaba
 * `dados` a propósito porque Resumen/Cobranza/Análisis cuentan «lo que te
 * deben», y meter un recibido adentro sumaba como cobrable una plata que en
 * realidad hay que devolver. Actividad es distinto: es un historial, no un
 * saldo — acá SÍ tiene que aparecer todo, con la dirección de cada evento.
 *
 * Cada evento sabe de qué lado está la plata (`leerDireccion`) y de ahí sale
 * todo: el signo (`cajaAlCrear`/`cajaAlDevolver`, la misma regla que usa el
 * servidor para mover la caja), el texto y el chip — el MISMO chip que
 * `TablaAdelantos` (icono + «Te prestaron»/«Te pagaron antes»), para no
 * inventar un segundo lenguaje visual para lo mismo.
 */

import { useState } from "react";
import {
  TrendingDown,
  TrendingUp,
  Activity,
  FileText,
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "@buleje/design-system/icons";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { fmtMon, fmtMonedas, EmptyState, SkeletonGrid } from "./shared";
import { formatDateNumeric } from "@/lib/format";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import { cajaAlCrear, cajaAlDevolver, ETIQUETA_CONCEPTO, type AdelantoDireccion, type AdelantoConceptoRecibido } from "@/lib/adelantos/direccion";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

type ActEvento = {
  fecha: string;
  tipo: "adelanto" | "entrega";
  direccion: AdelantoDireccion;
  concepto: AdelantoConceptoRecibido | null;
  persona: string;
  monto: number;
  moneda?: string | null;
  desc?: string;
};

/** Por moneda, nunca cruzado: un adelanto en soles y una entrega en dólares
 *  del mismo período no son la misma plata. */
const sumar = (map: Record<string, number>, moneda: string | null | undefined, monto: number) => {
  const m = moneda || "PEN";
  map[m] = (map[m] ?? 0) + monto;
};
const tieneAlgo = (map: Record<string, number>) => Object.values(map).some((v) => v > 0);

/** Línea "+X · −Y · +Z" con sólo los montos que existen, cada uno con su color. */
function LineaMontos({ partes }: { partes: { map: Record<string, number>; signo: "+" | "−"; cls: string }[] }) {
  const activas = partes.filter((p) => tieneAlgo(p.map));
  if (activas.length === 0) return null;
  return (
    <>
      {activas.map((p, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <span className={`font-bold ${p.cls}`}>
            {p.signo}
            {fmtMonedas(p.map)}
          </span>
        </span>
      ))}
    </>
  );
}

export function ActividadView({ adelantos, loading }: { adelantos: DbAdelanto[]; loading: boolean }) {
  const [tipo, setTipo] = useState<"todo" | "adelanto" | "entrega">("todo");
  const [dir, setDir] = useState<"todo" | AdelantoDireccion>("todo");
  const [rango, setRango] = useState<"hoy" | "semana" | "mes" | "todo">("mes");
  const [q, setQ] = useState("");

  const eventos: ActEvento[] = [];
  for (const a of adelantos) {
    const persona = a.beneficiario?.nombre ?? "—";
    const { direccion, concepto } = leerDireccion(a);
    if (a.status !== "CANCELADO") eventos.push({ fecha: a.fechaAdelanto, tipo: "adelanto", direccion, concepto, persona, monto: a.montoAdelantado, moneda: a.moneda });
    for (const e of a.entregas) eventos.push({ fecha: e.fecha, tipo: "entrega", direccion, concepto, persona, monto: e.valor, moneda: a.moneda, desc: e.descripcion ?? undefined });
  }
  eventos.sort((x, y) => new Date(y.fecha).getTime() - new Date(x.fecha).getTime());
  const hayRecibido = eventos.some((e) => e.direccion === "RECIBIDO");

  const now = Date.now();
  const cutoff = rango === "hoy" ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
    : rango === "semana" ? now - 7 * 86_400_000
    : rango === "mes" ? now - 30 * 86_400_000
    : 0;
  const ql = q.trim().toLowerCase();
  const filtrados = eventos.filter((e) =>
    new Date(e.fecha).getTime() >= cutoff &&
    (tipo === "todo" || e.tipo === tipo) &&
    (dir === "todo" || e.direccion === dir) &&
    (!ql || e.persona.toLowerCase().includes(ql)),
  );

  const resumen = filtrados.reduce(
    (a, e) => {
      if (e.direccion === "DADO") {
        if (e.tipo === "adelanto") sumar(a.diste, e.moneda, e.monto); else sumar(a.recuperado, e.moneda, e.monto);
      } else {
        if (e.tipo === "adelanto") sumar(a.recibiste, e.moneda, e.monto); else sumar(a.devolviste, e.moneda, e.monto);
      }
      return a;
    },
    { diste: {} as Record<string, number>, recuperado: {} as Record<string, number>, recibiste: {} as Record<string, number>, devolviste: {} as Record<string, number> },
  );

  // Agrupar por día (local)
  const localKey = (f: string) => { const d = new Date(f); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const hoyK = localKey(new Date().toISOString());
  const ayerK = localKey(new Date(Date.now() - 86_400_000).toISOString());
  const dayLabel = (k: string) => (k === hoyK ? "Hoy" : k === ayerK ? "Ayer" : new Date(k + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "long" }));
  const grupos: { key: string; eventos: ActEvento[]; diste: Record<string, number>; recuperado: Record<string, number>; recibiste: Record<string, number>; devolviste: Record<string, number> }[] = [];
  for (const e of filtrados) {
    const k = localKey(e.fecha);
    let g = grupos[grupos.length - 1];
    if (!g || g.key !== k) { g = { key: k, eventos: [], diste: {}, recuperado: {}, recibiste: {}, devolviste: {} }; grupos.push(g); }
    g.eventos.push(e);
    if (e.direccion === "DADO") {
      if (e.tipo === "adelanto") sumar(g.diste, e.moneda, e.monto); else sumar(g.recuperado, e.moneda, e.monto);
    } else {
      if (e.tipo === "adelanto") sumar(g.recibiste, e.moneda, e.monto); else sumar(g.devolviste, e.moneda, e.monto);
    }
  }

  const exportarPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Historial de actividad", 14, 18);
    doc.setFontSize(10); doc.text(`${filtrados.length} movimientos · +${fmtMonedas(resumen.diste)} diste · −${fmtMonedas(resumen.recuperado)} recuperado`, 14, 25);
    autoTable(doc, {
      startY: 31,
      head: [["Fecha", "Movimiento", "Persona", "Detalle", "Monto"]],
      body: filtrados.map((e) => {
        const movimiento = e.tipo === "adelanto" ? cajaAlCrear(e.direccion) : cajaAlDevolver(e.direccion);
        const signo = movimiento === "egreso" ? "-" : "+";
        const label = e.direccion === "DADO"
          ? (e.tipo === "adelanto" ? "Diste" : `${e.persona} te devolvió`)
          : (e.tipo === "adelanto" ? "Recibiste" : "Le diste");
        return [formatDateNumeric(e.fecha), label, e.persona, e.desc ?? "", `${signo}${fmtMon(e.monto, e.moneda)}`];
      }),
    });
    doc.save(`actividad-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (loading) return <SkeletonGrid />;
  if (eventos.length === 0) return <EmptyState icon={Activity} title="Sin actividad" hint="Acá aparecen adelantos y entregas a medida que ocurren." />;

  const selectCls =
    "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base font-semibold text-[var(--text-primary)] outline-none focus:border-primary";
  const rangoChip = (active: boolean) =>
    `h-9 px-3 rounded-full border-2 text-sm font-bold transition-colors ${active ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`;

  return (
    <div className="space-y-4">
      {/* Rango + resumen del periodo */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
        <div className="flex items-center gap-1.5">
          {([["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ["todo", "Todo"]] as const).map(([v, l]) => (
            <button key={v} className={rangoChip(rango === v)} onClick={() => setRango(v)}>{l}</button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 text-base text-[var(--text-secondary)]">
          <LineaMontos
            partes={[
              { map: resumen.diste, signo: "+", cls: "text-[var(--data-warning)]" },
              { map: resumen.recuperado, signo: "−", cls: "text-[var(--data-success)]" },
              { map: resumen.recibiste, signo: "+", cls: "text-[var(--data-info-ink)]" },
              { map: resumen.devolviste, signo: "−", cls: "text-[var(--data-info-ink)]" },
            ]}
          />
          {" "}· <span className="font-bold text-[var(--text-primary)]">{filtrados.length}</span> movs
          {hayRecibido && (
            <InfoTip
              title="Diste / recibiste"
              what="Diste y recuperado es la plata de siempre: adelantos a personas. Recibiste y devolviste es al revés: plata que te prestaron o te pagaron antes de un servicio."
              example="«Recibiste» de WASACO es un adelanto por un servicio que vas a dar — esa plata la devuelves con producto, no con dinero de tu caja."
            />
          )}
        </span>
      </div>

      {/* Filtros por tipo + dirección + búsqueda + PDF. El rango (arriba)
          queda en chips porque es lo que se toca siempre; tipo y dirección
          afinan de vez en cuando y van en desplegables: eran seis chips con
          texto más (ley de la vista, «a la vista sólo lo de uso constante»). */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
          aria-label="Tipo de movimiento"
          className={selectCls}
        >
          <option value="todo">Adelantos y entregas</option>
          <option value="adelanto">Sólo adelantos</option>
          <option value="entrega">Sólo entregas</option>
        </select>
        {hayRecibido && (
          <select
            value={dir}
            onChange={(e) => setDir(e.target.value as typeof dir)}
            aria-label="Dirección de la plata"
            className={selectCls}
          >
            <option value="todo">Diste y recibiste</option>
            <option value="DADO">Sólo diste</option>
            <option value="RECIBIDO">Sólo recibiste</option>
          </select>
        )}
        {/* min-w-* es clase muerta acá (memoria min-width-utilities-muertas) — inline style. */}
        <div className="relative ml-auto flex-1 sm:flex-none" style={{ minWidth: 200 }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por persona, código (ADL-2026-7) o recibo…" className="h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:border-primary" />
        </div>
        {/* Exportar: ícono + tooltip, no un botón con texto por cada vista. */}
        <button
          onClick={exportarPdf}
          disabled={filtrados.length === 0}
          title={`Descargar PDF de los ${filtrados.length} movimientos que ves`}
          aria-label={`Descargar PDF de los ${filtrados.length} movimientos que ves`}
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
        >
          <FileText className="h-5 w-5" />
        </button>
      </div>

      {/* Feed agrupado por día */}
      {grupos.length === 0 ? (
        <EmptyState icon={Search} title="Sin movimientos" hint="Prueba con otro filtro o rango." />
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <div key={g.key} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2">
                <span className="text-sm font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">{dayLabel(g.key)}</span>
                <span className="text-sm tabular-nums text-[var(--text-tertiary)]">
                  <LineaMontos
                    partes={[
                      { map: g.diste, signo: "+", cls: "text-[var(--data-warning)]" },
                      { map: g.recuperado, signo: "−", cls: "text-[var(--data-success)]" },
                      { map: g.recibiste, signo: "+", cls: "text-[var(--data-info-ink)]" },
                      { map: g.devolviste, signo: "−", cls: "text-[var(--data-info-ink)]" },
                    ]}
                  />
                </span>
              </div>
              <ul>
                {g.eventos.map((e, i) => {
                  const dado = e.direccion === "DADO";
                  const movimiento = e.tipo === "adelanto" ? cajaAlCrear(e.direccion) : cajaAlDevolver(e.direccion);
                  const sale = movimiento === "egreso";
                  const Icon = dado ? (sale ? TrendingDown : TrendingUp) : (sale ? ArrowUpFromLine : ArrowDownToLine);
                  const tono = dado
                    ? (sale ? "bg-[var(--data-warning)]/15 text-[var(--data-warning)]" : "bg-[var(--data-success)]/15 text-[var(--data-success)]")
                    : "bg-[var(--data-info-500)]/15 text-[var(--data-info-ink)]";
                  const montoCls = dado
                    ? (sale ? "text-[var(--data-warning)]" : "text-[var(--data-success)]")
                    : "text-[var(--data-info-ink)]";
                  const texto = dado
                    ? (e.tipo === "adelanto" ? `Diste a ${e.persona}` : `${e.persona} te devolvió`)
                    : (e.tipo === "adelanto" ? `Recibiste de ${e.persona}` : `Le diste a ${e.persona}`);
                  return (
                    <li key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--rule-soft)] last:border-0">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tono}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-[var(--text-primary)] truncate">{texto}</p>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1">
                          {e.desc && <span className="truncate text-sm text-[var(--text-tertiary)]">{e.desc}</span>}
                          {!dado && e.concepto && (
                            <span
                              title={ETIQUETA_CONCEPTO[e.concepto]}
                              className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-[var(--data-info-500)]/12 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-ink)]"
                            >
                              <ArrowDownToLine className="h-3 w-3" aria-hidden /> {e.concepto === "PRESTAMO" ? "Te prestaron" : "Te pagaron antes"}
                            </span>
                          )}
                        </span>
                      </div>
                      <span className={`tabular-nums text-base font-extrabold ${montoCls}`}>{sale ? "−" : "+"}{fmtMon(e.monto, e.moneda)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
