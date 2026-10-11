"use client";

/**
 * Análisis › Alertas (la vista `inteligencia`): lo raro del negocio que pide
 * una acción y las cifras que tú decides seguir. Dos secciones en `?sub=`.
 *
 * Medido 11-10 en main (1280 claro): 3,62 pantallas y 121 textos < 14 px —la
 * vista más larga del panel— porque apilaba cinco bloques, cuatro repetidos:
 *   · «Reportes Comparativos»  = Mi Plata › Comparar períodos (VistaDePlata.tsx:115)
 *   · «Precios del Mercado»     = Compras › Proveedores › Comparar (CompararProveedores.tsx:63)
 *   · tira Margen/Ventas/Ticket/Productos y las 6 tarjetas de «Business
 *     Intelligence» = los Indicadores de Métricas e Inicio (y la tira leía
 *     claves que `/api/analytics/kpis-v2` no manda: salía todo en 0)
 *   · «Proyección de ventas — próximos 7 días» = Predicción (mismo endpoint)
 * Queda lo propio: las alertas (antes al fondo, con enlaces rotos) y los
 * indicadores propios. Lo mudado, en «Más», para quien puede abrirlo.
 */

import { Plus, RefreshCw, Download } from "@buleje/design-system/icons";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import CustomKPITab, { type AccionesIndicadores } from "@/components/admin/CustomKPITab";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { cn } from "@/lib/utils";
import { AlertasNegocio, useAlertasNegocio } from "./AlertasNegocio";
import { CabeceraAnalisis } from "./CabeceraAnalisis";
import { useMudanzasAnalisis } from "./use-mudanzas-analisis";

const SECCIONES = ["revisar", "indicadores"] as const;
type Seccion = (typeof SECCIONES)[number];
const ID_PANEL = "analisis-alertas-panel";

const AYUDA = {
  revisar: {
    what: "Lo que se sale de lo normal y pide una acción: ventas muy por debajo del promedio, productos sin venta en 15 días, fiados vencidos hace más de 30 días y márgenes bajo el 10 %.",
    affects: "Las de prioridad alta van primero. Cada fila abre la pestaña donde se arregla.",
    example: "«Fiado vencido: Rosa Pérez — S/ 85 pendiente, 42 días de mora» → Ver fiados.",
  },
  indicadores: {
    what: "Las cifras que tú decides seguir, con su meta. El valor no se calcula solo: para una meta con avance automático, usa Metas y logros.",
    example: "«Pedidos por WhatsApp» con meta de 40 a la semana.",
  },
} as const;

const BOTON_PRINCIPAL = "inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90";

export default function InteligenciaTab() {
  const { vista: seccion, irA } = useSubvistaModulo<Seccion>("analisis-alertas", SECCIONES, "revisar");
  const alertas = useAlertasNegocio();
  const mudanzas = useMudanzasAnalisis(["comparativos", "precios-mercado"]);

  const cuenta = alertas.alertas?.length;
  const barra = (
    <BarraDeSecciones
      secciones={[
        { clave: "revisar", rotulo: "Qué revisar", cuenta: cuenta && cuenta > 0 ? cuenta : undefined },
        { clave: "indicadores", rotulo: "Mis indicadores" },
      ]}
      activa={seccion}
      onCambiar={irA}
      etiqueta="Secciones de Alertas"
      idPanel={ID_PANEL}
    />
  );

  const cabeceraIndicadores = (a: AccionesIndicadores) => {
    const acciones: MenuAccion[] = [
      { id: "csv", label: "Exportar a Excel", hint: `${a.cuantos} indicadores`, icon: Download, onSelect: a.exportar, disabled: a.cuantos === 0 },
      { id: "recargar", label: "Actualizar", icon: RefreshCw, onSelect: a.recargar },
      ...mudanzas,
    ];
    return (
      <CabeceraAnalisis titulo="Alertas" ayuda={AYUDA.indicadores} secciones={barra} acciones={acciones} tituloMas="Exportar, actualizar y lo que se mudó a Mi Plata y Compras">
        <button type="button" onClick={a.nuevo} className={BOTON_PRINCIPAL}>
          <Plus className="h-4 w-4" aria-hidden /> Nuevo indicador
        </button>
      </CabeceraAnalisis>
    );
  };

  return (
    <div className="space-y-3">
      {seccion === "revisar" && (
        <CabeceraAnalisis
          titulo="Alertas"
          ayuda={AYUDA.revisar}
          secciones={barra}
          acciones={[{ id: "recargar", label: "Revisar de nuevo", icon: RefreshCw, onSelect: alertas.recargar }, ...mudanzas]}
          tituloMas="Revisar de nuevo y lo que se mudó a Mi Plata y Compras"
        />
      )}
      <div
        role="tabpanel"
        id={ID_PANEL}
        aria-labelledby={idPestanaDeSeccion(ID_PANEL, seccion)}
        className={cn(seccion === "indicadores" ? "space-y-3" : "")}
      >
        {seccion === "revisar" ? <AlertasNegocio estado={alertas} /> : <CustomKPITab cabecera={cabeceraIndicadores} />}
      </div>
    </div>
  );
}
