"use client";

/**
 * Conectar apps: usar tu negocio desde ChatGPT, Claude, Gemini o Cursor
 * (conexión MCP). Cada conexión tiene su clave, que se muestra UNA vez; se
 * puede dejar sólo para mirar o con permiso de anotar (siempre con confirmación).
 */
import { useState } from "react";
import { Loader2, Plus, Trash2 } from "@buleje/design-system/icons";
import { CardTitle, ErrorAlert, SectionTitle } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { useConfirm } from "@/components/ui-system/ConfirmModal";
import type { ConexionMcp } from "@/lib/ia-proveedores/tipos";
import { useBulejeIaConexiones, type ConexionCreada } from "@/hooks/use-buleje-ia-conexiones";
import { CAMPO_IA, ETIQUETA_IA } from "./campos";
import { ClaveUnaVez } from "./ClaveUnaVez";
import { fechaCorta } from "./formato";
import { InstruccionesApps } from "./InstruccionesApps";

export function VistaConectar() {
  const cx = useBulejeIaConexiones();
  const [nombre, setNombre] = useState("");
  const [escribir, setEscribir] = useState(false);
  const [creando, setCreando] = useState(false);
  const [creada, setCreada] = useState<ConexionCreada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const crear = async () => {
    if (!nombre.trim()) return setError("Ponle un nombre, por ejemplo «Mi ChatGPT».");
    setError(null);
    setCreando(true);
    const r = await cx.crear(nombre.trim(), escribir);
    setCreando(false);
    if (!r.ok) return setError(r.error);
    setCreada(r.data);
    setNombre("");
    setEscribir(false);
  };

  const cambiar = async (c: ConexionMcp, cambios: Partial<Pick<ConexionMcp, "permiteEscribir" | "activo">>) => {
    const r = await cx.actualizar(c.id, cambios);
    if (!r.ok) setError(r.error);
  };

  const revocar = async (c: ConexionMcp) => {
    const ok = await confirm({
      title: `¿Cortar «${c.nombre}»?`,
      description: "Esa app deja de entrar a tu negocio al toque. Para volver, crea una conexión nueva.",
      intent: "danger",
      confirmLabel: "Cortar",
    });
    if (!ok) return;
    const r = await cx.revocar(c.id);
    if (!r.ok) setError(r.error);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <p className="text-sm text-[var(--text-secondary)]">
          Usa tu negocio desde la app de IA que ya tienes: le preguntas o le pides que anote, y lo hace en tu panel (conexión MCP).
        </p>
        {(cx.error || error) && (
          <ErrorAlert
            description={cx.error ?? error}
            action={
              cx.error ? (
                <Button variant="secondary" onClick={cx.recargar}>
                  Reintentar
                </Button>
              ) : undefined
            }
          />
        )}

        <section className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <SectionTitle>Nueva conexión</SectionTitle>
          <div>
            <label htmlFor="cx-nombre" className={ETIQUETA_IA}>
              Nombre
            </label>
            <div className="flex flex-wrap gap-2">
              <input id="cx-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Mi ChatGPT" className={`${CAMPO_IA} min-w-0 flex-1`} />
              <Button variant="accent" onClick={() => void crear()} disabled={creando}>
                {creando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />} Crear
              </Button>
            </div>
          </div>
          <Interruptor enabled={escribir} onChange={setEscribir} label="Puede anotar" desc="Si está apagado, sólo mira. Si lo prendes, puede anotar gastos, cobros y más, siempre pidiéndote que confirmes." />
        </section>

        <section className="space-y-3">
          <SectionTitle>Tus conexiones</SectionTitle>
          {cx.cargando && cx.items.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Cargando…
            </p>
          ) : cx.items.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Todavía no conectaste ninguna app.</p>
          ) : (
            <ul className="space-y-2">
              {cx.items.map((c) => (
                <li key={c.id} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle>{c.nombre}</CardTitle>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        Clave {c.tokenPrefijo}… · entra como {c.usuario} · {c.usos > 0 ? `usada ${c.usos} veces` : "sin usar"}
                        {c.ultimoUso && ` · última ${fechaCorta(c.ultimoUso)}`}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Cortar ${c.nombre}`} onClick={() => void revocar(c)}>
                      <Trash2 className="h-5 w-5" aria-hidden />
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    <Interruptor enabled={c.permiteEscribir} onChange={(v) => void cambiar(c, { permiteEscribir: v })} label="Puede anotar" />
                    <Interruptor enabled={c.activo} onChange={(v) => void cambiar(c, { activo: v })} label="Prendida" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {cx.urlMcp && (
          <section className="space-y-3">
            <SectionTitle>Cómo conectar cada app</SectionTitle>
            <InstruccionesApps urlMcp={cx.urlMcp} clave={null} />
          </section>
        )}
      </div>

      {creada && <ClaveUnaVez creada={creada} urlMcp={cx.urlMcp} onCerrar={() => setCreada(null)} />}
      <ConfirmDialog />
    </div>
  );
}
