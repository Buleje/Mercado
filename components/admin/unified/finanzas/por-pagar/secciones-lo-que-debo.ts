/**
 * Las secciones de Mi Plata › Lo que debo y quién ve cada una. Puro: lo usan la
 * pantalla y el test. Cada sección pide el permiso que declara en
 * `ANIDADAS_POR_MODULO` (single source, no una copia del array):
 *
 *   «Todo» junta adelantos recibidos y cuentas a favor de otro → Mi Plata o Activos.
 *   Proveedores, Calendario, Propuesta y Conciliación eran Compras › Por pagar
 *   → Compras o Comprobantes (`documentos`, como en el plan Pro) o Mi Plata.
 *
 * El plan Básico entra a Mi Plata por Activos y nunca tuvo Compras: ve «Todo»
 * y no las cuentas de proveedores (crear una, pagarla con egreso de caja).
 */
import { vistaPermitida, type ContextoPermiso } from "@/lib/admin/permiso-vista";
import { origenDeSeccion } from "@/lib/admin/subvistas-modulos";

export const SECCIONES_LO_QUE_DEBO = ["todo", "cuentas", "calendario", "propuesta", "conciliacion"] as const;
export type SeccionLoQueDebo = (typeof SECCIONES_LO_QUE_DEBO)[number];

/**
 * Las secciones que esta persona puede abrir, en el orden de la barra. Cuentan
 * el rol y el plan (los candados: `/api/payables` no tiene candado de plan); la
 * plantilla, el rubro y Modo Fácil deciden qué ofrece la barra, no qué se abre
 * dentro de una vista, igual que `vistasConLaPedida`. Medido 19-10: en `main`
 * (Enterprise) la plantilla esconde Compras, Comprobantes y Mi Plata; con ella
 * en el filtro, el aviso de una cuenta por pagar (`sub=cuentas`) caía en «Todo».
 */
export function seccionesVisibles(ctx: ContextoPermiso): SeccionLoQueDebo[] {
  const candados: ContextoPermiso = { ...ctx, plantilla: null, rubro: null, modoFacil: null };
  return SECCIONES_LO_QUE_DEBO.filter((s) => vistaPermitida(candados, origenDeSeccion("plata", "por-pagar", s)));
}
