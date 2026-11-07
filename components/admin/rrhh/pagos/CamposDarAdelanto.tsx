"use client";

/**
 * Los campos de «Dar adelanto» en dos columnas (una en el celular): a la
 * izquierda la plata (quién, cuánto, cuándo, cómo, caja); a la derecha el
 * respaldo (para qué, recibo de papel, foto, firma). Todo el estado vive en
 * `use-dar-adelanto`.
 */

import { useState } from "react";
import { Interruptor } from "@/components/ui-system";
import { Field } from "@/components/admin/shared/Field";
import CapturaFoto from "@/components/admin/adelantos/CapturaFoto";
import { Comprobante } from "@/components/admin/adelantos/crear-adelanto/campos-respaldo";
import { METODOS_ADELANTO, MOTIVOS_ADELANTO, type MetodoAdelanto, type MotivoAdelanto } from "@/lib/rrhh/adelanto-rrhh";
import { CLASE_CAMPO } from "../rrhh-form";
import { formatearPEN } from "../rrhh-ui";
import type { FormDarAdelanto, PersonaParaAdelanto } from "./use-dar-adelanto";

interface Props {
  form: FormDarAdelanto;
  cambiar: <K extends keyof FormDarAdelanto>(k: K, v: FormDarAdelanto[K]) => void;
  personas: readonly PersonaParaAdelanto[];
  /** La persona vino elegida (desde su fila o su ficha): no se pregunta. */
  conPersonaFija: boolean;
  persona: PersonaParaAdelanto | undefined;
  hoy: string;
  esHoy: boolean;
  firmar: boolean;
  onFirmar: (v: boolean) => void;
  /** Encima de otra ventana la cámara (z-60) quedaría detrás: sólo «Adjuntar archivo». */
  sinCamara: boolean;
}

export default function CamposDarAdelanto({ form, cambiar, personas, conPersonaFija, persona, hoy, esHoy, firmar, onFirmar, sinCamara }: Props) {
  const [conCamara, setConCamara] = useState(false);
  const pideDetalle = form.motivo === "otro";

  return (
    <>
      <div className="space-y-4">
        {!conPersonaFija && (
          <Field label="A quién">
            {(id) => (
              <select id={id} value={form.quien} onChange={(e) => cambiar("quien", e.target.value)} className={CLASE_CAMPO}>
                <option value="">Elige a la persona</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Cuánto (S/)" hint={persona?.yaDado ? `Esta semana ya le diste ${formatearPEN(persona.yaDado)}.` : undefined}>
          {(id) => (
            <input
              id={id}
              data-qa="adl-monto"
              inputMode="decimal"
              autoFocus
              value={form.monto}
              onChange={(e) => cambiar("monto", e.target.value)}
              placeholder="0.00"
              className={`${CLASE_CAMPO} tabular-nums`}
            />
          )}
        </Field>
        <Field label="Fecha">
          {(id) => <input id={id} type="date" value={form.fecha} max={hoy} onChange={(e) => cambiar("fecha", e.target.value)} className={CLASE_CAMPO} />}
        </Field>
        <Field label="Cómo se lo diste">
          {(id) => (
            <select id={id} data-qa="adl-metodo" value={form.metodo} onChange={(e) => cambiar("metodo", e.target.value as MetodoAdelanto)} className={CLASE_CAMPO}>
              {METODOS_ADELANTO.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Interruptor
          enabled={esHoy && form.saleDeCaja}
          onChange={(v) => cambiar("saleDeCaja", v)}
          disabled={!esHoy}
          label="Sale de la caja abierta"
          desc={esHoy ? "Queda anotado como salida en la caja de hoy." : "Sólo lo que se da hoy sale de la caja."}
        />
      </div>

      <div className="space-y-4">
        <Field label="Para qué fue">
          {(id) => (
            <select id={id} data-qa="adl-motivo" value={form.motivo} onChange={(e) => cambiar("motivo", e.target.value as MotivoAdelanto | "")} className={CLASE_CAMPO}>
              <option value="">Sin decir</option>
              {MOTIVOS_ADELANTO.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={pideDetalle ? "Detalle" : "Detalle (opcional)"}>
          {(id) => (
            <input
              id={id}
              data-qa="adl-detalle"
              value={form.detalle}
              maxLength={200}
              required={pideDetalle}
              onChange={(e) => cambiar("detalle", e.target.value)}
              placeholder={pideDetalle ? "Para qué lo pidió" : "Pasaje a Pucallpa, medicinas…"}
              className={CLASE_CAMPO}
            />
          )}
        </Field>
        <Field label="N.º de recibo de papel (opcional)">
          {(id) => (
            <input id={id} data-qa="adl-recibo" value={form.recibo} maxLength={60} onChange={(e) => cambiar("recibo", e.target.value)} placeholder="0042" className={CLASE_CAMPO} />
          )}
        </Field>
        <Field label="Foto del voucher o del Yape (opcional)">
          {() => <Comprobante url={form.foto} onChange={(u) => cambiar("foto", u)} onAbrirCamara={sinCamara ? undefined : () => setConCamara(true)} />}
        </Field>
        <Interruptor enabled={firmar} onChange={onFirmar} label="Firmar el recibo al guardar" desc="Firma en la pantalla, como en Mi Plata." />
      </div>

      {conCamara && <CapturaFoto onFoto={(foto) => cambiar("foto", foto)} onCerrar={() => setConCamara(false)} />}
    </>
  );
}
