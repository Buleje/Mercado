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
 * que sale (planos, archivos) en `use-loth-mapa-exportes`.
 */
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { ErrorAlert, SectionTitle } from "@buleje/design-system";
import { ClipboardCopy, Compass, FileCheck, Loader2, Printer, ShieldCheck, Square, Table, Upload } from "@buleje/design-system/icons";
import LothMapaMarco from "./LothMapaMarco";
import LothMapaBloque from "./LothMapaBloque";
import LothEudrRail, { resumenEudr, tonoEudr } from "./LothEudrRail";
import LothPlanoRequisitos, { resumenPlano } from "./LothPlanoRequisitos";
import LothVerticesPanel, { resumenVertices } from "./LothVerticesPanel";
import LothPredioPanel, { resumenPredio } from "./LothPredioPanel";
import LothContextoPanel, { resumenContexto } from "./LothContextoPanel";
import LothCaratulaBanner, { type CaratulaUbicacion } from "./LothCaratulaBanner";
import LothCoordsModal from "./LothCoordsModal";
import { useLothMapaDatos } from "./hooks/use-loth-mapa-datos";
import { useLothMapaDibujo } from "./hooks/use-loth-mapa-dibujo";
import { useLothMapaHerramientas } from "./hooks/use-loth-mapa-herramientas";
import { useLothMapaDerivados } from "./hooks/use-loth-mapa-derivados";
import { useLothMapaExportes } from "./hooks/use-loth-mapa-exportes";
import { formatNumber } from "@/lib/format";

/** Claves de los bloques plegables. Exportadas: la prueba en navegador las lee. */
export const CLAVES_BLOQUES_MAPA = {
  eudr: "loth:mapa:eudr-abierto",
  plano: "loth:mapa:plano-abierto",
  coordenadas: "loth:mapa:coordenadas-abierto",
  predio: "loth:mapa:predio-abierto",
  contexto: "loth:mapa:contexto-abierto",
} as const;

const TONO_PASTILLA = {
  success: "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  warning: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  error: "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
} as const;
const PASTILLA = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums";
const BTN_BLOQUE =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40";

const plural = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;

export default function LothMapaView({
  focusTree,
  onFocusHandled,
}: {
  /** Árbol a centrar al entrar (se llega acá desde la trazabilidad por árbol). */
  focusTree?: string | null;
  onFocusHandled?: () => void;
} = {}) {
  const marcoRef = useRef<HTMLElement>(null);
  const datos = useLothMapaDatos();
  const herr = useLothMapaHerramientas({ onError: datos.setError });
  const der = useLothMapaDerivados({ ...datos, showCenso: herr.showCenso, showGrid: herr.showGrid, hidden: herr.hidden });
  const dib = useLothMapaDibujo({ ...datos, censo: der.censoAll });
  const verticesCuadro = dib.drawMode && dib.draft.length >= 3 ? dib.draft : datos.parcela.vertices;
  const exp = useLothMapaExportes({
    ...datos,
    ...der,
    verticesCuadro,
    basemap: herr.basemap,
    overlays: herr.overlays,
    vista: herr.vista,
    onError: datos.setError,
  });
  const { centrar } = herr;
  const { raw, caratula, plan, parcela } = datos;
  const { geoAll, censoAll, readiness, declarada, checkPlano } = der;

  // Llegar al árbol, no al mapa entero: desde «Por árbol» se entra acá con un
  // código y el mapa se posiciona sobre él. Si el árbol no tiene coordenada, el
  // foco se consume igual — si no, quedaría pegado esperando para siempre.
  useEffect(() => {
    if (!focusTree || raw == null) return;
    const punto = geoAll.find((g) => g.code === focusTree || g.code.startsWith(`${focusTree}-`));
    const censado = punto ? undefined : censoAll.find((t) => t.code === focusTree);
    if (punto) centrar([punto.lat, punto.lng]);
    else if (censado) centrar([censado.lat, censado.lng]);
    onFocusHandled?.();
  }, [focusTree, raw, geoAll, censoAll, centrar, onFocusHandled]);

  /** Marcar o trazar desde un bloque de abajo: el mapa sube a la vista, que es donde se toca. */
  const alMapa = (accion: () => void) => {
    accion();
    marcoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const tono = tonoEudr(readiness);

  return (
    <div className="space-y-4" data-vista-mapa>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <SectionTitle>Mapa del área de aprovechamiento</SectionTitle>
        <p className="text-sm tabular-nums text-[var(--text-secondary)]" aria-live="polite">
          {datos.loading && raw === null ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Cargando ubicaciones…
            </span>
          ) : (
            <>
              {plural(geoAll.length, "operación geolocalizada", "operaciones geolocalizadas")}
              {censoAll.length > 0 && <> · {plural(censoAll.length, "árbol del censo", "árboles del censo")}</>}
              {declarada && <> · parcela {readiness.areaHa.toFixed(1)} ha</>}
              {declarada && readiness.fuera > 0 && (
                <span className="font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"> · {readiness.fuera} fuera</span>
              )}
            </>
          )}
        </p>
      </header>

      {datos.error && <ErrorAlert title="No se pudo completar" description={datos.error} />}

      <LothMapaMarco ref={marcoRef} datos={datos} dib={dib} herr={herr} der={der} exp={exp} verticesCuadro={verticesCuadro.length} />

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
            <button type="button" onClick={() => void exp.imprimirPlano()} className={BTN_BLOQUE}>
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
