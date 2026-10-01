"use client";

/**
 * Inventar un campo, o adoptar uno que otro formulario ya inventó (ADR-427).
 *
 * Lo único que este formulario decide de verdad es **cuánto vive** el campo, y
 * por eso esa elección no se pregunta con jerga («temporal / permanente») sino
 * con lo que va a pasar después: uno queda nada más que en este registro, el
 * otro se le va a pedir a todos los que se carguen de ahora en adelante.
 *
 * Adoptar copia la PREGUNTA, no la respuesta: cada formulario guarda lo suyo.
 */

import { useId, useState } from "react";
import { Check, ChevronDown, Copy, Loader2, X as XIcon } from "@buleje/design-system/icons";
import {
  TIPOS_CAMPO,
  TIPO_CAMPO_AYUDA,
  TIPO_CAMPO_LABEL,
  claveDesdeNombre,
  motivoNombreInvalido,
  type CampoPersonalizado,
  type TipoCampo,
} from "@/lib/campos-personalizados";
import type { CampoNuevoInput } from "@/hooks/use-campos-personalizados";
import {
  BOTON_PRIMARIO,
  BOTON_SUAVE,
  CAMPO_AYUDA,
  CAMPO_INPUT,
  CAMPO_LABEL,
} from "@/components/admin/shared/campos-personalizados-ui";

/** Una opción por línea: se escribe como se lee, sin comas ni JSON. */
function opcionesDesdeTexto(texto: string): string[] {
  const vistas = new Set<string>();
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !vistas.has(l) && (vistas.add(l), true));
}

export default function CampoPersonalizadoNuevo({
  etiquetaFormulario,
  existentes,
  reutilizables,
  cargandoCatalogo,
  guardando,
  onCargarReutilizables,
  onCrear,
  onCancelar,
}: {
  /** Cómo se llama en criollo lo que este formulario carga: «planes», «ingresos». */
  etiquetaFormulario: string;
  existentes: readonly CampoPersonalizado[];
  reutilizables: readonly CampoPersonalizado[];
  cargandoCatalogo: boolean;
  guardando: boolean;
  onCargarReutilizables: () => void;
  /** Devuelve el motivo si no se pudo crear, o `null` si entró. */
  onCrear: (input: CampoNuevoInput) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const id = useId();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState<TipoCampo>("texto");
  const [opcionesTexto, setOpcionesTexto] = useState("");
  const [soloEnEsteRegistro, setSoloEnEsteRegistro] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [verCatalogo, setVerCatalogo] = useState(false);

  const motivo = motivoNombreInvalido(nombre, existentes);
  const clave = claveDesdeNombre(nombre);

  async function crear(input: CampoNuevoInput) {
    setAviso(null);
    const error = await onCrear(input);
    if (error) setAviso(error);
  }

  async function guardar() {
    setTocado(true);
    if (motivo) {
      setAviso(null);
      return;
    }
    await crear({ nombre, descripcion, tipo, opciones: opcionesDesdeTexto(opcionesTexto), soloEnEsteRegistro });
  }

  return (
    <div className="mt-3 rounded-xl border-[1.5px] border-[var(--accent)] bg-[var(--surface-raised)] p-3">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-nombre`} className={CAMPO_LABEL}>
            Cómo se va a llamar
          </label>
          <input
            id={`${id}-nombre`}
            type="text"
            className={CAMPO_INPUT}
            value={nombre}
            placeholder="Nombre del apuntador"
            aria-describedby={`${id}-nombre-ayuda`}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => setTocado(true)}
          />
          {tocado && motivo ? (
            <p id={`${id}-nombre-ayuda`} role="alert" className="mt-1 text-xs font-semibold text-[var(--data-error)]">
              {motivo}
            </p>
          ) : (
            <p id={`${id}-nombre-ayuda`} className={CAMPO_AYUDA}>
              {clave ? `Se guarda como «${clave}»: si después lo renombras, lo escrito no se pierde.` : "Es lo que se va a ver arriba del campo."}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <label htmlFor={`${id}-para`} className={CAMPO_LABEL}>
            Para qué es
          </label>
          <input
            id={`${id}-para`}
            type="text"
            className={CAMPO_INPUT}
            value={descripcion}
            placeholder="Quién tomó la medida en el monte"
            aria-describedby={`${id}-para-ayuda`}
            onChange={(e) => setDescripcion(e.target.value)}
          />
          <p id={`${id}-para-ayuda`} className={CAMPO_AYUDA}>
            Se lee debajo del campo. Dentro de seis meses es lo único que explica qué se esperaba ahí.
          </p>
        </div>

        <div className="min-w-0">
          <label htmlFor={`${id}-tipo`} className={CAMPO_LABEL}>
            Qué se escribe
          </label>
          <select id={`${id}-tipo`} className={CAMPO_INPUT} value={tipo} aria-describedby={`${id}-tipo-ayuda`} onChange={(e) => setTipo(e.target.value as TipoCampo)}>
            {TIPOS_CAMPO.map((t) => (
              <option key={t} value={t}>
                {TIPO_CAMPO_LABEL[t]}
              </option>
            ))}
          </select>
          <p id={`${id}-tipo-ayuda`} className={CAMPO_AYUDA}>
            {TIPO_CAMPO_AYUDA[tipo]}
          </p>
        </div>

        {tipo === "opcion" && (
          <div className="min-w-0">
            <label htmlFor={`${id}-opciones`} className={CAMPO_LABEL}>
              Las opciones de la lista
            </label>
            <textarea
              id={`${id}-opciones`}
              rows={3}
              className={`${CAMPO_INPUT} h-auto py-2 leading-relaxed`}
              value={opcionesTexto}
              placeholder={"Bueno\nRegular\nMalo"}
              aria-describedby={`${id}-opciones-ayuda`}
              onChange={(e) => setOpcionesTexto(e.target.value)}
            />
            <p id={`${id}-opciones-ayuda`} className={CAMPO_AYUDA}>
              Una por línea, en el orden en que las vas a querer ver.
            </p>
          </div>
        )}

        <fieldset className="min-w-0 sm:col-span-2">
          <legend className={CAMPO_LABEL}>Cuánto vive este campo</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <OpcionDeAlcance
              nombre={`${id}-alcance`}
              elegido={soloEnEsteRegistro}
              onElegir={() => setSoloEnEsteRegistro(true)}
              titulo="Sólo en este registro"
              detalle={`Queda nada más que acá. Los demás ${etiquetaFormulario} no lo van a ver ni te lo van a pedir.`}
            />
            <OpcionDeAlcance
              nombre={`${id}-alcance`}
              elegido={!soloEnEsteRegistro}
              onElegir={() => setSoloEnEsteRegistro(false)}
              titulo="Siempre en este formulario"
              detalle={`Te lo va a pedir en todos los ${etiquetaFormulario} que cargues de ahora en adelante. Lo ya guardado no cambia.`}
            />
          </div>
        </fieldset>
      </div>

      {aviso && (
        <p className="mt-2 rounded-lg border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-100)] px-3 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
          {aviso}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className={`${BOTON_SUAVE} mr-auto`}
          aria-expanded={verCatalogo}
          onClick={() => {
            setVerCatalogo((v) => !v);
            onCargarReutilizables();
          }}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          Usar uno que ya existe
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${verCatalogo ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <button type="button" className={BOTON_SUAVE} onClick={onCancelar}>
          <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Cancelar
        </button>
        <button type="button" className={BOTON_PRIMARIO} disabled={guardando} onClick={() => void guardar()}>
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          Crear el campo
        </button>
      </div>

      {verCatalogo && (
        <div className="mt-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Preguntas que ya inventaste en otras pantallas. Se copia la pregunta, no lo respondido: lo que se escriba acá es de
            este formulario.
          </p>
          {cargandoCatalogo && <p className={CAMPO_AYUDA}>Buscando…</p>}
          {!cargandoCatalogo && reutilizables.length === 0 && (
            <p className={CAMPO_AYUDA}>Todavía no hay campos en otras pantallas para copiar acá.</p>
          )}
          <div className="mt-2 space-y-1.5">
            {reutilizables.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2">
                <span className="text-sm font-bold text-[var(--text-primary)]">{c.nombre}</span>
                <span className="text-xs text-[var(--text-secondary)]">{TIPO_CAMPO_LABEL[c.tipo]}</span>
                <span className="text-xs text-[var(--text-tertiary)]">viene de {c.formulario}</span>
                <button
                  type="button"
                  className={`${BOTON_SUAVE} ml-auto`}
                  disabled={guardando}
                  onClick={() =>
                    void crear({
                      nombre: c.nombre,
                      descripcion: c.descripcion ?? "",
                      tipo: c.tipo,
                      opciones: c.opciones,
                      soloEnEsteRegistro: false,
                    })
                  }
                >
                  Usarlo acá
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Una de las dos vidas posibles, con su consecuencia escrita al lado.
 *
 * El texto cuelga directo del `<label>` (y no de un `<span>` contenedor) para
 * que el nombre accesible del radio sea el título: anidarlo un nivel más lo
 * deja sin etiqueta para un lector de pantalla.
 */
function OpcionDeAlcance({
  nombre,
  elegido,
  onElegir,
  titulo,
  detalle,
}: {
  nombre: string;
  elegido: boolean;
  onElegir: () => void;
  titulo: string;
  detalle: string;
}) {
  return (
    <label
      className={`grid cursor-pointer grid-cols-[auto_1fr] gap-x-2 rounded-xl border-[1.5px] p-2.5 transition-colors ${
        elegido
          ? "border-[var(--accent)] bg-[var(--accent)]/8"
          : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--rule-strong)]"
      }`}
    >
      <input type="radio" name={nombre} checked={elegido} onChange={onElegir} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
      <span className="min-w-0 text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
      <span className="col-start-2 mt-0.5 min-w-0 text-xs text-[var(--text-secondary)]">{detalle}</span>
    </label>
  );
}
