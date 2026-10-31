"use client";

/**
 * LothSeccionKpis — la cabecera de la sección que se está mirando: su título,
 * qué se asienta ahí, y sus indicadores plegables.
 *
 * El título es un `SectionTitle` de verdad (h2): antes, entre el título del
 * libro y la tabla, todo era texto chico en mayúsculas al mismo peso, y nada
 * decía en qué sección estabas salvo el botón resaltado del riel.
 *
 * Los indicadores se pliegan y la preferencia se RECUERDA, una sola para las
 * seis secciones (Brandon, 2026-09-18). Una por sección haría saltar la tabla
 * ~120 px cada vez que se cambia de Tala a Trozado —la pantalla se movería
 * justo cuando la vista busca la misma fila— y obligaría a plegar seis veces
 * lo mismo: lo que se decide es cuánto lugar le toca a la tabla, y eso no
 * cambia de una sección a otra. Arranca plegada, como en el Libro CTP
 * (Brandon, 2026-09-03: «que los KPIs estén ocultos y que haya un botón para
 * mostrarlos»); plegada igual dice sus cifras en una línea, así el botón no
 * es una caja ciega.
 *
 * Las tarjetas FILTRAN la tabla al tocarlas (backlog L11, 08-10: «al nivel del
 * Libro CTP», mismo `CtpKpi` y mismo anillo): «Líneas» deja sólo las vigentes,
 * «Fuera de plazo» sólo las tardías, y el reparto «Por especie» (o «Por guía»)
 * filtra por la fila tocada. Segundo toque, deshace. Escriben en el MISMO
 * autofiltro de la cabecera (columna Estado / Especie / N° GTF): un solo
 * estado, con su chip para quitarlo. Con un filtro puesto, las cifras son de lo
 * que deja el filtro —la misma cuenta que el pie (`loth-seccion-cifras`)—.
 *
 * Dentro del libro (compactación 17-10) el título y su frase no ocupan fila: el
 * riel de secciones ya dice dónde estás, la frase va a un ⓘ y «Indicadores» al
 * riel del libro, chico (`loth-seccion-kpis-riel`). Con el libro, una cuarta
 * tarjeta: el embudo del libro entero (`LothEmbudoKpi`), que era el bloque
 * «Aprovechamiento» de arriba.
 */

import { useId } from "react";
import { createPortal } from "react-dom";
import { SectionTitle } from "@buleje/design-system";
import {
  AlertCircle,
  Boxes,
  FileText,
  ShieldAlert,
  ShieldCheck,
  TreePine,
  Truck,
} from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import { PLAZO_REGISTRO_DIAS, type LothEntryDTO, type LothSection } from "@/lib/forestal/loth-constants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import CtpKpi, { DesgloseSimple } from "./CtpKpi";
import { SECTION_META } from "./LothEntryForm";
import type { FiltrosTabla } from "./filtros-tabla-forestal";
import { useHuecoIndicadores } from "./loth-indicadores-slot";
import { ESTADO_LINEA } from "./loth-seccion-filtros";
import { BotonIndicadores } from "./loth-boton-indicadores";
import { alternarSolo, cifrasDeLineas, filtraSolo } from "./loth-seccion-cifras";
import IndicadoresSeccionEnRiel from "./loth-seccion-kpis-riel";
import LothEmbudoKpi from "./LothEmbudoKpi";
import type { EmbudoLibroTh } from "./hooks/use-loth-avisos-libro";

/** Clave de la preferencia. Exportada: la prueba en navegador la lee. */
export const CLAVE_KPIS_SECCION = "loth:secciones:kpis-abiertos";

/* El mismo botón lo usa el Censo (`LothCensoKpis` lo importa de acá). */
export { BotonIndicadores };

const fm = (n: number) => formatNumber(n, 2);
const plural = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;

export default function LothSeccionKpis({
  section,
  cur,
  totalLibro,
  lineas,
  delLibroEntero,
  filtros,
  embudo = null,
  onVerRentabilidad,
}: {
  section: LothSection;
  /** Lo que declara la API para la sección (sólo líneas vigentes). */
  cur?: { count: number; totalVolumeM3: number; totalQuantity: number };
  /** Líneas vigentes del libro entero, las seis secciones. */
  totalLibro: number;
  /** Las líneas de la sección que hay a mano. */
  lineas: LothEntryDTO[];
  /** `true` si `lineas` es la sección entera; `false` si es sólo la página. */
  delLibroEntero: boolean;
  /** El autofiltro de la tabla (`useLothSeccionTabla`): las tarjetas lo leen y lo escriben. */
  filtros?: FiltrosTabla<LothEntryDTO>;
  /** El embudo del libro entero: una tarjeta más (`LothEmbudoKpi`). */
  embudo?: EmbudoLibroTh | null;
  onVerRentabilidad?: () => void;
}) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_KPIS_SECCION, false);
  const panelId = useId();
  const meta = SECTION_META[section];
  const hueco = useHuecoIndicadores();
  const enLibro = useEnElLibro();
  const conEmbudo = !!embudo?.hayActividad;

  /* Sin filtro, las cifras de la API (como siempre). Con filtro, las de lo que
     deja el filtro: las mismas líneas y la misma cuenta que el pie de la tabla. */
  const filtrando = !!filtros && filtros.activos > 0;
  const c = cifrasDeLineas(section, filtrando ? filtros.filtradas : lineas);
  const alcance = filtrando ? "en el filtro" : delLibroEntero ? "en la sección" : "en pantalla";
  const count = filtrando ? c.totales.lineas : (cur?.count ?? 0);
  const deLaSeccion = (texto: string) => (filtrando ? `de ${texto} en la sección` : null);

  const usaVolumen = section === "tala" || section === "trozado" || section === "consumo_troza";
  const usaCantidad = section === "producto_terminado" || section === "despacho_producto";
  /* En Despacho de trozas la segunda tarjeta repetía la primera («Líneas 2» y
     «Trozas despachadas 2»: cada línea ES una troza). Lo que suma es el m³
     que salió —el del trozado de cada troza, la línea no lo guarda (08-10)—
     y en cuántas guías. */
  const volumen = `${fmtM3(filtrando ? c.totales.volumenM3 : (cur?.totalVolumeM3 ?? 0))} m³`;
  const cantidad = filtrando ? c.total : fm(cur?.totalQuantity ?? 0);
  const segunda = usaVolumen
    ? { label: "Volumen registrado", value: volumen, corto: volumen, icon: TreePine, de: `${fmtM3(cur?.totalVolumeM3 ?? 0)} m³` }
    : usaCantidad
      ? { label: "Cantidad registrada", value: cantidad, corto: `cantidad ${cantidad}`, icon: FileText, de: fm(cur?.totalQuantity ?? 0) }
      : {
          label: "Volumen despachado",
          value: volumen,
          corto: `${volumen} en ${plural(c.guias, "guía", "guías")}`,
          icon: Truck,
          de: `${fmtM3(cur?.totalVolumeM3 ?? 0)} m³`,
        };

  /* Tocar = poner SÓLO ese valor en la columna; otra vez = quitarlo. */
  const estado = filtros?.facetas.obs;
  const soloVigentes = filtraSolo(estado, ESTADO_LINEA.registrada);
  const soloTardias = filtraSolo(estado, ESTADO_LINEA.fueraDePlazo);
  const alternarEstado = (v: string) => filtros?.setFaceta("obs", alternarSolo(filtros.facetas.obs, v));
  const conEspecie = !!filtros?.columnas.some((x) => x.id === "esp");
  const elegirEspecie = conEspecie && filtros ? (v: string) => filtros.setFaceta("esp", alternarSolo(filtros.facetas.esp, v)) : undefined;
  const elegirGuia = filtros?.columnas.some((x) => x.id === "gtf")
    ? (v: string) => filtros.setTexto("gtf", filtros.textos.gtf === v ? "" : v)
    : undefined;

  /* Plegados, las cifras siguen a la vista en una línea: las mismas cuentas que
     las tarjetas, nunca otras (y dicen si están filtradas). El botón y esa línea
     van en la fila de los botones de la barra (`loth-indicadores-slot`); sin
     barra, en la del título como siempre. */
  const resumenPlegado = !abierto && (
    <p className="flex flex-wrap items-center gap-x-2 text-sm tabular-nums text-[var(--text-secondary)]">
      {filtrando && (
        <>
          <span className="font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">filtrado</span>
          <span aria-hidden="true">·</span>
        </>
      )}
      <span>{plural(count, "línea", "líneas")}</span>
      <span aria-hidden="true">·</span>
      <span>{segunda.corto}</span>
      <span aria-hidden="true">·</span>
      <span
        className={
          c.tardias > 0 ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : undefined
        }
      >
        {formatNumber(c.tardias)} fuera de plazo
      </span>
    </p>
  );
  const botonIndicadores = (
    <BotonIndicadores
      abierto={abierto}
      onAlternar={() => setAbierto(!abierto)}
      controla={`${panelId}-panel`}
      ayudaAbierto="Oculta los indicadores. Se recuerda en este navegador para las seis secciones."
      ayudaCerrado="Muestra los indicadores de la sección"
      className={hueco ? "" : "ml-auto"}
    />
  );

  const panel = (
    <div id={`${panelId}-panel`} hidden={!abierto} className={`grid grid-cols-1 items-start gap-3 ${conEmbudo ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
      <CtpKpi
        label={`Líneas · ${meta.short}`}
        value={formatNumber(count)}
        subValue={
          soloVigentes
            ? "Filtrando: sólo las vigentes"
            : (deLaSeccion(formatNumber(cur?.count ?? 0)) ?? `${formatNumber(totalLibro)} en el libro · ver sólo vigentes`)
        }
        icon={Boxes}
        emphasis="neutral"
        onClick={filtros ? () => alternarEstado(ESTADO_LINEA.registrada) : undefined}
        filtrando={soloVigentes}
      />
      <CtpKpi
        label={segunda.label}
        value={segunda.value}
        subValue={
          (segunda.de && deLaSeccion(segunda.de)) ??
          (usaVolumen || usaCantidad ? meta.short : `en ${plural(c.guias, "guía", "guías")} · según el trozado`)
        }
        icon={segunda.icon}
        emphasis="success"
        desglose={
          usaVolumen || usaCantidad ? (
            c.porEspecie.length > 0 ? <DesgloseSimple filas={c.porEspecie} onElegir={elegirEspecie} vacio="Sin líneas vigentes" /> : undefined
          ) : c.porGuia.length > 0 ? (
            <DesgloseSimple filas={c.porGuia} onElegir={elegirGuia} vacio="Sin guías" />
          ) : undefined
        }
        desgloseLabel={usaVolumen || usaCantidad ? "Por especie" : "Por guía"}
      />
      {/* Lo que mira primero una fiscalización: el registro tardío. El CITES
          va de subtítulo cuando lo hay, en vez de un tercio de fila en cero. */}
      <CtpKpi
        label="Fuera de plazo"
        value={formatNumber(c.tardias)}
        subValue={
          soloTardias
            ? "Filtrando: sólo las fuera de plazo"
            : c.tardias > 0
              ? `de ${formatNumber(c.totales.lineas)} ${alcance} · plazo ${PLAZO_REGISTRO_DIAS} días · ver cuáles`
              : c.cites > 0
                ? `${plural(c.cites, "línea", "líneas")} con especie CITES`
                : "todo asentado en plazo"
        }
        icon={c.tardias > 0 ? AlertCircle : c.cites > 0 ? ShieldAlert : ShieldCheck}
        emphasis={c.tardias > 0 ? "warning" : c.cites > 0 ? "error" : "success"}
        onClick={filtros && (c.tardias > 0 || soloTardias) ? () => alternarEstado(ESTADO_LINEA.fueraDePlazo) : undefined}
        filtrando={soloTardias}
      />
      {conEmbudo && <LothEmbudoKpi embudo={embudo} onVerRentabilidad={onVerRentabilidad} />}
    </div>
  );

  /* Dentro del libro: sin fila de título (ver arriba). El h2 queda para el
     lector de pantalla; la tabla sube lo que medía esa fila. */
  if (enLibro) {
    const resumen = [
      filtrando ? "filtrado" : null,
      plural(count, "línea", "líneas"),
      segunda.corto,
      `${formatNumber(c.tardias)} fuera de plazo`,
    ].filter(Boolean).join(" · ");
    return (
      <>
        <SectionTitle id={`${panelId}-titulo`} className="sr-only">{meta.label}</SectionTitle>
        <IndicadoresSeccionEnRiel
          titulo={meta.label}
          ayuda={meta.help}
          abierto={abierto}
          onAlternar={() => setAbierto(!abierto)}
          controla={`${panelId}-panel`}
          tarjetas={conEmbudo ? 4 : 3}
          resumen={resumen}
          tardias={c.tardias}
          filtrando={filtrando}
        />
        <section aria-labelledby={`${panelId}-titulo`} hidden={!abierto}>
          {panel}
        </section>
      </>
    );
  }

  return (
    <section aria-labelledby={`${panelId}-titulo`} className="space-y-3">
      {hueco && createPortal(<>{botonIndicadores}{resumenPlegado}</>, hueco)}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <SectionTitle id={`${panelId}-titulo`}>{meta.label}</SectionTitle>
          <span className="text-sm text-[var(--text-tertiary)]">{meta.help}</span>
        </div>
        {hueco ? null : (
          <>
            {resumenPlegado}
            {botonIndicadores}
          </>
        )}
      </div>

      {panel}
    </section>
  );
}
