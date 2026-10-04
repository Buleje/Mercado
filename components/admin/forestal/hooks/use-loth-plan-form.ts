"use client";

/**
 * Estado y reglas del formulario del plan (`LothPlanForm`): los campos, el
 * permiso elegido y la propuesta del permiso del libro, las especies de una
 * plantación, el lector de la constancia, «copiar de un plan anterior» y el
 * envío (`loth-plan-form-guardar.ts`). El componente y sus bloques sólo dibujan.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import type { Parte } from "@/lib/forestal/directorio";
import type { Contrato } from "@/lib/forestal/contratos";
import { completarPlanDesdeDirectorio, opcionesEscritas } from "@/lib/forestal/permisos-de-parte";
import { pendientesVacios, type PendientesCampos } from "@/components/admin/shared/CamposPersonalizados";
import { copiarDePlanPrevio, etiquetaPlanPrevio, type PlanPrevio } from "@/lib/forestal/loth-plan-alta";
import {
  documentosVacios,
  hayDocumentosPendientes,
  type PasoGuardado,
  type PendientesDocumentos,
} from "../plan-documentos/pendientes";
import { useLothPermiso } from "./use-loth-libro-permiso";
import { filaDesdeLeida, useLectorConstancia } from "./use-lector-constancia";
import { completarPlanDesdeConstancia, sumarEspeciesLeidas } from "@/lib/forestal/loth-constancia-ocr";
import { especiesRepetidas, filaEnBlanco, filaVacia, problemaDeFila, type FilaEspecie } from "../loth-plan-especies-api";
import type { Plan } from "../loth-plan-shared";
import { esTipoPlantacion, especialidadSugerida, metaDe, rotulosDe, type TipoPlan } from "@/lib/forestal/loth-tipos-plan";
import { FORMULARIO, REGION_POR_DEFECTO, desdePlan, formularioVacio, type FormularioPlan } from "../loth-plan-form-shared";
import { enviarPlan } from "../loth-plan-form-guardar";

export function useLothPlanForm({
  plan,
  planesPrevios,
  onSaved,
  onEstadoCierre,
}: {
  plan?: Plan | null;
  planesPrevios: readonly PlanPrevio[];
  onSaved: (planId?: string) => void;
  onEstadoCierre?: (e: { pendientes: boolean; ocupado: boolean; creado: boolean }) => void;
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
  /* «Documentos» (ADR-467): en un alta, los archivos con su carpeta y su
     casillero quedan en memoria hasta que el plan tenga id. */
  const [docsPend, setDocsPend] = useState<PendientesDocumentos>(documentosVacios);
  const [pasoDocs, setPasoDocs] = useState<PasoGuardado | null>(null);
  const [subiendoEnEdicion, setSubiendoEnEdicion] = useState(false);
  /* El plan que este alta YA creó. Si después falla algo (una especie, el
     permiso, un archivo), «Reintentar» manda un PATCH a este id: volver a hacer
     POST duplicaba el plan. */
  const [creadoId, setCreadoId] = useState<string | null>(null);
  const hayDocsPendientes = hayDocumentosPendientes(docsPend);
  useEffect(() => {
    onEstadoCierre?.({ pendientes: hayDocsPendientes, ocupado: busy || subiendoEnEdicion, creado: creadoId != null });
  }, [onEstadoCierre, hayDocsPendientes, busy, subiendoEnEdicion, creadoId]);
  /**
   * Las especies del registro de una plantación, en el ALTA (ADR-459). Viven
   * fuera de `f` a propósito: `desdePlan` copia el plan campo por campo y su
   * test compara las claves con `formularioVacio` — las especies no son un
   * campo del plan, son filas propias.
   */
  const [especies, setEspecies] = useState<FilaEspecie[]>(() => [filaVacia()]);
  /** Recién después del primer «Crear» se marcan en rojo las filas a medias. */
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  /** Las filas que entraron leyendo la constancia: se marcan para revisarlas contra el papel. */
  const [filasLeidas, setFilasLeidas] = useState<ReadonlySet<string>>(() => new Set());

  /* Los permisos, una sola vez para el formulario y su picker: dos consultas de
     la misma lista en la misma pantalla pueden contestar distinto. */
  const { contratos, actualizar: actualizarPermiso } = usePermisosForestal();
  /* El plan elegido en el chip del libro, si está atado a un permiso del
     Directorio: en un ALTA se propone el mismo permiso (02-10-2026). Sólo se
     propone mientras no se haya elegido uno a mano ni descartado la propuesta. */
  const libroPermiso = useLothPermiso();
  const [propuestaDescartada, setPropuestaDescartada] = useState(false);
  const planDelLibro = libroPermiso?.plan ?? null;
  const contratoDelLibro =
    !editando && !permiso && !propuestaDescartada && planDelLibro?.contratoId
      ? (contratos.find((c) => c.id === planDelLibro.contratoId) ?? null)
      : null;
  const arffsUsadas = useMemo(
    () => opcionesEscritas([...contratos.map((c) => c.arffs), ...planesPrevios.map((p) => p.arffs), f.arffs]),
    [contratos, planesPrevios, f.arffs],
  );

  const meta = metaDe(f.planType);
  const rot = rotulosDe(f.planType);
  const esPlantacion = esTipoPlantacion(f.planType);
  /** Sólo un ALTA de plantación manda especies: al editar se corrigen en la pestaña Registro. */
  const llevaEspecies = esPlantacion && !editando;
  const especiesConDatos = llevaEspecies ? especies.filter((x) => !filaEnBlanco(x)) : [];
  const especiesMal = especiesConDatos.some((x) => problemaDeFila(x) != null) || especiesRepetidas(especiesConDatos).length > 0;

  /**
   * «Leer la constancia» (ronda 3 de ADR-459): completa lo VACÍO —como copiar
   * de un plan anterior—, completa las celdas vacías de las especies ya
   * escritas y agrega como filas nuevas las que no estaban. Las reglas viven
   * en el módulo puro, que las prueba sin navegador; acá sólo se aplican y se
   * devuelve qué se hizo para decirlo.
   */
  const lector = useLectorConstancia((l) => {
    const { campos, completados, avisos } = completarPlanDesdeConstancia(f, l, { regionPorDefecto: REGION_POR_DEFECTO });
    const suma = sumarEspeciesLeidas(especies, l.especies, filaDesdeLeida, filaEnBlanco);
    setF(campos);
    if (suma.uidsLeidos.length > 0) {
      setEspecies(suma.filas);
      setFilasLeidas((prev) => new Set([...prev, ...suma.uidsLeidos]));
    }
    return { completados, especies: suma.nuevas, especiesCompletadas: suma.completadas, yaEstaban: suma.yaEstaban, avisos, nota: l.nota };
  }, llevaEspecies);

  const faltaRegente = meta.regente === "obligatorio" && f.regenteName.trim().length < 2;
  const puedeGuardar = f.titularName.trim().length >= 2 && !busy;
  /* La vigencia de una plantación es opcional y va plegada; abierta si ya trae fechas. */
  const [vigenciaAbierta, setVigenciaAbierta] = useState(() => Boolean(f.vigenciaDesde || f.vigenciaHasta));

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

  /** «Usar» el permiso del plan del libro: lo mismo que elegirlo en el Directorio, sin pisar lo escrito. */
  function usarPermisoDelLibro(c: Contrato) {
    const { campos, completados } = completarPlanDesdeDirectorio(
      f,
      // Sin nombre si ya hay titular escrito: `completarPlanDesdeDirectorio` pondría el del permiso encima.
      { nombre: f.titularName.trim() ? "" : c.titularNombre },
      c,
      { tipoTocado, regionPorDefecto: REGION_POR_DEFECTO },
    );
    setF({ ...campos, contratoId: c.id });
    setPermiso(c);
    setTraidos(completados);
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

  function submit(e: FormEvent) {
    return enviarPlan(e, {
      f, plan, creadoId, puedeGuardar, especiesMal, especiesConDatos, permiso, camposPendientes, docsPend,
      actualizarPermiso, onSaved, setErr, setBusy, setIntentoGuardar, setCreadoId, setCamposPendientes,
      setDocsPend, setPasoDocs,
    });
  }

  return {
    editando, f, setF, set, busy, err, permiso, traidos, copiadoDe, menuCopiar, setMenuCopiar,
    camposPendientes, setCamposPendientes, docsPend, setDocsPend, pasoDocs, setSubiendoEnEdicion, creadoId,
    especies, setEspecies, intentoGuardar, filasLeidas, contratos, planDelLibro, contratoDelLibro,
    setPropuestaDescartada, arffsUsadas, meta, rot, esPlantacion, llevaEspecies, lector, faltaRegente,
    puedeGuardar, vigenciaAbierta, setVigenciaAbierta, traerDelDirectorio, copiarDe, usarPermisoDelLibro,
    soltarPermiso, elegirTipo, submit,
  };
}

/** Todo lo que el formulario dibuja: cada bloque lo recibe entero y toma lo suyo. */
export type LothPlanFormEstado = ReturnType<typeof useLothPlanForm>;
