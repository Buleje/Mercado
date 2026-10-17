"use client";

/**
 * Mi Plata — el hub financiero del panel, en DOS niveles.
 *
 * Acá vive SÓLO la navegación del hub: qué pestaña está abierta, qué sección
 * dentro de ella, qué deja ver el permiso de cada vista, y de dónde salió esa
 * decisión (la URL, un atajo del menú o la memoria). La estructura —las ocho
 * pestañas y sus secciones— está en `finanzas/estructura.ts`, el contenido de
 * cada hoja en `finanzas/VistaDePlata.tsx` y el tablero de Resumen en
 * `finanzas/FinanzasDashboard.tsx`.
 *
 * El segundo nivel va en la fila del título: las secciones de Mi Plata
 * (`SeccionesNav`) o, en Préstamos, Adelantos y Activos, las pestañas propias
 * de cada módulo, que las dibuja él mismo en la RANURA que deja este hub
 * (`finanzas/segundo-nivel.tsx`). Nunca hay un tercer nivel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, MoreHorizontal, Wallet } from "@buleje/design-system/icons";

import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import ActionMenu from "@/components/admin/shared/action-menu";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { useVistaModulo, type ParamsDeVista } from "@/hooks/use-vista-modulo";
import { useSeccionesConDatos } from "@/hooks/use-secciones-con-datos";
import { useContextoPermiso, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";

import SeccionesNav, { ID_HOJA_DE_PLATA } from "./finanzas/SeccionesNav";
import VistaDePlata from "./finanzas/VistaDePlata";
import { RanuraDelSegundoNivel } from "./finanzas/segundo-nivel";
import { generarReporteBancario } from "./finanzas/reporte-bancario";
import { CON_PESTANAS_PROPIAS, CON_SUB_PROPIO, MODULE_ID, SECCIONES, TABS, VISTAS, ubicar, type ClaveDeDato } from "./finanzas/estructura";

/** Cuánto se espera al rol antes de abrir igual (con las vistas propias del hub). */
const ESPERA_DEL_ROL_MS = 4000;

/**
 * Las hojas, con su nombre, para preguntarle al permiso cuáles se ven: cada
 * vista lleva su `origen` en el registro (Activos y Adelantos los ve el plan
 * Básico aunque Mi Plata sea Pro; Impuestos, quien veía Comprobantes).
 */
const HOJAS: readonly { id: string; label: string }[] = VISTAS.map((id) => {
  const tab = TABS.find((t) => t.id === id);
  const seccion = Object.values(SECCIONES).flat().find((s) => s?.id === id);
  return { id, label: seccion?.label ?? tab?.label ?? id };
});

/**
 * Al dejar Préstamos, Adelantos o Activos, su pestaña propia (`?sub=`) no viaja
 * a la vista siguiente. Tampoco la sección interna de las hojas que tienen la
 * suya (`CON_SUB_PROPIO`: Resumen, Rentabilidad, Gastos, Proyección; 2026-10-11).
 */
const PARAMS_DE_VISTA: ParamsDeVista<string> = Object.fromEntries(
  [...CON_PESTANAS_PROPIAS, ...CON_SUB_PROPIO].map((t) => [t, ["sub"]]),
);

export default function FinanzasModule({ initialTab }: { initialTab?: string } = {}) {
  /* Qué vistas se ven depende del plan, la plantilla y el rol (regla R2), y
     `useVistaModulo` valida la vista UNA vez, al montar: sin esperar al rol, un
     enlace a `?vista=impuestos` (que llegó de Comprobantes) caía en Resumen. */
  const rolListo = useContextoPermiso() !== null;
  const rolTarde = useEsperaVencida(!rolListo, ESPERA_DEL_ROL_MS);
  if (!rolListo && !rolTarde) return <S />;
  return <HubDePlata initialTab={initialTab} />;
}

/** `true` cuando `esperando` lleva `ms` sin resolverse. */
function useEsperaVencida(esperando: boolean, ms: number): boolean {
  const [vencida, setVencida] = useState(false);
  useEffect(() => {
    if (!esperando) return;
    const t = setTimeout(() => setVencida(true), ms);
    return () => clearTimeout(t);
  }, [esperando, ms]);
  return vencida;
}

function HubDePlata({ initialTab }: { initialTab?: string }) {
  const hojas = useVistasPermitidas(MODULE_ID, HOJAS);
  const permitidas = useMemo(() => new Set(hojas.map((h) => h.id)), [hojas]);
  /** El rótulo que le puso la plantilla a una hoja renombrada (si no, el de siempre). */
  const rotulo = useMemo(() => new Map(hojas.map((h) => [h.id, h.label] as const)), [hojas]);
  const validas = useMemo(() => VISTAS.filter((v) => permitidas.has(v)), [permitidas]);
  const porDefecto = validas.includes("resumen") ? "resumen" : (validas[0] ?? "resumen");

  /**
   * La vista vive en `?vista=`: link compartible, atrás del navegador y destino
   * del buscador global. Lo que se guarda es la HOJA, no la pestaña: volver a
   * Mi Plata devuelve a «Lo que debo» si ahí estabas. Todo pasa por `ubicar()`,
   * que traduce cualquier nombre —viejo o nuevo, pestaña o vista— a la hoja.
   */
  const { vista, irA: irAVista } = useVistaModulo(
    MODULE_ID,
    validas,
    porDefecto,
    initialTab ? ubicar(initialTab).vista : undefined,
    { paramsDeVista: PARAMS_DE_VISTA },
  );
  const ubic = ubicar(vista);
  const tab = ubic.tab;
  const seccion = ubic.seccion;

  /** La hoja de un nombre; si es una pestaña cuya primera sección no se ve, la primera que sí. */
  const irA = useCallback(
    (id: string) => {
      const u = ubicar(id);
      const destino = permitidas.has(u.vista)
        ? u.vista
        : (SECCIONES[u.tab]?.find((s) => permitidas.has(s.id))?.id ?? u.vista);
      irAVista(destino);
    },
    [irAVista, permitidas],
  );
  // Un atajo del menú puede llegar con el módulo ya montado (`?tab=activos`).
  // Con `irAVista` y no con `irA`: `irA` cambia cuando llega el permiso, y eso
  // no es un atajo nuevo (te devolvería al atajo después de haberte movido).
  useEffect(() => { if (initialTab) irAVista(ubicar(initialTab).vista); }, [initialTab, irAVista]);

  /** Una pestaña se ve si se ve alguna de sus hojas (regla R2). */
  const tabs = useMemo(
    () =>
      TABS.filter((t) => {
        const secciones = SECCIONES[t.id];
        return secciones ? secciones.some((s) => permitidas.has(s.id)) : permitidas.has(t.id);
      }).map((t) =>
        /* Sin «Impuestos del mes» a la vista (en `main` la plantilla esconde
           facturación y documentos, su origen) la pestaña sólo abre reportes:
           que no se llame «Impuestos» (medido 2026-10-11 en vista=cierres). */
        t.id === "impuestos-reportes" && !permitidas.has("impuestos")
          ? { ...t, label: "Reportes", shortLabel: undefined }
          : SECCIONES[t.id] ? t : { ...t, label: rotulo.get(t.id) ?? t.label },
      ),
    [permitidas, rotulo],
  );
  const secciones = useMemo(
    () => SECCIONES[tab]?.filter((s) => permitidas.has(s.id)).map((s) => ({ ...s, label: rotulo.get(s.id) ?? s.label })),
    [tab, permitidas, rotulo],
  );

  /**
   * Los datos que hay que medir para ESTA pestaña: el de cada sección que puede
   * estar vacía, más el del presupuesto, que no es una sección pero se pliega
   * con el mismo criterio. Sólo se pregunta por lo que esta pestaña muestra.
   */
  const claves = useMemo<ClaveDeDato[]>(() => {
    const lista = (secciones ?? []).flatMap((s) => (s.dato ? [s.dato] : []));
    if (tab === "movimientos") lista.push("presupuesto");
    return lista;
  }, [secciones, tab]);
  const datos = useSeccionesConDatos(claves);

  /* El auto-refresco del Resumen («Actualiza en 283s ⏸ ↻» suelto en esta
     banda hasta el 2026-10-11) vive en el «⋯» del Resumen: re-pintaba el hub
     cada segundo y remontaba la vista a los 5 min (`resumen/use-auto-actualizar`). */

  /** El segundo nivel cambia lo que hay debajo: eso es su `tabpanel`. */
  const conSegundoNivel = (secciones?.length ?? 0) > 1 || CON_PESTANAS_PROPIAS.includes(tab);
  const nombreDeLaPestana = tabs.find((t) => t.id === tab)?.label ?? "Mi Plata";

  /** Dónde dibujan su segundo nivel Préstamos, Adelantos y Activos. */
  const [ranura, setRanura] = useState<HTMLElement | null>(null);
  const enElHub = useMemo(() => ({ ranura }), [ranura]);

  return (
    <div className="space-y-6">
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07): identidad a la izquierda, una sola regla. Con las
          acciones viaja el SEGUNDO NIVEL —las secciones, o las pestañas del
          módulo montado— en lugar de cobrar una barra propia arriba del
          contenido (56 px en 14 de las 15 vistas, medidos el 2026-09-21). */}
      <AdminTabBar
        heading={{
          title: "Mi Plata",
          icon: Wallet,
          actions: (
            <>
              {secciones && secciones.length > 1 && (
                <SeccionesNav
                  secciones={secciones}
                  activa={seccion}
                  onIr={irA}
                  datos={datos}
                  etiqueta={`Secciones de ${nombreDeLaPestana}`}
                />
              )}
              {/* `contents`: lo que el módulo dibuja acá es parte de esta fila. */}
              <div ref={setRanura} className="contents" data-ranura-segundo-nivel="" />
              {/* El reporte bancario se pide una vez al mes: al «⋯», con su
                  explicación de una línea (un «Opciones» con texto ocupaba
                  145 px de la banda para una sola opción). */}
              <ActionMenu
                label="Más de Mi Plata"
                icon={MoreHorizontal}
                soloIcono
                size="md"
                className="w-12 shrink-0"
                title="Reporte bancario"
                actions={[
                  {
                    id: "reporte-bancario",
                    label: "Reporte bancario",
                    hint: "Seis meses de ingresos, gastos y utilidad, listos para imprimir",
                    icon: FileText,
                    onSelect: generarReporteBancario,
                  },
                ]}
              />
            </>
          ),
        }}
        tabs={tabs}
        wrap
        activeTab={tab}
        onTabChange={irA}
        moduleId="finanzas"
      >
        <RanuraDelSegundoNivel.Provider value={enElHub}>
          {conSegundoNivel ? (
            /* Lo que controla la barra de secciones de la banda. En Préstamos,
               Adelantos y Activos la pestaña activa la sabe el módulo: el panel
               se nombra con la pestaña de Mi Plata. */
            <div
              role="tabpanel"
              id={ID_HOJA_DE_PLATA}
              {...(secciones && secciones.length > 1
                ? { "aria-labelledby": idPestanaDeSeccion(ID_HOJA_DE_PLATA, seccion) }
                : { "aria-label": nombreDeLaPestana })}
            >
              <VistaDePlata vista={vista} seccion={seccion} datos={datos} irA={irA} />
            </div>
          ) : (
            <VistaDePlata vista={vista} seccion={seccion} datos={datos} irA={irA} />
          )}
        </RanuraDelSegundoNivel.Provider>
      </AdminTabBar>
    </div>
  );
}
