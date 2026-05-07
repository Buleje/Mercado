"use client";

/**
 * ChefIACard — "¿Qué cocino hoy?" IA asistente
 *
 * Flujo:
 *   1. Usuario elige presupuesto (S/) + personas + restriccion opcional
 *   2. Tap "Generá 3 recetas" → POST /api/chef-ia
 *   3. Muestra 3 cards de receta con ingredientes, tiempo, total
 *   4. "Agregar todo al carrito" por cada receta → bulk add
 *
 * Diferenciador Peru: recetas locales (aji de gallina, lomo saltado, etc)
 * con precios realistas de bodega. El usuario no piensa "qué comprar" sino
 * "qué cocinar" — la IA resuelve el resto.
 *
 * Impacto esperado: nuevo journey de descubrimiento, conversion 2-3x en
 * usuarios indecisos vs catálogo tradicional.
 */

import { useState, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  ChefHat,
  Clock,
  Users,
  ShoppingCart,
  Loader2,
  Sparkles,
  Check,
  AlertCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Receta {
  nombre: string;
  descripcion: string;
  tiempo: string;
  dificultad: "facil" | "media" | "dificil";
  ingredientes: Array<{ nombre: string; cantidad: string; precioEstimado: number }>;
  pasos: string[];
  totalEstimado: number;
}

interface Props {
  onAddToCart?: (
    receta: Receta,
  ) => Promise<void> | void;
  endpoint?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

const PRESUPUESTOS = [20, 30, 50, 80] as const;
const PERSONAS = [1, 2, 4, 6] as const;
const RESTRICCIONES = [
  { id: "ninguna", label: "Todo" },
  { id: "vegetariano", label: "Vegetariano" },
  { id: "sin-gluten", label: "Sin gluten" },
  { id: "sin-lactosa", label: "Sin lactosa" },
] as const;

export default function ChefIACard({
  onAddToCart,
  endpoint = "/api/chef-ia",
}: Props) {
  const [presupuesto, setPresupuesto] = useState<number>(30);
  const [personas, setPersonas] = useState<number>(2);
  const [restriccion, setRestriccion] = useState<string>("ninguna");
  const [loading, setLoading] = useState(false);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addedIdx, setAddedIdx] = useState<number | null>(null);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRecetas([]);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ presupuesto, personas, restriccion }),
      });
      if (!res.ok) throw new Error("No pudimos generar las recetas");
      const data = await res.json();
      setRecetas(data.recetas ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, [presupuesto, personas, restriccion, endpoint]);

  const handleAdd = useCallback(
    async (receta: Receta, idx: number) => {
      await onAddToCart?.(receta);
      setAddedIdx(idx);
      setTimeout(() => setAddedIdx(null), 2500);
    },
    [onAddToCart],
  );

  return (
    <section
      aria-label="Chef IA — qué cocino hoy"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
    >
      {/* Header editorial */}
      <div className="relative p-5 sm:p-6">
        <div
          aria-hidden
          className="absolute top-0 right-0 h-32 w-32 rounded-full bg-[var(--accent)]/10 blur-3xl"
        />
        <div className="relative flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <ChefHat className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              Chef IA
            </p>
            <h3 className="text-lg font-extrabold tracking-tight text-[var(--text-primary)] mt-0.5">
              ¿Qué cocino hoy?
            </h3>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              La IA te arma 3 recetas dentro de tu presupuesto con ingredientes
              de bodega local
            </p>
          </div>
        </div>
      </div>

      {/* Form compacto */}
      <div className="px-5 sm:px-6 pb-5 space-y-4 border-b border-[var(--rule-soft)]">
        {/* Presupuesto */}
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            Presupuesto
          </p>
          <div className="flex gap-2 flex-wrap">
            {PRESUPUESTOS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPresupuesto(p)}
                aria-pressed={presupuesto === p}
                className={cn(
                  "flex-1 min-w-[68px] rounded-xl border px-3 py-2.5 text-sm font-extrabold tabular-nums transition-all active:scale-[0.98]",
                  presupuesto === p
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40",
                )}
              >
                S/ {p}
              </button>
            ))}
          </div>
        </div>

        {/* Personas */}
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            Personas
          </p>
          <div className="flex gap-2 flex-wrap">
            {PERSONAS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPersonas(p)}
                aria-pressed={personas === p}
                className={cn(
                  "flex-1 min-w-[56px] rounded-xl border px-3 py-2.5 text-sm font-extrabold tabular-nums transition-all active:scale-[0.98]",
                  personas === p
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Restriccion */}
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            Dieta
          </p>
          <div className="flex gap-2 flex-wrap">
            {RESTRICCIONES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRestriccion(r.id)}
                aria-pressed={restriccion === r.id}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-xs font-bold transition-all active:scale-[0.98]",
                  restriccion === r.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* CTA generar */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className={cn(
            "w-full inline-flex items-center justify-center gap-2 rounded-full py-3.5 text-base font-bold transition-all active:scale-[0.98]",
            loading
              ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
              : "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)]",
          )}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />
              La IA está cocinando…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Generá 3 recetas
            </>
          )}
        </button>

        {error && (
          <p className="rounded-lg bg-[var(--data-error,_#e11d48)]/10 text-[var(--data-error,_#e11d48)] px-3 py-2 text-xs font-medium inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {error}
          </p>
        )}
      </div>

      {/* Recetas resultado */}
      {recetas.length > 0 && (
        <div className="p-5 sm:p-6 space-y-3 bg-[var(--surface-sunken)]">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            3 opciones para vos
          </p>
          {recetas.map((r, idx) => (
            <article
              key={`${r.nombre}-${idx}`}
              className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5 space-y-3"
            >
              {/* Header receta */}
              <div>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <h4 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                    {r.nombre}
                  </h4>
                  <p className="text-base font-extrabold tabular-nums text-[var(--accent)] shrink-0">
                    {fmt(r.totalEstimado)}
                  </p>
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-snug">
                  {r.descripcion}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                    {r.tiempo}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                    {personas} personas
                  </span>
                  <span className="uppercase tracking-wider font-bold">
                    {r.dificultad}
                  </span>
                </div>
              </div>

              {/* Lista de ingredientes */}
              <ul className="space-y-1 border-t border-[var(--rule-soft)] pt-3">
                {r.ingredientes.map((ing, i) => (
                  <li
                    key={i}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="text-[var(--text-secondary)] truncate">
                      {ing.nombre}{" "}
                      <span className="text-[var(--text-tertiary)]">· {ing.cantidad}</span>
                    </span>
                    <span className="font-bold tabular-nums text-[var(--text-secondary)] shrink-0">
                      {fmt(ing.precioEstimado)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA agregar todo */}
              <button
                type="button"
                onClick={() => handleAdd(r, idx)}
                className={cn(
                  "w-full inline-flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold transition-all active:scale-[0.98]",
                  addedIdx === idx
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
                )}
              >
                {addedIdx === idx ? (
                  <>
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    Agregado al carrito
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    Agregar ingredientes al carrito
                  </>
                )}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
