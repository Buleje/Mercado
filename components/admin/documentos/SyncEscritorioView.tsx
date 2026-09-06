"use client";

/**
 * SyncEscritorioView — la carpeta de tu PC dentro del panel (ADR-307).
 *
 * El sync funcionaba pero era invisible: la clave se generaba con un comando en
 * una terminal y no había forma de saber si el agente estaba corriendo. Un dueño
 * de bodega no abre una terminal, y "no sé si está andando" es lo mismo que "no
 * confío en que esté andando".
 *
 * Acá: el estado de cada equipo con su semáforo, qué movió, los conflictos que
 * hay que mirar, y el paso a paso para conectar una PC nueva con la clave y el
 * archivo de configuración listos para copiar.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  FolderSync,
  Loader2,
  Monitor,
  RefreshCw,
  Trash2,
} from "@buleje/design-system/icons";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import CarpetaLocalPanel from "./CarpetaLocalPanel";

type Salud = "activo" | "demorado" | "caido";

interface Equipo {
  equipoId: string;
  nombre: string;
  carpeta: string;
  version: string;
  motivo?: string;
  visto: string;
  salud: Salud;
  ciclos: number;
  archivos?: number;
  subidos?: number;
  bajados?: number;
  borrados?: number;
  totalSubidos: number;
  totalBajados: number;
  totalBorrados: number;
  error?: string | null;
  conflictos: { ruta: string; cuando: string }[];
}

interface Clave {
  id: string;
  nombre: string;
  prefijo: string;
  creada: string;
  ultimoUso: string | null;
}

const URL_SYNC = "/api/admin/documents/sync";

const SEMAFORO: Record<Salud, { label: string; clase: string; punto: string }> = {
  activo: {
    label: "Sincronizando",
    clase: "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
    punto: "bg-[var(--data-success-500)]",
  },
  demorado: {
    label: "Con demora",
    clase: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
    punto: "bg-[var(--data-warning-500)]",
  },
  caido: {
    label: "No responde",
    clase: "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
    punto: "bg-[var(--data-error-500)]",
  },
};

const haceCuanto = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "hace segundos";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
};

export default function SyncEscritorioView({
  tenantId,
  documentos,
  carpetas,
  onCambios,
}: {
  tenantId: string;
  documentos: DbDocument[];
  carpetas: DbDocumentFolder[];
  onCambios: () => void;
}) {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [claves, setClaves] = useState<Clave[]>([]);
  const [duplicadas, setDuplicadas] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** La clave recién creada: se muestra UNA vez y no se puede volver a ver. */
  const [claveNueva, setClaveNueva] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(URL_SYNC, { credentials: "include", headers: csrfHeaders({}) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `HTTP ${res.status}`);
      const j = await res.json();
      setEquipos(j.equipos ?? []);
      setClaves(j.claves ?? []);
      setDuplicadas(j.carpetasDuplicadas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    // Refresco suave: un latido llega cada ~30s, mirar más seguido no aporta.
    const t = setInterval(() => void cargar(), 45_000);
    return () => clearInterval(t);
  }, [cargar]);

  async function crearClave() {
    setCreando(true);
    setError(null);
    try {
      const res = await fetch(URL_SYNC, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ nombre: "Sync de escritorio" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `HTTP ${res.status}`);
      const j = await res.json();
      setClaveNueva(j.clave);
      void cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreando(false);
    }
  }

  async function revocar(id: string) {
    if (!confirm("¿Revocar esta clave?\n\nEl agente que la use va a dejar de sincronizar hasta que le pongas una nueva.")) return;
    await fetch(`${URL_SYNC}?keyId=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: csrfHeaders({}),
      credentials: "include",
    });
    void cargar();
  }

  async function olvidar(equipoId: string) {
    await fetch(`${URL_SYNC}?equipoId=${encodeURIComponent(equipoId)}`, {
      method: "DELETE",
      headers: csrfHeaders({}),
      credentials: "include",
    });
    void cargar();
  }

  async function copiar(texto: string, marca: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(marca);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setError("El navegador no dejó copiar: seleccioná el texto y copialo a mano.");
    }
  }

  const configJson = `{
  "carpeta": "C:\\\\Users\\\\TU-USUARIO\\\\Buleje-Drive",
  "api": "${typeof window !== "undefined" ? window.location.origin : "https://tu-dominio.com"}",
  "clave": "${claveNueva ?? "sk_pegá-acá-la-clave"}",
  "intervaloSegundos": 30
}`;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionTitle as="h2" className="flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
              <FolderSync className="h-5 w-5 text-primary" aria-hidden="true" />
              Tu carpeta de la PC, acá
            </SectionTitle>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
              Elegís una carpeta de Windows y todo lo que pongas ahí aparece en Documentación. Lo que subís
              desde el panel o el celular baja a la carpeta. Si borrás un archivo en la PC va a la papelera del
              panel (se puede recuperar), y si lo renombrás o lo movés de subcarpeta, el panel lo sigue.
              Hay dos formas: <strong>desde acá mismo</strong> (sin instalar nada, mientras el panel esté
              abierto) o con el <strong>agente de Windows</strong>, que sigue sincronizando con el panel cerrado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", cargando && "animate-spin")} /> Actualizar
          </button>
        </div>
      </div>

      {/* La vía sin instalación va primero: es la que sirve hoy mismo. */}
      <CarpetaLocalPanel
        tenantId={tenantId}
        documentos={documentos}
        carpetas={carpetas}
        onCambios={onCambios}
      />

      {error && (
        <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {duplicadas.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Hay <strong>dos equipos sincronizando la misma carpeta</strong> ({duplicadas.join(", ")}). Se van a
            pisar entre ellos: dejá uno solo activo.
          </span>
        </p>
      )}

      {/* ── Equipos ── */}
      <section className="space-y-3">
        <CardTitle as="h3" className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Equipos conectados
        </CardTitle>
        {cargando && equipos.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Viendo si hay alguno…
          </p>
        ) : equipos.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center">
            <Monitor className="mx-auto mb-2 h-8 w-8 text-[var(--text-tertiary)] opacity-40" aria-hidden="true" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Todavía no hay ninguna PC conectada</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Seguí los tres pasos de abajo para conectar la primera.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {equipos.map((e) => {
              const s = SEMAFORO[e.salud];
              return (
                <li key={e.equipoId} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border-2 px-2.5 text-xs font-bold", s.clase)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", s.punto)} aria-hidden="true" />
                          {s.label}
                        </span>
                        <span className="font-bold text-[var(--text-primary)]">{e.nombre}</span>
                        <span className="text-xs text-[var(--text-tertiary)]">v{e.version}</span>
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-[var(--text-secondary)]">{e.carpeta}</p>
                      <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                        Último reporte {haceCuanto(e.visto)}
                        {e.motivo ? ` · ${e.motivo}` : ""}
                        {typeof e.archivos === "number" ? ` · ${e.archivos} archivos en la carpeta` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                        Movió en total: {e.totalSubidos} subidos · {e.totalBajados} bajados · {e.totalBorrados} a
                        la papelera · {e.ciclos} revisiones
                      </p>
                      {e.error && (
                        <p className="mt-1.5 rounded-lg bg-[var(--data-error-50)] px-2 py-1 text-xs text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
                          Último error: {e.error}
                        </p>
                      )}
                      {e.conflictos.length > 0 && (
                        <div className="mt-1.5 rounded-lg bg-[var(--data-warning-50)] px-2 py-1.5 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                          <p className="font-bold">
                            {e.conflictos.length} archivo(s) se editaron en los dos lados
                          </p>
                          <p className="mt-0.5">
                            Se guardó tu versión y la del panel quedó al lado con “(del panel)”. Revisá:{" "}
                            {e.conflictos.slice(0, 3).map((c) => c.ruta).join(", ")}
                          </p>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void olvidar(e.equipoId)}
                      className="shrink-0 rounded-lg p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-700)]"
                      aria-label={`Olvidar el equipo ${e.nombre}`}
                      title="Olvidar este equipo (no desinstala el agente)"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Conectar una PC ── */}
      <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Conectar una PC</CardTitle>
        <ol className="mt-3 space-y-4 text-sm text-[var(--text-secondary)]">
          <li>
            <p className="font-bold text-[var(--text-primary)]">1 · Generá la clave</p>
            <p className="mt-0.5 text-xs">
              Es la credencial del programita que corre en tu PC. Se muestra una sola vez: si la perdés, generás
              otra y listo.
            </p>
            {claveNueva ? (
              <div className="mt-2 rounded-lg border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-2 dark:bg-[var(--data-success-500)]/12">
                <p className="text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                  Copiala ahora — no se vuelve a mostrar
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded bg-[var(--surface-raised)] px-2 py-1 font-mono text-xs text-[var(--text-primary)]">
                    {claveNueva}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copiar(claveNueva, "clave")}
                    className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-white"
                  >
                    {copiado === "clave" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void crearClave()}
                disabled={creando}
                className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-60"
              >
                {creando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Generar la clave
              </button>
            )}
          </li>

          <li>
            <p className="font-bold text-[var(--text-primary)]">2 · Elegí la carpeta y pegá la configuración</p>
            <p className="mt-0.5 text-xs">
              Creá la carpeta que querés sincronizar (por ejemplo <code>C:\Users\TU-USUARIO\Buleje-Drive</code>) y
              guardá este archivo como <code>buleje-sync.config.json</code> al lado del agente.
            </p>
            <div className="mt-2 flex items-start gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-[var(--surface-sunken)] p-2 font-mono text-[length:var(--ts-2xs,11px)] text-[var(--text-primary)]">
                {configJson}
              </pre>
              <button
                type="button"
                onClick={() => void copiar(configJson, "config")}
                className="shrink-0 rounded-lg border-2 border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
              >
                {copiado === "config" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </li>

          <li>
            <p className="font-bold text-[var(--text-primary)]">3 · Arrancalo</p>
            <p className="mt-0.5 text-xs">
              En la carpeta del agente, click derecho sobre <code>instalar.ps1</code> → “Ejecutar con PowerShell”.
              Queda andando y se prende solo cuando enciendes la PC. Cuando reporte, aparece arriba.
            </p>
          </li>
        </ol>
      </section>

      {/* ── Claves ── */}
      {claves.length > 0 && (
        <section className="space-y-2">
          <CardTitle as="h3" className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Claves activas
          </CardTitle>
          <ul className="space-y-2">
            {claves.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {k.nombre} <span className="font-mono text-xs text-[var(--text-tertiary)]">{k.prefijo}…</span>
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {k.ultimoUso ? `Usada ${haceCuanto(k.ultimoUso)}` : "Nunca usada"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void revocar(k.id)}
                  className="shrink-0 rounded-lg border-2 border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/15"
                >
                  Revocar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
