"use client";

/**
 * Elegir a alguien del Directorio forestal, en cualquier formulario.
 *
 * La libreta de personas, comunidades y empresas **ya existe**: es
 * `ForestParty`, el Directorio del Libro CTP (`Gestión → Directorio`), con
 * roles, documento único, dirección desglosada, título habilitante, resolución,
 * ARFFS, representante legal y su DNI, logo y adjuntos. Diez pantallas del CTP
 * ya la consultan a través de `TramiteEntidadPicker`.
 *
 * Este picker existe porque aquél está acoplado a los trámites: entrega diez
 * campos elegidos (`EntidadElegida`) y deja fuera **tituloHabilitante,
 * resolucion, planManejo, arffs y representanteDni** — justamente los que el
 * Libro TH necesita para dar de alta un plan de manejo. Acá se entrega la
 * `Parte` **completa** y cada formulario toma lo que le sirve.
 *
 * Lo que NO se duplica: la libreta (`useDirectorioForestal`) y el editor
 * (`CtpParteModal`) son los mismos de siempre. Un solo editor de partes en toda
 * la app, como quedó dicho cuando se amplió el picker de trámites.
 *
 * Pendiente anotado: `TramiteEntidadPicker` podría pasar a ser un envoltorio de
 * éste. No se tocó ahora para no mover diez pantallas del CTP en el mismo paso.
 *
 * ## Elegir al titular no alcanza: hay que elegir con QUÉ permiso
 *
 * Brandon (2026-09-21): «al escoger directorio de una CCNN, al presionar me
 * aparecen las otras opciones de qué permiso usar». Una comunidad maneja
 * varios títulos habilitantes a la vez —cada uno con su área y su resolución—,
 * así que el titular no determina el papel. Con `conPermisos`, elegir una parte
 * abre un segundo paso con SUS permisos (`ForestContrato`, ADR-421) y el
 * formulario recibe los dos: la ficha y el papel bajo el que se trabaja.
 *
 * Un solo permiso no pregunta nada: se elige solo y se avisa cuál fue. Preguntar
 * entre una opción es hacer clic para confirmar lo obvio.
 */

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import { claveBusqueda, direccionCompleta, type Parte, type RolParte } from "@/lib/forestal/directorio";
import type { Contrato } from "@/lib/forestal/contratos";
import { areaDelPermiso, permisosDeParte, permisosOfrecibles } from "@/lib/forestal/permisos-de-parte";
import { logger } from "@/lib/logger";
import { TIPO_LABEL, fmtFechaCorta } from "./contratos-ui";
import CtpParteModal from "./CtpParteModal";

export default function DirectorioPicker({
  onElegir,
  rol = "proveedor",
  label = "Traer del Directorio",
  /** Texto de ayuda bajo el buscador, para explicar a quién se está buscando. */
  ayuda,
  conPermisos = false,
  contratos: contratosDelFormulario,
}: {
  onElegir: (p: Parte, permiso?: Contrato | null) => void;
  /** Qué papel se busca. También es el rol con el que se crea uno nuevo. */
  rol?: RolParte;
  label?: string;
  ayuda?: string;
  /**
   * Preguntar con cuál de sus permisos se trabaja. Sólo lo enciende el
   * formulario que sabe qué hacer con el papel: en los demás sería un clic de
   * más sin efecto.
   */
  conPermisos?: boolean;
  /**
   * Los permisos ya cargados por el formulario. Cuando los tiene, el picker no
   * vuelve a pedirlos: dos consultas de la misma lista en la misma pantalla
   * pueden además contestar distinto.
   */
  contratos?: Contrato[];
}) {
  const { partes, vehiculos, cargando, error, guardarParte, eliminarParte, marcarUso } = useDirectorioForestal();
  const { confirm } = useConfirm();
  const [abierto, setAbierto] = useState(false);
  /* Los permisos se piden recién al abrir el menú: un formulario que nunca lo
     abre no paga la consulta. */
  const permisos = usePermisosForestal({ activo: conPermisos && abierto && !contratosDelFormulario });
  const contratos = contratosDelFormulario ?? permisos.contratos;
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<"nuevo" | Parte | null>(null);
  /** Paso 2: la parte elegida, esperando que se diga con qué permiso. */
  const [eligiendoPermiso, setEligiendoPermiso] = useState<Parte | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const delRol = partes.filter((p) => p.roles.includes(rol) && p.activo);
  const k = claveBusqueda(q);
  const visibles = !k
    ? delRol
    : delRol.filter(
        (p) => claveBusqueda(p.nombre).includes(k) || (p.docNumero ?? "").toLowerCase().includes(k),
      );

  /** Los permisos que se le pueden ofrecer a esta parte, suyos primero. */
  const permisosDe = (p: Parte): Contrato[] =>
    permisosOfrecibles(permisosDeParte({ id: p.id, nombre: p.nombre }, contratos));

  function elegir(p: Parte, permiso?: Contrato | null) {
    onElegir(p, permiso ?? null);
    /**
     * La libreta se ordena por lo que se usa («el destinatario de todos los
     * martes queda arriba sin que nadie lo configure»). Ese contador lo suben
     * las pantallas de guías del CTP, pero ningún picker lo hacía: elegir una
     * parte desde un formulario no contaba como uso, así que el orden sólo
     * aprendía de una parte del trabajo. Es conveniencia, no compliance: si
     * falla, la elección sigue igual.
     */
    marcarUso({ partes: [p.id] });
    setAbierto(false);
    setEligiendoPermiso(null);
    setQ("");
  }

  /**
   * Un clic en la parte. Con `conPermisos`, decide si hay algo que preguntar:
   * sin permisos cargados no hay pregunta posible, y con uno solo preguntar
   * sería pedir un clic para confirmar lo obvio.
   */
  function tocar(p: Parte) {
    if (!conPermisos) return elegir(p);
    const suyos = permisosDe(p);
    if (suyos.length === 0) return elegir(p, null);
    if (suyos.length === 1) return elegir(p, suyos[0]);
    setEligiendoPermiso(p);
  }

  /**
   * Dar de baja una ficha desde acá mismo, sin ir hasta la pantalla del
   * Directorio. Es baja lógica (`eliminarParte`): sale de los selectores, lo
   * ya emitido con ella no se toca.
   */
  async function darDeBaja(p: Parte) {
    const ok = await confirm({
      title: `¿Dar de baja a ${p.nombre}?`,
      description: `Deja de aparecer acá y en los demás selectores. Las guías e ingresos ya emitidos con «${p.nombre}» no cambian.`,
      intent: "danger",
      confirmLabel: "Sí, dar de baja",
    });
    if (!ok) return;
    setBorrandoId(p.id);
    setAviso(null);
    try {
      await eliminarParte(p.id);
      // Si era la que se estaba por elegir con permiso, o la que se tenía
      // abierta para editar, ese paso queda sin sentido: se cierra en vez de
      // dejarlo apuntando a una ficha que ya no está.
      if (eligiendoPermiso?.id === p.id) setEligiendoPermiso(null);
      if (modal !== "nuevo" && modal?.id === p.id) setModal(null);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo dar de baja la ficha.";
      setAviso(mensaje);
      logger.error("[DirectorioPicker] no se pudo dar de baja", { id: p.id, error: mensaje });
    } finally {
      setBorrandoId(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
      >
        <Users className="h-4 w-4" />
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="absolute right-0 z-20 mt-1.5 w-[24rem] max-w-[90vw] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]">
          {eligiendoPermiso ? (
            <PasoPermiso
              parte={eligiendoPermiso}
              permisos={permisosDe(eligiendoPermiso)}
              onVolver={() => setEligiendoPermiso(null)}
              onElegir={(permiso) => elegir(eligiendoPermiso, permiso)}
            />
          ) : (
          <>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o documento..."
              aria-label="Buscar en el Directorio"
              className="h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-8 pr-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-info-600)]"
            />
          </div>
          {ayuda && <p className="mb-1.5 px-1 text-xs text-[var(--text-tertiary)]">{ayuda}</p>}
          {aviso && (
            <p className="mb-1.5 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-2 py-1.5 text-xs font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              {aviso}
            </p>
          )}

          <div className="max-h-64 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)]">
            {cargando && <p className="px-3 py-4 text-sm text-[var(--text-tertiary)]">Cargando la libreta…</p>}
            {error && <p className="px-3 py-4 text-sm text-[var(--data-error-700)]">{error}</p>}
            {!cargando && !error && visibles.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
                {delRol.length === 0 ? "El Directorio todavía no tiene a nadie con este papel." : "Sin resultados."}
              </p>
            )}
            {visibles.map((p) => (
              <div key={p.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => tocar(p)}
                  className="min-w-0 flex-1 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{p.nombre}</span>
                  <span className="block truncate text-xs text-[var(--text-tertiary)]">
                    {[p.docNumero ? `${p.docTipo ?? "Doc"} ${p.docNumero}` : null, direccionCompleta(p)]
                      .filter(Boolean)
                      .join(" · ") || "Sin documento cargado"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setModal(p)}
                  aria-label={`Editar ${p.nombre} en el Directorio`}
                  title="Editar en el Directorio"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void darDeBaja(p)}
                  disabled={borrandoId === p.id}
                  aria-label={`Dar de baja a ${p.nombre} del Directorio`}
                  title={`Dar de baja a ${p.nombre} del Directorio`}
                  className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[var(--data-error-500)]/12 dark:hover:text-[var(--data-error-500)]"
                >
                  {borrandoId === p.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setModal("nuevo")}
            className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--data-success-500)] hover:text-[var(--data-success-700)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar al Directorio
          </button>
          </>
          )}
        </div>
      )}

      {/* El MISMO editor del Directorio, no un formulario aparte */}
      {modal && (
        <CtpParteModal
          parte={modal === "nuevo" ? null : modal}
          rolInicial={rol}
          existentes={partes}
          vehiculos={vehiculos}
          onGuardar={async (datos) => {
            const guardada = await guardarParte(datos);
            /* El modal cierra solo (`onClose`) DESPUÉS de crear los permisos que
               hayan quedado pendientes del alta: cerrarlo acá lo desmontaba en
               medio de ese guardado y sus errores no se veían. */
            // Al crear una parte nueva desde el formulario, se elige sola: el
            // paso siguiente siempre es usarla.
            if (guardada && modal === "nuevo") elegir(guardada);
            return guardada;
          }}
          onUsarExistente={(existente) => {
            // El duplicado se resuelve en un clic: se cierra el alta y se sigue
            // con la ficha que ya estaba, que es lo que el aviso pedía hacer.
            setModal(null);
            elegir(existente);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/**
 * «¿Con cuál de sus permisos?» — el segundo paso de elegir un titular.
 *
 * Cada opción muestra lo que distingue a un papel de otro: el código, qué papel
 * es, **cuánta área tiene** y hasta cuándo vale. Un área sin cargar se dice
 * («sin área cargada»), no se rellena con un cero: medido en el tenant real,
 * ninguno de los 6 permisos tenía área, y un «0.00 ha» los haría ver como áreas
 * de cero hectáreas.
 *
 * «Sólo la ficha» queda siempre disponible: hay altas que no cuelgan de ningún
 * permiso todavía, y obligar a elegir uno haría inventar el papel.
 */
function PasoPermiso({
  parte,
  permisos,
  onVolver,
  onElegir,
}: {
  parte: Parte;
  permisos: Contrato[];
  onVolver: () => void;
  onElegir: (permiso: Contrato | null) => void;
}) {
  const conteo = useMemo(() => permisos.length, [permisos]);
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver a la lista del Directorio"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{parte.nombre}</span>
          <span className="block text-xs text-[var(--text-tertiary)]">
            Maneja {conteo} permisos: ¿con cuál vas a trabajar?
          </span>
        </div>
      </div>

      <div className="max-h-64 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)]">
        {permisos.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onElegir(c)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-sm font-bold text-[var(--text-primary)]">{c.codigo}</span>
              <span className="block truncate text-xs text-[var(--text-tertiary)]">
                {[
                  c.tipo ? TIPO_LABEL[c.tipo] : null,
                  areaDelPermiso(c) ?? "sin área cargada",
                  c.vigenciaHasta ? `vence ${fmtFechaCorta(c.vigenciaHasta)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onElegir(null)}
        className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
      >
        Sólo los datos de la ficha
      </button>
    </div>
  );
}
