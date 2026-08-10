"use client";

/**
 * GastosFijosPanel — los gastos que se repiten: cuáles vencen, cuáles ya
 * pagaste este período y cuáles están cargados dos veces.
 *
 * `lib/expense-meta.ts` ya tenía escritas las tres respuestas
 * —`proximoVencimiento`, `yaPagadoEnPeriodo`, `agruparDuplicados`— y ninguna
 * pantalla las llamaba. El catálogo del Punto de Compra mostraba «Mensual ·
 * Día 5 · Yape» y dejaba la cuenta al lector, con un botón «Pagar» al lado que
 * se veía igual hubieras pagado o no, y con el alquiler duplicado. Acá se dice
 * en días y en plata.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, Copy, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import {
  agruparDuplicados, decodeExpenseDescription, proximoVencimiento,
  summarizeMeta, yaPagadoEnPeriodo,
  type EstadoVencimiento, type PagoRegistrado,
} from "@/lib/expense-meta";
import { fmt } from "./shared";

type GastoCrudo = { id: string; category: string; description: string; amount: number; date: string; recurring: boolean };

type Fijo = {
  id: string;
  nombre: string;
  category: string;
  amount: number;
  resumenMeta: string;
  estado: EstadoVencimiento;
  textoVencimiento: string;
  dias: number | null;
  pagado: boolean;
  fechaPago: string | null;
};

const TONO_ESTADO: Record<EstadoVencimiento, string> = {
  vencido: "var(--data-error-500)",
  hoy: "var(--data-error-500)",
  pronto: "var(--data-warning-500)",
  lejos: "var(--text-secondary)",
  sin_fecha: "var(--text-secondary)",
};

/** Primero lo que arde: vencido, hoy, pronto, y lo pagado al final. */
function urgencia(f: Fijo): number {
  if (f.pagado) return 100;
  const orden: Record<EstadoVencimiento, number> = { vencido: 0, hoy: 1, pronto: 2, lejos: 3, sin_fecha: 4 };
  return orden[f.estado];
}

export default function GastosFijosPanel({ onPagoRegistrado }: { onPagoRegistrado?: () => void }) {
  const [fijos, setFijos] = useState<Fijo[]>([]);
  const [duplicados, setDuplicados] = useState<Array<{ nombre: string; veces: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [pagando, setPagando] = useState<string | null>(null);
  const [errorPago, setErrorPago] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [plantillas, ejecutados] = await Promise.all([
        fetch("/api/expenses?recurring=true").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/expenses?recurring=false").then((r) => (r.ok ? r.json() : [])),
      ]);
      const tpl: GastoCrudo[] = Array.isArray(plantillas) ? plantillas : [];
      const pagos: PagoRegistrado[] = (Array.isArray(ejecutados) ? ejecutados : []).map((e: GastoCrudo) => ({
        description: e.description,
        amount: Number(e.amount),
        date: e.date,
      }));

      // Los repetidos se muestran UNA vez y se avisan aparte: el riesgo de la
      // tarjeta duplicada no es visual, es pagar dos veces.
      const { unicos, duplicados: grupos } = agruparDuplicados(tpl, (g) => ({
        description: g.description,
        amount: Number(g.amount),
      }));

      const hoy = new Date();
      setFijos(unicos.map((g) => {
        const { description, meta } = decodeExpenseDescription(g.description);
        const v = proximoVencimiento(meta, hoy);
        const pago = yaPagadoEnPeriodo({ description: g.description, amount: Number(g.amount) }, pagos, hoy);
        return {
          id: g.id,
          nombre: description || "Sin nombre",
          category: g.category,
          amount: Number(g.amount),
          resumenMeta: summarizeMeta(meta),
          estado: v.estado,
          textoVencimiento: v.texto,
          dias: v.dias,
          pagado: pago.pagado,
          fechaPago: pago.fecha,
        };
      }).sort((a, b) => urgencia(a) - urgencia(b) || b.amount - a.amount));

      setDuplicados(grupos.map((gr) => ({
        nombre: decodeExpenseDescription(
          (gr.items[0] as GastoCrudo).description,
        ).description || "Sin nombre",
        veces: gr.items.length,
      })));
    } catch (err) {
      console.warn("[GastosFijosPanel] carga falló", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const registrarPago = useCallback(async (id: string) => {
    setPagando(id);
    setErrorPago(null);
    try {
      const res = await fetch(`/api/expenses/from-template/${id}`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await cargar();
      onPagoRegistrado?.();
    } catch (err) {
      console.warn("[GastosFijosPanel] registrar pago falló", err);
      setErrorPago("No se pudo registrar el pago. Intentá de nuevo.");
    } finally {
      setPagando(null);
    }
  }, [cargar, onPagoRegistrado]);

  const resumen = useMemo(() => {
    const pagados = fijos.filter((f) => f.pagado);
    const pendientes = fijos.filter((f) => !f.pagado);
    return {
      pagados: pagados.length,
      total: fijos.length,
      falta: Math.round(pendientes.reduce((s, f) => s + f.amount, 0) * 100) / 100,
      urgentes: pendientes.filter((f) => f.estado === "vencido" || f.estado === "hoy" || f.estado === "pronto").length,
    };
  }, [fijos]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-5">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-secondary)]" />
        <span className="text-sm text-[var(--text-secondary)]">Revisando los gastos fijos…</span>
      </div>
    );
  }

  if (fijos.length === 0) return null;

  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <CalendarClock className="h-4 w-4 text-[var(--text-secondary)]" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Gastos fijos de este período
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-bold text-[var(--text-primary)] tabular-nums">
            {resumen.pagados} de {resumen.total}
          </span>{" "}
          pagados
          {/* El monto va en el color de texto normal, no en rojo: a 14px bold
              el rojo del DS se queda en 3.92:1 sobre la superficie oscura
              (medido con axe) y WCAG AA pide 4.5. La urgencia ya la dan el
              borde de las tarjetas y el contador de «por vencer». */}
          {resumen.falta > 0 && (
            <> · faltan <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(resumen.falta)}</span></>
          )}
          {resumen.urgentes > 0 && (
            <> · <span className="font-bold text-[var(--data-warning-500)]">{resumen.urgentes} por vencer</span></>
          )}
        </p>
        <button
          type="button"
          onClick={cargar}
          title="Recargar los fijos"
          className="ml-auto rounded-lg border border-[var(--rule-base)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      {duplicados.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2">
          <Copy className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" />
          <p className="text-sm text-[var(--text-primary)]">
            <span className="font-bold">Hay gastos cargados más de una vez.</span>{" "}
            {duplicados.map((d) => `${d.nombre} (×${d.veces})`).join(", ")}. Se muestran una sola vez
            acá — revisá el catálogo para no pagarlos doble.
          </p>
        </div>
      )}

      {errorPago && (
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4" />{errorPago}
        </p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {fijos.map((f) => (
          <li
            key={f.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border-2 px-3 py-2.5",
              f.pagado
                ? "border-[var(--rule-soft)] bg-[var(--surface-sunken)]"
                : f.estado === "vencido" || f.estado === "hoy"
                  ? "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5"
                  : "border-[var(--rule-base)] bg-[var(--surface-canvas)]",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className={cn(
                "truncate text-sm font-bold",
                f.pagado ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]",
              )}>
                {f.nombre}
              </p>
              <p className="truncate text-sm text-[var(--text-secondary)]">
                {f.resumenMeta || f.category}
                {!f.pagado && f.textoVencimiento && (
                  <span style={{ color: TONO_ESTADO[f.estado] }} className="font-semibold"> · {f.textoVencimiento}</span>
                )}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-primary)]">{fmt(f.amount)}</span>
            {f.pagado ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[var(--data-success-500)]">
                <Check className="h-4 w-4" />Pagado
              </span>
            ) : (
              <button
                type="button"
                onClick={() => registrarPago(f.id)}
                disabled={pagando === f.id}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {pagando === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Registrar pago
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
