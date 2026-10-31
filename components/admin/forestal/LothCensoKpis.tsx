"use client";

/**
 * LothCensoKpis — la fila de arriba de la tabla del censo y sus indicadores
 * plegables, al nivel de las Secciones del libro (08-10; mismo `CtpKpi`, mismo
 * anillo, mismo botón «Indicadores» y la preferencia RECORDADA).
 *
 * Las tarjetas FILTRAN la tabla al tocarlas: «Árboles» deja sólo los en pie,
 * «No en el plan» deja las especies que el plan no autoriza, y los repartos
 * («Por categoría POA», «Por especie») filtran por la fila tocada. Segundo
 * toque, deshace. Escriben en el MISMO autofiltro de la cabecera (Estado,
 * Especie, Categoría POA): un solo estado, con su chip para quitarlo.
 *
 * Con un filtro puesto, las cifras son de lo que deja el filtro: la misma
 * cuenta que el pie de la tabla (`cifrasDelCenso`). Plegadas, siguen a la vista
 * en una línea: plegar no es esconder el dato.
 */

import { useId, useMemo, type ReactNode } from "react";
import { Boxes, ShieldAlert, ShieldCheck, TreePine } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CATEGORIA_LABEL } from "@/lib/forestal/loth-poa";
import { formatNumber } from "@/lib/format";
import CtpKpi, { DesgloseSimple } from "./CtpKpi";
import { BotonIndicadores } from "./LothSeccionKpis";
import type { FiltrosTabla } from "./filtros-tabla-forestal";
import type { ArbolCenso } from "./loth-censo-arbol";
import { alternarJusto, cifrasDelCenso, filtraJusto } from "./loth-censo-cifras";
import { ESTADO_LABEL } from "./loth-censo-columnas";
import { alternarSolo, filtraSolo } from "./loth-seccion-cifras";

/** Clave de la preferencia. Exportada: la prueba en navegador la lee. */
export const CLAVE_KPIS_CENSO = "loth:censo:kpis-abiertos";

const plural = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;
const EN_PIE = ESTADO_LABEL.en_pie;

export default function LothCensoKpis({
  arboles,
  filtros,
  categorias,
  fueraDelPlan,
  hayEspeciesAutorizadas,
  plantacion = false,
  inicio,
  fin,
}: {
  /** Todos los árboles cargados del censo. */
  arboles: readonly ArbolCenso[];
  /** El autofiltro de la tabla: las tarjetas lo leen y lo escriben. */
  filtros: FiltrosTabla<ArbolCenso>;
  categorias: ReadonlyMap<string, keyof typeof CATEGORIA_LABEL>;
  fueraDelPlan: (especie: string) => boolean;
  /** El plan lista sus especies (sin lista, nada puede estar «fuera»). */
  hayEspeciesAutorizadas: boolean;
  plantacion?: boolean;
  /** A la izquierda de la fila (el contador «x de y»). */
  inicio?: ReactNode;
  /** A la derecha (las columnas de la tabla). */
  fin?: ReactNode;
}) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_KPIS_CENSO, false);
  const panelId = useId();
  const filtrando = filtros.activos > 0;
  const todos = useMemo(() => cifrasDelCenso(arboles, categorias, fueraDelPlan), [arboles, categorias, fueraDelPlan]);
  const filtradas = filtros.filtradas;
  const delFiltro = useMemo(() => cifrasDelCenso(filtradas, categorias, fueraDelPlan), [filtradas, categorias, fueraDelPlan]);
  const c = filtrando ? delFiltro : todos;
  const queFalta = plantacion ? "No en el registro" : "No en el plan";

  const { facetas, setFaceta } = filtros;
  const soloEnPie = filtraSolo(facetas.estado, EN_PIE);
  const soloFuera = filtraJusto(facetas.especie, todos.especiesFuera);
  const elegirEspecie = (v: string) => setFaceta("especie", alternarSolo(facetas.especie, v));
  const elegirCategoria = (v: string) => setFaceta("categoria", alternarSolo(facetas.categoria, v));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {inicio}
        {!abierto && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm tabular-nums text-[var(--text-secondary)]">
            {filtrando && (
              <>
                <span className="font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">filtrado</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{plural(c.arboles, "árbol", "árboles")}</span>
            <span aria-hidden="true">·</span>
            <span>{fmtM3(c.volumenM3)} m³</span>
            {hayEspeciesAutorizadas && (
              <>
                <span aria-hidden="true">·</span>
                <span className={c.fueraDelPlan > 0 ? "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : undefined}>
                  {formatNumber(c.fueraDelPlan)} {queFalta.toLowerCase()}
                </span>
              </>
            )}
          </p>
        )}
        <BotonIndicadores
          abierto={abierto}
          onAlternar={() => setAbierto(!abierto)}
          controla={`${panelId}-panel`}
          ayudaAbierto="Oculta los indicadores. Se recuerda en este navegador."
          ayudaCerrado="Muestra los indicadores del censo"
        />
        {fin}
      </div>

      <div id={`${panelId}-panel`} hidden={!abierto} className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
        <CtpKpi
          label={plantacion ? "Árboles marcados" : "Árboles"}
          value={formatNumber(c.arboles)}
          subValue={
            soloEnPie
              ? "Filtrando: sólo los en pie"
              : filtrando
                ? `de ${formatNumber(todos.arboles)} en total`
                : `${formatNumber(c.enPie)} en pie · ver sólo esos`
          }
          icon={TreePine}
          emphasis="neutral"
          onClick={todos.enPie > 0 || soloEnPie ? () => setFaceta("estado", alternarSolo(facetas.estado, EN_PIE)) : undefined}
          filtrando={soloEnPie}
          desglose={c.porCategoria.length > 0 ? <DesgloseSimple filas={c.porCategoria} onElegir={elegirCategoria} vacio="Sin categoría" /> : undefined}
          desgloseLabel="Por categoría POA"
        />
        <CtpKpi
          label="Volumen estimado"
          value={`${fmtM3(c.volumenM3)} m³`}
          subValue={filtrando ? `de ${fmtM3(todos.volumenM3)} m³ en total` : `${plural(c.porEspecie.length, "especie", "especies")} · suma de Vol. m³`}
          icon={Boxes}
          emphasis="success"
          desglose={c.porEspecie.length > 0 ? <DesgloseSimple filas={c.porEspecie} onElegir={elegirEspecie} vacio="Sin árboles" /> : undefined}
          desgloseLabel="Por especie"
        />
        {/* Lo que mira primero una fiscalización: un árbol de una especie que el permiso no autoriza. */}
        <CtpKpi
          label={queFalta}
          value={formatNumber(c.fueraDelPlan)}
          subValue={
            soloFuera
              ? "Filtrando: sólo esas especies"
              : !hayEspeciesAutorizadas
                ? "el plan no lista sus especies"
                : c.fueraDelPlan > 0
                  ? `${plural(todos.especiesFuera.length, "especie", "especies")} sin autorizar · ver cuáles`
                  : c.cites > 0
                    ? `${plural(c.cites, "árbol", "árboles")} con especie CITES`
                    : "todas las especies autorizadas"
          }
          icon={c.fueraDelPlan > 0 ? ShieldAlert : ShieldCheck}
          emphasis={c.fueraDelPlan > 0 ? "error" : "success"}
          onClick={todos.especiesFuera.length > 0 || soloFuera ? () => setFaceta("especie", alternarJusto(facetas.especie, todos.especiesFuera)) : undefined}
          filtrando={soloFuera}
        />
      </div>
    </div>
  );
}
