"use client";

/**
 * Alta de un documento de gestión forestal.
 *
 * Antes era un `<select>` con tres siglas —PO, PMFI, DEMA— y doce campos
 * iguales para las tres. Pero no son variantes de lo mismo: **cada una
 * corresponde a un título habilitante distinto** (concesión, predio privado,
 * comunidad), y quien lo llena —un ingeniero o un regente— reconoce el suyo por
 * el tipo de bosque en el que trabaja, no por la sigla suelta.
 *
 * Ahora el tipo se elige primero, con su nombre completo y para qué sirve, y el
 * formulario se acomoda: una plantación no tiene parcela de corta, un PGMF no
 * tiene la parcela del año, y el **regente forestal** —que firma el informe de
 * ejecución junto al titular— tiene por fin dónde ir.
 *
 * Reglas y fuentes: `lib/forestal/loth-tipos-plan.ts`.
 *
 * ## El titular no alcanza: el plan cuelga de UN permiso
 *
 * Brandon (2026-09-21): «al escoger directorio de una CCNN me aparecen las
 * opciones de qué permiso usar». Una comunidad maneja varios títulos
 * habilitantes a la vez, cada uno con **su área de manejo, su resolución y su
 * vigencia**, y el plan de manejo se aprueba para uno. Por eso el picker ahora
 * devuelve la ficha **y** el permiso (`ForestContrato`, ADR-421): con el papel
 * elegido, seis de los campos de este formulario dejan de tipearse.
 *
 * ## Lo que se puede elegir, se elige
 *
 * Región y ARFFS eran texto libre y el dato lo demuestra: en un plan real la
 * región dice «Constitucion» (una ciudad, no un departamento) y la misma
 * autoridad está escrita de tres formas distintas entre las fichas y los
 * permisos. La región pasa a la lista de departamentos del Perú; la ARFFS, a lo
 * que este negocio YA escribió, con «Otra…» para el caso nuevo — un catálogo
 * cerrado de ARFFS no se puede verificar entero, y el módulo no inventa datos
 * oficiales.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, FileText, Loader2, Plus, X as XIcon } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import DirectorioPicker from "./DirectorioPicker";
import { DOC_TIPOS, type Parte } from "@/lib/forestal/directorio";
import type { Contrato } from "@/lib/forestal/contratos";
import { areaDelPermiso, completarPlanDesdeDirectorio, habilitaPlanDeManejo, opcionesEscritas } from "@/lib/forestal/permisos-de-parte";
import { TIPO_LABEL } from "./contratos-ui";
import LothPlanFormCosteo, { type CamposDeCosteo } from "./LothPlanFormCosteo";
import CamposPersonalizados, {
  guardarValoresPendientes,
  pendientesVacios,
  type PendientesCampos,
} from "@/components/admin/shared/CamposPersonalizados";
import { copiarDePlanPrevio, etiquetaPlanPrevio, type PlanPrevio } from "@/lib/forestal/loth-plan-alta";
import { SelectConOtra } from "./campos-elegibles";
import { Field, cls } from "./loth-plan-ui";
import LothPlanFormUbicacion from "./LothPlanFormUbicacion";
import type { Plan } from "./loth-plan-shared";
import {
  ESPECIALIDADES_REGENTE,
  TIPOS_PLAN_LISTA,
  especialidadSugerida,
  metaDe,
  pideCampo,
  type TipoPlan,
} from "@/lib/forestal/loth-tipos-plan";

/** Con lo que arranca el campo Región: nadie lo eligió, así que se puede completar. */
const REGION_POR_DEFECTO = "Ucayali";

/** Id estable de este formulario para los campos personalizados (ADR-427). */
const FORMULARIO = "forestal.plan";

/** El formulario vacío: un alta arranca acá. Exportado para el test que
 *  verifica que la edición no pierde ningún campo. */
export function formularioVacio() {
  return {
    planType: "PO" as TipoPlan,
    planNumber: "", tituloHabilitante: "", resolucionNumber: "", resolucionDate: "",
    titularName: "", representanteLegal: "", arffs: "", region: REGION_POR_DEFECTO, parcelaCorta: "",
    areaHa: "", uitRef: "5350", vigenciaDesde: "", vigenciaHasta: "",
    regenteName: "", regenteRegistro: "", regenteEspecialidad: "maderable",
    // Lo que el modelo ya guardaba y el alta no preguntaba (ADR-425 · ronda 2).
    costoExtraccionM3: "", costoTransformacionM3: "", costoFleteM3: "",
    estado: "vigente", notes: "",
    // Cómo se reconoce y dónde queda (ADR-426).
    alias: "", propietarioNombre: "", propietarioDocTipo: "DNI", propietarioDoc: "",
    provincia: "", distrito: "", sector: "", cuenca: "", contratoId: "",
  };
}

type FormularioPlan = ReturnType<typeof formularioVacio>;

/** `2026-01-15T00:00:00.000Z` → `2026-01-15`, que es lo que come un input date. */
const soloFecha = (v: string | null | undefined) => (v ?? "").slice(0, 10);
const txt = (v: string | null | undefined) => v ?? "";

/**
 * Un plan guardado, vuelto formulario.
 *
 * Copia campo por campo desde el tipo `Plan` y no con un spread: es el mismo
 * error que costó dos rondas en RRHH y en el Directorio —una copia a mano que
 * se queda corta **borra** al guardar, porque lo que no llega viaja como
 * `null`—. Si mañana se agrega un campo al plan, hay que sumarlo acá.
 */
export function desdePlan(p: Plan): FormularioPlan {
  return {
    ...formularioVacio(),
    planType: (p.planType as TipoPlan) ?? "PO",
    planNumber: txt(p.planNumber),
    tituloHabilitante: txt(p.tituloHabilitante),
    resolucionNumber: txt(p.resolucionNumber),
    resolucionDate: soloFecha(p.resolucionDate),
    titularName: p.titularName ?? "",
    representanteLegal: txt(p.representanteLegal),
    arffs: txt(p.arffs),
    region: txt(p.region),
    parcelaCorta: txt(p.parcelaCorta),
    areaHa: txt(p.areaHa),
    uitRef: txt(p.uitRef),
    vigenciaDesde: soloFecha(p.vigenciaDesde),
    vigenciaHasta: soloFecha(p.vigenciaHasta),
    regenteName: txt(p.regenteName),
    regenteRegistro: txt(p.regenteRegistro),
    regenteEspecialidad: p.regenteEspecialidad || "maderable",
    costoExtraccionM3: txt(p.costoExtraccionM3),
    costoTransformacionM3: txt(p.costoTransformacionM3),
    costoFleteM3: txt(p.costoFleteM3),
    estado: p.estado || "vigente",
    notes: txt(p.notes),
    alias: txt(p.alias),
    propietarioNombre: txt(p.propietarioNombre),
    propietarioDocTipo: p.propietarioDocTipo || "DNI",
    propietarioDoc: txt(p.propietarioDoc),
    provincia: txt(p.provincia),
    distrito: txt(p.distrito),
    sector: txt(p.sector),
    cuenca: txt(p.cuenca),
    contratoId: txt(p.contratoId),
  };
}

export default function LothPlanForm({
  onClose,
  onSaved,
  planesPrevios = [],
  plan,
}: {
  onClose: () => void;
  onSaved: () => void;
  /**
   * Los planes ya cargados. De ellos sale lo que se repite entre un documento y
   * el siguiente —ARFFS, región, regente, UIT, costos— y las autoridades que ya
   * se escribieron: sin eso, el campo libre se vuelve a escribir distinto (pasó:
   * tres grafías de la misma autoridad en el mismo tenant).
   */
  planesPrevios?: readonly PlanPrevio[];
  /** El plan que se está EDITANDO. Sin esto, el formulario es un alta. */
  plan?: Plan | null;
}) {
  const editando = Boolean(plan);
  const [f, setF] = useState<FormularioPlan>(() => (plan ? desdePlan(plan) : formularioVacio()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** El permiso bajo el que se aprueba este plan, si se eligió uno. */
  const [permiso, setPermiso] = useState<Contrato | null>(null);
  /** Qué campos completó el permiso: se dice, no se hace en silencio. */
  const [traidos, setTraidos] = useState<string[]>([]);
  /**
   * ¿El tipo lo eligió una persona? Mientras no, el permiso puede proponerlo:
   * cada título habilitante tiene su documento por norma. Después, manda quien
   * lo eligió.
   */
  const [tipoTocado, setTipoTocado] = useState(false);
  /** Qué trajo la copia del plan anterior, para decirlo. */
  const [copiadoDe, setCopiadoDe] = useState<{ plan: string; campos: string[] } | null>(null);
  const [menuCopiar, setMenuCopiar] = useState(false);
  /* Lo escrito en campos personalizados durante un ALTA: no hay id al que
     colgarlo hasta que el servidor devuelve el plan (ADR-427). */
  const [camposPendientes, setCamposPendientes] = useState<PendientesCampos>(() => pendientesVacios(FORMULARIO));
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  /* Los permisos, una sola vez para el formulario y su picker: dos consultas de
     la misma lista en la misma pantalla pueden contestar distinto. */
  const { contratos, actualizar: actualizarPermiso } = usePermisosForestal();
  const arffsUsadas = useMemo(
    () => opcionesEscritas([...contratos.map((c) => c.arffs), ...planesPrevios.map((p) => p.arffs), f.arffs]),
    [contratos, planesPrevios, f.arffs],
  );

  const meta = metaDe(f.planType);
  const faltaRegente = meta.regente === "obligatorio" && f.regenteName.trim().length < 2;
  const puedeGuardar = f.titularName.trim().length >= 2 && !busy;

  /**
   * El titular del plan es, casi siempre, alguien que YA está en el Directorio
   * (`ForestParty`): la comunidad, la empresa o el propietario del predio. Y la
   * libreta guarda justo los campos que este formulario pedía a mano — título
   * habilitante, resolución, ARFFS y representante legal con su DNI.
   *
   * Sólo se completa lo que está vacío: si alguien ya escribió algo, no se le
   * pisa. Traer del Directorio es una ayuda de carga, no una sobreescritura.
   */
  function traerDelDirectorio(p: Parte, elegido?: Contrato | null) {
    /* La cuenta de qué se completó se hace ACÁ, fuera del updater: React invoca
       los updaters dos veces en desarrollo y el aviso salía repetido
       («título habilitante, título habilitante»). La regla vive en el módulo
       puro, que la prueba sin navegador. */
    const { campos, completados } = completarPlanDesdeDirectorio(f, p, elegido ?? null, {
      tipoTocado,
      regionPorDefecto: REGION_POR_DEFECTO,
    });
    /* El plan queda atado al permiso desde los DOS lados: acá `contratoId`, y
       del otro `ForestContrato.planId` al guardar. */
    setF({ ...campos, contratoId: elegido?.id ?? campos.contratoId });
    setPermiso(elegido ?? null);
    setTraidos(completados);
  }

  /**
   * Lo que se repite del plan anterior: la ARFFS, la región, el regente, la UIT
   * y los costos. Lo que identifica al documento —número, resolución, parcela,
   * vigencia— NUNCA se copia: sería declarar un papel que no es éste.
   */
  function copiarDe(plan: PlanPrevio) {
    const { campos, completados } = copiarDePlanPrevio(f, plan, { regionPorDefecto: REGION_POR_DEFECTO });
    setF(campos);
    setCopiadoDe(completados.length > 0 ? { plan: etiquetaPlanPrevio(plan), campos: completados } : null);
    setMenuCopiar(false);
  }

  /** Soltar el permiso NO borra lo cargado: eso ya es parte del formulario. */
  function soltarPermiso() {
    setPermiso(null);
    setTraidos([]);
  }

  function elegirTipo(tipo: TipoPlan) {
    setTipoTocado(true);
    setF((p) => ({
      ...p,
      planType: tipo,
      // La especialidad del regente la decide el tipo de documento; si el
      // usuario ya la cambió a mano, no se le pisa.
      regenteEspecialidad: p.regenteName ? p.regenteEspecialidad : especialidadSugerida(tipo),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeGuardar) return;
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f)) body[k] = v === "" ? null : v;
      body.titularName = f.titularName.trim();
      // Editar manda el id y va por PATCH; el resto del cuerpo es idéntico.
      if (plan) body.id = plan.id;
      // Lo que este tipo no usa no se manda: un campo escondido que igual viaja
      // deja datos que la pantalla nunca va a mostrar.
      if (!pideCampo(f.planType, "parcelaCorta")) body.parcelaCorta = null;
      if (!pideCampo(f.planType, "tituloHabilitante")) body.tituloHabilitante = null;
      const r = await fetch("/api/admin/forestal/plan", {
        method: plan ? "PATCH" : "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(body),
      });
      const creado = (await r.json().catch(() => ({}))) as { plan?: { id?: string }; message?: string };
      if (!r.ok) throw new Error(creado.message ?? `HTTP ${r.status}`);
      /* El permiso y su documento de gestión quedan atados: `ForestContrato.planId`
         existía desde ADR-421 y ninguna pantalla lo llenaba (0 de 6 medidos).
         Si falla, el plan YA está creado: se avisa, no se pierde el alta. */
      if (permiso && creado.plan?.id) {
        const atado = await actualizarPermiso(permiso.id, { planId: creado.plan.id });
        if (atado.error) {
          setErr(`El plan se creó, pero no se pudo atar al permiso ${permiso.codigo}: ${atado.error}`);
          setBusy(false);
          return;
        }
      }
      /* Los campos personalizados cargados durante el alta se guardan recién
         acá: antes no había registro al que colgarlos. Si fallan, el plan YA
         está creado — se avisa y no se pierde el alta. */
      const idPlan = plan?.id ?? creado.plan?.id;
      if (idPlan) {
        const r = await guardarValoresPendientes(idPlan, camposPendientes);
        if (r.errores.length > 0) {
          setErr(`El plan se guardó, pero sus campos personalizados no: ${r.errores.join(" · ")}`);
          setBusy(false);
          return;
        }
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 p-5">
      {err && (
        <div className="rounded-lg border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          {err}
        </div>
      )}

      {/* 1 · Qué documento es: decide todo lo demás */}
      <Bloque
        n={1}
        titulo="Qué documento vas a registrar"
        accion={
          planesPrevios.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuCopiar((v) => !v)}
                aria-expanded={menuCopiar}
                title="Trae lo que se repite: ARFFS, región, regente, UIT y costos"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copiar de un plan anterior
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuCopiar ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {menuCopiar && (
                <>
                {/* Un clic afuera cierra el menú: sin esto queda tapando el
                    formulario hasta que alguien vuelva a tocar el botón. */}
                <button
                  type="button"
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={() => setMenuCopiar(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 z-20 mt-1.5 max-h-64 w-[20rem] max-w-[90vw] overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1 shadow-[var(--shadow-lg)]">
                  {planesPrevios.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => copiarDe(p)}
                      className="block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                    >
                      <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{etiquetaPlanPrevio(p)}</span>
                      <span className="block truncate text-xs text-[var(--text-tertiary)]">{p.titularName}</span>
                    </button>
                  ))}
                </div>
                </>
              )}
            </div>
          ) : undefined
        }
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TIPOS_PLAN_LISTA.map((t) => {
            const activo = f.planType === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={activo}
                onClick={() => elegirTipo(t.key)}
                className={`rounded-xl border-2 p-3 text-left transition-colors ${
                  activo
                    ? "border-[var(--data-success-500)] bg-[var(--data-success-50)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`text-sm font-bold ${activo ? "text-[var(--data-success-700)]" : "text-[var(--text-primary)]"}`}>
                    {t.sigla}
                  </span>
                  {activo && <Check className="h-3.5 w-3.5 text-[var(--data-success-700)]" strokeWidth={3} />}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-[var(--text-secondary)]">{t.nombre}</span>
                <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{t.para}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">{meta.ayuda}</p>
        {copiadoDe && (
          <p className="mt-2 rounded-xl border border-[var(--data-info-100)] bg-[var(--data-info-50)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:border-[var(--data-info-500)]/30 dark:bg-[var(--data-info-500)]/10">
            De <b className="text-[var(--text-primary)]">{copiadoDe.plan}</b> se copiaron: {copiadoDe.campos.join(", ")}. El número, la
            resolución, la parcela y la vigencia no se copian: son de este documento.
          </p>
        )}
      </Bloque>

      {/* 2 · El documento aprobado */}
      <Bloque n={2} titulo="Documento aprobado">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="N° de documento">
            <input value={f.planNumber} onChange={(e) => set("planNumber", e.target.value)} placeholder="PO 12" className={cls} />
          </Field>
          {pideCampo(f.planType, "tituloHabilitante") && (
            <Field label="Título habilitante">
              <input value={f.tituloHabilitante} onChange={(e) => set("tituloHabilitante", e.target.value)} placeholder="17-CPO/C-J-001-02" className={cls} />
            </Field>
          )}
          <Field label="N° resolución">
            <input value={f.resolucionNumber} onChange={(e) => set("resolucionNumber", e.target.value)} placeholder="RDF N° 001-2026..." className={cls} />
          </Field>
          <Field label="Fecha resolución">
            <input type="date" value={f.resolucionDate} onChange={(e) => set("resolucionDate", e.target.value)} className={cls} />
          </Field>
          <Field label="ARFFS que aprobó">
            <SelectConOtra
              className={cls}
              valor={f.arffs}
              opciones={arffsUsadas}
              textoOtra="Otra autoridad…"
              placeholder="ATFFS Selva Central"
              onCambio={(v) => set("arffs", v)}
            />
          </Field>
        </div>
      </Bloque>

      {/* 3 · Quién responde: titular y regente */}
      <Bloque n={3} titulo="Titular y regente" accion={
        <DirectorioPicker
          rol="proveedor"
          label="Traer del Directorio"
          ayuda="La misma libreta del Libro CTP: comunidades, empresas y propietarios."
          conPermisos
          contratos={contratos}
          onElegir={traerDelDirectorio}
        />
      }>
        {permiso && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--data-info-100)] bg-[var(--data-info-50)] px-3 py-2 dark:border-[var(--data-info-500)]/30 dark:bg-[var(--data-info-500)]/10">
            <FileText className="h-4 w-4 shrink-0 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]" aria-hidden="true" />
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
              Bajo el permiso
            </span>
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{permiso.codigo}</span>
            {permiso.tipo && <span className="text-xs text-[var(--text-secondary)]">{TIPO_LABEL[permiso.tipo]}</span>}
            <span className={`text-xs tabular-nums ${areaDelPermiso(permiso) ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}`}>
              {areaDelPermiso(permiso) ?? "sin área de manejo cargada"}
            </span>
            <button
              type="button"
              onClick={soltarPermiso}
              className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              aria-label="Dejar de declarar este plan bajo ese permiso"
              title="Soltar el permiso (lo ya cargado se queda)"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
            {traidos.length > 0 && (
              <span className="w-full text-xs text-[var(--text-tertiary)]">
                Del permiso se completaron: {traidos.join(", ")}. Lo que ya estaba escrito no se tocó.
              </span>
            )}
            {!habilitaPlanDeManejo(permiso) && (
              <span className="w-full text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                Ojo: ese papel es comercial, no habilita a aprovechar bosque. Revisá si el plan va bajo otro título.
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="Titular *">
            <input value={f.titularName} onChange={(e) => set("titularName", e.target.value)} placeholder="Maderera ... SAC" required className={cls} />
          </Field>
          <Field label="Representante legal">
            <input value={f.representanteLegal} onChange={(e) => set("representanteLegal", e.target.value)} placeholder="Si el titular es empresa" className={cls} />
          </Field>
          <Field label={`Regente forestal${meta.regente === "obligatorio" ? " *" : ""}`}>
            <input value={f.regenteName} onChange={(e) => set("regenteName", e.target.value)} placeholder="Ing. ..." className={cls} />
          </Field>
          <Field label="N° de registro SERFOR">
            <input value={f.regenteRegistro} onChange={(e) => set("regenteRegistro", e.target.value)} placeholder="RNR-0000" className={`${cls} font-mono`} />
          </Field>
          <Field label="Especialidad del regente">
            <select value={f.regenteEspecialidad} onChange={(e) => set("regenteEspecialidad", e.target.value)} className={cls}>
              {ESPECIALIDADES_REGENTE.map((x) => (
                <option key={x.key} value={x.key}>{x.label}</option>
              ))}
            </select>
          </Field>
          {/* El dueño del predio no siempre es el titular del permiso: en un
              PMFI el papel está a nombre del propietario y quien opera es otro.
              Sin este campo, ese nombre vive en un cuaderno. */}
          <Field label="Propietario del predio">
            <input value={f.propietarioNombre} onChange={(e) => set("propietarioNombre", e.target.value)} placeholder="Si no es el titular" className={cls} />
          </Field>
          <Field label="Su documento">
            <div className="flex gap-1.5">
              <select value={f.propietarioDocTipo} onChange={(e) => set("propietarioDocTipo", e.target.value)} className={`${cls} w-28 shrink-0`}>
                {DOC_TIPOS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input value={f.propietarioDoc} onChange={(e) => set("propietarioDoc", e.target.value)} className={`${cls} font-mono`} />
            </div>
          </Field>
          <Field label="Apodo del plan">
            <input value={f.alias} onChange={(e) => set("alias", e.target.value)} placeholder="«el de Puerto Inca»" className={cls} />
          </Field>
        </div>
        {faltaRegente && (
          <p className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-100)] px-3 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Un {meta.sigla} lo elabora e implementa un regente forestal, y es quien firma el informe de ejecución junto
            al titular. Puedes guardar sin cargarlo, pero va a faltar en el expediente.
          </p>
        )}
      </Bloque>

      {/* 4 · Dónde y hasta cuándo */}
      <Bloque
        n={4}
        titulo="Área y vigencia"
        ayuda={
          meta.vigenciaTipicaAnios != null
            ? {
                what: `Un ${meta.sigla} suele aprobarse por ${meta.vigenciaTipicaAnios} año${meta.vigenciaTipicaAnios === 1 ? "" : "s"}.`,
                example: "Carga las fechas de tu resolución, no las típicas.",
              }
            : undefined
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <LothPlanFormUbicacion
            valores={{ region: f.region, provincia: f.provincia, distrito: f.distrito, sector: f.sector, cuenca: f.cuenca }}
            onCambio={(cambios) => setF((p) => ({ ...p, ...cambios }))}
          />
          {pideCampo(f.planType, "parcelaCorta") && (
            <Field label="Parcela de corta">
              <input value={f.parcelaCorta} onChange={(e) => set("parcelaCorta", e.target.value)} placeholder="PC 12" className={cls} />
            </Field>
          )}
          <Field label="Área (ha)">
            <input type="number" step="0.01" value={f.areaHa} onChange={(e) => set("areaHa", e.target.value)} className={cls} />
          </Field>
          <Field label="Vigencia desde">
            <input type="date" value={f.vigenciaDesde} onChange={(e) => set("vigenciaDesde", e.target.value)} className={cls} />
          </Field>
          <Field label="Vigencia hasta">
            <input type="date" value={f.vigenciaHasta} onChange={(e) => set("vigenciaHasta", e.target.value)} className={cls} />
          </Field>
        </div>
      </Bloque>

      {/* 5 · Lo que el plan ya guardaba y nadie preguntaba */}
      <LothPlanFormCosteo
        valores={{
          uitRef: f.uitRef,
          costoExtraccionM3: f.costoExtraccionM3,
          costoTransformacionM3: f.costoTransformacionM3,
          costoFleteM3: f.costoFleteM3,
          estado: f.estado,
          notes: f.notes,
        }}
        onCambio={(k: keyof CamposDeCosteo, v: string) => set(k, v)}
      />

      {/* 6 · Lo que este negocio necesita y el formulario no previó (ADR-427) */}
      <CamposPersonalizados
        formulario={FORMULARIO}
        registroId={plan?.id ?? null}
        etiquetaFormulario="planes de manejo"
        pendientes={camposPendientes}
        onPendientes={setCamposPendientes}
      />

      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
        <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!puedeGuardar}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editando ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editando ? "Guardar cambios" : `Crear ${meta.sigla}`}
        </button>
      </div>
    </form>
  );
}

/** Un paso del formulario, numerado: el alta tiene un orden, no doce campos sueltos. */
function Bloque({
  n,
  titulo,
  children,
  accion,
  ayuda,
}: {
  n: number;
  titulo: string;
  children: React.ReactNode;
  /** Algo a la derecha del título (por ejemplo, traer datos del Directorio). */
  accion?: React.ReactNode;
  /** Consejo del bloque, en el ⓘ junto al título (Brandon 2026-09-24: nada de párrafos sueltos). */
  ayuda?: { what: React.ReactNode; example?: React.ReactNode };
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
              {n}
            </span>
            {titulo}
          </CardTitle>
          {ayuda && <InfoTip icono="ayuda" title={titulo} what={ayuda.what} example={ayuda.example} />}
        </span>
        {accion}
      </div>
      {children}
    </section>
  );
}
