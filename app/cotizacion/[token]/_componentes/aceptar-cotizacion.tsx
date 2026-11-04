"use client";

/**
 * Botón «Aceptar cotización» de la página pública (noche 04-11, tramo 2).
 * Pide el nombre de quien acepta → POST /api/public/cotizacion/[token]/aceptar
 * (con el `x-csrf-token` de la cookie que siembra la página) → muestra
 * «Aceptada el … por …» al toque y refresca la hoja (el estado de arriba) sin
 * recargar la página. «Pedir un cambio» abre WhatsApp al celular del negocio.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfHeaders } from "@/lib/csrf-client";
import { NOMBRE_MAX, NOMBRE_MIN, enlacePedirCambio, textoAceptacion } from "@/lib/cotizaciones/aceptacion";

const BIEN =
  "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/10 dark:text-[var(--data-success-500)]";
const MAL =
  "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]";
const BOTON =
  "inline-flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-[var(--text-inverse)] transition-opacity hover:opacity-90 disabled:opacity-60";
const ENLACE = "text-sm font-semibold text-[var(--accent)] underline-offset-2 hover:underline";

/** «Aceptada el … por …»: lo usan este botón al terminar y la hoja al volver a abrirla. */
export function AvisoAceptada({ texto }: { texto: string }) {
  return (
    <p role="status" className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${BIEN}`}>
      {texto}
    </p>
  );
}

type Respuesta = { error?: string; nombre?: string; aceptadaEl?: string };

export function AceptarCotizacion({ token, numero, whatsapp }: { token: string; numero: string; whatsapp: string | null }) {
  const router = useRouter();
  const [paso, setPaso] = useState<"inicio" | "nombre" | "enviando" | "lista">("inicio");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  async function aceptar(e: React.FormEvent) {
    e.preventDefault();
    const limpio = nombre.replace(/\s+/g, " ").trim();
    if (limpio.length < NOMBRE_MIN || limpio.length > NOMBRE_MAX) {
      setError(`Escribe tu nombre (de ${NOMBRE_MIN} a ${NOMBRE_MAX} letras).`);
      return;
    }
    setPaso("enviando");
    setError(null);
    try {
      const res = await fetch(`/api/public/cotizacion/${encodeURIComponent(token)}/aceptar`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ nombre: limpio }),
      });
      const data = (await res.json().catch(() => ({}))) as Respuesta;
      if (res.ok) {
        setHecho(textoAceptacion(data.aceptadaEl ?? new Date().toISOString(), data.nombre ?? limpio));
        setPaso("lista");
        router.refresh();
        return;
      }
      setError(data.error ?? "No se pudo aceptar. Prueba de nuevo.");
      setPaso("nombre");
      if (res.status === 409) router.refresh();
    } catch {
      setError("Sin conexión. Revisa tu internet y prueba de nuevo.");
      setPaso("nombre");
    }
  }

  return (
    <section className="space-y-3 border-t border-[var(--rule-base)] px-5 py-4 sm:px-7">
      {paso === "lista" && hecho ? (
        <AvisoAceptada texto={hecho} />
      ) : paso === "inicio" ? (
        <button type="button" className={BOTON} onClick={() => setPaso("nombre")}>
          Aceptar cotización
        </button>
      ) : (
        <form onSubmit={aceptar} className="space-y-3" noValidate>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-[var(--text-primary)]">¿Quién acepta? Escribe tu nombre</span>
            <input
              type="text"
              autoFocus
              autoComplete="name"
              maxLength={NOMBRE_MAX}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={paso === "enviando"}
              className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-base text-[var(--text-primary)]"
            />
          </label>
          {/* Ley 29733, deber de informar (security 04-11). */}
          <p className="text-sm text-[var(--text-secondary)]">
            Guardamos tu nombre, la fecha y parte de tu IP como constancia de que aceptaste.
          </p>
          {error ? (
            <p role="alert" className={`rounded-xl border px-3 py-2 text-sm ${MAL}`}>
              {error}
            </p>
          ) : null}
          <button type="submit" className={BOTON} disabled={paso === "enviando"}>
            {paso === "enviando" ? "Aceptando…" : `Aceptar la cotización ${numero}`}
          </button>
          <button type="button" className={`${ENLACE} block w-full text-center`} disabled={paso === "enviando"} onClick={() => { setPaso("inicio"); setError(null); }}>
            Volver
          </button>
        </form>
      )}
      {paso !== "lista" && whatsapp ? (
        <p className="text-center">
          <a href={enlacePedirCambio(whatsapp, numero)} target="_blank" rel="noopener noreferrer" className={ENLACE}>
            Pedir un cambio
          </a>
        </p>
      ) : null}
    </section>
  );
}
