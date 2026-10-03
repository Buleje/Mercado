"use client";

/**
 * LothMapaView — el mapa del Libro TH. El gemelo espacial del libro: el libro
 * dice CUÁNTA madera salió; el mapa dice DE DÓNDE, con qué coordenadas y si
 * eso resiste una fiscalización (SERFOR/OSINFOR) y el Reglamento UE
 * Antideforestación (EUDR · UE 2023/1115).
 *
 * Ordenada por la ley de las vistas (Brandon, 2026-09-18: «organizalo mejor,
 * mejor jerarquía, sin componentes dispersos»):
 *   1. UN título (`SectionTitle`) con las cifras de lo que hay en el mapa.
 *   2. El mapa, grande y arriba, con UNA barra (`LothMapaMarco`).
 *   3. Debajo, cinco bloques plegables que se recuerdan (`LothMapaBloque`):
 *      cumplimiento EUDR, plano del expediente, cuadro de coordenadas, predio,
 *      y referencias/vías/acceso. Plegados, cada uno dice su resumen.
 *
 * Esta vista sólo arma: los datos y el guardado viven en `use-loth-mapa-datos`,
 * el dibujo en `use-loth-mapa-dibujo`, las capas y herramientas en
 * `use-loth-mapa-herramientas`, lo calculado en `use-loth-mapa-derivados` y lo
 * que sale (planos, archivos) en `use-loth-mapa-exportes`; el censo del lado
 * de quien camina el monte (filtro, ficha del árbol, «¿Qué árbol tengo
 * cerca?») en `use-loth-mapa-arboles`.
 */
import "leaflet/dist/leaflet.css";
import { useRef } from "react";
import { ErrorAlert } from "@buleje/design-system";
import { ClipboardCopy, Compass, FileCheck, Printer, Route, ShieldCheck, Square, Table, Upload } from "@buleje/design-system/icons";
import LothMapaMarco from "./LothMapaMarco";
import LothMapaCabecera from "./LothMapaCabecera";
import LothMapaBloque from "./LothMapaBloque";
import LothEudrRail, { resumenEudr, tonoEudr } from "./LothEudrRail";
import LothPlanoRequisitos, { resumenPlano } from "./LothPlanoRequisitos";
import LothVerticesPanel, { resumenVertices } from "./LothVerticesPanel";
import LothPredioPanel, { resumenPredio } from "./LothPredioPanel";
import LothContextoPanel, { resumenContexto } from "./LothContextoPanel";
import LothRutasPuntosPanel, { resumenRutas } from "./LothRutasPuntosPanel";
import LothRutasExportar from "./LothRutasExportar";
import LothCaratulaBanner, { type CaratulaUbicacion } from "./LothCaratulaBanner";
import LothCoordsModal from "./LothCoordsModal";
import { useLothMapaDatos } from "./hooks/use-loth-mapa-datos";
import { useLothPermiso } from "./hooks/use-loth-libro-permiso";
import { PERMISO_SIN_PLAN } from "@/lib/forestal/loth-filtro-permiso";
import { useLothMapaDibujo } from "./hooks/use-loth-mapa-dibujo";
import { useLothMapaHerramientas } from "./hooks/use-loth-mapa-herramientas";
import { useLothMapaDerivados } from "./hooks/use-loth-mapa-derivados";
import { useLothMapaExportes } from "./hooks/use-loth-mapa-exportes";
import { useLothMapaArboles } from "./hooks/use-loth-mapa-arboles";
import { useLothMapaEtapas } from "./hooks/use-loth-mapa-etapas";
import { useLothMapaTalaVarios } from "./hooks/use-loth-mapa-tala-varios";
import { useLothPlanificador } from "./hooks/use-loth-planificador";
import { useLothMapaRutas } from "./hooks/use-loth-mapa-rutas";
import { useLothMapaFoco } from "./hooks/use-loth-mapa-foco";
import { useLothMapaImagenes } from "./hooks/use-loth-mapa-imagenes";
import type { TandaTalaInicial } from "./hooks/use-tala-en-tanda";

/** Claves de los bloques plegables. Exportadas: la prueba en navegador las lee. */
export const CLAVES_BLOQUES_MAPA = {
  eudr: "loth:mapa:eudr-abierto",
  plano: "loth:mapa:plano-abierto",
  coordenadas: "loth:mapa:coordenadas-abierto",
  predio: "loth:mapa:predio-abierto",
  contexto: "loth:mapa:contexto-abierto",
  rutas: "loth:mapa:rutas-abierto",
} as const;

const TONO_PASTILLA = {
  success: "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  warning: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  error: "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
} as const;
const PASTILLA = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums";
const BTN_BLOQUE =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40";

/** Referencias estables: un `[]` nuevo por render re-dispararía los hooks derivados. */
const SIN_ARBOLES: never[] = [];
const SIN_ESPECIES: never[] = [];

export default function LothMapaView({
  focusTree,
  onFocusHandled,
  onTalarVarios,
  reloadSignal = 0,
}: {
  /** Árbol a centrar al entrar (se llega acá desde la trazabilidad por árbol). */
  focusTree?: string | null;
  onFocusHandled?: () => void;
  /** «Elegir varios»: abre la MISMA planilla de tala en tanda que «Ver censo». */
  onTalarVarios?: (t: TandaTalaInicial) => void;
  /** Sube cada vez que el libro escribe (tala, tala en tanda, anulación): las etiquetas se releen sin recargar. */
  reloadSignal?: number;
} = {}) {
  const marcoRef = useRef<HTMLElement>(null);
  /* El permiso del libro (chip de la banda): su censo, su POA y sus líneas. Sin
     uno elegido, el plan activo, como antes. */
  const libro = useLothPermiso();
  const planDelLibro = libro?.planSel && libro.planSel !== PERMISO_SIN_PLAN ? libro.planSel : null;
  const datosCrudos = useLothMapaDatos({ planId: planDelLibro, filtro: libro?.filtro ?? null });
  /* «Sin permiso»: ningún censo ni plan (mismo criterio que Trazabilidad); el hook trae el del plan activo y acá se descarta. */
  const sinPlan = libro?.planSel === PERMISO_SIN_PLAN;
  const datos = sinPlan ? { ...datosCrudos, trees: SIN_ARBOLES, planSpecies: SIN_ESPECIES, plan: null } : datosCrudos;
  const herr = useLothMapaHerramientas({ onError: datos.setError });
  const der = useLothMapaDerivados({ ...datos, showCenso: herr.showCenso, showGrid: herr.showGrid, hidden: herr.hidden });
  const dib = useLothMapaDibujo({ ...datos, censo: der.censoAll });
  // Lo que el libro hizo con cada árbol (tala, trozas, despachos, CTP): se vuelve a leer con cada carga
  // y cada vez que el libro escribe — la tala registrada desde el mapa cambia la etiqueta ahí mismo.
  const etapas = useLothMapaEtapas(datos.plan?.id ?? null, datos.fitKey, reloadSignal);
  const arb = useLothMapaArboles(der.censoAll, { centrar: herr.centrar, etapas });
  // Patio, campamento, trochas y camino de salida según el terreno (panel sobre el mapa).
  const planificador = useLothPlanificador({ planId: datos.plan?.id ?? null, carto: datos.carto, guardarCartografia: datos.guardarCartografia, onEncuadrar: arb.encuadrar });
  // Las rutas y los puntos con sus coordenadas; sin rutas guardadas, la propuesta punteada.
  const rutas = useLothMapaRutas({
    planId: datos.plan?.id ?? null,
    carto: datos.carto,
    fitKey: datos.fitKey,
    censoCount: der.censoAll.length,
    onEncuadrar: arb.encuadrar,
    onCentrar: herr.centrar,
  });
  const variosTala = useLothMapaTalaVarios({
    // El censo con la etapa del libro: un árbol ya talado en el libro no se marca aunque el censo lo diga en pie.
    censoAll: arb.censoAll,
    trees: datos.trees,
    raw: datos.raw,
    poaConfig: datos.poaConfig,
    plan: datos.plan,
  });
  const talarVarios = () => {
    const tanda = variosTala.armarTanda();
    if (tanda) onTalarVarios?.(tanda);
    variosTala.desactivar();
  };
  const verticesCuadro = dib.drawMode && dib.draft.length >= 3 ? dib.draft : datos.parcela.vertices;
  // Sentinel-2 y la fecha de la foto de Esri (se pide al terminar de cargar el mapa): el mapa la pinta y el plano sale con ella.
  const img = useLothMapaImagenes({ planId: datos.plan?.id ?? null, listo: datos.fitKey > 0, waybackActivo: !!herr.wayback, apagarWayback: herr.apagarWayback });
  const exp = useLothMapaExportes({ ...datos, ...der, verticesCuadro, basemap: herr.basemap, overlays: herr.overlays, vista: herr.vista, imagen: img, onError: datos.setError });
  const { centrar } = herr;
  const { elegir } = arb;
  const { raw, caratula, plan, parcela } = datos;
  const { geoAll, censoAll, readiness, declarada, checkPlano } = der;

  useLothMapaFoco({ focusTree, onFocusHandled, raw, cargando: datos.loading, geoAll, censoAll, centrar, elegir });

  /** Marcar, trazar o ver una ruta desde un bloque de abajo: el mapa sube a la vista, que es donde se toca. */
  const alMapa = (accion: () => void, bloque: ScrollLogicalPosition = "start") => {
    accion();
    marcoRef.current?.scrollIntoView({ behavior: "smooth", block: bloque });
  };

  const tono = tonoEudr(readiness);

  return (
    <div className="space-y-4" data-vista-mapa>
      <LothMapaCabecera
        cargando={datos.loading && raw === null}
        permiso={plan ? { nombre: plan.planNumber ?? plan.titularName ?? "Plan sin número", elegido: planDelLibro != null } : null}
        operaciones={geoAll.length}
        arboles={censoAll.length}
        areaHa={declarada ? readiness.areaHa : null}
        fuera={readiness.fuera}
        rutas={rutas.rutas.length}
        puntos={rutas.puntos.length}
      />

      {datos.error && <ErrorAlert title="No se pudo completar" description={datos.error} />}

      <LothMapaMarco
        ref={marcoRef}
        datos={datos}
        dib={dib}
        herr={herr}
        der={der}
        exp={exp}
        arb={arb}
        variosTala={variosTala}
        onTalarVarios={talarVarios}
        verticesCuadro={verticesCuadro.length}
        plan={planificador}
        rutas={rutas}
        img={img}
      />

      <div className="space-y-3">
        <LothMapaBloque
          clave={CLAVES_BLOQUES_MAPA.eudr}
          titulo="Cumplimiento EUDR"
          icono={ShieldCheck}
          resumen={resumenEudr(readiness)}
          estado={<span className={`${PASTILLA} ${TONO_PASTILLA[tono]}`}>{readiness.score}/100</span>}
        >
          <LothEudrRail
            readiness={readiness}
            parcela={parcela}
            planAreaHa={plan?.areaHa ?? null}
            planParcelaCorta={plan?.parcelaCorta ?? null}
            drawMode={dib.drawMode}
            saving={datos.saving}
            onStartDraw={() => alMapa(dib.startDraw)}
            onToggleDeforestacion={dib.toggleDeforestacion}
            onExportGeoJson={exp.exportarGeoJson}
            onPrintDds={exp.imprimirDds}
          />
        </LothMapaBloque>

        <LothMapaBloque
          clave={CLAVES_BLOQUES_MAPA.plano}
          titulo="Plano del expediente"
          icono={FileCheck}
          resumen={resumenPlano(checkPlano)}
          estado={
            <span className={`${PASTILLA} ${TONO_PASTILLA[checkPlano.listo ? "success" : "warning"]}`}>
              {checkPlano.cumplidos} de {checkPlano.total}
            </span>
          }
          acciones={
            <button type="button" onClick={() => void exp.imprimirPlano()} title={`Sale sobre ${exp.planoSobre}`} className={BTN_BLOQUE}>
              <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Imprimir plano oficial
            </button>
          }
        >
          <LothPlanoRequisitos check={checkPlano}>
            <LothCaratulaBanner
              caratula={caratula ? { id: caratula.id, titularName: caratula.titularName, departamento: caratula.departamento, provincia: caratula.provincia, distrito: caratula.distrito } : null}
              titularSugerido={plan?.titularName ?? null}
              onSaved={(c: CaratulaUbicacion) =>
                datos.setCaratula({ ...c, tituloHabilitante: caratula?.tituloHabilitante ?? null })
              }
            />
          </LothPlanoRequisitos>
        </LothMapaBloque>

        <LothMapaBloque
          clave={CLAVES_BLOQUES_MAPA.coordenadas}
          titulo="Cuadro de coordenadas UTM"
          icono={Table}
          resumen={resumenVertices(verticesCuadro)}
          acciones={
            <>
              <button type="button" onClick={dib.importarArea} title="Pegar el cuadro del plan o subir KML/GeoJSON" className={BTN_BLOQUE}>
                <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Pegar
              </button>
              <button type="button" onClick={exp.copiarCoordenadas} disabled={verticesCuadro.length === 0} className={BTN_BLOQUE}>
                <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar
              </button>
            </>
          }
        >
          <LothVerticesPanel vertices={verticesCuadro} censoCount={censoAll.length} />
        </LothMapaBloque>

        <LothMapaBloque clave={CLAVES_BLOQUES_MAPA.predio} titulo="El predio" icono={Square} resumen={resumenPredio(datos.carto.predio)}>
          <LothPredioPanel
            cartografia={datos.carto}
            parcela={parcela}
            saving={datos.savingCarto}
            onChange={datos.setCarto}
            onSave={() => void datos.guardarCartografia()}
            onDibujarPredio={() => alMapa(dib.startDrawPredio)}
            onImportPredio={() => dib.setCoordsOpen("predio")}
            onCopiarDelArea={() => datos.setCarto((c) => ({ ...c, predio: { ...c.predio, vertices: parcela.vertices } }))}
          />
        </LothMapaBloque>

        <LothMapaBloque
          clave={CLAVES_BLOQUES_MAPA.rutas}
          titulo="Rutas y puntos"
          icono={Route}
          resumen={resumenRutas(rutas.rutas, rutas.puntos)}
          acciones={<LothRutasExportar rutas={rutas.rutas} puntos={rutas.puntos} />}
        >
          <LothRutasPuntosPanel
            rutas={rutas.rutas}
            puntos={rutas.puntos}
            relieve={rutas.relieve}
            clave={rutas.clave}
            onVer={(clave) => alMapa(() => rutas.verEnElMapa(clave), "center")}
          />
        </LothMapaBloque>

        <LothMapaBloque
          clave={CLAVES_BLOQUES_MAPA.contexto}
          titulo="Referencias, vías y acceso"
          icono={Compass}
          resumen={resumenContexto(datos.carto)}
        >
          <LothContextoPanel
            cartografia={datos.carto}
            markMode={dib.markMode}
            trazando={dib.viaDraft !== null}
            saving={datos.savingCarto}
            onChange={datos.setCarto}
            onSave={() => void datos.guardarCartografia()}
            onToggleMark={() => alMapa(() => dib.setMarkMode((v) => !v))}
            onTrazarVia={() => alMapa(dib.iniciarVia)}
          />
        </LothMapaBloque>
      </div>

      <LothCoordsModal
        open={dib.coordsOpen !== null}
        zonaDefault={der.zonaSugerida}
        onClose={() => dib.setCoordsOpen(null)}
        onApply={dib.aplicarCoordenadas}
      />
    </div>
  );
}
