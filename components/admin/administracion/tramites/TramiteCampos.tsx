"use client";

/**
 * TramiteCampos — los datos de un trámite en la ventana: con quién, de qué y
 * para quién; las fechas y el estado; el próximo paso y por dónde se habla.
 * Sólo dibuja: el borrador vive en `useTramiteForm`.
 */
import { CardTitle } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import { AREA_TEXTO, CAMPO_ALTO } from "@/components/admin/planificacion/piezas/clases";
import {
  CANALES_TRAMITE,
  ENTIDADES_TRAMITE,
  ESTADOS_TRAMITE,
  type CanalTramite,
  type EntidadTramite,
  type EstadoTramite,
} from "@/lib/admin/fichas-tramites-alquileres";
import type { Parte } from "@/lib/forestal/directorio";
import { ElegirFicha } from "../comun/ElegirFicha";
import { CANAL_UI, ENTIDAD_UI, ESTADO_TRAMITE_UI, PLANTILLAS_TRAMITE } from "./tramites-ui";
import { MAX_ASUNTO, type BorradorTramite } from "./use-tramite-form";

const BLOQUE = "space-y-3 border-t border-[var(--rule-soft)] pt-4";
const FILA = "grid gap-3 sm:grid-cols-2";

interface Props {
  b: BorradorTramite;
  cambiar: <K extends keyof BorradorTramite>(k: K, v: BorradorTramite[K]) => void;
  elegirPlantilla: (id: string) => void;
  /** Sólo al crear: la plantilla siembra los requisitos. */
  esNuevo: boolean;
  partes: readonly Parte[];
  parteNombre: string | null;
}

export function TramiteCampos({ b, cambiar, elegirPlantilla, esNuevo, partes, parteNombre }: Props) {
  return (
    <>
      {esNuevo && (
        <Field label="Empezar con" hint="Una plantilla trae la lista de requisitos de ese trámite; luego la ajustas">
          <select className={CAMPO_ALTO} value={b.plantilla} onChange={(e) => elegirPlantilla(e.target.value)}>
            <option value="">Sin plantilla (agrego los requisitos yo)</option>
            {PLANTILLAS_TRAMITE.map((p) => (
              <option key={p.id} value={p.id}>
                {p.texto}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className={FILA}>
        <Field label="Entidad" required>
          <select className={CAMPO_ALTO} value={b.entidad} onChange={(e) => cambiar("entidad", e.target.value as EntidadTramite)}>
            {ENTIDADES_TRAMITE.map((x) => (
              <option key={x} value={x}>
                {ENTIDAD_UI[x]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nombre de la entidad" hint="El banco o la oficina exacta">
          <input type="text" className={CAMPO_ALTO} value={b.entidadNombre} placeholder="Ej.: Agrobanco, agencia Constitución" onChange={(e) => cambiar("entidadNombre", e.target.value)} />
        </Field>
      </div>

      <Field label="Asunto" required>
        <input type="text" className={CAMPO_ALTO} value={b.asunto} maxLength={MAX_ASUNTO} placeholder="Ej.: alquiler del local de Constitución" onChange={(e) => cambiar("asunto", e.target.value)} />
      </Field>

      <ElegirFicha
        label="Persona"
        hint="De quién es el trámite: su ficha del Directorio o su nombre"
        valor={b.persona}
        nombreFicha={parteNombre}
        partes={partes}
        onCambiar={(v) => cambiar("persona", v)}
      />

      <section className={BLOQUE} aria-label="Fechas y estado">
        <CardTitle as="h3">Fechas y estado</CardTitle>
        <div className={FILA}>
          <Field label="Estado">
            <select className={CAMPO_ALTO} value={b.estado} onChange={(e) => cambiar("estado", e.target.value as EstadoTramite)}>
              {ESTADOS_TRAMITE.map((x) => (
                <option key={x} value={x}>
                  {ESTADO_TRAMITE_UI[x].texto}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Empezó">
            <input type="date" className={CAMPO_ALTO} value={b.iniciadoEl} onChange={(e) => cambiar("iniciadoEl", e.target.value)} />
          </Field>
          <Field label="Se envió">
            <input type="date" className={CAMPO_ALTO} value={b.enviadoEl} onChange={(e) => cambiar("enviadoEl", e.target.value)} />
          </Field>
          <Field label="Vence" hint="Sale en Hoy y en el calendario">
            <input type="date" className={CAMPO_ALTO} value={b.venceEl} onChange={(e) => cambiar("venceEl", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className={BLOQUE} aria-label="Próximo paso">
        <CardTitle as="h3">Próximo paso</CardTitle>
        <div className={FILA}>
          <Field label="Qué toca">
            <input type="text" className={CAMPO_ALTO} value={b.proximoPaso} placeholder="Ej.: llevar la partida a la agencia" onChange={(e) => cambiar("proximoPaso", e.target.value)} />
          </Field>
          <Field label="Cuándo">
            <input type="date" className={CAMPO_ALTO} value={b.proximoPasoEl} onChange={(e) => cambiar("proximoPasoEl", e.target.value)} />
          </Field>
          <Field label="Por dónde">
            <select className={CAMPO_ALTO} value={b.canal} onChange={(e) => cambiar("canal", e.target.value as CanalTramite | "")}>
              <option value="">Sin elegir</option>
              {CANALES_TRAMITE.map((x) => (
                <option key={x} value={x}>
                  {CANAL_UI[x]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contacto" hint="Nombre y teléfono o correo de quien atiende">
            <input type="text" className={CAMPO_ALTO} value={b.contacto} placeholder="Ej.: Sra. Pérez, 961 234 567" onChange={(e) => cambiar("contacto", e.target.value)} />
          </Field>
        </div>
        <Field label="Notas" hint="Sin claves ni contraseñas: el sistema las rechaza">
          <textarea className={AREA_TEXTO} value={b.notas} onChange={(e) => cambiar("notas", e.target.value)} />
        </Field>
      </section>
    </>
  );
}
