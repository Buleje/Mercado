"use client";

/**
 * CtpCobroAserrio — «¿A quién se le asierra?» (ADR-412).
 *
 * Bloque compartido entre declarar/ampliar producción, producir sin lote y
 * cobrar una corrida ya declarada: los tres necesitan la MISMA pregunta —quién
 * es el dueño de esta madera y a qué precio se le asierra— sobre bloques
 * distintos (paquetes de un formulario, o los ya guardados de una corrida).
 *
 * La vista previa usa `cotizarAserrio`, la misma función pura que corre el
 * servidor al guardar: lo que se ve acá es lo que se va a cobrar, no una
 * cuenta aparte (regla 6 del repo: totales en backend, esto es preview).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Search, Users } from "@buleje/design-system/icons";
import { marcarMenuAbierto } from "@/components/admin/shared/action-menu";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { filtrarPartes, ordenarPorUso, type Parte } from "@/lib/forestal/directorio";
import type { CandidatoParte } from "@/lib/forestal/directorio-desde-guias";
import {
  cotizarAserrio,
  explicarPrecio,
  versionVigente,
  type BloqueACobrar,
  type CobroAserrioValor,
} from "@/lib/forestal/tarifa-aserrio";
import { useTarifaAserrio } from "./hooks/use-tarifa-aserrio";
import { formatDate } from "./ctp-shared";
import CtpTarifaAserrioModal from "./CtpTarifaAserrioModal";
import CtpDuenoSugeridos from "./CtpDuenoSugeridos";
import { formatCurrency, formatNumber } from "@/lib/format";

const LABEL = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const PILL_BASE = "h-9 rounded-lg border px-3 text-sm font-semibold transition-colors";
/*
 * Historia de esta pastilla (revisión 2026-09-14, dos vueltas rojas):
 *   1. `dark:text-[var(--accent)]` medía 2.29:1 en oscuro (AA pide 4.5).
 *   2. `dark:text-[var(--text-primary)]` (texto claro) sobre `--accent-soft`
 *      SIN variante oscura midió PEOR (1.02): el fondo de la pastilla elegida
 *      seguía siendo claro en oscuro porque `--accent-soft` oscuro
 *      (`rgba(20,194,194,.10)`) es casi transparente y no se nota sobre lo
 *      que hay debajo si eso tampoco cambia lo suficiente.
 *
 * Arreglo: en oscuro el FONDO también cambia (`dark:bg-[var(--accent)]/15`,
 * el acento brillante propio del tema oscuro compuesto sobre `--surface-raised`
 * da un teal oscuro real) y el texto es `--text-primary` en los DOS temas —
 * el único token con garantía AA-en-ambos-temas de este design system.
 * Verificado por cómputo WCAG con los hex declarados en globals.css (sin
 * navegador disponible acá): oscuro 10.85:1, claro 18.53:1 — mejora la base
 * de claro (era 4.65) en vez de empeorarla. Re-confirmar con captura real.
 */
const pill = (activo: boolean) =>
  `${PILL_BASE} ${
    activo
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] dark:bg-[var(--accent)]/15"
      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
  }`;

/**
 * Qué tocó DE VERDAD el operador en esta sesión del bloque.
 *
 * ADR-412: el contrato de la PATCH distingue "ausente" (no cambia nada) de
 * `null` (quita/vuelve al default) de un valor (lo cambia) — pero comparar el
 * VALOR contra el anterior no alcanza: reafirmar "Según la tarifa" cuando el
 * precio ya estaba en null no cambia ningún valor, y sin embargo es una acción
 * explícita que el que llama necesita saber que ocurrió. Por eso el bloque
 * señala el toque él mismo, no el que lo usa comparando valores.
 */
export interface CobroAserrioTocado {
  dueno: boolean;
  precio: boolean;
}

/** Una instancia de la libreta, para que quien monta el bloque la comparta con él. */
export type DirectorioForestal = ReturnType<typeof useDirectorioForestal>;

export default function CtpCobroAserrio({
  fecha,
  bloques,
  valor,
  onChange,
  nombreGuardado,
  onValidez,
  labelSinElegir,
  ocultarImportePreview,
  onTarifaGuardada,
  soloDueno = false,
  directorio: directorioExterno,
}: {
  fecha: string;
  bloques: BloqueACobrar[];
  valor: CobroAserrioValor;
  onChange: (v: CobroAserrioValor, tocado: CobroAserrioTocado) => void;
  /** El nombre del dueño tal como quedó en el acta (`titularNombre`). Una
   *  parte se puede dar de baja DEL TODO y desaparecer del directorio — sin
   *  este nombre, esa corrida se leía como "Madera del centro" aunque el
   *  servidor le siguiera cobrando a alguien (MEDIO, revisión 2026-09-14). */
  nombreGuardado?: string | null;
  /** Avisa si el bloque queda en un estado que NO se puede guardar (a mano,
   *  con dueño elegido, sin precio puesto) — quien llama decide si eso apaga
   *  su botón de guardar. */
  onValidez?: (valido: boolean) => void;
  /**
   * El texto que se muestra ANTES de que se toque el selector de dueño, en
   * vez de «Madera del centro — no se cobra» (que en un uso normal —declarar
   * una corrida nueva— es un default correcto: no elegir a nadie es no
   * cobrarle a nadie). En una acción MASIVA sobre corridas que YA pueden
   * tener dueño, ese mismo texto se lee como una elección ya hecha, y no lo
   * es — quien llama (`CtpCobrarEnTandaModal`) pide un texto neutro hasta que
   * el operador elija algo de verdad (ALTO, revisión 2026-09-14).
   */
  labelSinElegir?: string;
  /**
   * Oculta el importe/PT/líneas de ESTE bloque (deja los avisos y "Editar
   * tarifa"). `CtpCobrarEnTandaModal` cotiza este bloque con los bloques de
   * TODAS las corridas juntos y una sola fecha de referencia — un total acá
   * arriba y otro, distinto y correcto, en la tabla de abajo (cada corrida con
   * su propia fecha) confundía cuál creer (MEDIO, revisión 2026-09-14: "un
   * solo total, no dos distintos arriba y abajo").
   */
  ocultarImportePreview?: boolean;
  /**
   * Además de refrescar la tarifa de ESTE bloque, avisa a quien llama que se
   * guardó una tarifa nueva. `CtpCobrarEnTandaModal` tiene su PROPIA
   * instancia de `useTarifaAserrio` para cotizar la tabla de abajo — sin este
   * aviso, esa tabla seguía usando la tarifa vieja después de editarla desde
   * acá (MEDIO, revisión 2026-09-14).
   */
  onTarifaGuardada?: () => void;
  /**
   * Sólo la pregunta «¿a quién?», sin precio ni vista previa ni la opción
   * «Madera del centro». Lo usa «Declarar producción» (ADR-429): ahí el precio
   * es UNO POR ESPECIE, en la columna del resumen, y elegir el servicio de
   * aserrío ya dijo que la madera NO es del centro.
   */
  soloDueno?: boolean;
  /**
   * La libreta de quien monta el bloque. Sin esto el bloque tiene la suya, y
   * una cuenta creada al lado («Crear cuenta nueva») no aparecía como elegida
   * hasta recargar: quedaba «Buscando…» con la ficha ya guardada.
   */
  directorio?: DirectorioForestal;
}) {
  const directorioPropio = useDirectorioForestal({ activo: !directorioExterno });
  const directorio = directorioExterno ?? directorioPropio;
  const tarifa = useTarifaAserrio();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const buscador = useRef<HTMLInputElement>(null);
  const botonDueno = useRef<HTMLButtonElement>(null);
  const panelDueno = useRef<HTMLDivElement>(null);
  const [modoPrecio, setModoPrecio] = useState<"tarifa" | "manual">(valor.precioManualPt != null ? "manual" : "tarifa");
  const [manualTxt, setManualTxt] = useState(valor.precioManualPt != null ? String(valor.precioManualPt) : "");
  const [verTarifa, setVerTarifa] = useState(false);
  /* Toques ACUMULADOS desde que se montó el bloque (sticky: una vez tocado,
     sigue tocado aunque el valor vuelva a como estaba). */
  const [duenoTocado, setDuenoTocado] = useState(false);
  const [precioTocado, setPrecioTocado] = useState(false);
  /** La clave del sugerido que se está agregando — deshabilita SU botón nomás. */
  const [guardandoSugerido, setGuardandoSugerido] = useState<string | null>(null);
  const [errorSugerido, setErrorSugerido] = useState<string | null>(null);

  // Cierra el desplegable con un click afuera — mismo patrón que `ColumnasMenu`.
  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    window.addEventListener("click", cerrar);
    return () => window.removeEventListener("click", cerrar);
  }, [abierto]);

  // Escape cierra el desplegable, no el diálogo de abajo (si lo hay). El
  // `stopPropagation` en captura no alcanza: el `DismissableLayer` de Radix
  // igual cierra el diálogo (medido en `ActionMenu`) — hay que pedírselo por
  // su propio mecanismo: marcar el diálogo y que `AdminModal` haga
  // `preventDefault()` en su `onEscapeKeyDown` mientras dure la marca.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setAbierto(false);
    };
    window.addEventListener("keydown", onKey, true);
    const dialogo = botonDueno.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    marcarMenuAbierto(dialogo, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      marcarMenuAbierto(dialogo, false);
    };
  }, [abierto]);

  // El foco va al buscador al desplegar — con `ref` y no `autoFocus`, que
  // enfoca también en el primer render (jsx-a11y lo marca por eso).
  useEffect(() => {
    if (abierto) buscador.current?.focus();
  }, [abierto]);

  /**
   * El desplegable se abre debajo del botón, y el botón puede estar cerca del
   * pie del modal (Cancelar/Guardar) en las tres pantallas donde vive este
   * bloque. Sin esto quedaba cortado por ese pie con cero pista de que había
   * que desplazar el CUERPO del modal para verlo (medido a 1440×900,
   * revisión 2026-09-14). `"nearest"` mueve lo mínimo: si ya se ve entero, no
   * hace nada.
   *
   * Se repite cuando llegan los proveedores sugeridos: vienen por fetch DESPUÉS
   * de abrir y alargan el panel, y el primer desplazamiento ya había pasado —
   * el aviso «Revisar» quedaba bajo el pie (medido: y=612 con el pie en y=568).
   */
  const sugeridosCargados = directorio.candidatosProveedor.length;
  useEffect(() => {
    if (abierto) panelDueno.current?.scrollIntoView({ block: "nearest" });
  }, [abierto, sugeridosCargados]);

  /* `directorio.partes` trae inactivas (`?inactivos=1`) — pero NO las que se
     dieron de baja DEL TODO (`deletedAt`), que `forest-directorio.db.ts` sigue
     filtrando aunque se pida con `inactivos=1`. Un dueño así NUNCA aparece
     acá, ni cargando ni después: por eso el nombre de respaldo (`nombreGuardado`,
     el `titularNombre` del acta) importa tanto como la búsqueda misma. */
  const elegido = valor.duenoParteId
    ? (directorio.partes.find((p) => p.id === valor.duenoParteId) ?? null)
    : null;
  /**
   * El hook arranca `cargando=false` y recién lo prende DENTRO de su propio
   * efecto — en el primer render, un directorio sin partes, sin error y sin
   * haber cargado todavía es tan "cargando" como cuando la bandera es `true`
   * de verdad. Sin esto, ese primer render decía "Madera del centro" para un
   * dueño real (revisión 2026-09-14).
   */
  const buscandoDueno =
    Boolean(valor.duenoParteId) &&
    !elegido &&
    !directorio.error &&
    (directorio.cargando || directorio.partes.length === 0);
  /* Con el directorio YA cargado, sin error, y el dueño sin aparecer, no es
     una carrera: se dio de baja del todo. Nunca "Madera del centro" (seguiría
     cobrándose a alguien que la pantalla dice que no cobra nada) ni "Buscando…"
     para siempre si el directorio quedó vacío. */
  const dadoDeBaja = Boolean(valor.duenoParteId) && !elegido && !buscandoDueno && !directorio.error;

  /* Proveedores primero: son quienes más traen madera a asierrar por encargo.
     El resto, por uso — mismo criterio que el resto de la libreta. */
  const opciones = useMemo(() => {
    const activas = directorio.partes.filter((p) => p.activo);
    const proveedores = ordenarPorUso(activas.filter((p) => p.roles.includes("proveedor")));
    const resto = ordenarPorUso(activas.filter((p) => !p.roles.includes("proveedor")));
    const todas = [...proveedores, ...resto];
    return (q.trim() ? filtrarPartes(todas, q) : todas).slice(0, 40);
  }, [directorio.partes, q]);

  const version = versionVigente(tarifa.tarifario, fecha);
  const cot = useMemo(
    () =>
      cotizarAserrio(version, bloques, {
        precioManualPt: modoPrecio === "manual" ? Number(manualTxt) || null : null,
      }),
    [version, bloques, modoPrecio, manualTxt],
  );

  /* «A mano» con el campo vacío o en 0 cotiza como si no hubiera precio a
     mano (cae a la tarifa) mientras el botón sigue mostrando «a mano»: la
     pantalla y lo que se manda a guardar dejan de coincidir. Sólo importa
     si hay a quién cobrarle — sin dueño, el precio no se usa para nada. */
  const precioInvalido = Boolean(valor.duenoParteId) && modoPrecio === "manual" && !(Number(manualTxt) > 0);
  useEffect(() => {
    onValidez?.(!precioInvalido);
  }, [precioInvalido, onValidez]);

  function elegir(p: Parte | null) {
    setDuenoTocado(true);
    onChange({ ...valor, duenoParteId: p?.id ?? null }, { dueno: true, precio: precioTocado });
    setAbierto(false);
    setQ("");
  }

  /** Da de alta al proveedor sugerido y lo deja elegido de una — "Agregar y elegir". */
  const agregarSugerido = useCallback(
    async (c: CandidatoParte) => {
      setGuardandoSugerido(c.clave);
      setErrorSugerido(null);
      try {
        const parte = await directorio.agregarCandidatoProveedor(c);
        elegir(parte);
      } catch (err) {
        setErrorSugerido(err instanceof Error ? err.message : String(err));
      } finally {
        setGuardandoSugerido(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [directorio.agregarCandidatoProveedor],
  );

  // Un solo elemento: se ubica ARRIBA o ABAJO de la lista según `q` (ver el
  // render), no dos instancias — evita pedir los candidatos dos veces.
  const sugeridos = (
    <CtpDuenoSugeridos
      abierto={abierto}
      candidatos={directorio.candidatosProveedor}
      conflictos={directorio.conflictosProveedor}
      cargando={directorio.cargandoCandidatos}
      error={directorio.candidatosProveedorError ?? errorSugerido}
      guardando={guardandoSugerido}
      onCargar={directorio.cargarCandidatosProveedor}
      onAgregar={(c) => void agregarSugerido(c)}
    />
  );

  return (
    <div className="space-y-3">
      <div>
        <span className={LABEL}>¿A quién se le asierra?</span>
        <div className="relative mt-1">
          <button
            ref={botonDueno}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAbierto((v) => !v);
            }}
            aria-expanded={abierto}
            className="flex h-11 w-full items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-left text-sm hover:border-[var(--accent)]"
          >
            <Users className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">
              {buscandoDueno
                ? "Buscando…"
                : elegido
                  ? `${elegido.nombre}${elegido.activo ? "" : " (dado de baja)"}`
                  : dadoDeBaja
                    ? `${nombreGuardado?.trim() || "Dueño"} (dado de baja)`
                    : valor.duenoParteId && directorio.error
                      ? "No se pudo leer el directorio"
                      : labelSinElegir && (!duenoTocado || soloDueno)
                        ? labelSinElegir
                        : "Madera del centro — no se cobra"}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {abierto && (
            <div
              ref={panelDueno}
              role="presentation"
              onClick={(e) => e.stopPropagation()}
              /* `max-h` + su propio scroll: el panel entero (buscador + botón +
                 sugeridos + lista) no puede crecer sin límite y quedar cortado
                 por el pie del modal sin ninguna pista de que hay más abajo. */
              className="absolute z-10 mt-1 max-h-[22rem] w-full overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]"
            >
              <div className="relative mb-1.5">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
                <input
                  ref={buscador}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por nombre o documento…"
                  aria-label="Buscar dueño de la madera"
                  className="h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              {!soloDueno && (
                <button
                  type="button"
                  onClick={() => elegir(null)}
                  className="mb-1 flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                >
                  Madera del centro — no se cobra
                </button>
              )}
              {/* De entrada (buscador vacío) van ARRIBA de la lista: son la
                  razón #1 por la que alguien abre este selector sin encontrar
                  a nadie todavía, y antes quedaban debajo de TODA la libreta
                  — nadie llegaba a verlos sin desplazar el modal entero. */}
              {!q.trim() && sugeridos}
              <ul className="max-h-56 space-y-0.5 overflow-y-auto">
                {opciones.length === 0 ? (
                  <li className="px-2.5 py-3 text-center text-sm text-[var(--text-tertiary)]">Nadie coincide.</li>
                ) : (
                  opciones.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => elegir(p)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-primary/5"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">{p.nombre}</span>
                        {p.roles.includes("proveedor") && (
                          <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                            proveedor
                          </span>
                        )}
                      </button>
                    </li>
                  ))
                )}
              </ul>
              {/* Buscando y sin match: sigue disponible, ahora debajo del "Nadie
                  coincide." — ya no compite con la lista por el primer lugar. */}
              {q.trim() !== "" && sugeridos}
            </div>
          )}
        </div>
      </div>

      {!soloDueno && (
      <div>
        <span className={LABEL}>Precio</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={modoPrecio === "tarifa"}
            onClick={() => {
              setModoPrecio("tarifa");
              setPrecioTocado(true);
              onChange({ ...valor, precioManualPt: null }, { dueno: duenoTocado, precio: true });
            }}
            className={pill(modoPrecio === "tarifa")}
          >
            Según la tarifa vigente el {formatDate(fecha)}
          </button>
          <button
            type="button"
            aria-pressed={modoPrecio === "manual"}
            onClick={() => {
              setModoPrecio("manual");
              setPrecioTocado(true);
              /* El input ya puede traer un número de ANTES (se escribió, se
                 pasó a "tarifa" y se volvió acá): sin emitirlo, `onChange`
                 nunca se llamaba al volver a "a mano" y el valor real que se
                 mandaba seguía siendo el de la última vez que SÍ se tocó el
                 número o la tarifa — `null` si esa última vez fue "tarifa"
                 (revisión 2026-09-14, MEDIO). */
              onChange({ ...valor, precioManualPt: Number(manualTxt) || null }, { dueno: duenoTocado, precio: true });
            }}
            className={pill(modoPrecio === "manual")}
          >
            Precio a mano
          </button>
          {modoPrecio === "manual" && (
            <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
              S/
              <input
                type="number"
                min={0}
                step="0.01"
                value={manualTxt}
                onChange={(e) => {
                  setManualTxt(e.target.value);
                  setPrecioTocado(true);
                  onChange({ ...valor, precioManualPt: Number(e.target.value) || null }, { dueno: duenoTocado, precio: true });
                }}
                placeholder="0.35"
                aria-label="Precio a mano, en soles por pie tablar"
                className="h-9 w-24 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              por PT
            </label>
          )}
        </div>
        {/* `!tarifa.cargando`: mientras el tarifario todavía no llegó, `version`
            también da `null` — sin el guard, este aviso salía un instante para
            una tarifa que sí existe (mismo patrón `loading && !X` de arriba). */}
        {modoPrecio === "tarifa" && !tarifa.cargando && !version && (
          <p className="mt-1 text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            No hay tarifa vigente el {formatDate(fecha)}: cárgala o pon un precio a mano.
          </p>
        )}
        {precioInvalido && (
          <p className="mt-1 text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            Pon el precio por PT o elige la tarifa.
          </p>
        )}
      </div>
      )}

      {valor.duenoParteId && !soloDueno && (
        <div className="rounded-xl bg-[var(--surface-sunken)] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">Vista previa</span>
            {!ocultarImportePreview && (
              <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {formatCurrency(Number(cot.importe))}{" "}
                <span className="font-sans text-xs font-normal text-[var(--text-tertiary)]">
                  · {formatNumber(cot.pt)} PT
                </span>
              </span>
            )}
          </div>

          {!ocultarImportePreview &&
            cot.lineas.length > 0 &&
            (cot.lineas.length <= 3 ? (
              <ul className="mt-1 space-y-0.5">
                {cot.lineas.map((l, i) => (
                  <li key={i} className="break-words font-mono text-xs leading-snug text-[var(--text-tertiary)]">
                    {l.etiqueta} — {explicarPrecio(l)}
                  </li>
                ))}
              </ul>
            ) : (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs font-medium text-[var(--text-secondary)]">
                  {cot.lineas.length} líneas — ver el detalle
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {cot.lineas.map((l, i) => (
                    <li key={i} className="break-words font-mono text-xs leading-snug text-[var(--text-tertiary)]">
                      {l.etiqueta} — {explicarPrecio(l)}
                    </li>
                  ))}
                </ul>
              </details>
            ))}

          {cot.avisos.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {cot.avisos.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {a}
                </li>
              ))}
            </ul>
          )}
          {!cot.cobrable && (
            <p className="mt-1.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              No se va a cargar nada en su cuenta{cot.avisos[0] ? `: ${cot.avisos[0]}` : "."}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setVerTarifa(true)}
              className="text-xs font-bold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
            >
              Editar tarifa
            </button>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              {ocultarImportePreview
                ? "El importe de cada corrida está abajo; el servidor lo recalcula al guardar."
                : "El importe definitivo lo calcula el servidor al guardar."}
            </p>
          </div>
        </div>
      )}

      {verTarifa && (
        <CtpTarifaAserrioModal
          open
          onClose={() => {
            setVerTarifa(false);
            void tarifa.recargar();
            onTarifaGuardada?.();
          }}
        />
      )}
    </div>
  );
}
