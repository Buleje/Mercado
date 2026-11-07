/**
 * El plan recién guardado queda ATADO a la ficha de su titular (ADR-518).
 *
 * La ficha del Directorio es la entidad (una por comunidad o empresa); sus
 * planes de manejo son N y se cargan acá, en el alta del plan. Lo que los une
 * es el permiso (`ForestContrato`): `titularId` = la ficha, `planId` = el plan,
 * y del lado del plan `contratoId` = el permiso. Así la ficha lista sus planes
 * sin adivinar por nombre.
 *
 * - Con un permiso elegido: se le pone el plan (y la ficha, si no tenía dueño).
 * - Sin permiso elegido pero con el plan ya colgado de uno (`f.contratoId`, al
 *   editar): ése ES su permiso. Sólo se le pone la ficha si no tenía dueño;
 *   nunca se crea otro (revisión ADR-518: creaba uno nuevo y el plan saltaba
 *   de permiso sin aviso, o caía en un 409 `plan_ocupado` sin salida).
 * - Sin permiso, con la ficha traída del Directorio: se crea el permiso con el
 *   código del plan. Si ese código ya era un permiso libre, se usa ése (el
 *   servidor responde 409 con el existente); si es de otra ficha o de otro
 *   plan, no se toca.
 * - Sin código (ni título habilitante ni N° de registro) no se inventa nada: el
 *   plan queda ligado por el nombre, como antes.
 * - Si el titular escrito ya no es exactamente el de la ficha (misma clave sin
 *   tildes ni mayúsculas), no se ata salvo que se haya tocado «Atar igual».
 *
 * Devuelve el mensaje de error o `null`. Si falla, el plan YA está guardado:
 * «Reintentar» lo repite y es idempotente (el 409 devuelve el mismo permiso).
 */

import { csrfHeaders } from "@/lib/csrf-client";
import type { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import type { Contrato, ContratoInput } from "@/lib/forestal/contratos";
import type { Parte } from "@/lib/forestal/directorio";
import { permisoDesdePlan, planDesdeLaFicha, sigueSiendoElTitular } from "@/lib/forestal/directorio-planes";
import { completarPlanDesdeDirectorio } from "@/lib/forestal/permisos-de-parte";
import { REGION_POR_DEFECTO, formularioVacio, type FormularioPlan } from "./loth-plan-form-shared";
import type { AltaDePlanPedida } from "./hooks/loth-plan-alta-pedida";

type Permisos = ReturnType<typeof usePermisosForestal>;

export interface AtarAlTitular {
  idPlan: string;
  f: FormularioPlan;
  permiso: Contrato | null;
  /** La ficha que se trajo del Directorio (o con la que se pidió el alta). */
  titular: Parte | null;
  /** «Atar igual»: el titular escrito cambió, pero se confirmó que es esa ficha. */
  atarIgual?: boolean;
  /** Los permisos del negocio: el del plan (`f.contratoId`) se busca acá. */
  contratos: readonly Contrato[];
  crear: Permisos["crear"];
  actualizar: Permisos["actualizar"];
  /** Sin la spec de permisos (403) no se crea nada: el plan queda como antes. */
  disponible: boolean;
}

async function atarElPlanAlPermiso(idPlan: string, contratoId: string): Promise<number | null> {
  try {
    const r = await fetch("/api/admin/forestal/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      credentials: "include",
      body: JSON.stringify({ id: idPlan, contratoId }),
    });
    return r.ok ? null : r.status;
  } catch {
    return 0;
  }
}

export async function atarPlanAlTitular(ctx: AtarAlTitular): Promise<string | null> {
  const { idPlan, f, permiso, titular, atarIgual = false, contratos, crear, actualizar, disponible } = ctx;
  // Si el titular se cambió a mano después de traerlo, ya no es esa ficha (salvo «Atar igual»).
  const ficha = titular && (atarIgual || sigueSiendoElTitular(f.titularName, titular)) ? titular : null;

  if (permiso) {
    const cambios: Partial<ContratoInput> = { planId: idPlan };
    if (ficha && !permiso.titularId) {
      cambios.titularId = ficha.id;
      cambios.titularDoc = permiso.titularDoc ?? ficha.docNumero;
      cambios.titularDocTipo = permiso.titularDocTipo ?? ficha.docTipo;
    }
    const r = await actualizar(permiso.id, cambios);
    return r.error ? `El plan se creó, pero no se pudo atar al permiso ${permiso.codigo}: ${r.error}` : null;
  }

  if (f.contratoId) {
    // El plan ya cuelga de un permiso: no se crea otro ni se mueve el plan.
    const delPlan = contratos.find((c) => c.id === f.contratoId);
    if (!ficha || !delPlan || delPlan.titularId) return null;
    const r = await actualizar(delPlan.id, {
      titularId: ficha.id,
      titularDoc: delPlan.titularDoc ?? ficha.docNumero,
      titularDocTipo: delPlan.titularDocTipo ?? ficha.docTipo,
    });
    return r.error ? `El plan se guardó, pero no quedó atado a la ficha de ${ficha.nombre}: ${r.error}` : null;
  }

  if (!ficha || !disponible) return null;
  const input = permisoDesdePlan(f, ficha, idPlan);
  if (!input) return null;
  const alta = await crear(input);
  const fallo = (motivo: string) =>
    `El plan se guardó, pero no quedó atado a la ficha de ${ficha.nombre}: ${motivo}. Toca «Reintentar lo que faltó».`;
  if (!alta.contrato) return fallo(alta.error ?? "sin respuesta");
  let c = alta.contrato;
  if (alta.yaExistia) {
    // Ese código ya es un permiso: se usa sólo si está libre.
    if ((c.titularId && c.titularId !== ficha.id) || (c.planId && c.planId !== idPlan)) return null;
    const r = await actualizar(c.id, { planId: idPlan, ...(c.titularId ? {} : { titularId: ficha.id }) });
    if (!r.contrato) return fallo(r.error ?? "sin respuesta");
    c = r.contrato;
  }
  const status = await atarElPlanAlPermiso(idPlan, c.id);
  return status == null ? null : fallo(status ? `error ${status}` : "revisa tu conexión");
}

/**
 * El alta que pidió la ficha: sus datos de ENTIDAD (titular, representante,
 * región, ARFFS) y, sólo si se pidió «Pasarlo a un plan», lo que la ficha
 * vieja anotó del permiso. Un plan nuevo de la misma comunidad es otro papel:
 * el título de antes no se copia solo.
 */
export function arranqueDelAlta(pedido: AltaDePlanPedida | null): {
  f: FormularioPlan;
  permiso: Contrato | null;
  traidos: string[];
  titular: Parte;
} | null {
  if (!pedido) return null;
  const { titular, permiso, conLoAnotado } = pedido;
  const opts = { tipoTocado: false, regionPorDefecto: REGION_POR_DEFECTO };
  const { campos, completados } = conLoAnotado
    ? planDesdeLaFicha(formularioVacio(), titular, permiso, opts)
    : completarPlanDesdeDirectorio(
        formularioVacio(),
        { nombre: titular.nombre, representante: titular.representante, region: titular.region, arffs: titular.arffs },
        permiso,
        opts,
      );
  return { f: { ...campos, contratoId: permiso?.id ?? campos.contratoId }, permiso, traidos: completados, titular };
}
