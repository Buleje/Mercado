"use client";

/**
 * Suscripción a novedades: el mismo `POST /api/newsletter` del pie de la
 * tienda general (lo guarda para ESTE negocio por la cookie de la tienda).
 *
 * La cookie `csrf-token` no la siembra `/t/<negocio>` (el proxy corta antes):
 * en una primera visita no existe y el POST daría 403. Si falta, se pide
 * cualquier GET de `/api` (que sí la siembra) antes de enviar.
 */
import { useState } from "react";
import { ArrowRight, Check } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

type Estado = "listo" | "enviando" | "hecho" | "error";

export function Suscripcion() {
  const [correo, setCorreo] = useState("");
  const [estado, setEstado] = useState<Estado>("listo");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!correo.trim() || estado === "enviando") return;
    setEstado("enviando");
    try {
      if (!/(?:^|;\s*)csrf-token=/.test(document.cookie)) await fetch("/api/health", { cache: "no-store" });
      const r = await fetch("/api/newsletter", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: correo.trim() }),
      });
      setEstado(r.ok ? "hecho" : "error");
      if (r.ok) setCorreo("");
    } catch {
      setEstado("error");
    }
  }

  if (estado === "hecho") {
    return (
      <p className="inline-flex items-center gap-2 text-base font-semibold text-[var(--mu-sobre-cacao)]" role="status">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--mu-boton-fondo)] text-[var(--mu-boton-texto)]">
          <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
        </span>
        ¡Listo, linda! Te avisaremos de las novedades y ofertas.
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className="flex w-full flex-col gap-2">
      <label htmlFor="mu-correo" className="text-base text-[var(--mu-sobre-cacao-2)]">
        Ofertas, lanzamientos y tips de cuidado, una vez por semana.
      </label>
      <div className="flex gap-2">
        <input
          id="mu-correo"
          type="email"
          required
          autoComplete="email"
          value={correo}
          onChange={(e) => {
            setCorreo(e.target.value);
            if (estado === "error") setEstado("listo");
          }}
          placeholder="tu@correo.com"
          className="h-12 w-full rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 text-base text-[var(--mu-sobre-cacao)] transition-colors duration-[var(--mu-dur-corto)] placeholder:text-[var(--mu-sobre-cacao-2)] focus:border-[var(--rule-strong)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mu-foco)]"
        />
        <button
          type="submit"
          disabled={estado === "enviando"}
          aria-label="Suscribirme"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--mu-boton-fondo)] text-[var(--mu-boton-texto)] transition-colors duration-[var(--mu-dur-corto)] hover:bg-[var(--mu-boton-fondo-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mu-foco)] disabled:opacity-60"
        >
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {estado === "error" && (
        <p className="text-sm font-semibold text-[var(--mu-sobre-cacao)]" role="alert">
          No pudimos guardar tu correo. Revisa que esté bien escrito e inténtalo de nuevo.
        </p>
      )}
    </form>
  );
}
