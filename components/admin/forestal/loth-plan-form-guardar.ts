/**
 * El envío del formulario del plan (`LothPlanForm`): POST del alta —o PATCH al
 * editar y al reintentar un alta ya creada— y después lo que cuelga del plan:
 * especies, permiso, campos personalizados y documentos. Es el `submit` que
 * vivía en el componente, sin cambios: recibe en `ctx` la foto de ese render.
 */

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import type { Contrato } from "@/lib/forestal/contratos";
import { guardarValoresPendientes, pendientesVacios, type PendientesCampos } from "@/components/admin/shared/CamposPersonalizados";
import {
  guardarDocumentosPendientes,
  hayDocumentosPendientes,
  type PasoGuardado,
  type PendientesDocumentos,
} from "./plan-documentos/pendientes";
import { aEspecieParaGuardar, agregarVarias, type FilaEspecie } from "./loth-plan-especies-api";
import type { Plan } from "./loth-plan-shared";
import { pideCampo } from "@/lib/forestal/loth-tipos-plan";
import { FORMULARIO, type FormularioPlan } from "./loth-plan-form-shared";

/** Lo que el envío lee y escribe del formulario, tal como estaba en el render del clic. */
export interface ContextoEnvioPlan {
  f: FormularioPlan;
  plan?: Plan | null;
  creadoId: string | null;
  puedeGuardar: boolean;
  especiesMal: boolean;
  especiesConDatos: FilaEspecie[];
  permiso: Contrato | null;
  camposPendientes: PendientesCampos;
  docsPend: PendientesDocumentos;
  actualizarPermiso: ReturnType<typeof usePermisosForestal>["actualizar"];
  onSaved: (planId?: string) => void;
  setErr: Dispatch<SetStateAction<string | null>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setIntentoGuardar: Dispatch<SetStateAction<boolean>>;
  setCreadoId: Dispatch<SetStateAction<string | null>>;
  setCamposPendientes: Dispatch<SetStateAction<PendientesCampos>>;
  setDocsPend: Dispatch<SetStateAction<PendientesDocumentos>>;
  setPasoDocs: Dispatch<SetStateAction<PasoGuardado | null>>;
}

export async function enviarPlan(e: FormEvent, ctx: ContextoEnvioPlan) {
  const {
    f, plan, creadoId, puedeGuardar, especiesMal, especiesConDatos, permiso, camposPendientes, docsPend,
    actualizarPermiso, onSaved, setErr, setBusy, setIntentoGuardar, setCreadoId, setCamposPendientes,
    setDocsPend, setPasoDocs,
  } = ctx;
  e.preventDefault();
  if (!puedeGuardar) return;
  setIntentoGuardar(true);
  if (especiesMal) {
    setErr("Hay especies a medio cargar o repetidas: complétalas o quítalas antes de guardar.");
    return;
  }
  setBusy(true);
  setErr(null);
  try {
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) body[k] = v === "" ? null : v;
    body.titularName = f.titularName.trim();
    // Editar manda el id y va por PATCH; el resto del cuerpo es idéntico.
    // El reintento de un alta ya creada también: es el mismo plan.
    const idExistente = plan?.id ?? creadoId;
    if (idExistente) body.id = idExistente;
    // Lo que este tipo no usa no se manda: un campo escondido que igual viaja
    // deja datos que la pantalla nunca va a mostrar.
    if (!pideCampo(f.planType, "parcelaCorta")) body.parcelaCorta = null;
    if (!pideCampo(f.planType, "tituloHabilitante")) body.tituloHabilitante = null;
    /* El registro y sus especies viajan JUNTOS: el servidor los crea en una
       transacción, y una plantación nunca queda a medias sin su base. */
    /* En el reintento ya entraron con el POST (el PATCH las ignora y
       agregarlas de nuevo daba «ya existe»). */
    const paraGuardar = idExistente ? [] : especiesConDatos.map(aEspecieParaGuardar);
    if (paraGuardar.length > 0) body.species = paraGuardar;
    const r = await fetch("/api/admin/forestal/plan", {
      method: idExistente ? "PATCH" : "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify(body),
    });
    const creado = (await r.json().catch(() => ({}))) as {
      plan?: { id?: string }; species?: unknown; message?: string; issues?: { message?: string }[];
    };
    /* El rechazo de una especie («Bolaina ya está en la fila 1») viene en
       `issues`: decirlo vale más que un «HTTP 400». */
    if (!r.ok) throw new Error(creado.message ?? creado.issues?.find((i) => i.message)?.message ?? `HTTP ${r.status}`);
    const idPlan = idExistente ?? creado.plan?.id;
    if (!plan && idPlan && !creadoId) setCreadoId(idPlan);
    /* Un servidor que todavía no conoce `species` las ignora y devuelve sólo
       el plan: entonces se agregan de a una, como lo haría la pestaña
       Registro. Si alguna no entra, el plan YA existe: se dice cuál falta. */
    if (paraGuardar.length > 0 && creado.plan?.id && !Array.isArray(creado.species)) {
      const { errores } = await agregarVarias(creado.plan.id, paraGuardar);
      if (errores.length > 0) {
        setErr(`El registro se creó, pero ${errores.length === 1 ? "una especie no entró" : `${errores.length} especies no entraron`}: ${errores.join(" · ")}. Agrégalas en la pestaña Registro y saldo.`);
        setBusy(false);
        return;
      }
    }
    /* El permiso y su documento de gestión quedan atados: `ForestContrato.planId`
       existía desde ADR-421 y ninguna pantalla lo llenaba (0 de 6 medidos).
       Si falla, el plan YA está creado: se avisa, no se pierde el alta. */
    if (permiso && idPlan) {
      const atado = await actualizarPermiso(permiso.id, { planId: idPlan });
      if (atado.error) {
        setErr(`El plan se creó, pero no se pudo atar al permiso ${permiso.codigo}: ${atado.error}`);
        setBusy(false);
        return;
      }
    }
    /* Los campos personalizados cargados durante el alta se guardan recién
       acá: antes no había registro al que colgarlos. Si fallan, el plan YA
       está creado — se avisa y no se pierde el alta. */
    if (idPlan) {
      const r = await guardarValoresPendientes(idPlan, camposPendientes);
      if (r.errores.length > 0) {
        setErr(`El plan se guardó, pero sus campos personalizados no: ${r.errores.join(" · ")}`);
        setBusy(false);
        return;
      }
      // Ya entraron: el reintento no los vuelve a crear («ya existe»).
      setCamposPendientes(pendientesVacios(FORMULARIO));
    }
    /* Los documentos del alta: preparar carpetas → subir → etiquetar. Lo que
       entra sale de los pendientes; lo que falla queda con su motivo y el
       modal sigue abierto con «Reintentar». */
    if (idPlan && !plan && hayDocumentosPendientes(docsPend)) {
      const r = await guardarDocumentosPendientes(idPlan, docsPend, setPasoDocs);
      setDocsPend(r.restante);
      setPasoDocs(null);
      if (r.errores.length > 0) {
        const faltan = r.restante.archivos.length;
        setErr(
          `El plan se guardó${r.subidos > 0 ? ` y subieron ${r.subidos} ${r.subidos === 1 ? "archivo" : "archivos"}` : ""}` +
            `${faltan > 0 ? `, pero ${faltan} ${faltan === 1 ? "archivo no" : "archivos no"}` : ", pero algo no entró"}: ${r.errores.join(" · ")}. ` +
            "Toca «Reintentar» para mandar sólo lo que faltó.",
        );
        setBusy(false);
        return;
      }
    }
    onSaved(idPlan);
  } catch (e) {
    setErr(e instanceof Error ? e.message : String(e));
    setBusy(false);
  }
}
