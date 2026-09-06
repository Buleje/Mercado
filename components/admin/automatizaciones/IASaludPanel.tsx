"use client";

/**
 * IASaludPanel — ¿la IA está realmente viva?
 *
 * Esta tarjeta existe por una historia concreta: Groq dio de baja tres modelos
 * sin aviso y el asistente quedó mudo semanas. Cada llamada devolvía 404, el
 * router lo traducía a «no pude responder» y desde el chat parecía un problema
 * de conexión. Nada en el panel lo mostraba, porque no había dónde mirarlo.
 *
 * Va PRIMERA en Automatizaciones a propósito: antes de preguntarse por qué el
 * bot de WhatsApp no entendió algo, conviene saber si el modelo existe.
 *
 * Muestra tres estados y nunca los confunde: verde (verificado contra el
 * proveedor), rojo (algo no existe) y **gris (no se pudo preguntar)** — este
 * último NO es verde, porque «no sé» y «está bien» son cosas distintas y
 * confundirlas es justamente el bug que esta pantalla previene.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Activity, CheckCircle2, AlertTriangle, HelpCircle, RefreshCw, Loader2, Eye,
} from "@buleje/design-system/icons";
import { CardTitle, BadgeStatus, WarningAlert } from "@buleje/design-system";

type EstadoSalud = "ok" | "roto" | "sin-verificar";

interface ModeloRevisado {
  para: string;
  modelo: string;
  estado: EstadoSalud;
  detalle?: string;
}

interface HuecoCableado {
  tipo: string;
  donde: string;
  sintoma: string;
}

interface Diagnostico {
  generadoEn: string;
  proveedor: { nombre: string; configurado: boolean; modelosDisponibles: number | null; error?: string };
  modelos: ModeloRevisado[];
  vision: { disponible: boolean; modelo: string; nota: string };
  agentes: { tools: number; huecos: HuecoCableado[] };
  resumen: string;
  estado: EstadoSalud;
}

const API = "/api/admin/ia-salud";

const ICONO: Record<EstadoSalud, typeof CheckCircle2> = {
  ok: CheckCircle2,
  roto: AlertTriangle,
  "sin-verificar": HelpCircle,
};

/** El color dice el estado sin leer: verde sirve, rojo no, gris no se sabe. */
const COLOR: Record<EstadoSalud, string> = {
  ok: "var(--data-success-500)",
  roto: "var(--data-error-500)",
  "sin-verificar": "var(--text-tertiary)",
};

const BADGE: Record<EstadoSalud, { variant: "success" | "error" | "neutral"; label: string }> = {
  ok: { variant: "success", label: "Todo responde" },
  roto: { variant: "error", label: "Hay algo caído" },
  "sin-verificar": { variant: "neutral", label: "Sin verificar" },
};

export default function IASaludPanel() {
  const [dato, setDato] = useState<Diagnostico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (refrescar = false) => {
    if (refrescar) setRefrescando(true);
    try {
      const r = await fetch(refrescar ? `${API}?refrescar=1` : API);
      if (!r.ok) throw new Error("No se pudo leer el estado de la IA");
      setDato((await r.json()) as Diagnostico);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) return null;

  const estado = dato?.estado ?? "sin-verificar";
  const Icono = ICONO[estado];
  const badge = BADGE[estado];

  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Activity className="h-4 w-4 text-[var(--text-secondary)]" />
        <CardTitle className="font-extrabold">Estado de la IA</CardTitle>
        <BadgeStatus variant={badge.variant} size="sm" label={badge.label} />
        <button
          type="button"
          disabled={refrescando}
          onClick={() => void cargar(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-soft)] px-3 py-2 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--rule-base)] transition-colors min-h-[44px] disabled:opacity-50"
        >
          {refrescando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Volver a preguntar
        </button>
      </div>

      {error && <WarningAlert>{error}</WarningAlert>}

      {dato && (
        <>
          <div className="flex items-start gap-2">
            <Icono className="h-5 w-5 shrink-0 mt-0.5" style={{ color: COLOR[estado] }} />
            <p className="text-sm text-[var(--text-primary)] leading-relaxed">{dato.resumen}</p>
          </div>

          {/* ── Modelos ───────────────────────────────────────────────────── */}
          <ul className="space-y-2">
            {dato.modelos.map((m) => {
              const I = ICONO[m.estado];
              return (
                <li
                  key={m.modelo + m.para}
                  className="flex items-start gap-2.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2.5"
                >
                  <I className="h-4 w-4 shrink-0 mt-0.5" style={{ color: COLOR[m.estado] }} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{m.para}</p>
                    <p className="font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                      {m.modelo}
                    </p>
                    {m.detalle && (
                      <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] mt-0.5">{m.detalle}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* ── Visión ────────────────────────────────────────────────────── */}
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2.5">
            <Eye
              className="h-4 w-4 shrink-0 mt-0.5"
              style={{ color: dato.vision.disponible ? COLOR.ok : COLOR["sin-verificar"] }}
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">Leer fotos (boletas, documentos)</p>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] mt-0.5">{dato.vision.nota}</p>
            </div>
          </div>

          {/* ── Cableado de agentes ───────────────────────────────────────── */}
          {dato.agentes.huecos.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--data-error-500)]">
                Herramientas que el asistente no puede usar
              </p>
              {dato.agentes.huecos.map((h) => (
                <div
                  key={h.tipo + h.donde}
                  className="rounded-lg border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] px-3 py-2.5"
                >
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {h.donde} <span className="font-normal text-[var(--text-tertiary)]">· falta {h.tipo}</span>
                  </p>
                  <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] mt-0.5">{h.sintoma}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
              {dato.agentes.tools} herramientas cableadas y alcanzables · {dato.proveedor.nombre}
              {dato.proveedor.modelosDisponibles !== null && ` sirve ${dato.proveedor.modelosDisponibles} modelos`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
