/**
 * useLothPlanView — el estado de la vista del plan de manejo (`LothPlanView`).
 *
 * Salió tal cual de la vista: la pestaña recordada (una clave para bosque y
 * otra para plantación), los pedidos a «Especies» y al censo, el cierre del
 * formulario con archivos sin subir, la baja del plan que avisa qué cuelga de
 * él y los documentos (ADR-467). Los datos y las cuentas siguen en
 * `use-loth-plan`; el menú y las pestañas, en `loth-plan-view-shared`.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { csrfHeaders } from "@/lib/csrf-client";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatNumber } from "@/lib/format";
import { siglaDePlan } from "@/lib/forestal/loth-tipos-plan";
import type { PedidoEspecie, PedidoLote } from "../LothPlanEspecies";
import { PESTANAS_PLAN, PESTANAS_PLANTACION, type PestanaPlan } from "../LothPlanPestanas";
import { CLAVE_PESTANA_PLAN, CLAVE_PESTANA_PLANTACION, opcionesDelPlan, pestanasDelPlan } from "../loth-plan-view-shared";
import { loQueFalta } from "../plan-documentos/modelo";
import { useAutorizarDesdeUrl } from "./use-autorizar-desde-url";
import { useLothPlan } from "./use-loth-plan";
import { usePlanDocumentos } from "./use-plan-documentos";

export function useLothPlanView(reloadSignal?: number) {
  const d = useLothPlan(reloadSignal);
  const { trees, zafra } = d;
  /* El plan se muestra cuando llegó SU detalle: con sólo la lista de planes la
     cabecera decía «0 m³ autorizados» y el plan de tala no aparecía. */
  const plan = d.detalleListo ? d.plan : null;
  const cargando = d.loading || (d.plan != null && !d.detalleListo);
  const [pestanaBosque, setPestanaBosque] = useLocalStorage<PestanaPlan>(CLAVE_PESTANA_PLAN, "avance");
  const [pestanaPlantacion, setPestanaPlantacion] = useLocalStorage<PestanaPlan>(CLAVE_PESTANA_PLANTACION, "registro");
  const esPlantacion = d.esPlantacion;
  const setPestana = esPlantacion ? setPestanaPlantacion : setPestanaBosque;
  const validas = esPlantacion ? PESTANAS_PLANTACION : PESTANAS_PLAN;
  const pestanaGuardada = esPlantacion ? pestanaPlantacion : pestanaBosque;
  const [pedidoEspecie, setPedidoEspecie] = useState<PedidoEspecie | null>(null);
  const [importarSignal, setImportarSignal] = useState(0);
  /** El plan abierto para corregir sus datos (ADR-426). */
  const [editandoPlan, setEditandoPlan] = useState(false);
  const [borrandoPlan, setBorrandoPlan] = useState(false);
  const [errorPlan, setErrorPlan] = useState<string | null>(null);
  const { confirm } = useConfirm();
  /* Documentos del plan (ADR-467): una sola instancia para la pestaña y su cifra. */
  const docs = usePlanDocumentos({ planId: plan?.id ?? null, activo: plan != null });
  const faltaDocs = useMemo(() => loQueFalta(docs.carpetas), [docs.carpetas]);
  /* Un valor viejo o tocado a mano en el navegador no deja la vista sin panel
     (tampoco «documentos» en un despliegue donde esa pestaña no está). */
  const pestana: PestanaPlan =
    validas.includes(pestanaGuardada) && (pestanaGuardada !== "documentos" || docs.disponible) ? pestanaGuardada : validas[0];

  /* Cerrar el formulario del plan con archivos cargados sin subir pregunta
     antes; con algo subiendo, no se cierra (cortaría la subida a la mitad). */
  const cierreRef = useRef({ pendientes: false, ocupado: false, creado: false });
  const onEstadoCierre = useCallback((e: { pendientes: boolean; ocupado: boolean; creado: boolean }) => {
    cierreRef.current = e;
  }, []);
  async function cerrarFormulario(cerrar: () => void) {
    const { pendientes, ocupado, creado } = cierreRef.current;
    if (ocupado) return;
    if (pendientes) {
      const ok = await confirm({
        title: "¿Cerrar sin subir los documentos?",
        description: creado
          ? "El plan ya se guardó. Los archivos que no subieron se descartan: puedes subirlos después desde su pestaña «Documentos»."
          : "Cargaste archivos que se suben al guardar el plan. Si cierras ahora, se descartan.",
        intent: "warning",
        confirmLabel: "Cerrar y descartarlos",
      });
      if (!ok) return;
    }
    cierreRef.current = { pendientes: false, ocupado: false, creado: false };
    cerrar();
    /* Un alta que creó el plan y falló en un archivo no pasó por `onSaved`:
       sin recargar, el plan recién creado no aparecía en el selector. */
    if (creado) d.loadPlans();
  }

  const pedirEspecie = (id: string, accion: PedidoEspecie["accion"]) =>
    setPedidoEspecie((p) => ({ id, accion, n: (p?.n ?? 0) + 1 }));

  /* «Cargar lo autorizado» desde «Cupo por especie» (`?autorizar=`). */
  const [pedidoLote, setPedidoLote] = useState<PedidoLote | null>(null);
  useAutorizarDesdeUrl({
    plans: d.plans,
    planId: d.planId,
    setPlanId: d.setPlanId,
    onAbrir: (especie) => {
      setPestana("especies");
      setPedidoLote((p) => ({ especie, n: (p?.n ?? 0) + 1 }));
    },
  });

  /**
   * Eliminar un plan cargado por error — diciendo ANTES qué se lleva puesto.
   *
   * Brandon (2026-09-21): «en el menú también tiene que tener los detalles de
   * datos que alojó ese plan de manejo, para saber qué estoy eliminando». Un
   * plan con 600 árboles censados y 12 asientos del libro no es lo mismo que
   * uno cargado hace un minuto, y el diálogo tiene que decir la diferencia con
   * el número real, no con una advertencia genérica.
   *
   * La baja es lógica: los asientos y las guías que lo citan son lo que se
   * declara ante la ARFFS y no se tocan.
   */
  async function eliminarPlan(p: NonNullable<typeof plan>) {
    setBorrandoPlan(true);
    try {
      const r = await fetch(`/api/admin/forestal/plan?planId=${encodeURIComponent(p.id)}&usos=1`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await r.json().catch(() => ({}))) as { usos?: Record<string, number | null> };
      const u = j.usos ?? {};
      /* Una plantación no tiene especies «autorizadas» ni árboles «censados». */
      const base = esPlantacion ? "registrada" : "autorizada";
      const marcado = esPlantacion ? "marcado" : "censado";
      const partes = [
        u.especies ? `${u.especies} ${u.especies === 1 ? `especie ${base}` : `especies ${base}s`}` : null,
        u.censo ? `${u.censo} ${u.censo === 1 ? `árbol ${marcado}` : `árboles ${marcado}s`}` : null,
        u.asientos ? `${u.asientos} ${u.asientos === 1 ? "asiento del libro" : "asientos del libro"}` : null,
        u.guias ? `${u.guias} ${u.guias === 1 ? "guía emitida" : "guías emitidas"}` : null,
        u.contratos ? `${u.contratos} ${u.contratos === 1 ? "permiso atado" : "permisos atados"}` : null,
      ].filter(Boolean);
      /* El volumen autorizado va aparte: es la cifra que dice de qué tamaño era
         el plan. `null` (sin especies cargadas) NO es 0 m³ y no se muestra. */
      const vol = typeof u.volumenAutorizadoM3 === "number" ? ` ${esPlantacion ? "Registraba" : "Autorizaba"} ${formatNumber(Number(u.volumenAutorizadoM3), 3)} m³.` : "";
      const detalle = partes.length
        ? `Tiene ${partes.join(", ")}.${vol} Nada de eso se borra: el plan deja de aparecer en el selector y lo que ya se declaró sigue igual.`
        : `No tiene especies, ${esPlantacion ? "árboles marcados" : "censo"}, asientos ni guías: se puede sacar sin dejar nada suelto.${vol}`;
      const ok = await confirm({
        title: `¿Eliminar ${siglaDePlan(p.planType)} ${p.planNumber ?? ""}?`.replace(/\s+\?/, "?"),
        description: `${p.titularName}. ${detalle}`,
        intent: "danger",
        confirmLabel: "Sí, eliminar",
      });
      if (!ok) return;
      const del = await fetch(`/api/admin/forestal/plan?id=${encodeURIComponent(p.id)}`, {
        method: "DELETE",
        headers: csrfHeaders(),
        credentials: "include",
      });
      if (!del.ok) {
        const e = (await del.json().catch(() => ({}))) as { message?: string; error?: string };
        setErrorPlan(e.message ?? e.error ?? `No se pudo eliminar (HTTP ${del.status})`);
        return;
      }
      setErrorPlan(null);
      d.setPlanId(null);
      d.loadPlans();
    } catch (e) {
      setErrorPlan(e instanceof Error ? e.message : String(e));
    } finally {
      setBorrandoPlan(false);
    }
  }

  const opciones = opcionesDelPlan({
    d, plan, esPlantacion, borrandoPlan, setErrorPlan, setPestana, setImportarSignal, setEditandoPlan, eliminarPlan,
  });
  const { pestanas, pestanasPlantacion } = pestanasDelPlan({ d, docs, faltaDocs });
  const conPeriodo = zafra.estado !== "sin_vigencia";

  return {
    d, trees, zafra, plan, cargando, esPlantacion, pestana, setPestana, setPestanaPlantacion,
    pedidoEspecie, pedirEspecie, pedidoLote, importarSignal, editandoPlan, setEditandoPlan, errorPlan,
    docs, cerrarFormulario, onEstadoCierre, opciones, pestanas, pestanasPlantacion, conPeriodo,
  };
}

export type VistaPlan = ReturnType<typeof useLothPlanView>;
