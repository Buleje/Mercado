"use client";

/**
 * Cámaras — lo que la cámara del patio manda, y la dirección para que mande.
 *
 * La cámara es 4G con panel solar: nadie puede «entrar» a verla (CGNAT), y un
 * stream continuo no se sostiene ni en datos ni en batería. Así que esta
 * pantalla no es un monitor de video: es **el historial de lo que pasó**, que es
 * lo que sirve a la mañana siguiente — quién entró, a qué hora, y la foto.
 *
 * Dos cosas que la pantalla resuelve y son las que hacen que esto funcione o no:
 *
 *  1. **La dirección para copiar en la cámara.** Es lo único que hay que
 *     configurar del lado del aparato, y se copia de un botón. Si se escribe a
 *     mano, no anda.
 *  2. **Avisar cuando una dejó de mandar.** Con panel solar, dos días nublados
 *     la apagan; y una SIM sin datos deja de subir sin decir nada. Enterarse a
 *     las 24 h es la diferencia entre revisarla hoy o descubrirlo el día que
 *     pasó algo y no hay foto.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Camera, Check, Copy, Image as ImageIcon, Loader2, Plus, RefreshCw, Trash2, Upload,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  EVENTO_LABEL, estaCallada, horasSinVerse, type Camara, type Captura,
} from "@/lib/camaras/camaras";

const API = "/api/admin/camaras";

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function CamarasView() {
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [capturas, setCapturas] = useState<Captura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [lugar, setLugar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(API, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { camaras?: Camara[]; capturas?: Captura[] };
      setCamaras(j.camaras ?? []);
      setCapturas(j.capturas ?? []);
      setError(null);
    } catch {
      setError("No se pudo leer las cámaras.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const escribir = async (init: RequestInit & { url?: string }) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(init.url ?? API, {
        ...init,
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
      });
      const j = (await r.json().catch(() => ({}))) as { mensaje?: string; message?: string; error?: string; camaras?: Camara[] };
      if (!r.ok || j.error) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
      if (j.camaras) setCamaras(j.camaras);
      if (j.mensaje) setAviso(j.mensaje);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const crear = async () => {
    if (!nombre.trim()) return;
    if (await escribir({ method: "POST", body: JSON.stringify({ nombre, lugar }) })) {
      setNombre("");
      setLugar("");
      await cargar();
    }
  };

  /** La dirección que se copia en la cámara. Absoluta: el aparato no sabe de rutas. */
  const direccionDe = (c: Camara) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/camara?k=${c.token}`;

  const copiar = async (c: Camara) => {
    try {
      await navigator.clipboard.writeText(direccionDe(c));
      setCopiado(c.id);
      setTimeout(() => setCopiado((k) => (k === c.id ? null : k)), 2500);
    } catch {
      setError("El navegador no dejó copiar. Seleccioná la dirección a mano.");
    }
  };

  const calladas = useMemo(() => camaras.filter((c) => estaCallada(c)), [camaras]);
  const visibles = useMemo(
    () => (filtro ? capturas.filter((c) => c.camaraId === filtro) : capturas),
    [capturas, filtro],
  );
  const nombreDe = (id: string) => camaras.find((c) => c.id === id)?.nombre ?? "Cámara quitada";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Camera className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">
            Cámaras del patio
          </CardTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            La cámara manda la foto cuando detecta algo y acá queda con su hora. No es video en vivo:
            con panel solar y datos móviles, transmitir todo el día vacía la batería.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden /> Actualizar
        </button>
      </div>

      {calladas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
          <p className="text-sm text-[var(--text-primary)]">
            {calladas.length === 1 ? "Una cámara no manda nada" : `${calladas.length} cámaras no mandan nada`} hace más
            de un día: {calladas.map((c) => `${c.nombre} (${horasSinVerse(c)} h)`).join(" · ")}. Suele ser batería o
            datos.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
      {aviso && !error && (
        <p className="rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
          {aviso}
        </p>
      )}

      {/* Alta + lista de cámaras con su dirección */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Cámara nueva
            </span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void crear(); }}
              placeholder="Portón de entrada"
              className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Qué mira (opcional)
            </span>
            <input
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
              placeholder="Patio de trozas"
              className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <button
            type="button"
            onClick={() => void crear()}
            disabled={guardando || !nombre.trim()}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Agregar
          </button>
        </div>

        <ul className="mt-3 space-y-2">
          {camaras.map((c) => (
            <li key={c.id} className="rounded-xl border border-[var(--rule-base)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{c.nombre}</span>
                  <span className="block truncate text-xs text-[var(--text-tertiary)]">
                    {c.lugar || "Sin lugar declarado"} ·{" "}
                    {c.ultimaCapturaEn ? `última foto ${cuando(c.ultimaCapturaEn)}` : "todavía no mandó nada"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void copiar(c)}
                  title="Copiar la dirección para pegarla en la cámara"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                >
                  {copiado === c.id ? <Check className="h-4 w-4 text-[var(--data-success-600)]" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copiado === c.id ? "Copiada" : "Copiar dirección"}
                </button>
                <button
                  type="button"
                  onClick={() => void escribir({ method: "PATCH", body: JSON.stringify({ id: c.id, accion: "rotar" }) })}
                  disabled={guardando}
                  title="Dirección nueva: la anterior deja de funcionar"
                  className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  aria-label={`Cambiar la dirección de ${c.nombre}`}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void escribir({ method: "DELETE", url: `${API}?id=${encodeURIComponent(c.id)}` })}
                  disabled={guardando}
                  className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-500)] disabled:opacity-50"
                  aria-label={`Quitar ${c.nombre}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
          {camaras.length === 0 && !cargando && (
            <li className="px-1 py-3 text-sm text-[var(--text-tertiary)]">
              Todavía no hay ninguna. Agregá la primera y copiá su dirección en la cámara (en Hik-Connect:
              notificación por correo o subida FTP/HTTP al enlace).
            </li>
          )}
        </ul>
      </div>

      {/* El historial */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CardTitle as="h3" className="mr-auto flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <ImageIcon className="h-4 w-4 text-[var(--accent)]" aria-hidden /> Lo que mandaron ({visibles.length})
          </CardTitle>
          {camaras.length > 1 && (
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              aria-label="Filtrar por cámara"
              className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)]"
            >
              <option value="">Todas las cámaras</option>
              {camaras.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
        </div>

        {cargando ? (
          <p className="flex items-center gap-2 px-1 py-6 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las fotos…
          </p>
        ) : visibles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-1 py-8 text-center">
            <Upload className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
            <p className="text-sm text-[var(--text-secondary)]">
              Todavía no llegó ninguna foto. Cuando la cámara mande la primera, aparece acá con su hora.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibles.map((c) => (
              <li key={c.id} className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagen de storage propio, sin layout fijo */}
                  <img src={c.url} alt={`${nombreDe(c.camaraId)} · ${cuando(c.at)}`} className="aspect-video w-full object-cover" loading="lazy" />
                </a>
                <div className="flex items-center gap-1.5 px-2.5 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[var(--text-primary)]">{nombreDe(c.camaraId)}</span>
                    <span className="block truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      {cuando(c.at)} · {EVENTO_LABEL[c.evento]}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (await escribir({ method: "DELETE", url: `${API}?captura=${encodeURIComponent(c.id)}` })) {
                        setCapturas((prev) => prev.filter((x) => x.id !== c.id));
                      }
                    }}
                    disabled={guardando}
                    aria-label="Borrar esta foto del historial"
                    title="Borrar esta foto del historial"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-500)] disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
