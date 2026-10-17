"use client";

/**
 * «Quién miró el video» (Ley 29733): los últimos 50 que abrieron el video de
 * una cámara, en vivo o en grabación. Plegado: sólo pide los datos al abrirlo.
 * Sólo admin y dueño (el servidor lo exige; acá se oculta para el resto).
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Eye, Loader2 } from "@buleje/design-system/icons";
import { useMiRol } from "@/hooks/use-mi-rol";
import { BLOQUE, CHIP_BASE } from "./camaras-ui";

type Mirada = {
  id: string;
  persona: string;
  rol: string | null;
  camaraId: string | null;
  camara: string | null;
  tipo: "vivo" | "grabacion" | null;
  calidad: "hd" | "sd" | null;
  desde: string | null;
  hasta: string | null;
  hora: string;
};

const SELECT =
  "h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]";

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default function QuienMiro({ camaras }: { camaras: { id: string; nombre: string }[] }) {
  const rol = useMiRol();
  const [abierto, setAbierto] = useState(false);
  const [camaraId, setCamaraId] = useState("");
  const [persona, setPersona] = useState("");
  const [filas, setFilas] = useState<Mirada[] | null>(null);
  const [personas, setPersonas] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (camaraId) qs.set("camaraId", camaraId);
      if (persona) qs.set("persona", persona);
      const r = await fetch(`/api/admin/camaras/miradas?${qs}`, { credentials: "include" });
      const j = (await r.json().catch(() => ({}))) as { miradas?: Mirada[]; message?: string };
      if (!r.ok) throw new Error(j.message ?? "No se pudo leer el registro.");
      const m = j.miradas ?? [];
      setFilas(m);
      setPersonas((prev) => [...new Set([...prev, ...m.map((x) => x.persona)])].sort());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el registro.");
    } finally {
      setCargando(false);
    }
  }, [camaraId, persona]);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  if (rol !== null && rol !== "admin" && rol !== "owner") return null;

  return (
    <section className={BLOQUE} aria-labelledby="camaras-miro-titulo">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 text-left"
      >
        <Eye className="h-4 w-4 text-[var(--accent-ink)]" aria-hidden />
        <span
          id="camaras-miro-titulo"
          className="mr-auto text-base font-bold text-[var(--text-primary)]"
        >
          Quién miró el video
        </span>
        <ChevronDown
          className={`h-4 w-4 text-[var(--text-secondary)] transition ${abierto ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Las últimas 50 veces que alguien abrió el video. Una anotación cada 5 minutos por
            persona y cámara.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              value={camaraId}
              onChange={(e) => setCamaraId(e.target.value)}
              className={SELECT}
              aria-label="Filtrar por cámara"
            >
              <option value="">Todas las cámaras</option>
              {camaras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              className={SELECT}
              aria-label="Filtrar por persona"
            >
              <option value="">Todas las personas</option>
              {personas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {cargando && (
              <Loader2 className="h-5 w-5 animate-spin self-center" aria-label="Cargando" />
            )}
          </div>

          {error && <p className="text-sm text-[var(--data-error-ink)]">{error}</p>}
          {filas && filas.length === 0 && !error && (
            <p className="text-sm text-[var(--text-secondary)]">Todavía nadie abrió el video.</p>
          )}
          {filas && filas.length > 0 && (
            <ul className="divide-y divide-[var(--rule-base)]">
              {filas.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="font-bold text-[var(--text-primary)]">{m.persona}</span>
                  {m.rol && <span className="text-[var(--text-secondary)]">{m.rol}</span>}
                  <span className="text-[var(--text-primary)]">{m.camara ?? "Cámara"}</span>
                  <span
                    className={`${CHIP_BASE} border-[var(--rule-base)] text-[var(--text-secondary)]`}
                  >
                    {m.tipo === "grabacion"
                      ? `Grabación${m.desde ? ` ${m.desde.slice(11, 16)}–${(m.hasta ?? "").slice(11, 16)}` : ""}`
                      : `En vivo${m.calidad ? ` ${m.calidad.toUpperCase()}` : ""}`}
                  </span>
                  <span className="ml-auto tabular-nums text-[var(--text-secondary)]">
                    {hora(m.hora)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
