"use client";

/**
 * El editor de UN reporte diario (ADR-439): nombre, hora, días, canales con
 * sus destinatarios, secciones y de qué días habla. Controlado: el borrador lo
 * tiene el modal, que es quien guarda, previsualiza y manda.
 */
import { Check, Mail, MessageCircle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  DIAS_SEMANA,
  RANGO_META,
  RANGOS_REPORTE,
  SECCION_META,
  SECCIONES_REPORTE,
  HORAS_DEL_EDITOR,
  TOPE_DESTINATARIOS,
  cuandoSale,
  ventanaDeHora,
  type ReporteDiarioInput,
  type SeccionReporte,
} from "@/lib/forestal/reporte-diario";
import { Field, I } from "./ctp-shared";
import DestinatariosCampo from "./ctp-reporte-diario-destinatarios";

/** Ficha que se prende y se apaga (días, secciones, canales). */
const CHIP =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";
const chip = (on: boolean) =>
  `${CHIP} ${
    on
      ? "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
  }`;

/**
 * Cada hora dice en qué ventana llega de verdad: sin el disparador exacto, los
 * disparos son 4 al día y caen en cualquier minuto de su hora. Con él vivo
 * (`horaExacta`, lo mide el servidor por su latido) sale a su media hora y el
 * rótulo es la hora sola. Después de las 21:00 no hay envío, así que esas
 * horas no se ofrecen (el servidor también las rechaza).
 */
const HORAS_VENTANA = HORAS_DEL_EDITOR.map((h) => {
  const v = ventanaDeHora(h);
  return { valor: h, rotulo: v ? `${h} · llega ${v.desde}–${v.hasta}` : h };
});
const HORAS_EXACTAS = HORAS_DEL_EDITOR.map((h) => ({ valor: h, rotulo: h }));

export const BORRADOR_NUEVO: ReporteDiarioInput = {
  nombre: "Cierre del día",
  activo: true,
  hora: "18:00",
  dias: [1, 2, 3, 4, 5, 6],
  porCorreo: true,
  porWhatsapp: true,
  correos: [],
  telefonos: [],
  secciones: [...SECCIONES_REPORTE],
  rango: "hoy",
};

const alternar = <T,>(lista: readonly T[], v: T): T[] => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

export default function ReporteDiarioEditor({
  borrador,
  onCambio,
  canales,
  horaExacta = false,
}: {
  borrador: ReporteDiarioInput;
  onCambio: (b: ReporteDiarioInput) => void;
  canales: { correo: boolean; whatsapp: boolean };
  horaExacta?: boolean;
}) {
  const horas = horaExacta ? HORAS_EXACTAS : HORAS_VENTANA;
  const set = <K extends keyof ReporteDiarioInput>(k: K, v: ReporteDiarioInput[K]) => onCambio({ ...borrador, [k]: v });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_15rem]">
        <Field label="Nombre del reporte">
          <input className={I} value={borrador.nombre} maxLength={80} onChange={(e) => set("nombre", e.target.value)} />
        </Field>
        <Field label="Hora (Lima)">
          <select className={I} value={borrador.hora} onChange={(e) => set("hora", e.target.value)}>
            {/* Un reporte guardado antes con una hora que ya no se ofrece se ve igual, para poder cambiarla. */}
            {!HORAS_DEL_EDITOR.includes(borrador.hora) && <option value={borrador.hora}>{borrador.hora} · no sale</option>}
            {horas.map((h) => (
              <option key={h.valor} value={h.valor}>
                {h.rotulo}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="-mt-2 text-sm text-[var(--text-secondary)]">{cuandoSale(borrador.hora, horaExacta)}</p>

      <Field label="Qué días sale">
        <div className="flex flex-wrap gap-1.5">
          {DIAS_SEMANA.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={borrador.dias.includes(i)}
              className={chip(borrador.dias.includes(i))}
              onClick={() => set("dias", alternar(borrador.dias, i).sort((a, b) => a - b))}
            >
              {d}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-[var(--rule-base)] p-3">
          <button type="button" aria-pressed={borrador.porCorreo} className={chip(borrador.porCorreo)} onClick={() => set("porCorreo", !borrador.porCorreo)}>
            <Mail className="h-4 w-4" /> Por correo
          </button>
          {!canales.correo && <p className="text-sm text-[var(--data-warning-700)]">El servidor no tiene el correo conectado todavía.</p>}
          <DestinatariosCampo
            id="reporte-correos"
            tipo="email"
            valores={borrador.correos}
            onCambio={(v) => set("correos", v)}
            placeholder="contador@correo.pe — Enter para agregar"
            deshabilitado={!borrador.porCorreo}
            tope={TOPE_DESTINATARIOS - borrador.telefonos.length}
          />
        </div>
        <div className="space-y-2 rounded-xl border border-[var(--rule-base)] p-3">
          <button
            type="button"
            aria-pressed={borrador.porWhatsapp}
            className={chip(borrador.porWhatsapp)}
            onClick={() => set("porWhatsapp", !borrador.porWhatsapp)}
          >
            <MessageCircle className="h-4 w-4" /> Por WhatsApp
          </button>
          {!canales.whatsapp && <p className="text-sm text-[var(--data-warning-700)]">El servidor no tiene WhatsApp conectado todavía.</p>}
          <DestinatariosCampo
            id="reporte-telefonos"
            tipo="tel"
            valores={borrador.telefonos}
            onCambio={(v) => set("telefonos", v)}
            placeholder="987 654 321 (celular de Perú) — Enter para agregar"
            deshabilitado={!borrador.porWhatsapp}
            tope={TOPE_DESTINATARIOS - borrador.correos.length}
          />
        </div>
      </div>

      <div role="group" aria-labelledby="reporte-secciones-rotulo">
        <div className="mb-1 flex items-center gap-1.5">
          <span id="reporte-secciones-rotulo" className="text-sm font-medium text-[var(--text-primary)]">
            Qué trae
          </span>
          <InfoTip
            title="Qué trae cada sección"
            ariaLabel="Ayuda: qué trae cada sección"
            what={SECCIONES_REPORTE.map((s) => (
              <span key={s} className="block">
                <strong>{SECCION_META[s].nombre}:</strong> {SECCION_META[s].trae}.
              </span>
            ))}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SECCIONES_REPORTE.map((s: SeccionReporte) => {
            const on = borrador.secciones.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                title={SECCION_META[s].trae}
                className={chip(on)}
                onClick={() => set("secciones", SECCIONES_REPORTE.filter((k) => (k === s ? !on : borrador.secciones.includes(k))))}
              >
                {on && <Check className="h-3.5 w-3.5" />}
                {SECCION_META[s].nombre}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="De qué días habla">
          <div className="flex flex-wrap gap-1.5">
            {RANGOS_REPORTE.map((r) => (
              <button key={r} type="button" aria-pressed={borrador.rango === r} className={chip(borrador.rango === r)} onClick={() => set("rango", r)}>
                {RANGO_META[r]}
              </button>
            ))}
          </div>
        </Field>
        <label className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent-dark)]" checked={borrador.activo} onChange={(e) => set("activo", e.target.checked)} />
          Activo (sale solo)
        </label>
      </div>
    </div>
  );
}
