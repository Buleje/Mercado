"use client";

/**
 * CreateJuntaForm — arma una Junta del Barrio desde el hub `/juntas`.
 * Llena el gap: hasta ahora la API POST /api/juntas no tenía entrada en la UI.
 * El % de descuento se muestra en vivo según el tamaño elegido (escalonado).
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, Loader2 } from "@buleje/design-system/icons";
import { juntaCouponPercent, JUNTA_REWARD_TIERS } from "@/lib/junta/constants";
import { csrfHeaders } from "@/lib/csrf-client";

const WINDOW_OPTIONS = [
  { hours: 24, label: "1 día" },
  { hours: 48, label: "2 días" },
  { hours: 72, label: "3 días" },
] as const;

const INPUT =
  "h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]";

export default function CreateJuntaForm() {
  const router = useRouter();
  const [zoneLabel, setZoneLabel] = useState("");
  const [productLabel, setProductLabel] = useState("");
  const [targetMembers, setTargetMembers] = useState(4);
  const [windowHours, setWindowHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);

  const rewardPercent = juntaCouponPercent(targetMembers);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const zone = zoneLabel.trim();
      if (!zone) {
        setError("Escribe tu zona o cuadra");
        return;
      }
      setSubmitting(true);
      setError("");
      setNeedsLogin(false);
      try {
        const res = await fetch("/api/juntas", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            zoneLabel: zone,
            ...(productLabel.trim() && { productLabel: productLabel.trim() }),
            targetMembers,
            windowHours,
          }),
        });
        const data = await res.json().catch((err) => {
          console.warn("[junta] create: respuesta no-JSON", err);
          return null;
        });
        if (res.status === 401) {
          setNeedsLogin(true);
          return;
        }
        if (!res.ok || !data?.code) {
          setError(data?.error ?? "No se pudo armar la junta");
          return;
        }
        router.push(`/junta/${data.code}`);
      } catch {
        setError("Error de red al armar la junta");
      } finally {
        setSubmitting(false);
      }
    },
    [zoneLabel, productLabel, targetMembers, windowHours, router],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6"
      aria-label="Armar una junta"
    >
      <div className="h-1 -mx-6 -mt-6 mb-5 bg-[var(--accent)]" aria-hidden />
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
        Arma tu junta
      </p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
        Junta a tu cuadra y ahorren juntos
      </h2>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-[var(--text-secondary)]">
            Tu zona o cuadra
          </span>
          <input
            className={`mt-1.5 ${INPUT}`}
            value={zoneLabel}
            onChange={(e) => setZoneLabel(e.target.value)}
            placeholder="Ej. Jr. Los Cedros, Mz. F"
            maxLength={80}
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-[var(--text-secondary)]">
            Producto{" "}
            <span className="font-medium text-[var(--text-tertiary)]">
              (opcional)
            </span>
          </span>
          <input
            className={`mt-1.5 ${INPUT}`}
            value={productLabel}
            onChange={(e) => setProductLabel(e.target.value)}
            placeholder="Ej. Balón de gas, arroz por saco"
            maxLength={120}
          />
        </label>

        <div>
          <span className="text-sm font-bold text-[var(--text-secondary)]">
            Meta de vecinos
          </span>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {JUNTA_REWARD_TIERS.map((tier) => {
              const active = tier.members === targetMembers;
              return (
                <button
                  key={tier.members}
                  type="button"
                  onClick={() => setTargetMembers(tier.members)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-0.5 border-2 py-3 transition ${
                    active
                      ? "border-[var(--accent)] bg-primary/10"
                      : "border-[var(--rule-base)] hover:border-[var(--accent)]"
                  }`}
                >
                  <span className="text-lg font-black tabular-nums text-[var(--text-primary)]">
                    {tier.members}
                  </span>
                  <span className="text-sm font-bold text-[var(--accent)]">
                    {tier.percent}% off
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-bold text-[var(--text-secondary)]">
            Se cierra en
          </span>
          <select
            className={`mt-1.5 ${INPUT}`}
            value={windowHours}
            onChange={(e) => setWindowHours(Number(e.target.value))}
          >
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.hours} value={o.hours}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 bg-[var(--accent)] py-4 text-base font-extrabold text-white transition hover:opacity-90 disabled:opacity-60 active:scale-[0.99]"
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.25} aria-hidden />
        ) : (
          <Users className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        )}
        Armar junta · {rewardPercent}% off para todos
      </button>

      {needsLogin && (
        <p className="mt-3 text-sm font-semibold text-[var(--text-secondary)]" role="alert">
          Inicia sesión para armar una junta.{" "}
          <Link href="/ingresar" className="font-bold text-[var(--accent)] underline">
            Ingresar
          </Link>
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm font-semibold text-[var(--data-error-600)]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
