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
import { CardTitle } from "@buleje/design-system";
import {
  AlertTriangle, CalendarClock, Check, ChevronDown, Copy, Loader2, RefreshCw, Wand2,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import {
  agruparDuplicados, decodeExpenseDescription, proximoVencimiento,
  summarizeMeta, yaPagadoEnPeriodo,
  type EstadoVencimiento, type PagoRegistrado,
} from "@/lib/expense-meta";
import ConfirmarPagoModal from "./ConfirmarPagoModal";
import UnificarDuplicadosModal, { type GrupoRepetido } from "./UnificarDuplicadosModal";
import { fmt } from "./shared";

type GastoCrudo = {
  id: string; category: string; description: string; amount: number; date: string; recurring: boolean;
  /** Sólo en los ejecutados: de qué plantilla salieron (ADR-374). */
  templateId?: string | null;
};

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
  vencido: "var(--data-error-ink)",
  hoy: "var(--data-error-ink)",
  pronto: "var(--data-warning-ink)",
  lejos: "var(--text-secondary)",
  sin_fecha: "var(--text-secondary)",
};

/** Primero lo que arde: vencido, hoy, pronto, y lo pagado al final. */
function urgencia(f: Fijo): number {
  if (f.pagado) return 100;
  const orden: Record<EstadoVencimiento, number> = { vencido: 0, hoy: 1, pronto: 2, lejos: 3, sin_fecha: 4 };
  return orden[f.estado];
}

export default function GastosFijosPanel({
  onPagoRegistrado, recargaToken = 0,
}: {
  onPagoRegistrado?: () => void;
  /**
   * Sube de a uno cuando el historial cambia por afuera (se corrigió o se borró
   * un gasto). Sin esto, corregir el monto de un pago dejaba al panel diciendo
   * «1 de 3 pagados» con datos viejos hasta recargar la página entera.
   */
  recargaToken?: number;
}) {
  const [fijos, setFijos] = useState<Fijo[]>([]);
  const [duplicados, setDuplicados] = useState<Array<GrupoRepetido & { veces: number }>>([]);
  const [unificando, setUnificando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pagando, setPagando] = useState<string | null>(null);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  /** El fijo que está esperando confirmación en el modal. */
  const [porConfirmar, setPorConfirmar] = useState<Fijo | null>(null);
  const [abierto, setAbierto] = useState(true);

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
        templateId: e.templateId ?? null,
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
        // El `id` va porque el pago sabe de qué plantilla salió (ADR-374):
        // sin él, corregir el monto de un pago hacía revivir la tarjeta como
        // «pendiente» aunque la plata ya hubiera salido.
        const pago = yaPagadoEnPeriodo({ id: g.id, description: g.description, amount: Number(g.amount) }, pagos, hoy);
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

      // Los ids de las copias viajan además del nombre: sin ellos el aviso
      // podía señalar el problema pero no arreglarlo. `agruparDuplicados`
      // conserva `items[0]` (el que ya se ve en el panel); el resto sobra.
      setDuplicados(grupos.map((gr) => {
        const [primero, ...resto] = gr.items as GastoCrudo[];
        return {
          conservar: primero!.id,
          nombre: decodeExpenseDescription(primero!.description).description || "Sin nombre",
          amount: Number(primero!.amount),
          veces: gr.items.length,
          sobrantes: resto.map((g) => g.id),
        };
      }));
    } catch (err) {
      console.warn("[GastosFijosPanel] carga falló", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar, recargaToken]);

  const registrarPago = useCallback(async (id: string, fechaIso: string, monto: number) => {
    setPagando(id);
    setErrorPago(null);
    try {
      const res = await fetch(`/api/expenses/from-template/${id}`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ date: fechaIso, amount: monto }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPorConfirmar(null);
      await cargar();
      onPagoRegistrado?.();
    } catch (err) {
      console.warn("[GastosFijosPanel] registrar pago falló", err);
      // El error se queda EN el modal: cerrarlo y avisar atrás dejaba al
      // usuario sin saber si el pago entró o no.
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
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CalendarClock className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Gastos fijos de este período
        </CardTitle>
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
            <> · <span className="font-bold text-[var(--data-warning-ink)]">{resumen.urgentes} por vencer</span></>
          )}
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={cargar}
            title="Recargar los fijos"
            aria-label="Recargar los gastos fijos"
            className="rounded-lg border border-[var(--rule-base)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          {/* El panel es lo primero de la pantalla y empuja la tabla —que es a
              lo que la gente viene— media pantalla para abajo. Se pliega. */}
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-label={abierto ? "Ocultar los gastos fijos" : "Mostrar los gastos fijos"}
            className="rounded-lg border border-[var(--rule-base)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", !abierto && "-rotate-90")} />
          </button>
        </div>
      </header>

      {abierto && (
      <div className="mt-3 space-y-3">

      {/* El aviso ahora TRAE el arreglo: mandar a «revisar el catálogo» dejaba
          intacto el riesgo del que avisaba (pagar dos veces el mismo alquiler). */}
      {duplicados.length > 0 && (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2.5">
          <Copy className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
          <p className="min-w-[16rem] flex-1 text-sm text-[var(--text-primary)]">
            <span className="font-bold">Hay gastos cargados más de una vez.</span>{" "}
            {duplicados.map((d) => `${d.nombre} (×${d.veces})`).join(", ")}. Acá se muestran una sola
            vez, pero en el catálogo siguen repetidos y se pueden pagar doble.
          </p>
          <button
            type="button"
            onClick={() => setUnificando(true)}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border-2 border-[var(--data-warning-500)]/50 bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <Wand2 className="h-4 w-4" aria-hidden />
            Unificar
          </button>
        </div>
      )}

      {errorPago && !porConfirmar && (
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--data-error-500)]" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden />{errorPago}
        </p>
      )}

      {/* Tres datos y una acción no entran en una línea: el nombre del gasto se
          cortaba a la mitad («Internet + cable…») para dejarle lugar al botón.
          Ahora la tarjeta respira en dos pisos y el botón ocupa el ancho. */}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {fijos.map((f) => (
          <li
            key={f.id}
            className={cn(
              "flex flex-col gap-2.5 rounded-xl border-2 p-3",
              f.pagado
                ? "border-[var(--rule-soft)] bg-[var(--surface-sunken)]"
                : f.estado === "vencido" || f.estado === "hoy"
                  ? "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5"
                  : "border-[var(--rule-base)] bg-[var(--surface-canvas)]",
            )}
          >
            <div className="min-w-0">
              <p className={cn(
                "truncate text-base font-bold",
                f.pagado ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]",
              )}>
                {f.nombre}
              </p>
              <p className="truncate text-sm text-[var(--text-secondary)]">
                {f.resumenMeta || f.category}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className={cn(
                "text-lg font-extrabold tabular-nums",
                f.pagado ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]",
              )}>
                {fmt(f.amount)}
              </span>
              {!f.pagado && f.textoVencimiento && (
                <span
                  className="text-sm font-semibold"
                  style={{ color: TONO_ESTADO[f.estado] }}
                >
                  {f.textoVencimiento}
                </span>
              )}
            </div>

            {f.pagado ? (
              <p className="inline-flex items-center gap-1 text-sm font-bold text-[var(--data-success-ink)]">
                <Check className="h-4 w-4" aria-hidden />
                Pagado{f.fechaPago ? ` el ${new Date(f.fechaPago).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}` : ""}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => { setErrorPago(null); setPorConfirmar(f); }}
                disabled={pagando === f.id}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {pagando === f.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Registrar pago
              </button>
            )}
          </li>
        ))}
      </ul>
      </div>
      )}

      {/* `key` por gasto: el modal guarda la fecha elegida en su estado, y sin
          remontarlo la fecha que pusiste para el alquiler quedaba puesta al
          abrir el siguiente fijo. */}
      <ConfirmarPagoModal
        key={porConfirmar?.id ?? "ninguno"}
        pago={porConfirmar && {
          id: porConfirmar.id,
          nombre: porConfirmar.nombre,
          amount: porConfirmar.amount,
          resumenMeta: porConfirmar.resumenMeta || porConfirmar.category,
          textoVencimiento: porConfirmar.textoVencimiento,
          pagado: porConfirmar.pagado,
        }}
        guardando={pagando === porConfirmar?.id}
        error={errorPago}
        onConfirmar={(fechaIso, monto) => porConfirmar && registrarPago(porConfirmar.id, fechaIso, monto)}
        onClose={() => { setPorConfirmar(null); setErrorPago(null); }}
      />

      {unificando && (
        <UnificarDuplicadosModal
          grupos={duplicados}
          onListo={() => { cargar(); onPagoRegistrado?.(); }}
          onClose={() => setUnificando(false)}
        />
      )}
    </section>
  );
}
