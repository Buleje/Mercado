/**
 * Los chequeos de Cumplimiento › «Chequeo del período», como DATOS (no JSX):
 * se ordenan (bloqueos → advertencias) y se agrupan (problemas vs. en orden)
 * antes de pintar, y el mismo arreglo arma el PDF de fiscalización.
 *
 * Salió de `CtpCompliancePanel` (compactación del libro, 17-10) cuando la vista
 * pasó a tener dos pestañas —el chequeo y «Cerrar el mes»— y el archivo
 * pasaba de 600 líneas. Los textos son los mismos, letra por letra.
 */

import {
  AlertCircle,
  Clock,
  Gauge,
  Link2,
  PackageX,
  ScrollText,
  ShieldAlert,
  ThumbsUp,
  TreePine,
} from "@buleje/design-system/icons";
import type { CtpComplianceData } from "@/hooks/use-ctp-compliance";
import type { EspecieEnElLibro } from "@/lib/forestal/especies-catalogo";
import { plural } from "./CtpComplianceScore";
import type { CtpIngresosFiltroRapido } from "./ctp-shared";

/** Adónde lleva el botón de un chequeo. «ficha» abre Directorio › Tu CTP. */
export type ComplianceNavTarget = "ingresos" | "saldos" | "despacho" | "produccion" | "ficha";
export type Severity = "error" | "warning";
/** El veredicto de cierre: los bloqueos impiden cerrar; las advertencias no. */
export type Readiness = Severity | "ready";

/** Descriptor de un chequeo: los datos, no el JSX — se ordena y agrupa antes de pintar. */
export interface CheckDescriptor {
  key: string;
  count: number;
  icon: typeof AlertCircle;
  severity: Severity;
  title: string;
  okTitle: string;
  description: string;
  action: string;
  navTarget: ComplianceNavTarget;
  /** Filtro que deja puesto en el destino (sólo Ingresos lo entiende hoy). */
  navFiltro?: CtpIngresosFiltroRapido;
  navigateLabel: string;
  /** Se resuelve ACÁ y no en otra pestaña (el catálogo de especies es un modal):
   *  cuando está, el botón la llama en vez de navegar. */
  onAction?: () => void;
}

export function armarChequeos(
  data: CtpComplianceData,
  dosFormas: readonly EspecieEnElLibro[],
  abrirCatalogo: () => void,
): CheckDescriptor[] {
  const cites = data.citesSinPermisoEspecies;
  const citesIng = data.citesSinPermisoIngresos;
  const prodNeg = data.productosNegativos;
  const trazaLin = data.despachosSinTrazaLineas;
  const rendLin = data.rendimientoAltoLineas;
  const docsVenc = data.documentosVencidosLabels;
  const docsPorVenc = data.documentosPorVencerLabels;
  return [
    {
      key: "fueraPlazo",
      count: data.counts.fueraPlazo,
      icon: Clock,
      severity: "error",
      title: `${data.counts.fueraPlazo} ${plural(data.counts.fueraPlazo, "ingreso registrado", "ingresos registrados")} fuera de plazo`,
      okTitle: "Ningún ingreso fuera de plazo",
      description: "SERFOR exige registrar el ingreso dentro de los 2 días hábiles de la operación (RDE D000025-2023).",
      action: "Revisa la columna 'Días registro' en la pestaña Ingresos.",
      navTarget: "ingresos",
      navFiltro: "fuera-de-plazo",
      navigateLabel: "Ver ingresos",
    },
    {
      key: "pendientes",
      count: data.counts.pendientes,
      icon: ThumbsUp,
      severity: "warning",
      title: `${data.counts.pendientes} ${plural(data.counts.pendientes, "ingreso pendiente", "ingresos pendientes")} de validar`,
      okTitle: "Todos los ingresos están validados",
      description: "Un ingreso sin validar no cuenta como materia prima disponible en Saldos.",
      action: "Validalos desde la pestaña Ingresos antes de cerrar el período.",
      navTarget: "ingresos",
      navFiltro: "pendiente",
      navigateLabel: "Ver ingresos",
    },
    {
      key: "cites",
      count: data.counts.citesCount,
      icon: ScrollText,
      severity: "warning",
      title: `${data.counts.citesCount} ${plural(data.counts.citesCount, "ingreso es de especie CITES", "ingresos son de especies CITES")}`,
      okTitle: "Sin especies CITES en el período",
      description:
        cites.length > 0
          ? `Sin permiso CITES cargado en la Ficha: ${cites.slice(0, 3).join(", ")}${cites.length > 3 ? ` y ${cites.length - 3} más` : ""}.`
          : "Las especies CITES requieren permiso de aprovechamiento archivado.",
      action:
        cites.length > 0
          ? "Carga su N° de permiso CITES en la pestaña Ficha CTP."
          : "Verifica que cada una tenga su permiso CITES a mano para una fiscalización.",
      navTarget: cites.length > 0 ? "ficha" : "ingresos",
      navFiltro: cites.length > 0 ? undefined : "cites",
      navigateLabel: cites.length > 0 ? "Ir a Ficha CTP" : "Ver ingresos",
    },
    {
      key: "citesIng",
      count: citesIng.length,
      icon: ShieldAlert,
      severity: "warning",
      title: `${citesIng.length} ${plural(citesIng.length, "ingreso CITES sin permiso vinculado", "ingresos CITES sin permiso vinculado")}`,
      okTitle: "Cada ingreso CITES tiene su permiso vinculado",
      description:
        citesIng.length > 0
          ? `Un ingreso de especie protegida sin su N° de permiso vinculado no acredita origen legal ante una fiscalización: GTF ${citesIng.slice(0, 4).join(", ")}${citesIng.length > 4 ? ` y ${citesIng.length - 4} más` : ""}.`
          : "Cada acta de ingreso CITES acredita su permiso.",
      action: "Carga el permiso en la Ficha CTP y vincúlalo al registrar el ingreso.",
      navTarget: "ingresos",
      navFiltro: "cites",
      navigateLabel: "Ver ingresos",
    },
    {
      key: "especiesEnNegativo",
      count: data.counts.especiesEnNegativo,
      icon: TreePine,
      severity: "error",
      title: `${data.counts.especiesEnNegativo} ${plural(data.counts.especiesEnNegativo, "especie tiene", "especies tienen")} saldo negativo`,
      okTitle: "Ninguna especie en sobre-consumo",
      description: "Se transformó más volumen del que ingresó validado.",
      action: "Revisa el Balance por especie en la pestaña Saldos.",
      navTarget: "saldos",
      navigateLabel: "Ver saldos",
    },
    {
      key: "stockNegativo",
      count: data.counts.stockNegativo,
      icon: PackageX,
      severity: "error",
      title: `${data.counts.stockNegativo} ${plural(data.counts.stockNegativo, "producto tiene", "productos tienen")} stock negativo`,
      okTitle: "Ningún producto con sobre-despacho",
      description:
        prodNeg.length > 0
          ? `Se despachó más de lo producido en: ${prodNeg.slice(0, 3).join(", ")}${prodNeg.length > 3 ? ` y ${prodNeg.length - 3} más` : ""}.`
          : "Se despachó más producto del que se produjo.",
      action: "Revisa el Stock de productos transformados en la pestaña Saldos.",
      navTarget: "saldos",
      navigateLabel: "Ver saldos",
    },
    {
      key: "despachosSinTraza",
      count: data.counts.despachosSinTraza,
      icon: Link2,
      severity: "warning",
      title: `${data.counts.despachosSinTraza} ${plural(data.counts.despachosSinTraza, "despacho", "despachos")} sin cadena de custodia completa`,
      okTitle: "Todos los despachos tienen cadena de custodia completa",
      description:
        trazaLin.length > 0
          ? `No pueden emitir certificado de trazabilidad: ${plural(trazaLin.length, "línea", "líneas")} #${trazaLin.slice(0, 5).join(", #")}${trazaLin.length > 5 ? ` y ${trazaLin.length - 5} más` : ""}.`
          : "Hay volumen despachado sin corrida de origen atribuida.",
      action: "Complétala con 'Editar atribución' dentro del botón 'Cadena' del despacho.",
      navTarget: "despacho",
      navigateLabel: "Ver despachos",
    },
    {
      key: "rendimientoAlto",
      count: data.counts.rendimientoAlto ?? 0,
      icon: Gauge,
      severity: "warning",
      title: `${data.counts.rendimientoAlto ?? 0} ${plural(data.counts.rendimientoAlto ?? 0, "corrida con rendimiento", "corridas con rendimiento")} sobre el referencial SERFOR`,
      okTitle: "Rendimientos dentro del referencial SERFOR",
      description:
        rendLin.length > 0
          ? `Posible sobre-declaración (ref. 56% aserrada / 41% tablillas, RDE D000259-2024): ${plural(rendLin.length, "corrida", "corridas")} #${rendLin.slice(0, 5).join(", #")}${rendLin.length > 5 ? ` y ${rendLin.length - 5} más` : ""}.`
          : "Se declaró más producto del que la troza suele rendir.",
      action: "Verifica el volumen consumido vs. producido en la pestaña Producción.",
      navTarget: "produccion",
      navigateLabel: "Ver producción",
    },
    {
      key: "documentosVencidos",
      count: data.counts.documentosVencidos ?? 0,
      icon: AlertCircle,
      severity: "error",
      title: `${data.counts.documentosVencidos ?? 0} ${plural(data.counts.documentosVencidos ?? 0, "documento vencido", "documentos vencidos")} en la Ficha`,
      okTitle: "Títulos habilitantes y permisos CITES vigentes",
      description:
        docsVenc.length > 0
          ? `Un título habilitante o permiso CITES vencido invalida el origen de la materia prima: ${docsVenc.slice(0, 4).join(", ")}${docsVenc.length > 4 ? ` y ${docsVenc.length - 4} más` : ""}.`
          : "Hay un documento habilitante vencido en la Ficha del CTP.",
      action: "Renueva o actualiza su vencimiento en la pestaña Ficha CTP.",
      navTarget: "ficha",
      navigateLabel: "Ir a Ficha CTP",
    },
    {
      key: "documentosPorVencer",
      count: data.counts.documentosPorVencer ?? 0,
      icon: Clock,
      severity: "warning",
      title: `${data.counts.documentosPorVencer ?? 0} ${plural(data.counts.documentosPorVencer ?? 0, "documento vence", "documentos vencen")} en menos de 30 días`,
      okTitle: "Ningún documento de la Ficha vence este mes",
      description:
        docsPorVenc.length > 0
          ? `La renovación ante la ARFFS no es inmediata: ${docsPorVenc.slice(0, 4).join(", ")}${docsPorVenc.length > 4 ? ` y ${docsPorVenc.length - 4} más` : ""}.`
          : "Un documento habilitante de la Ficha está por vencer.",
      action: "Empieza el trámite de renovación antes de que caduque.",
      navTarget: "ficha",
      navigateLabel: "Ir a Ficha CTP",
    },
    {
      key: "especiesDosFormas",
      count: dosFormas.length,
      icon: TreePine,
      severity: "warning",
      title: `${dosFormas.length} ${plural(dosFormas.length, "especie está escrita", "especies están escritas")} de más de una forma`,
      okTitle: "Cada especie se escribe de una sola forma",
      description:
        dosFormas.length > 0
          ? `Para el libro son dos maderas distintas y los totales por especie se parten: ${dosFormas
              .slice(0, 3)
              .map((e) => e.grafias.map((g) => `«${g.texto}» ${g.usos}`).join(" vs "))
              .join(" · ")}${dosFormas.length > 3 ? ` y ${dosFormas.length - 3} más` : ""}.`
          : "«Tornillo» y «TORNILLO» serían dos especies en el mismo libro.",
      action: "Elige una forma en el catálogo de especies: el libro entero pasa a decirla.",
      navTarget: "ingresos",
      navigateLabel: "Abrir el catálogo",
      onAction: abrirCatalogo,
    },
  ];
}

/** Problemas primero (bloqueos antes que advertencias), lo que está en orden aparte. */
export function clasificarChequeos(checks: readonly CheckDescriptor[]) {
  const problemas = checks
    .filter((c) => c.count > 0)
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const enOrden = checks.filter((c) => c.count <= 0);
  const bloqueos = problemas.filter((c) => c.severity === "error").length;
  const advertencias = problemas.filter((c) => c.severity === "warning").length;
  const readiness: Readiness = bloqueos > 0 ? "error" : advertencias > 0 ? "warning" : "ready";
  return { problemas, enOrden, bloqueos, advertencias, readiness };
}
