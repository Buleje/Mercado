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
 * VARIOS ARCHIVOS, CADA UNO CON SU PERMISO (Brandon 19-10, ADR-503): en «Un
 * archivo por sección» cada caja acepta los archivos que quieras y cada uno
 * dice a qué permiso pertenece (titular, RUC); en «Un solo archivo», un permiso
 * para todo el libro. El servidor sólo llena lo vacío: una fila que ya trae su
 * contrato lo conserva y el reporte lo cuenta aparte.
 *
 * Nunca escribe a ciegas: primero muestra qué haría con cada fila y cómo va a
 * quedar el aserradero, y recién con eso a la vista aparece el botón. La lógica
 * vive en `serfor-import/use-archivos-del-libro.ts` (qué se cargó) y
 * `serfor-import/use-enviar-libro.ts` (cómo se manda).
 */

import { useMemo } from "react";
import { AlertTriangle, FileText, Upload } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import AdminModal from "@/components/admin/shared/AdminModal";
import { filasQueEntran } from "@/lib/forestal/ctp-serfor-a-libro";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import { useMiRol } from "@/hooks/use-mi-rol";
import { armarCadena, mapaCodigoAGuia } from "@/lib/forestal/ctp-cadena-import";
import { llevaPermiso, revisarEntreArchivos } from "@/lib/forestal/ctp-import-entre-archivos";
import { armarReporte } from "@/lib/forestal/ctp-reporte-import";
import AsignarPermisoDeArchivo from "./serfor-import/AsignarPermisoDeArchivo";
import AvanceDelEnvio from "./serfor-import/AvanceDelEnvio";
import BajarPlantilla from "./serfor-import/BajarPlantilla";
import CajasPorSeccion from "./serfor-import/CajasPorSeccion";
import LoQueDeclaraElLibro from "./serfor-import/LoQueDeclaraElLibro";
import ReporteDeImport from "./serfor-import/ReporteDeImport";
import RevisionDelLibro from "./serfor-import/RevisionDelLibro";
import { etiquetaDe, useArchivosDelLibro, type ArchivoCargado } from "./serfor-import/use-archivos-del-libro";
import { useEnviarLibro } from "./serfor-import/use-enviar-libro";
import ZonaDelLibro from "./serfor-import/ZonaDelLibro";

const MODOS = [
  ["libro", "Un solo archivo", "El Excel con las cinco hojas"],
  ["secciones", "Un archivo por sección", "Cada sección en su caja, con su permiso"],
] as const;

export default function CtpSerforImportModal({ onClose, onImportado }: { onClose: () => void; onImportado?: () => void }) {
  const envio = useEnviarLibro({ onImportado });
  /* Todo cambio de lo cargado invalida el reporte y el error anteriores. */
  const libro = useArchivosDelLibro({ alCambiar: envio.limpiar });
  /* Una sola lista de permisos para todos los selectores: crear uno en un
     archivo lo deja elegible en los demás sin volver a pedirlo. */
  const catalogo = usePermisosForestal();
  const rol = useMiRol();
  /* El servidor exige admin o dueño para asignar (el encargado no): `null` = todavía no se sabe. */
  const puede = rol == null ? null : rol === "admin" || rol === "owner";

  const { modo, ordenados, filasDe, permisoDe } = libro;
  const hay = ordenados.length > 0;
  const nombres = [...new Set(ordenados.map((a) => a.nombre))];
  const nombreArchivo = nombres.length === 1 ? nombres[0] : null;

  const avisosDeCadena = armarCadena({
    consumos: filasDe("consumos"),
    produccion: filasDe("produccion"),
    salidas: filasDe("salidas"),
  }).avisos;

  /* Lo que sólo se ve juntando archivos: la misma planta en dos, una GTF con
     dos permisos. Las hojas de un mismo Excel no se comparan entre sí (mismo
     `archivoId`): ahí el SNIFFS ya cuadró lo suyo. */
  const avisosEntreArchivos = useMemo(
    () =>
      revisarEntreArchivos(
        ordenados.map((a) => {
          const id = permisoDe(a);
          return {
            id: a.archivoId,
            nombre: etiquetaDe(a),
            formato: a.formato,
            parseadas: a.seccion.parseadas,
            permiso: id ? { id, codigo: catalogo.contratos.find((c) => c.id === id)?.codigo ?? "?" } : null,
          };
        }),
      ),
    [ordenados, permisoDe, catalogo.contratos],
  );

  const totalListas = ordenados.reduce((s, a) => s + filasQueEntran(a.formato, a.seccion.parseadas).length, 0);

  const enviar = (mode: "preview" | "commit") =>
    void envio.enviar(mode, { archivos: ordenados, permisoDe, filasDe, mapaIngresos: mapaCodigoAGuia(filasDe("ingresos")) });

  const tomarLibro = async (f: File) => {
    const error = await libro.tomarLibro(f);
    if (error) envio.setErr(error);
  };

  /* El selector de permiso de cada archivo, sólo en las secciones que originan
     madera (Ingresos, Producción y los dos inventarios). */
  const permisoDeArchivo = (a: ArchivoCargado, deLaSeccion: readonly ArchivoCargado[]) =>
    llevaPermiso(a.formato) ? (
      <AsignarPermisoDeArchivo
        catalogo={catalogo}
        valor={a.contratoId}
        onCambiar={(id) => libro.asignar(a.id, id)}
        puede={puede}
        etiqueta={`Permiso de ${etiquetaDe(a)}`}
        deshabilitado={envio.cargando}
        enTodos={
          a.contratoId
            ? {
                cuantos: deLaSeccion.filter((h) => h.id !== a.id && h.contratoId !== a.contratoId).length,
                onUsar: () => libro.asignarASeccion(a.formato, a.contratoId),
              }
            : null
        }
      />
    ) : null;

  const { cargando, modoEnvio, paso } = envio;

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Importar el libro"
      icon={Upload}
      ayuda={
        <InfoTip
          title="Importar el libro"
          what="El Excel que baja del SNIFFS, o la plantilla. Puedes subir varios archivos por sección y decir a qué permiso pertenece cada uno."
          example="Reconozco las cinco secciones por sus columnas — no hace falta elegirlas de una lista ni acertar el orden."
        />
      }
      size="xl"
      claveVentana="ctp-importar-libro"
      footer={
        <ModalFooter>
          <BajarPlantilla onError={envio.setErr} />
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
            Cerrar
          </button>
          {hay && (
            <>
              {/* Revisar quedó como opción, no como peaje: el estado del libro
                  y los avisos ya se ven arriba SIN pedirle nada al servidor. */}
              <button
                type="button"
                onClick={() => enviar("preview")}
                disabled={cargando || totalListas === 0}
                className={button({ variant: "ghost" })}
              >
                <FileText className="h-5 w-5" aria-hidden />
                {cargando && modoEnvio === "preview" ? (paso ? `Revisando ${paso}…` : "Revisando…") : "Sólo revisar"}
              </button>
              <button
                type="button"
                onClick={() => enviar("commit")}
                disabled={cargando || totalListas === 0}
                className={button({ variant: "primary" })}
              >
                <Upload className="h-5 w-5" aria-hidden />
                {cargando && modoEnvio === "commit"
                  ? paso
                    ? `Importando ${paso}…`
                    : "Importando…"
                  : `Importar ${totalListas} filas`}
              </button>
            </>
          )}
        </ModalFooter>
      }
    >
      <div className="space-y-4 px-5 py-5 sm:px-6">
        {/* ── Cómo viene el libro ─────────────────────────────────── */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Cómo viene el libro">
          {MODOS.map(([v, titulo, sub]) => (
            <button
              key={v}
              type="button"
              onClick={() => libro.cambiarModo(v)}
              aria-pressed={modo === v}
              disabled={cargando}
              className={`min-h-12 flex-1 rounded-xl border-2 px-4 text-left transition-colors disabled:opacity-60 ${
                modo === v ? "border-primary bg-primary/10" : "border-[var(--rule-base)] hover:border-primary/50"
              }`}
            >
              <span className="block text-base font-extrabold text-[var(--text-primary)]">{titulo}</span>
              <span className="block text-sm text-[var(--text-tertiary)]">{sub}</span>
            </button>
          ))}
        </div>

        {modo === "secciones" ? (
          <CajasPorSeccion
            archivos={libro.archivos}
            onAgregar={libro.agregarASeccion}
            onQuitar={libro.quitar}
            deshabilitado={cargando}
            estadoDe={envio.estadoDe}
            permiso={permisoDeArchivo}
          />
        ) : (
          <ZonaDelLibro
            nombreArchivo={nombreArchivo}
            leyendo={libro.leyendo}
            deshabilitado={cargando}
            onArchivo={(f) => void tomarLibro(f)}
            permiso={
              catalogo.disponible && ordenados.some((a) => llevaPermiso(a.formato)) ? (
                <AsignarPermisoDeArchivo
                  catalogo={catalogo}
                  valor={libro.permisoLibro}
                  onCambiar={libro.elegirPermisoLibro}
                  puede={puede}
                  etiqueta="Permiso de todo el libro"
                  deshabilitado={cargando}
                />
              ) : null
            }
          />
        )}

        {envio.err && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-[var(--data-error)]/10 px-4 py-3 text-base font-semibold text-[var(--data-error)]"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {envio.err}
          </p>
        )}

        <RevisionDelLibro
          ordenados={ordenados}
          ignoradas={libro.ignoradas}
          variosArchivos={nombres.length > 1}
          avisosDeCadena={avisosDeCadena}
          avisosEntreArchivos={avisosEntreArchivos}
        />
        <LoQueDeclaraElLibro filasDe={filasDe} hay={hay} />
        <AvanceDelEnvio
          avance={envio.avance}
          modoEnvio={modoEnvio}
          paso={paso}
          pasoFilas={envio.pasoFilas}
          segundos={envio.segundos}
        />

        {/* ── El reporte: qué entró, qué quedó afuera y qué hacer ─────── */}
        {envio.resultados && (
          <ReporteDeImport
            reporte={armarReporte(envio.resultados, {
              incompletas: ordenados.flatMap((a) =>
                a.seccion.parseadas
                  .filter((f) => f.problemas.length > 0)
                  .map((f) => ({ formato: a.formato, fila: f.fila, motivos: f.problemas, archivo: etiquetaDe(a) })),
              ),
              avisosDeCadena,
            })}
            nombreArchivo={nombreArchivo}
            escrito={envio.resultados.some((r) => r.respuesta.resumen.creados > 0)}
            commit={envio.modoResultados === "commit"}
          />
        )}
      </div>
    </AdminModal>
  );
}
