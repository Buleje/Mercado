"use client";

/**
 * Editar una corrida del libro (ADR-401).
 *
 * Muestra **los campos de la fila con lo que hoy dicen** y deja corregirlos:
 * especie, tipo de producto, producción declarada, unidad, volumen consumido,
 * presentación, referencia de materia prima y observaciones. El N° de permiso
 * también, con la vuelta de que no es un campo de la corrida —se hereda de la
 * madera— y por eso su formulario escribe en la GUÍA, y lo dice.
 *
 * Dos puertas, una pantalla: llenar un hueco es `completar_linea`, sobrescribir
 * lo que el libro ya afirmaba es `corregir_linea`. El reparto lo hace
 * `partirCambios` y no la UI, porque es una regla del libro (auditoría distinta
 * para cada una) y no una decisión de presentación.
 *
 * Lo que NO se toca acá:
 *  · **La fecha** — mover `entryDate` cambia de qué mes es la producción y toca
 *    dos períodos a la vez. Se anula con motivo y se registra de nuevo (§1.1).
 *  · **Los campos del registro de una corrida atada** — despachada, reprocesada
 *    o metida en un lote: quedan en gris **con el motivo**, porque un campo
 *    bloqueado sin explicación se lee como un error de la pantalla.
 */

import { useMemo, useState, useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { AlertTriangle, Check, Loader2, Lock, X } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { esCampoSinDato, marcadorDeAusencia } from "@/lib/forestal/campo-sin-dato";
import { PRESENTACIONES_LOCTP, TIPOS_PRODUCTO_SALIDA } from "@/lib/forestal/loctp-catalogos";
import { UNIDADES_LOCTP, unidadOficial } from "@/lib/forestal/loctp-campos";
import {
  CAMPOS_EDITABLES,
  hayCambios,
  partirCambios,
  valorInicial,
  type CampoEditable,
  type DefCampoEditable,
  type ValoresLinea,
} from "@/lib/forestal/ctp-linea-editable";

/** Lo que el modal necesita saber de la fila. */
export interface LineaEditable {
  id: string;
  lineNo: number | null;
  fecha: string;
  observations: string | null;
  presentacion: string | null;
  materiaPrimaRef: string | null;
  speciesCommon: string | null;
  speciesScientific: string | null;
  productType: string | null;
  /** De quién es la madera (ADR-412): "propia" | "tercero" | null. */
  duenoMadera?: string | null;
  titularNombre?: string | null;
  unit: string | null;
  /** Producción declarada de la corrida (`quantity`). */
  quantity: number | null;
  /** Materia prima consumida (`volumeInputM3`). */
  volumeInputM3: number | null;
  /** Por qué la corrida está atada, si lo está: se muestra en los bloqueados. */
  atadaPorque?: string | null;
  /**
   * El N° de permiso que la corrida HEREDA de la madera que consumió, y las
   * guías de las que lo hereda. Una corrida no tiene permiso propio: se corrige
   * en el ingreso, no acá.
   */
  permisos?: string[];
  gtfOrigen?: string[];
  /** Especies ya escritas en el libro: sugerencias, no un catálogo cerrado. */
  especiesConocidas?: string[];
}

const INPUT =
  "mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

/** Las opciones del catálogo, más lo que el asiento ya dice si no está en él —
 *  un valor viejo o importado no se pierde por no figurar en la lista. */
function opcionesCon(catalogo: { valor: string; label: string }[], actual: string) {
  const v = actual.trim();
  return v && !catalogo.some((o) => o.valor === v) ? [{ valor: v, label: `${v} (como está)` }, ...catalogo] : catalogo;
}

const CATALOGO_PRODUCTO = TIPOS_PRODUCTO_SALIDA.map((t) => ({ valor: t.valor, label: t.valor }));
const CATALOGO_PRESENTACION = PRESENTACIONES_LOCTP.map((p) => ({ valor: p, label: p }));
const CATALOGO_UNIDAD = UNIDADES_LOCTP.map((u) => ({ valor: u.valor, label: u.label }));

const etiqueta = (k: string) => CAMPOS_EDITABLES.find((c) => c.key === k)?.label ?? k;

export default function CtpEditarLineaModal({
  linea,
  onCerrar,
  onListo,
}: {
  linea: LineaEditable;
  onCerrar: () => void;
  onListo: (resumen: string) => void;
}) {
  /* Sin esto el foco se queda atrás del modal: Tab se va a la pantalla
     de abajo y Escape no cierra (hook medido en el módulo, 2026-09-09). */
  const cajaRef = useRef<HTMLDivElement>(null);
  /** Lo que dice hoy el asiento — la referencia contra la que se mide el cambio. */
  const actual = useMemo<ValoresLinea>(
    () => ({
      speciesCommon: linea.speciesCommon,
      speciesScientific: linea.speciesScientific,
      productType: linea.productType,
      presentacion: linea.presentacion,
      quantity: linea.quantity,
      unit: linea.unit,
      volumeInputM3: linea.volumeInputM3,
      materiaPrimaRef: linea.materiaPrimaRef,
      duenoMadera: linea.duenoMadera ?? null,
      titularNombre: linea.titularNombre ?? null,
      observations: linea.observations,
    }),
    [linea],
  );
  const [valores, setValores] = useState<Partial<Record<CampoEditable, string>>>(() =>
    Object.fromEntries(CAMPOS_EDITABLES.map((c) => [c.key, valorInicial(actual[c.key])])),
  );

  /**
   * El permiso siempre se puede escribir; lo que cambia es DÓNDE queda:
   *
   *  · con guías → en la(s) guía(s), que es de donde la corrida lo hereda y de
   *    donde lo heredan también todas sus otras corridas;
   *  · sin guías (una existencia de apertura, que no consumió madera de
   *    ninguna) → en el propio asiento (ADR-402). Antes acá no había ningún
   *    lugar donde registrarlo y el campo quedaba trabado con un candado.
   *
   * Con dos permisos distintos entre sus guías no hay un valor que «corregir»:
   * el campo arranca vacío y lo que se escriba las unifica, dicho antes.
   */
  const guias = linea.gtfOrigen ?? [];
  const permisos = [...new Set((linea.permisos ?? []).filter((p) => !esCampoSinDato(p)).map((p) => p.trim()))];
  const permisoActual = permisos.length === 1 ? permisos[0] : "";
  const permisoAmbiguo = permisos.length > 1;
  /** Sin guía de origen el permiso es un campo del asiento, no de la guía. */
  const permisoEnAsiento = guias.length === 0;
  const [permiso, setPermiso] = useState(permisoActual);

  const [guardando, setGuardando] = useState(false);
  useModalAccesible(cajaRef, { onCerrar: guardando ? undefined : onCerrar });
  const [error, setError] = useState<string | null>(null);
  /** Lo que el servidor NO aplicó, con su motivo. Se muestra y no se cierra. */
  const [sinAplicar, setSinAplicar] = useState<string[]>([]);

  const bloqueado = (c: DefCampoEditable) => c.registro && !!linea.atadaPorque;
  const reparto = partirCambios(actual, valores);
  const permisoNuevo = permiso.trim();
  const permisoCambio = permisoNuevo !== "" && permisoNuevo !== permisoActual;
  /* Sin guía el permiso viaja con el resto de las correcciones del asiento: una
     sola llamada y una sola entrada en la auditoría, no dos. */
  const camposCorregir = permisoCambio && permisoEnAsiento
    ? { ...reparto.corregir, originCode: permisoNuevo }
    : reparto.corregir;
  const algoQueGuardar = hayCambios(reparto) || permisoCambio;

  const pedir = async (url: string, body: unknown) => {
    const r = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => null)) as
      | {
          message?: string;
          error?: string;
          aplicados?: string[];
          cambios?: string[];
          omitidos?: { campo: string; motivo: string }[];
          rechazados?: { campo: string; motivo: string }[];
        }
      | null;
    if (!r.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
    return {
      hechos: [...(j?.aplicados ?? []), ...(j?.cambios ?? [])],
      faltaron: [...(j?.omitidos ?? []), ...(j?.rechazados ?? [])].map(
        (o) => `${etiqueta(o.campo)}: ${o.motivo}`,
      ),
    };
  };

  const guardar = async () => {
    if (!algoQueGuardar || guardando) return;
    setGuardando(true);
    setError(null);
    setSinAplicar([]);
    const hechos: string[] = [];
    const faltaron: string[] = [];
    try {
      if (Object.keys(reparto.completar).length > 0) {
        const r = await pedir("/api/admin/forestal/ctp", {
          id: linea.id,
          action: "completar_linea",
          campos: reparto.completar,
        });
        hechos.push(...r.hechos);
        faltaron.push(...r.faltaron);
      }
      if (Object.keys(camposCorregir).length > 0) {
        const r = await pedir("/api/admin/forestal/ctp", {
          id: linea.id,
          action: "corregir_linea",
          campos: camposCorregir,
        });
        hechos.push(...r.hechos);
        faltaron.push(...r.faltaron);
      }
      /* El permiso va a la GUÍA, y a TODAS las que alimentaron la corrida: si
         consumió madera de dos, las dos comparten ese origen. Completar (estaba
         en blanco) y corregir (decía otra cosa) son dos acciones distintas
         porque dejan dos rastros distintos. */
      if (permisoCambio && !permisoEnAsiento) {
        for (const gtf of guias) {
          const r = await pedir("/api/admin/forestal/wood-entries", {
            action: permisoActual ? "corregir_guia" : "completar_guia",
            gtfNumber: gtf,
            campos: { originCode: permisoNuevo },
          });
          hechos.push(...r.hechos);
          faltaron.push(...r.faltaron);
        }
      }

      onListo(
        hechos.length > 0
          ? `Corrida N° ${linea.lineNo ?? "—"} · ${hechos.length} ${hechos.length === 1 ? "cambio guardado" : "cambios guardados"}.`
          : `Corrida N° ${linea.lineNo ?? "—"}: no se aplicó ningún cambio.`,
      );
      /* Con algo sin aplicar el modal NO se cierra: cerrar y que el operario
         descubra después que 2 de 5 campos no entraron es peor que no tener la
         función (ADR-401 §5.2). */
      if (faltaron.length > 0) setSinAplicar(faltaron);
      else onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const campoInput = (c: DefCampoEditable) => {
    const valor = valores[c.key] ?? "";
    const set = (v: string) => setValores((prev) => ({ ...prev, [c.key]: v }));
    const off = bloqueado(c);
    /* Un número nunca es un marcador de ausencia: sólo los textos dicen «—». */
    const crudo = actual[c.key];
    const marcador = typeof crudo === "string" ? marcadorDeAusencia(crudo) : null;
    const placeholder = off ? "Bloqueado" : (marcador ?? "Vacío");

    if (c.control === "textarea") {
      return (
        <textarea
          rows={2}
          value={valor}
          disabled={off}
          onChange={(e) => set(e.target.value)}
          placeholder={placeholder}
          className={`${INPUT} h-auto py-2 font-normal`}
        />
      );
    }
    if (c.control === "numero") {
      return (
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.0001}
          value={valor}
          disabled={off}
          onChange={(e) => set(e.target.value)}
          placeholder={placeholder}
          className={`${INPUT} text-right font-mono tabular-nums`}
        />
      );
    }
    if (c.control === "dueno") {
      /* Dos opciones y un «sin declarar» que se puede elegir de vuelta: una
         corrida vieja no eligió nada, y forzarla a decir «propia» para poder
         guardar otra cosa sería ponerle un dueño que nadie declaró. */
      return (
        <select value={valor} disabled={off} onChange={(e) => set(e.target.value)} className={INPUT}>
          <option value="">— sin declarar —</option>
          <option value="propia">Es del centro</option>
          <option value="tercero">Es de un tercero</option>
        </select>
      );
    }
    if (c.control === "producto" || c.control === "presentacion" || c.control === "unidad") {
      const catalogo =
        c.control === "producto"
          ? CATALOGO_PRODUCTO
          : c.control === "presentacion"
            ? CATALOGO_PRESENTACION
            : CATALOGO_UNIDAD;
      return (
        <select value={valor} disabled={off} onChange={(e) => set(e.target.value)} className={INPUT}>
          <option value="">— sin especificar —</option>
          {opcionesCon(catalogo, valor).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <>
        <input
          type="text"
          value={valor}
          disabled={off}
          list={c.key === "speciesCommon" ? "ctp-especies-conocidas" : undefined}
          onChange={(e) => set(e.target.value)}
          placeholder={placeholder}
          className={INPUT}
        />
        {c.key === "speciesCommon" && (linea.especiesConocidas ?? []).length > 0 && (
          <datalist id="ctp-especies-conocidas">
            {(linea.especiesConocidas ?? []).map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        )}
      </>
    );
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[9990] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div ref={cajaRef} tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Editar la corrida N° ${linea.lineNo ?? ""}`}
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-lg)]"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <SectionTitle className="text-base font-extrabold text-[var(--text-primary)]">
              Editar la corrida N° {linea.lineNo ?? "—"}
            </SectionTitle>
            <p className="text-sm text-[var(--text-tertiary)]">
              {new Date(linea.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })} · queda registrado qué
              decía antes de cada cambio
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {linea.atadaPorque && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Esta corrida {linea.atadaPorque}, así que especie, producto, cantidad, unidad y volumen quedan
              fijos: cambiarlos dejaría un despacho citando madera que el libro ahora dice que era otra. Para
              cambiarlos hay que anularla con motivo y registrarla de nuevo.
            </span>
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {CAMPOS_EDITABLES.map((c) => (
            <label key={c.key} className={`block ${c.control === "textarea" ? "sm:col-span-2" : ""}`}>
              <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
                {c.label}
                {c.key === "quantity" && (valores.unit ?? "") !== "" && (
                  <span className="font-normal text-[var(--text-tertiary)]">
                    en {unidadOficial(valores.unit)}
                  </span>
                )}
                {bloqueado(c) && <Lock className="h-3 w-3 text-[var(--text-tertiary)]" aria-hidden />}
              </span>
              {campoInput(c)}
              {c.ayuda && !bloqueado(c) && (
                <span className="mt-0.5 block text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
                  {c.ayuda}
                </span>
              )}
            </label>
          ))}
        </div>

        {/* El N° de permiso: no es un campo de la corrida, se hereda de la
            madera. Por eso su formulario escribe en la guía y lo dice — y por
            eso, sin guía de la que heredarlo, no hay dónde escribirlo. */}
        <div className="mt-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)]">N° de permiso</span>
            <input
              type="text"
              value={permiso}
              onChange={(e) => setPermiso(e.target.value)}
              placeholder={permisoAmbiguo ? `Uno solo para las ${permisos.length} guías` : "Vacío"}
              className={`${INPUT} bg-[var(--surface-raised)]`}
            />
          </label>
          <p className="mt-1.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
            {permisoAmbiguo ? (
              <>
                Esta corrida consumió madera de <b>{permisos.length} permisos distintos</b> (
                {permisos.join(" · ")}). Lo que escribas acá los <b>unifica</b>: queda el mismo en{" "}
                {guias.join(", ")} y en todas sus corridas. Si de verdad son dos títulos, corregí cada guía
                desde Ingresos.
              </>
            ) : permisoEnAsiento ? (
              <>
                Esta corrida no consumió madera de ninguna guía —es una existencia de apertura—, así que el
                permiso se guarda <b>en el propio asiento</b> y vale sólo para ella.
              </>
            ) : (
              <>
                Una corrida no tiene permiso propio: lo hereda de la madera que consumió. Esto se guarda en{" "}
                {guias.length === 1 ? `la guía ${guias[0]}` : `las guías ${guias.join(", ")}`} y lo heredan{" "}
                <b>todas</b> sus corridas, no sólo ésta.
              </>
            )}
          </p>
        </div>

        {/* La fecha se muestra y no se toca: mover un asiento de mes cambia el
            rendimiento, el movimiento del libro y dos conciliaciones a la vez. */}
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
            <b className="text-[var(--text-secondary)]">
              Fecha: {new Date(linea.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })}
            </b>{" "}
            — no se corrige desde acá. Cambiarla mueve la producción de un mes a otro y con eso el rendimiento
            y los cuadros de los dos períodos. Una fecha mal puesta se anula con motivo y se registra de nuevo.
          </p>
        </div>

        {reparto.vaciados.length > 0 && (
          <p className="mt-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
            <b>{reparto.vaciados.map((k) => etiqueta(k)).join(", ")}</b> quedó en blanco: un campo no se vacía
            desde acá —borrar lo que el libro afirmó no es corregirlo—, así que se guarda como está. Para
            dejarlo sin dato hay que anular la corrida y registrarla de nuevo.
          </p>
        )}

        {sinAplicar.length > 0 && (
          <div className="mt-3 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <p className="font-bold">Lo demás se guardó, pero esto no entró:</p>
            <ul className="mt-1 list-disc pl-4">
              {sinAplicar.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="h-11 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={!algoQueGuardar || guardando}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--accent)] bg-primary/10 px-4 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[var(--accent)]"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
