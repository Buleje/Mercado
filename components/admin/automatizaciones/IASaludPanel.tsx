"use client";

/**
 * IASaludPanel — el detalle de «¿la IA está realmente viva?», dentro del panel
 * de Indicadores de Automatizaciones (el estado en una línea va en la cabecera:
 * `EstadoIA`).
 *
 * Existe por una historia concreta: Groq dio de baja tres modelos sin aviso y
 * el asistente quedó mudo semanas. Cada llamada devolvía 404, el router lo
 * traducía a «no pude responder» y desde el chat parecía un problema de
 * conexión. Nada en el panel lo mostraba, porque no había dónde mirarlo.
 *
 * Tres estados y nunca los confunde: verde (verificado contra el proveedor),
 * rojo (algo no existe) y **gris (no se pudo preguntar)**: «no sé» y «está
 * bien» son cosas distintas, y confundirlas es justamente el bug que esta
 * pantalla previene. Los ids de los modelos van acá adentro, nunca a la vista.
 */

import { AlertTriangle, CheckCircle2, Eye, HelpCircle } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { Diagnostico, EstadoSalud } from "./tipos";

export const ICONO_SALUD: Record<EstadoSalud, typeof CheckCircle2> = {
  ok: CheckCircle2,
  roto: AlertTriangle,
  "sin-verificar": HelpCircle,
};

/** El color dice el estado sin leer: verde sirve, rojo no, gris no se sabe. */
export const COLOR_SALUD: Record<EstadoSalud, string> = {
  ok: "text-[var(--data-success-ink)]",
  roto: "text-[var(--data-error-ink)]",
  "sin-verificar": "text-[var(--text-tertiary)]",
};

function Fila({ estado, titulo, detalle }: { estado: EstadoSalud; titulo: string; detalle: string }) {
  const I = ICONO_SALUD[estado];
  return (
    <li className="flex items-start gap-2.5 py-2">
      <I aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${COLOR_SALUD[estado]}`} />
      <div className="min-w-0">
        <p className="text-sm font-bold text-[var(--text-primary)]">{titulo}</p>
        <p className="break-words text-sm text-[var(--text-secondary)]">{detalle}</p>
      </div>
    </li>
  );
}

export default function IASaludPanel({ dato }: { dato: Diagnostico }) {
  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
      <CardTitle className="text-sm font-bold">Estado de la IA</CardTitle>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {dato.resumen} · {dato.agentes.tools} herramientas cableadas · {dato.proveedor.nombre}
        {dato.proveedor.modelosDisponibles !== null && ` sirve ${dato.proveedor.modelosDisponibles} modelos`}
      </p>
      <ul className="mt-1 grid gap-x-6 divide-y divide-[var(--rule-soft)] lg:grid-cols-2 lg:divide-y-0">
        {dato.modelos.map((m) => (
          <Fila
            key={m.modelo + m.para}
            estado={m.estado}
            titulo={m.para}
            detalle={[m.modelo, m.detalle].filter(Boolean).join(" · ")}
          />
        ))}
        <li className="flex items-start gap-2.5 py-2">
          <Eye
            aria-hidden="true"
            className={`mt-0.5 h-4 w-4 shrink-0 ${COLOR_SALUD[dato.vision.disponible ? "ok" : "sin-verificar"]}`}
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">Leer fotos (boletas, documentos)</p>
            <p className="break-words text-sm text-[var(--text-secondary)]">{dato.vision.nota}</p>
          </div>
        </li>
      </ul>
      {dato.agentes.huecos.length > 0 && (
        <>
          <p className="mt-2 text-sm font-bold text-[var(--data-error-ink)]">Herramientas que el asistente no puede usar</p>
          <ul className="divide-y divide-[var(--rule-soft)]">
            {dato.agentes.huecos.map((h) => (
              <Fila key={h.tipo + h.donde} estado="roto" titulo={`${h.donde} · falta ${h.tipo}`} detalle={h.sintoma} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
