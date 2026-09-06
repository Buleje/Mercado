"use client";

/**
 * WhatsAppAnotarPanel — habilitar tu propio WhatsApp para anotar.
 *
 * Lo mismo que resuelve el panel de Telegram —emparejar un canal con el
 * negocio— pero con un riesgo que Telegram no tiene: acá el número YA atiende
 * clientes. Por eso la pantalla dice, arriba de todo, qué cambia para quién:
 * los teléfonos de esta lista hablan con el bot que escribe en los libros;
 * todos los demás siguen con la tienda, exactamente como hoy.
 *
 * El código dura 15 minutos y se quema al usarse: quien lo tenga puede
 * enganchar SU teléfono y anotar plata.
 */

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Trash2, Copy, Check, Link2, Loader2 } from "@buleje/design-system/icons";
import { CardTitle, InfoAlert, WarningAlert, BadgeStatus, PrimaryButton } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useCopiar } from "./shared";

interface Dueno {
  telefono: string;
  nombre: string;
  vinculadoEn: string;
  ultimoUso?: string | null;
}

interface Estado {
  activo: boolean;
  comoSeLlama: string | null;
  duenos: Dueno[];
  codigo: { codigo: string; quedanSegundos: number } | null;
  comoVincular: string;
}

const API = "/api/admin/whatsapp-anotar";

const fecha = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" }) : "—";

/**
 * Un teléfono se muestra agrupado, no como un chorro de dígitos: la lista se
 * lee para reconocer «ese es el mío» de un vistazo.
 */
function telefonoLegible(soloDigitos: string): string {
  const d = soloDigitos;
  if (d.length <= 6) return d;
  const pais = d.slice(0, d.length - 9) || "";
  const resto = d.slice(-9);
  return `${pais ? `+${pais} ` : ""}${resto.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}`;
}

export default function WhatsAppAnotarPanel() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [quedan, setQuedan] = useState(0);
  const { copiado, copiar } = useCopiar();

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(API);
      if (!r.ok) throw new Error("No se pudo leer el estado del WhatsApp del negocio");
      const json = (await r.json()) as Estado;
      setEstado(json);
      setQuedan(json.codigo?.quedanSegundos ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // La cuenta regresiva: sin ella, «el código venció» se descubre recién cuando
  // el bot lo rechaza, con el celular ya en la mano.
  useEffect(() => {
    if (quedan <= 0) return;
    const t = setInterval(() => setQuedan((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [quedan]);

  const accion = useCallback(
    async (body: unknown, metodo: "POST" | "DELETE" = "POST") => {
      setOcupado(true);
      setError(null);
      try {
        const r = await fetch(API, {
          method: metodo,
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        if (!r.ok) throw new Error(String(json.error ?? "Falló la operación"));
        await cargar();
        return json;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [cargar],
  );

  if (cargando) return null;

  const codigoVivo = estado?.codigo && quedan > 0 ? estado.codigo.codigo : null;
  const frase = codigoVivo ? `vincular ${codigoVivo}` : "";

  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <MessageCircle className="h-4 w-4 text-[var(--text-secondary)]" />
        <CardTitle className="font-extrabold">Anotar por WhatsApp</CardTitle>
        {estado?.activo && estado.comoSeLlama && (
          <BadgeStatus variant="success" size="sm" label={estado.comoSeLlama} />
        )}
        {estado?.activo && estado.duenos.length === 0 && (
          <BadgeStatus variant="neutral" size="sm" label="Sin teléfonos" />
        )}
      </div>

      {error && <WarningAlert>{error}</WarningAlert>}

      {!estado?.activo ? (
        <InfoAlert>
          Este negocio todavía no tiene un número de WhatsApp conectado. Configuralo en{" "}
          <strong>Ajustes › WhatsApp</strong> y volvé acá para habilitar tu teléfono.
        </InfoAlert>
      ) : (
        <>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Le escribís al <strong>mismo número del negocio</strong> —con texto o una{" "}
            <strong>nota de voz</strong>— y te muestra qué se va a anotar con los botones{" "}
            <strong>Confirmar</strong> y <strong>Cancelar</strong>. Recién cuando tocás Confirmar
            queda en los libros.
          </p>

          {/*
            La aclaración que evita el miedo razonable de «¿mis clientes van a
            hablar con esto?». Va antes del botón, no después.
          */}
          <InfoAlert>
            Sólo los teléfonos de esta lista hablan con el bot que anota. Cualquier otro número
            sigue siendo atendido por la tienda, igual que hoy.
          </InfoAlert>

          {/* ── Vincular ─────────────────────────────────────────────────── */}
          {codigoVivo ? (
            <div className="rounded-lg border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-4 space-y-2">
              <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Mandá esto al WhatsApp del negocio
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3 py-2 font-mono text-base font-bold tracking-widest text-[var(--text-primary)]">
                  {frase}
                </code>
                <button
                  type="button"
                  onClick={() => copiar(frase, "codigo")}
                  aria-label="Copiar el mensaje"
                  className="h-11 w-11 inline-flex items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {copiado === "codigo" ? (
                    <Check className="h-4 w-4 text-[var(--data-success-500)]" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                Vence en{" "}
                <strong className="tabular-nums">
                  {Math.floor(quedan / 60)}:{String(quedan % 60).padStart(2, "0")}
                </strong>{" "}
                · mandalo desde el teléfono que va a anotar
              </p>
            </div>
          ) : (
            <PrimaryButton
              type="button"
              size="lg"
              disabled={ocupado}
              onClick={() => void accion({ accion: "codigo" })}
              leftIcon={ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            >
              Habilitar un teléfono
            </PrimaryButton>
          )}

          {/* ── Teléfonos habilitados ────────────────────────────────────── */}
          {estado.duenos.length > 0 && (
            <ul className="space-y-2">
              {estado.duenos.map((d) => (
                <li
                  key={d.telefono}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {telefonoLegible(d.telefono)}
                    </p>
                    <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                      {d.nombre} · desde {fecha(d.vinculadoEn)} ·{" "}
                      {d.ultimoUso ? `usado ${fecha(d.ultimoUso)}` : "sin usar todavía"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          `¿Quitar ${telefonoLegible(d.telefono)}? Deja de poder anotar al instante y vuelve a ser atendido como cliente.`,
                        )
                      ) {
                        void accion({ telefono: d.telefono }, "DELETE");
                      }
                    }}
                    aria-label={`Quitar ${telefonoLegible(d.telefono)}`}
                    className="shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-lg border border-[var(--rule-soft)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:border-[var(--data-error-500)]/40 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
