"use client";

/**
 * Importar el Libro de Operaciones que devuelve el SNIFFS.
 *
 * El operador suelta el Excel —una sección o el libro entero, con sus cinco
 * hojas— y cada formato se reconoce solo por sus cabeceras: no hay que elegirlo
 * de una lista ni acertar el orden de las columnas, que es de donde salían los
 * errores.
 *
 * IMPORTA EL LIBRO COMPLETO, EN ORDEN. Antes se tomaba sólo la primera hoja
 * reconocible: quien subía el libro entero importaba los ingresos y perdía las
 * otras cuatro secciones sin enterarse. Ahora van todas, en el orden de la
 * cadena de custodia (`ctp-serfor-secuencia.ts`), que es lo que permite que la
 * producción encuentre su origen y el saldo salga solo.
 *
 * Nunca escribe a ciegas: primero muestra qué haría con cada fila y cómo va a
 * quedar el aserradero, y recién con eso a la vista aparece el botón.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle, Download, FileText, Upload, X } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { logger } from "@/lib/logger";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  FORMATOS_LIBRO,
  TITULO_FORMATO,
  columnasFaltantes,
  detectarColumnas,
  parsearFilas,
  type FormatoCtp,
  type FormatoLibro,
} from "@/lib/forestal/ctp-formatos-serfor";
import { leerArchivoSerfor } from "@/lib/forestal/ctp-serfor-archivo";
import { descargarPlantillaDeSeccion, descargarPlantillaSerfor } from "@/lib/forestal/ctp-serfor-plantilla";
import { CAMPO_BODY, ENDPOINT_DE, aCuerpoDelLibro, normalizarRespuesta } from "@/lib/forestal/ctp-serfor-a-libro";
import { ordenarSecciones, type SeccionDelLibro } from "@/lib/forestal/ctp-serfor-secuencia";
import {
  armarCadena,
  estadoDelLibro,
  mapaCodigoAGuia,
  normalizarLote,
  origenesDelDespacho,
  seResuelveAlImportar,
} from "@/lib/forestal/ctp-cadena-import";
import CajasPorSeccion, { type ArchivoDeSeccion } from "./serfor-import/CajasPorSeccion";
import ReporteDeImport from "./serfor-import/ReporteDeImport";
import { armarReporte } from "@/lib/forestal/ctp-reporte-import";

type ResultadoFila = { fila?: number; codigo: string; accion: string; mensaje: string };
type Respuesta = {
  resumen: { creados: number; porCrear: number; existen: number; errores: number };
  filas: ResultadoFila[];
};
/** El resultado de cada sección, para poder decir cuál falló. */
type ResultadoSeccion = { formato: FormatoCtp; respuesta: Respuesta };

/**
 * Baja de «error» a «pendiente» lo que el propio archivo va a resolver.
 *
 * Sólo aplica al preview: en el commit un error es un error.
 */
function reetiquetar(r: Respuesta, mapa: Map<string, string>): Respuesta {
  const filas = r.filas.map((f) =>
    f.accion === "error" && seResuelveAlImportar(f.mensaje, f.codigo, mapa)
      ? { ...f, accion: "crear", mensaje: "Se resuelve al importar: el ingreso viene en este mismo archivo" }
      : f,
  );
  return {
    filas,
    resumen: {
      ...r.resumen,
      porCrear: filas.filter((f) => f.accion === "crear").length,
      errores: filas.filter((f) => f.accion === "error").length,
    },
  };
}

/**
 * Le pega a cada salida los orígenes de las corridas de su mismo lote.
 *
 * Sólo aplica a Salidas y sólo si ya hay corridas importadas: en preview el mapa
 * está vacío y el despacho va sin atribuir, que es lo correcto porque todavía no
 * existe ninguna corrida a la cual atribuirlo.
 */
function atribuirSiEsSalida(
  formato: FormatoCtp,
  cuerpo: Record<string, unknown>[],
  parseadas: readonly { fila: number; datos: Record<string, unknown> }[],
  corridasPorLote: Map<string, { id: string; cantidad: number }[]>,
): Record<string, unknown>[] {
  if (formato !== "salidas" || corridasPorLote.size === 0) return cuerpo;
  const loteDeFila = new Map(parseadas.map((f) => [f.fila, normalizarLote(f.datos.lote)]));
  return cuerpo.map((fila) => {
    const lote = loteDeFila.get(Number(fila.row));
    const corridas = lote ? corridasPorLote.get(lote) : undefined;
    if (!corridas?.length) return fila;
    return { ...fila, origenes: origenesDelDespacho(Number(fila.quantity) || 0, corridas) };
  });
}

export default function CtpSerforImportModal({ onClose, onImportado }: { onClose: () => void; onImportado?: () => void }) {
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [secciones, setSecciones] = useState<SeccionDelLibro[]>([]);
  const [faltantes, setFaltantes] = useState<{ formato: FormatoCtp; labels: string[] }[]>([]);
  const [ignoradas, setIgnoradas] = useState<string[]>([]);
  /** `libro` = un Excel con las cinco hojas · `secciones` = un archivo por caja. */
  const [modo, setModo] = useState<"libro" | "secciones">("libro");
  const [archivos, setArchivos] = useState<Map<FormatoCtp, ArchivoDeSeccion>>(new Map());
  const [bajandoPlantilla, setBajandoPlantilla] = useState(false);
  const [resultados, setResultados] = useState<ResultadoSeccion[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [paso, setPaso] = useState<string | null>(null);
  /** Qué se está corriendo, para que el botón correcto muestre el progreso. */
  const [modoEnvio, setModoEnvio] = useState<"preview" | "commit" | null>(null);
  /**
   * Cuántas secciones van y cuántas faltan.
   *
   * Importar el libro completo son cinco requests en fila y cada uno puede
   * tardar: sin esto la pantalla se queda quieta y no hay forma de distinguir
   * «está trabajando» de «se colgó». */
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  /** Filas de la sección en curso: un import de UNA sola sección —el caso más
   *  común— se quedaba en «1 de 1» toda la corrida sin decir nada más, y con
   *  filas que tardan (piezas, atribución) parecía colgado. */
  const [pasoFilas, setPasoFilas] = useState<number | null>(null);
  /** Segundos desde que arrancó el envío en curso: cuando el % no se mueve
   *  (una sola sección larga), el contador vivo es lo único que dice "sigue
   *  trabajando" en vez de "se colgó". */
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!cargando) { setSegundos(0); return; }
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [cargando]);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Lee un archivo y devuelve todas sus secciones reconocibles.
   *
   * Lo usan los dos modos: el libro completo se queda con todas, y la caja por
   * sección con la que le corresponde. Una sola lectura para que las dos
   * puertas entiendan exactamente lo mismo.
   */
  const leerSecciones = useCallback(async (file: File) => {
    const hojas = await leerArchivoSerfor(file);
    const leidas: SeccionDelLibro[] = [];
    const sinColumnas: { formato: FormatoCtp; labels: string[] }[] = [];
    const noReconocidas: string[] = [];
    for (const h of hojas) {
      if (!h.formato) {
        if (h.filas.length > 0) noReconocidas.push(h.nombre);
        continue;
      }
      const mapeo = detectarColumnas(h.formato, h.cabeceras);
      leidas.push({
        formato: h.formato,
        nombreHoja: h.nombre,
        filaCabecera: h.filaCabecera,
        parseadas: parsearFilas(h.formato, mapeo, h.filas, h.filaCabecera + 1),
      });
      const falta = columnasFaltantes(h.formato, mapeo);
      if (falta.length > 0) sinColumnas.push({ formato: h.formato, labels: falta.map((c) => c.label) });
    }
    return { leidas, sinColumnas, noReconocidas };
  }, []);

  /**
   * Una caja de sección recibió su archivo.
   *
   * Se exige que el archivo SEA de esa sección: aceptar cualquiera «porque se
   * reconoce solo» dejaría al operador creyendo que cargó Consumos cuando en
   * realidad reemplazó Ingresos.
   */
  const tomarSeccion = useCallback(
    async (formato: FormatoCtp, file: File): Promise<string | null> => {
      setResultados(null);
      try {
        const { leidas } = await leerSecciones(file);
        const propia = leidas.find((x) => x.formato === formato);
        if (!propia) {
          const otras = leidas.map((x) => TITULO_FORMATO[x.formato]).join(", ");
          return otras
            ? `Este archivo es de ${otras}, no de acá. Soltalo en su caja.`
            : "No reconozco ninguna sección del libro en este archivo.";
        }
        setSecciones((prev) => [...prev.filter((x) => x.formato !== formato), propia]);
        setArchivos((prev) => new Map(prev).set(formato, { nombre: file.name, seccion: propia }));
        return null;
      } catch (e) {
        logger.error("[ctp-serfor-import] no se pudo leer la sección", { formato, error: String(e) });
        return "No se pudo leer el archivo. ¿Está corrupto o protegido?";
      }
    },
    [leerSecciones],
  );

  const quitarSeccion = useCallback((formato: FormatoCtp) => {
    setResultados(null);
    setSecciones((prev) => prev.filter((x) => x.formato !== formato));
    setArchivos((prev) => {
      const m = new Map(prev);
      m.delete(formato);
      return m;
    });
  }, []);

  const tomarArchivo = useCallback(async (file: File) => {
    setErr(null);
    setResultados(null);
    setCargando(true);
    try {
      /* TODAS las hojas reconocibles, no la primera: el libro del SNIFFS trae
         una sección por hoja y quedarse con una perdía las otras cuatro. Una
         hoja CON datos que no se reconoce se avisa: sin eso el operador ve «3
         secciones» y no sabe que la cuarta quedó afuera. */
      const { leidas, sinColumnas, noReconocidas } = await leerSecciones(file);

      if (leidas.length === 0) {
        setErr("No reconozco ninguna sección del libro en este archivo. ¿Es el Excel que baja del SNIFFS?");
        setSecciones([]);
        setNombreArchivo(null);
        return;
      }
      setSecciones(leidas);
      setFaltantes(sinColumnas);
      setIgnoradas(noReconocidas);
      setNombreArchivo(file.name);
    } catch (e) {
      logger.error("[ctp-serfor-import] no se pudo leer el archivo", { error: String(e) });
      setErr("No se pudo leer el archivo. ¿Está corrupto o protegido?");
    } finally {
      setCargando(false);
    }
  }, [leerSecciones]);

  const orden = ordenarSecciones(secciones);
  const filasDe = (f: FormatoCtp) => orden.find((s) => s.formato === f)?.parseadas;
  /* El estado que va a quedar y los huecos de la cadena, calculados sobre el
     archivo: el operador los ve ANTES de escribir, no después. */
  const estado = orden.length > 0 ? estadoDelLibro({
    ingresos: filasDe("ingresos"),
    consumos: filasDe("consumos"),
    produccion: filasDe("produccion"),
    salidas: filasDe("salidas"),
  }) : null;
  const avisos = armarCadena({
    consumos: filasDe("consumos"),
    produccion: filasDe("produccion"),
    salidas: filasDe("salidas"),
  }).avisos;

  const totalListas = orden.reduce((s, x) => s + x.parseadas.filter((f) => f.problemas.length === 0).length, 0);

  const mapaIngresos = mapaCodigoAGuia(filasDe("ingresos"));

  /**
   * Lo que declara el inventario, por si vino en este archivo.
   *
   * Se muestra aparte del estado del libro: el libro dice qué PASÓ y el
   * inventario qué HAY. Sumarlos en el mismo panel haría parecer que la
   * existencia es un movimiento más.
   */
  const resumirInv = (f: FormatoCtp) => {
    const filas = filasDe(f)?.filter((x) => x.problemas.length === 0);
    if (!filas?.length) return null;
    return {
      m3: Math.round(filas.reduce((s, x) => s + (Number(x.datos.volumenM3) || 0), 0) * 1000) / 1000,
      piezas: filas.length,
      especies: new Set(filas.map((x) => String(x.datos.especie ?? "").trim().toLowerCase()).filter(Boolean)).size,
    };
  };
  const invRolliza = resumirInv("inventarioTrozas");
  const invAserrada = resumirInv("inventarioAserrada");
  const inventario = invRolliza || invAserrada ? { rolliza: invRolliza, aserrada: invAserrada } : null;

  /** `null` = el libro completo; un formato = esa sección suelta. */
  const bajarPlantilla = async (formato: FormatoLibro | null) => {
    setBajandoPlantilla(true);
    try {
      await (formato ? descargarPlantillaDeSeccion(formato) : descargarPlantillaSerfor());
    } catch (e) {
      logger.error("[ctp-serfor-import] no se pudo generar la plantilla", { error: String(e), formato });
      setErr("No se pudo generar la plantilla.");
    } finally {
      setBajandoPlantilla(false);
    }
  };

  const enviar = async (mode: "preview" | "commit") => {
    if (orden.length === 0) return;
    setCargando(true);
    setModoEnvio(mode);
    setErr(null);
    const acumulado: ResultadoSeccion[] = [];
    /* Las corridas que este import va creando, por lote. Es lo que después
       permite atribuir cada despacho a la producción que lo respalda (I3/I5):
       Salidas corre última justamente para tenerlas. */
    const corridasPorLote = new Map<string, { id: string; cantidad: number }[]>();
    try {
      /* SECUENCIAL y en orden de dependencia: la producción se atribuye contra
         los ingresos, así que tienen que estar escritos antes. En paralelo la
         corrida no encontraría su origen y entraría sin consumos. */
      for (const [i, s] of orden.entries()) {
        setPaso(TITULO_FORMATO[s.formato]);
        setPasoFilas(s.parseadas.length);
        setAvance({ hechas: i, total: orden.length });
        const destino = ENDPOINT_DE[s.formato];
        const res = await fetch(destino.url, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            mode,
            registro: destino.registro,
            fileName: nombreArchivo ?? s.nombreHoja,
            origen: "libro-oficial",
            [CAMPO_BODY[s.formato]]: atribuirSiEsSalida(
              s.formato,
              aCuerpoDelLibro(s.formato, s.parseadas, {
                ingresos: filasDe("ingresos"),
                consumos: filasDe("consumos"),
              }),
              s.parseadas,
              corridasPorLote,
            ),
          }),
        });
        const j = await res.json();
        if (!res.ok) {
          /* Se corta acá: seguir con las secciones que dependen de esta sólo
             sumaría errores en cascada sobre un libro a medio escribir. */
          setErr(`${TITULO_FORMATO[s.formato]}: ${j?.error ?? "no se pudo procesar"}`);
          setResultados(acumulado.length > 0 ? acumulado : null);
          return;
        }
        /* Al crear producción, el server devuelve el id de cada corrida: se
           indexa por el lote de su fila para que las Salidas lo encuentren. */
        if (s.formato === "produccion" && mode === "commit") {
          const loteDeFila = new Map(s.parseadas.map((f) => [f.fila, normalizarLote(f.datos.lote)]));
          for (const d of (j?.detalle ?? []) as { row?: number; id?: string; cantidad?: number }[]) {
            const lote = d.row != null ? loteDeFila.get(d.row) : "";
            if (!lote || !d.id || !d.cantidad) continue;
            corridasPorLote.set(lote, [...(corridasPorLote.get(lote) ?? []), { id: d.id, cantidad: d.cantidad }]);
          }
        }

        const r = normalizarRespuesta(j);
        /* En preview, los errores de «falta el ingreso» que este mismo archivo
           trae se marcan como pendientes, no como fallas: al importar de verdad
           los ingresos van primero y se resuelven solos. */
        acumulado.push({
          formato: s.formato,
          respuesta: mode === "preview" ? reetiquetar(r, mapaIngresos) : r,
        });
      }
      setResultados(acumulado);
      if (mode === "commit") onImportado?.();
    } catch (e) {
      logger.error("[ctp-serfor-import] falló el envío", { error: String(e) });
      setErr("No se pudo enviar. Revisá la conexión.");
      setResultados(acumulado.length > 0 ? acumulado : null);
    } finally {
      setCargando(false);
      setPaso(null);
      setPasoFilas(null);
      setModoEnvio(null);
      setAvance(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Importar el libro"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-5">
          <div>
            <SectionTitle as="h2" className="text-lg font-extrabold text-[var(--text-primary)]">Importar el libro</SectionTitle>
            <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
              El Excel que baja del SNIFFS, o la plantilla. Reconozco las cinco secciones por sus columnas.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-5">
          {/* ── Cómo viene el libro ─────────────────────────────────── */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Cómo viene el libro">
            {([
              ["libro", "Un solo archivo", "El Excel con las cinco hojas"],
              ["secciones", "Un archivo por sección", "Cada sección en su caja"],
            ] as const).map(([v, titulo, sub]) => (
              <button
                key={v}
                onClick={() => {
                  /* Cambiar de modo limpia lo cargado: mezclar un libro completo
                     con archivos sueltos deja al operador sin saber qué se va a
                     escribir. */
                  setModo(v);
                  setSecciones([]);
                  setArchivos(new Map());
                  setResultados(null);
                  setNombreArchivo(null);
                  setErr(null);
                }}
                aria-pressed={modo === v}
                className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                  modo === v
                    ? "border-primary bg-primary/10"
                    : "border-[var(--rule-base)] hover:border-primary/50"
                }`}
              >
                <span className="block text-base font-extrabold text-[var(--text-primary)]">{titulo}</span>
                <span className="block text-sm text-[var(--text-tertiary)]">{sub}</span>
              </button>
            ))}
          </div>

          {modo === "secciones" ? (
            <CajasPorSeccion
              cargadas={archivos}
              onArchivo={tomarSeccion}
              onQuitar={quitarSeccion}
              deshabilitado={cargando}
            />
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void tomarArchivo(f);
              }}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--rule-base)] px-6 py-8 transition-colors hover:border-primary hover:bg-primary/5"
            >
              <Upload className="h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
              <span className="text-base font-bold text-[var(--text-primary)]">
                {nombreArchivo ?? "Soltá el archivo o tocá para elegirlo"}
              </span>
              <span className="text-sm text-[var(--text-tertiary)]">Excel (.xlsx) o CSV · las 5 secciones del libro</span>
            </button>
          )}
          {/* El input vive FUERA del botón: un control de formulario no puede
              colgar de un `<button>`. Sigue oculto y lo abre el click de arriba. */}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void tomarArchivo(f);
            }}
          />

          {err && (
            <p className="flex items-start gap-2 rounded-xl bg-[var(--data-error)]/10 px-4 py-3 text-base font-semibold text-[var(--data-error)]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {err}
            </p>
          )}

          {/* ── Qué secciones trae el archivo ────────────────────────────── */}
          {orden.length > 0 && (
            <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] p-4">
              <p className="text-base font-extrabold text-[var(--text-primary)]">
                {orden.length === 1 ? "1 sección reconocida" : `${orden.length} secciones reconocidas`}
                <span className="ml-2 text-sm font-semibold text-[var(--text-tertiary)]">
                  · se importan en este orden
                </span>
              </p>
              {orden.map((s, i) => {
                const listas = s.parseadas.filter((f) => f.problemas.length === 0).length;
                const malas = s.parseadas.length - listas;
                const falta = faltantes.find((x) => x.formato === s.formato);
                return (
                  <div key={s.formato} className="flex flex-wrap items-baseline gap-2 text-base">
                    <span className="w-5 shrink-0 text-sm font-bold tabular-nums text-[var(--text-tertiary)]">
                      {i + 1}.
                    </span>
                    <CheckCircle className="h-4 w-4 shrink-0 text-[var(--data-success)]" aria-hidden />
                    <strong className="text-[var(--text-primary)]">{TITULO_FORMATO[s.formato]}</strong>
                    <span className="tabular-nums text-[var(--text-secondary)]">{listas} filas</span>
                    {malas > 0 && (
                      <span className="tabular-nums font-semibold text-[var(--data-warning)]">
                        · {malas} incompleta{malas === 1 ? "" : "s"}
                      </span>
                    )}
                    {falta && (
                      <span className="text-sm font-semibold text-[var(--data-warning)]">
                        · faltan columnas: {falta.labels.join(", ")}
                      </span>
                    )}
                  </div>
                );
              })}

              {ignoradas.length > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-[var(--data-warning)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-warning)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {ignoradas.length === 1 ? "Esta hoja tiene datos" : "Estas hojas tienen datos"} pero no reconozco su
                    formato: <strong>{ignoradas.join(", ")}</strong>. No se van a importar — revisá que los nombres de
                    las columnas sean los del SNIFFS.
                  </span>
                </p>
              )}

              {/* Las primeras filas con problema, con su número de Excel: sin el
                  número hay que buscar a ojo en un archivo de 300 líneas. */}
              {orden
                .flatMap((s) => s.parseadas.filter((f) => f.problemas.length > 0).map((f) => ({ s, f })))
                .slice(0, 5)
                .map(({ s, f }) => (
                  <p key={`${s.formato}-${f.fila}`} className="text-sm text-[var(--data-warning)]">
                    {TITULO_FORMATO[s.formato]}, fila {f.fila}: {f.problemas.join(" · ")}
                  </p>
                ))}
            </div>
          )}

          {/* ── Qué existencia declara el inventario ─────────────────────── */}
          {inventario && (
            <div className="space-y-2 rounded-xl border border-[var(--data-success)]/30 bg-[var(--data-success)]/5 p-4">
              <p className="text-base font-extrabold text-[var(--text-primary)]">Existencia que vas a cargar</p>
              <dl className="grid grid-cols-2 gap-3">
                {inventario.rolliza && (
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-tertiary)]">Rolliza en patio</dt>
                    <dd className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
                      {inventario.rolliza.m3.toLocaleString("es-PE", { maximumFractionDigits: 3 })} m³
                    </dd>
                    <dd className="text-sm text-[var(--text-tertiary)]">
                      {inventario.rolliza.piezas} trozas · {inventario.rolliza.especies} especies
                    </dd>
                  </div>
                )}
                {inventario.aserrada && (
                  <div>
                    <dt className="text-sm font-semibold text-[var(--text-tertiary)]">Aserrada en depósito</dt>
                    <dd className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
                      {inventario.aserrada.m3.toLocaleString("es-PE", { maximumFractionDigits: 3 })} m³
                    </dd>
                    <dd className="text-sm text-[var(--text-tertiary)]">
                      {inventario.aserrada.piezas} paquetes · {inventario.aserrada.especies} especies
                    </dd>
                  </div>
                )}
              </dl>
              {/* El número contra el que hay que cuadrarlo: sin decir de dónde
                  sale, el operador no sabe si su inventario está bien. */}
              <p className="text-sm text-[var(--text-secondary)]">
                Cuadrá esto contra el «Saldo Inicial» del Cuadro Resumen 2 del SNIFFS (aserrada) y el saldo de trozas
                del Cuadro 1. Si no coinciden, falta o sobra algo en el conteo.
              </p>
            </div>
          )}

          {/* ── Cómo va a quedar el aserradero ───────────────────────────── */}
          {estado && (estado.ingresadoM3 > 0 || estado.consumidoM3 > 0 || estado.producidoM3 > 0) && (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-base font-extrabold text-[var(--text-primary)]">
                Lo que declara este libro
                {estado.lotes > 0 && (
                  <span className="ml-2 text-sm font-semibold text-[var(--text-tertiary)]">
                    · {estado.lotes} lote{estado.lotes === 1 ? "" : "s"} de producción
                  </span>
                )}
              </p>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { t: "Ingresó", v: estado.ingresadoM3, sub: "materia prima" },
                  { t: "Se aserró", v: estado.consumidoM3, sub: "consumido" },
                  { t: "Queda en patio", v: estado.enPatioM3, sub: "rolliza disponible", ojo: estado.enPatioM3 < 0 },
                  { t: "Se produjo", v: estado.producidoM3, sub: "aserrada" },
                  { t: "Se despachó", v: estado.despachadoM3, sub: "con guía, a terceros" },
                  ...(estado.consumoInternoM3 > 0
                    ? [{ t: "Consumo interno", v: estado.consumoInternoM3, sub: "marcado C/I en el libro" }]
                    : []),
                  { t: "Queda en depósito", v: estado.enDepositoM3, sub: "sin despachar", ojo: estado.enDepositoM3 < 0 },
                ].map((k) => (
                  <div key={k.t}>
                    <dt className="text-sm font-semibold text-[var(--text-tertiary)]">{k.t}</dt>
                    <dd
                      className={`text-lg font-extrabold tabular-nums ${
                        k.ojo ? "text-[var(--data-error)]" : "text-[var(--text-primary)]"
                      }`}
                    >
                      {k.v.toLocaleString("es-PE", { maximumFractionDigits: 3 })} m³
                    </dd>
                    <dd className="text-sm text-[var(--text-tertiary)]">{k.sub}</dd>
                  </div>
                ))}
              </dl>
              {estado.aperturaNecesariaM3 > 0 && (
                <p className="rounded-lg bg-[var(--data-warning)]/10 px-3 py-2 text-base font-semibold text-[var(--text-primary)]">
                  Este libro arranca a mitad: despacha producto aserrado antes de la primera corrida que declara, así
                  que el depósito no puede empezar en cero.{" "}
                  <span className="font-normal text-[var(--text-secondary)]">
                    Por el detalle harían falta al menos{" "}
                    <strong className="tabular-nums">
                      {estado.aperturaNecesariaM3.toLocaleString("es-PE", { maximumFractionDigits: 3 })} m³
                    </strong>{" "}
                    de existencia inicial, pero el número exacto NO se estima: lo declara el «Saldo Inicial» del Cuadro
                    Resumen 2 del SNIFFS. Bajá ese cuadro y cargalo como existencia de apertura.
                  </span>
                </p>
              )}
              {estado.rendimientoPct != null && (
                <p className="text-base text-[var(--text-secondary)]">
                  Rendimiento del libro:{" "}
                  <strong className="tabular-nums text-[var(--text-primary)]">{estado.rendimientoPct}%</strong>
                  <span className="text-sm text-[var(--text-tertiary)]"> · un aserradero rinde entre 45 y 60%</span>
                </p>
              )}
            </div>
          )}

          {/* ── Lo que un fiscalizador levantaría de este libro ───────────── */}
          {avisos.length > 0 && (
            <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] p-4">
              <p className="text-base font-extrabold text-[var(--text-primary)]">Revisá esto antes de importar</p>
              {avisos.slice(0, 8).map((a, i) => (
                <p
                  key={`${a.lote}-${i}`}
                  className={`flex items-start gap-2 text-sm font-semibold ${
                    a.nivel === "error" ? "text-[var(--data-error)]" : "text-[var(--data-warning)]"
                  }`}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {a.lote !== "—" && <strong>Lote {a.lote}: </strong>}
                    {a.mensaje}
                  </span>
                </p>
              ))}
              {avisos.length > 8 && (
                <p className="text-sm text-[var(--text-tertiary)]">y {avisos.length - 8} más…</p>
              )}
            </div>
          )}

          {/* ── El avance, sección por sección ──────────────────────────── */}
          {avance && (
            <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] p-4">
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-base font-extrabold text-[var(--text-primary)]">
                <span>
                  {modoEnvio === "commit" ? "Importando" : "Revisando"} {paso ?? "…"}
                  {/* Un import de UNA sola sección —el caso más común— se
                      quedaba en "1 de 1" toda la corrida sin más información:
                      la cantidad de filas es lo único que dice cuánto hay
                      adentro de ese "1". */}
                  {pasoFilas != null && (
                    <span className="ml-1 text-sm font-semibold text-[var(--text-tertiary)]">
                      · {pasoFilas} {pasoFilas === 1 ? "fila" : "filas"}
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-[var(--text-tertiary)]">
                  {avance.hechas + 1} de {avance.total}
                  {/* Recién a los 3s: antes de eso el contador sólo agrega
                      ruido a algo que ya se ve andar. */}
                  {segundos >= 3 && <span className="ml-1">· {segundos}s</span>}
                </span>
              </p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={avance.total}
                aria-valuenow={avance.hechas}
                aria-label="Avance de la importación"
                className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  /* Se pinta lo TERMINADO, no lo que está en curso: una barra que
                     ya muestra completa la sección que todavía está corriendo
                     miente justo cuando el operador la mira para saber si puede
                     irse. */
                  style={{ width: `${Math.round((avance.hechas / avance.total) * 100)}%` }}
                />
                {/* El segmento de la sección EN CURSO parpadea: sin esto, una
                    sección lenta (piezas, atribución de consumos) deja la
                    barra clavada en el mismo % durante varios segundos y se
                    lee como colgada en vez de trabajando. */}
                <div
                  aria-hidden
                  className="absolute top-0 h-full animate-pulse rounded-full bg-primary/40 transition-[left,width] duration-300"
                  style={{
                    left: `${Math.round((avance.hechas / avance.total) * 100)}%`,
                    width: `${Math.round((1 / avance.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-sm text-[var(--text-tertiary)]">
                {/* Las secciones van en orden porque dependen entre sí; decirlo
                    acá evita que parezca lentitud gratuita. */}
                Van en orden porque cada una necesita la anterior. No cierres esta ventana.
              </p>
            </div>
          )}

          {/* ── El reporte: qué entró, qué quedó afuera y qué hacer ─────── */}
          {resultados && (
            <ReporteDeImport
              reporte={armarReporte(resultados, {
                incompletas: orden.flatMap((sec) =>
                  sec.parseadas
                    .filter((f) => f.problemas.length > 0)
                    .map((f) => ({ formato: sec.formato, fila: f.fila, motivos: f.problemas })),
                ),
                avisosDeCadena: avisos,
              })}
              nombreArchivo={nombreArchivo}
              escrito={resultados.some((r) => r.respuesta.resumen.creados > 0)}
            />
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 bg-[var(--surface-sunken)] px-6 py-4">
          {/* La plantilla vive acá y no en el menú: es lo que se busca cuando
              uno abre esta pantalla y no tiene el archivo. */}
          {/* Las dos formas de trabajar: el libro entero en un Excel de cinco
              hojas, o una sección suelta. Es el MISMO formato —lo escribe la
              misma función— así que las dos entran por esta misma pantalla. */}
          <div className="mr-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() => void bajarPlantilla(null)}
              disabled={bajandoPlantilla}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--surface-raised)] px-4 text-base font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <Download className="h-5 w-5" /> {bajandoPlantilla ? "Generando…" : "Libro completo"}
            </button>
            <label className="sr-only" htmlFor="plantilla-seccion">
              Descargar una sección suelta
            </label>
            <select
              id="plantilla-seccion"
              value=""
              disabled={bajandoPlantilla}
              onChange={(e) => {
                const v = e.target.value as FormatoLibro | "";
                if (v) void bajarPlantilla(v);
                e.target.value = "";
              }}
              className="h-12 rounded-xl bg-[var(--surface-raised)] px-3 text-base font-bold text-[var(--text-secondary)] disabled:opacity-50"
            >
              <option value="">…o una sección suelta</option>
              {FORMATOS_LIBRO.map((f) => (
                <option key={f} value={f}>
                  {TITULO_FORMATO[f]}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={onClose}
            className="h-12 rounded-xl px-5 text-base font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)]"
          >
            Cerrar
          </button>
          {orden.length > 0 && (
            <>
              {/* Revisar quedó como opción, no como peaje: el estado del libro
                  y los avisos de la cadena ya se ven arriba SIN pedirle nada al
                  servidor, y el reporte final dice exactamente qué pasó. Hacer
                  esperar dos rondas completas para lo mismo era cobrar el doble
                  de tiempo por la misma información. */}
              <button
                onClick={() => void enviar("preview")}
                disabled={cargando || totalListas === 0}
                className="inline-flex h-12 items-center gap-2 rounded-xl px-4 text-base font-bold text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                <FileText className="h-5 w-5" />
                {cargando && modoEnvio === "preview" ? (paso ? `Revisando ${paso}…` : "Revisando…") : "Sólo revisar"}
              </button>
              <button
                onClick={() => void enviar("commit")}
                disabled={cargando || totalListas === 0}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
              >
                <Upload className="h-5 w-5" />
                {cargando && modoEnvio === "commit"
                  ? paso
                    ? `Importando ${paso}…`
                    : "Importando…"
                  : `Importar ${totalListas} filas`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
