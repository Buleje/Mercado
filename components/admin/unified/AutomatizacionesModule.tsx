"use client";

/**
 * AutomatizacionesModule — el puente con n8n, en las dos direcciones.
 *
 * Arriba: la credencial para que n8n (y por n8n, WhatsApp o Telegram) pueda
 * ANOTAR operaciones en Buleje. Abajo: los flujos de n8n que el asistente puede
 * DISPARAR desde el chat.
 *
 * La descripción de cada flujo no es decorativa: es lo único que lee el modelo
 * para elegir cuál disparar cuando alguien dice «mandale esto al contador». Por
 * eso el formulario la exige y el placeholder muestra cómo se escribe.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Webhook, Plus, Trash2, Play, KeyRound, Copy, Check, RefreshCw,
  Loader2, ExternalLink, Power,
} from "@buleje/design-system/icons";
import { CardTitle, InfoAlert, WarningAlert, EmptyState, LoadingState, BadgeStatus, PrimaryButton } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

interface Flujo {
  id: string;
  nombre: string;
  descripcion: string;
  url: string;
  activo: boolean;
  createdAt: string;
  ultimoDisparo?: { fecha: string; ok: boolean; detalle: string } | null;
}

interface ConfigN8n {
  flujos: Flujo[];
  token: string | null;
  tokenVersion: number;
  urlEntrante: string;
  redLocalHabilitada: boolean;
}

const API = "/api/admin/n8n/flows";

/** Copiar al portapapeles con acuse visible: sin el tilde nadie sabe si copió. */
function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null);
  const copiar = useCallback((texto: string, clave: string) => {
    navigator.clipboard
      .writeText(texto)
      .then(() => {
        setCopiado(clave);
        setTimeout(() => setCopiado(null), 1600);
      })
      .catch(() => setCopiado(null));
  }, []);
  return { copiado, copiar };
}

export default function AutomatizacionesModule() {
  const [config, setConfig] = useState<ConfigN8n | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState<string | null>(null);
  const [resultadoPrueba, setResultadoPrueba] = useState<{ id: string; ok: boolean; texto: string } | null>(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "", url: "" });
  const { copiado, copiar } = useCopiar();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(API);
      if (!r.ok) throw new Error("No se pudo leer la configuración");
      setConfig((await r.json()) as ConfigN8n);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const enviar = useCallback(
    async (body: unknown, metodo: "POST" | "DELETE" = "POST") => {
      const r = await fetch(API, {
        method: metodo,
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) throw new Error(String(json.error ?? "Falló la operación"));
      return json;
    },
    [],
  );

  const crear = useCallback(async () => {
    if (!form.nombre.trim() || !form.descripcion.trim() || !form.url.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      await enviar({ ...form, activo: true });
      setForm({ nombre: "", descripcion: "", url: "" });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }, [form, enviar, cargar]);

  const probar = useCallback(async (id: string) => {
    setProbando(id);
    setResultadoPrueba(null);
    try {
      const json = await enviar({ accion: "probar", id });
      const res = json.resultado as { ok: boolean; status?: number; error?: string; respuesta?: string };
      setResultadoPrueba({
        id,
        ok: res.ok,
        texto: res.ok
          ? `Contestó ${res.status}. ${res.respuesta ? `Dijo: ${res.respuesta.slice(0, 120)}` : "Sin cuerpo."}`
          : (res.error ?? `Falló con ${res.status}`),
      });
      await cargar();
    } catch (e) {
      setResultadoPrueba({ id, ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setProbando(null);
    }
  }, [enviar, cargar]);

  const rotarToken = useCallback(async () => {
    if (!confirm("Al rotar, el token viejo deja de funcionar al instante y hay que pegarlo de nuevo en n8n. ¿Rotar?")) return;
    try {
      await enviar({ accion: "rotar-token" });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [enviar, cargar]);

  if (cargando) return <LoadingState message="Cargando automatizaciones…" />;

  const ejemploCurl = config?.token
    ? `curl -X POST "${typeof window !== "undefined" ? window.location.origin : ""}${config.urlEntrante}" \\
  -H "Authorization: Bearer ${config.token}" \\
  -H "X-Buleje-Tenant: <tu-slug>" \\
  -H "Content-Type: application/json" \\
  -d '{"texto":"25 galones de petróleo para el camión N12 a 27 el galón"}'`
    : "";

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Asistente · Automatizaciones"
        title="Automatizaciones (n8n)"
        description="Que n8n pueda anotar operaciones acá, y que el asistente pueda disparar tus flujos desde el chat."
        icon={Webhook}
      />

      {error && <WarningAlert>{error}</WarningAlert>}

      {/* ── Entrada: n8n → Buleje ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[var(--text-secondary)]" />
            <CardTitle className="font-extrabold">Anotar desde afuera</CardTitle>
          </div>
          <button
            type="button"
            onClick={() => void rotarToken()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-soft)] px-3 py-2 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:border-[var(--rule-base)] hover:text-[var(--text-primary)] transition-colors min-h-[44px]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Rotar token
          </button>
        </div>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          Pegá este token en el nodo <strong>HTTP Request</strong> de n8n. Con eso, un audio de
          WhatsApp que n8n transcriba llega acá como operación: te devuelve el resumen para que se
          lo hagas confirmar a la persona, y recién ahí se anota.
        </p>

        {config?.token ? (
          <>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] px-3 py-2.5 font-mono text-[length:var(--ts-xs)] text-[var(--text-primary)]">
                {config.token}
              </code>
              <button
                type="button"
                onClick={() => copiar(config.token!, "token")}
                aria-label="Copiar token"
                className="shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-lg border border-[var(--rule-soft)] hover:border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {copiado === "token" ? <Check className="h-4 w-4 text-[var(--data-success-500)]" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <details className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
              <summary className="cursor-pointer px-3 py-2.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Cómo se llama (copiar y pegar)
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <pre className="overflow-x-auto rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-3 font-mono text-[length:var(--ts-2xs)] text-[var(--text-secondary)] leading-relaxed">
{ejemploCurl}
                </pre>
                <button
                  type="button"
                  onClick={() => copiar(ejemploCurl, "curl")}
                  className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {copiado === "curl" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copiar el ejemplo
                </button>
                <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-relaxed">
                  Devuelve <code className="font-mono">estado: &quot;pendiente&quot;</code> con un{" "}
                  <code className="font-mono">aprobacionId</code> y el resumen. Para confirmarlo, volvé a
                  llamar con <code className="font-mono">{`{"aprobacionId":"…","decision":"aprobar"}`}</code>{" "}
                  — tenés 10 minutos. Si tu flujo ya le preguntó a la persona, mandá{" "}
                  <code className="font-mono">{`"confirmar": true`}</code> y se anota de una.
                </p>
              </div>
            </details>
          </>
        ) : (
          <WarningAlert>
            No se puede emitir el token porque falta <code className="font-mono">AUTH_SECRET</code> en el
            entorno. Configuralo y recargá.
          </WarningAlert>
        )}
      </section>

      {/* ── Salida: Buleje → n8n ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-[var(--text-secondary)]" />
          <CardTitle className="font-extrabold">Tus flujos de n8n</CardTitle>
          {config && config.flujos.length > 0 && (
            <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] tabular-nums">
              {config.flujos.filter((f) => f.activo).length} activos de {config.flujos.length}
            </span>
          )}
        </div>

        {config && !config.redLocalHabilitada && (
          <InfoAlert>
            Sólo se aceptan URLs públicas (https). Un n8n en tu propia máquina queda bloqueado por
            seguridad: en desarrollo se habilita con <code className="font-mono">N8N_ALLOW_LOCAL=1</code>.
          </InfoAlert>
        )}

        {/* Alta */}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
          <input
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Nombre — ej: Avisar al contador"
            className="h-12 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-primary)]/40"
          />
          <input
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            placeholder="Para qué sirve — ej: manda un correo al contador con el gasto del día"
            className="h-12 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-primary)]/40"
          />
          <input
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://tu-n8n.com/webhook/…"
            className="h-12 sm:col-span-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 font-mono text-[length:var(--ts-xs)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-primary)]/40"
          />
          {/*
            El primitivo del DS y no un botón a mano: `bg-[var(--text-primary)]
            text-white` se ve bien en claro y desaparece en oscuro (el fondo se
            vuelve claro y el texto sigue siendo blanco). `PrimaryButton` usa
            `--surface-canvas` como color de texto, que invierte con el tema.
          */}
          <PrimaryButton
            type="button"
            size="lg"
            className="sm:col-span-2 h-12 w-full"
            onClick={() => void crear()}
            disabled={guardando || !form.nombre.trim() || !form.descripcion.trim() || !form.url.trim()}
            leftIcon={guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          >
            Agregar flujo
          </PrimaryButton>
        </div>

        {/* Lista */}
        {!config || config.flujos.length === 0 ? (
          <EmptyState
            icon={Webhook}
            title="Todavía no hay flujos"
            description="Creá un flujo en n8n con un nodo Webhook, copiá su URL de producción y pegala acá. Después le decís al asistente «mandá esto al contador» y lo dispara."
          />
        ) : (
          <ul className="space-y-2">
            {config.flujos.map((f) => (
              <li
                key={f.id}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  f.activo
                    ? "border-[var(--rule-base)] bg-[var(--surface-raised)]"
                    : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{f.nombre}</p>
                      <BadgeStatus variant={f.activo ? "success" : "neutral"} label={f.activo ? "Activo" : "Apagado"} size="sm" />
                      {f.ultimoDisparo && (
                        <BadgeStatus
                          variant={f.ultimoDisparo.ok ? "success" : "error"}
                          size="sm"
                          label={`Último: ${f.ultimoDisparo.detalle}`}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-snug">
                      {f.descripcion}
                    </p>
                    <p className="mt-1 flex items-center gap-1 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {f.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void probar(f.id)}
                      disabled={probando === f.id}
                      title="Mandar un ping de prueba"
                      aria-label={`Probar ${f.nombre}`}
                      className="h-11 w-11 inline-flex items-center justify-center rounded-lg border border-[var(--rule-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--rule-base)] transition-colors disabled:opacity-50"
                    >
                      {probando === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void enviar({ accion: "activar", id: f.id, activo: !f.activo }).then(cargar).catch((e) => setError(String(e)))}
                      title={f.activo ? "Apagar" : "Encender"}
                      aria-label={`${f.activo ? "Apagar" : "Encender"} ${f.nombre}`}
                      className="h-11 w-11 inline-flex items-center justify-center rounded-lg border border-[var(--rule-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--rule-base)] transition-colors"
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`¿Borrar el flujo "${f.nombre}"? El flujo sigue existiendo en n8n; sólo se borra el acceso desde acá.`)) {
                          void enviar({ id: f.id }, "DELETE").then(cargar).catch((e) => setError(String(e)));
                        }
                      }}
                      title="Borrar"
                      aria-label={`Borrar ${f.nombre}`}
                      className="h-11 w-11 inline-flex items-center justify-center rounded-lg border border-[var(--rule-soft)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:border-[var(--data-error-500)]/40 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {resultadoPrueba?.id === f.id && (
                  <p
                    className={cn(
                      "mt-2 rounded-lg px-3 py-2 text-[length:var(--ts-xs)]",
                      resultadoPrueba.ok
                        ? "bg-[var(--data-success-50)] text-[var(--text-secondary)]"
                        : "bg-[var(--data-error-50)] text-[var(--text-secondary)]",
                    )}
                  >
                    {resultadoPrueba.texto}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
