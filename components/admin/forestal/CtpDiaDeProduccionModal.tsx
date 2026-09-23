"use client";

/**
 * Lo que salió UN día, pieza por pieza — lo que abre «Ver qué salió ese día».
 *
 * Pedido de Brandon (2026-09-23): *«que se ponga un modal donde estarán los
 * detalles específicamente del día seleccionado, pieza por pieza según lo
 * cubicado, para modificar/editar, para ver el resumen por especie y tipo de
 * ese día […] lo de traer cubicado es traerlo en todo (no especie por
 * especie), en general de todo ese día»*.
 *
 * Hasta ahora ese botón abría el RESUMEN (por especie, sólo lectura) y traer al
 * cubicado era corrida por corrida, un pedido al servidor cada una. Acá:
 *  · pieza por pieza: cada paquete con su escuadría en pulgadas y pies;
 *  · el resumen por especie y tipo del mismo día, de la misma respuesta;
 *  · editar con las puertas que YA existen y ya tienen sus reglas: la
 *    escuadría del paquete (`CtpEscuadriaPaqueteModal`) y la corrida
 *    (`CtpEditarLineaModal`, ADR-401). No hay una tercera vía de edición;
 *  · «Traer todo el día al cubicado»: un botón, todas las corridas. Sigue
 *    siendo una COPIA de trabajo — declararla crea corridas nuevas.
 *
 * El editor de la corrida es un modal a mano en `z-system`: con este (Radix)
 * abierto, Radix le apagaría los clics y le robaría el foco. Por eso, mientras
 * se edita la corrida, éste se oculta (`open={false}` — su estado sigue vivo) y
 * vuelve al cerrar el editor, ya releído.
 */

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Boxes, Copy, Download, Info, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import EncimaDeRadix from "@/components/admin/shared/encima-de-radix";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { exportSheetsToExcel } from "@/lib/export-excel";
import { hojasDelResumen } from "@/lib/forestal/resumen-de-jornadas-excel";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import {
  guardarEscuadriaDePaquete,
  type EscuadriaAGuardar,
} from "@/lib/forestal/escuadria-guardar";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { useMiRol } from "@/hooks/use-mi-rol";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  avisoSinEscuadria,
  filasPiezaPorPieza,
  hojaPiezaPorPieza,
  piezasDeLasCorridas,
  totalesDeLasCorridas,
} from "@/lib/forestal/piezas-del-dia";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import { Cifra, TablaPorDiaEspecieTipo, TablaPorEspecie } from "./ctp-resumen-jornadas-tablas";
import CtpPiezaPorPiezaTabla from "./CtpPiezaPorPiezaTabla";
import CtpEscuadriaPaqueteModal, { type PaqueteAMedir } from "./CtpEscuadriaPaqueteModal";
import CtpEditarLineaModal, { type LineaEditable } from "./CtpEditarLineaModal";
import { useJornadasConPaquetes } from "./hooks/use-jornadas-con-paquetes";
import { lineaEditableDe, paqueteAMedirDe } from "./dia-de-produccion-puertas";

type Vista = "piezas" | "especieTipo" | "especie";
const VISTAS: { value: Vista; label: string }[] = [
  { value: "piezas", label: "Pieza por pieza" },
  { value: "especieTipo", label: "Por especie y tipo" },
  { value: "especie", label: "Por especie" },
];

const AVISO = "flex items-start gap-2 rounded-xl px-3 py-2 text-sm";
const AVISO_INFO = `${AVISO} bg-[var(--data-info-500)]/12 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]`;
const AVISO_OJO = `${AVISO} bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`;

export default function CtpDiaDeProduccionModal({
  dia,
  onClose,
  onCopiarAlCubicado,
  onEditado,
}: {
  /** El día, `YYYY-MM-DD`. */
  dia: string;
  onClose: () => void;
  /** Sólo quien tiene un cubicador montado sabe recibir las piezas. */
  onCopiarAlCubicado?: (piezas: PiezaCubicada[]) => void;
  /** Se guardó algo en el libro: la tira y la tabla de atrás releen. */
  onEditado?: () => void;
}) {
  const { datos, error, releyendo, recargar } = useJornadasConPaquetes([dia]);
  const puedeEditar = puedePedir("PATCH /api/admin/forestal/ctp", useMiRol());
  const [vista, setVista] = useState<Vista>("piezas");
  const [midiendo, setMidiendo] = useState<PaqueteAMedir | null>(null);
  const [editando, setEditando] = useState<LineaEditable | null>(null);
  /** Lo último que pasó (se guardó, se trajo, falló el Excel): se dice arriba de la tabla. */
  const [nota, setNota] = useState<string | null>(null);
  /** Traído una vez: un segundo clic duplicaría las piezas en el cubicado. */
  const [traido, setTraido] = useState(false);
  const [bajando, setBajando] = useState(false);

  const filas = useMemo(() => (datos ? filasPiezaPorPieza(datos.detalle) : []), [datos]);
  const aTraer = useMemo(() => (datos ? piezasDeLasCorridas(datos.detalle) : null), [datos]);
  /* El PT de los paquetes es el MEDIDO al cubicar; el del día (el del
     casillero) sale del m³ × 424. Casi siempre redondean igual (22/09 de Blas:
     4 411,61 y 4 412); si no, se dice — dos cifras contiguas que no cierran
     sin explicación enseñan a desconfiar de las dos. */
  const ptDeLosPaquetes = useMemo(
    () => (datos ? totalesDeLasCorridas(datos.detalle).pt : 0),
    [datos],
  );
  const especies = useMemo(
    () => [
      ...new Set(
        (datos?.detalle ?? []).map((c) => c.especie?.trim()).filter((e): e is string => !!e),
      ),
    ],
    [datos],
  );

  const despuesDeEscribir = useCallback(
    (mensaje: string) => {
      setNota(mensaje);
      void recargar();
      onEditado?.();
    },
    [recargar, onEditado],
  );

  const guardarEscuadria = useCallback(
    async (m: EscuadriaAGuardar) => {
      /* Si falla, tira: el modal de la escuadría muestra el error y no se cierra. */
      await guardarEscuadriaDePaquete(m);
      const codigo = midiendo?.codigo ?? "";
      setMidiendo(null);
      despuesDeEscribir(`Escuadría de ${codigo} guardada.`);
    },
    [midiendo, despuesDeEscribir],
  );

  const traerTodo = () => {
    if (!onCopiarAlCubicado || !aTraer || aTraer.piezas.length === 0 || !datos) return;
    onCopiarAlCubicado(aTraer.piezas);
    setTraido(true);
    const piezas = aTraer.piezas.reduce((a, p) => a + p.cantidad, 0);
    const corridas = datos.detalle.length;
    setNota(
      `${aTraer.piezas.length} fila${aTraer.piezas.length === 1 ? "" : "s"} (${fmtPiezas(piezas)} piezas) de ${
        corridas === 1 ? "la corrida" : `las ${corridas} corridas`
      } al lote cubicado. Es una copia: guardarla crea corridas NUEVAS — las de este día no se tocan.`,
    );
  };

  const bajarExcel = async () => {
    if (!datos) return;
    setBajando(true);
    try {
      await exportSheetsToExcel(
        [hojaPiezaPorPieza(filas), ...hojasDelResumen(datos, "diaEspecie")],
        `produccion-${dia}-pieza-por-pieza`,
      );
    } catch (e) {
      setNota(`No se pudo descargar el Excel: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBajando(false);
    }
  };

  const faltanMedidas =
    onCopiarAlCubicado && aTraer
      ? avisoSinEscuadria(aTraer.sinEscuadria, fmtM3, {
          adonde: "al cubicado",
          como: puedeEditar
            ? "cárgala tocando «Sin escuadría» en su fila"
            : "un administrador la carga desde su fila",
        })
      : null;
  const hay = datos && datos.totales.corridas > 0;

  return (
    <>
      <AdminModal
        /* Oculto (no desmontado) mientras se edita la corrida: ver arriba. */
        open={!editando}
        onClose={onClose}
        title={`Lo que salió el ${etiquetaLarga(dia)}`}
        description={
          hay
            ? `${datos.totales.corridas} corrida${datos.totales.corridas === 1 ? "" : "s"} · pieza por pieza, como se cubicó`
            : "Pieza por pieza, como se cubicó"
        }
        variant="info"
        /* Se abre desde la tira de días, que vive DENTRO de otro modal. */
        aboveModals
        icon={Boxes}
        footer={
          <ModalFooter
            nota={
              puedeEditar
                ? "Corregir una escuadría o una corrida queda en el libro con lo que decía antes."
                : "Sólo lectura: corregir lo declarado es de un administrador."
            }
          >
            <Btn variant="primary" onClick={onClose}>
              Listo
            </Btn>
          </ModalFooter>
        }
      >
        <div className={`space-y-4 ${MODAL_BODY}`}>
          {!datos && error ? (
            <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              No se pudo leer lo que salió ese día: {error}
            </p>
          ) : !datos ? (
            <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo las corridas y sus
              paquetes…
            </p>
          ) : !hay ? (
            <p className="py-6 text-sm text-[var(--text-tertiary)]">
              Ese día no tiene ninguna corrida declarada.
            </p>
          ) : (
            <>
              {error && (
                <p className={AVISO_OJO}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  No se pudo releer ({error}): lo de abajo puede estar desactualizado.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Cifra rotulo="Pie tablar" valor={fmtPt(datos.totales.pt)} unidad="PT" destacado />
                <Cifra rotulo="Volumen" valor={fmtM3(datos.totales.m3)} unidad="m³" />
                <Cifra rotulo="Piezas" valor={fmtPiezas(datos.totales.piezas)} unidad="pza" />
                <Cifra
                  rotulo="Paquetes"
                  valor={String(filas.length)}
                  unidad={`en ${datos.totales.corridas} corrida${datos.totales.corridas === 1 ? "" : "s"}`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <SegmentedControl
                  value={vista}
                  onChange={setVista}
                  size="sm"
                  label="Qué mirar del día"
                  options={VISTAS}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {releyendo && (
                    <Loader2
                      className="h-4 w-4 animate-spin text-[var(--text-tertiary)]"
                      aria-label="Releyendo"
                    />
                  )}
                  <button
                    type="button"
                    disabled={bajando}
                    onClick={() => void bajarExcel()}
                    title="Un archivo con la hoja pieza por pieza y el resumen del día"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:opacity-50 dark:hover:text-[var(--accent)]"
                  >
                    {bajando ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Excel
                  </button>
                  {onCopiarAlCubicado && (
                    <Btn
                      variant="primary"
                      size="sm"
                      onClick={traerTodo}
                      disabled={traido || !aTraer || aTraer.piezas.length === 0}
                      title="Trae todas las piezas del día al lote cubicado para trabajarlas. No toca las corridas del libro."
                    >
                      <Copy className="h-4 w-4" aria-hidden />
                      {traido ? "Ya está en el cubicado" : "Traer todo el día al cubicado"}
                    </Btn>
                  )}
                </div>
              </div>

              {nota && (
                <p className={AVISO_INFO} role="status">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {nota}
                </p>
              )}
              {faltanMedidas && (
                <p className={AVISO_OJO}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {faltanMedidas}
                </p>
              )}

              {vista === "piezas" ? (
                <>
                  <CtpPiezaPorPiezaTabla
                    corridas={datos.detalle}
                    onEditarCorrida={
                      puedeEditar ? (c) => setEditando(lineaEditableDe(c, especies)) : undefined
                    }
                    onEditarEscuadria={
                      puedeEditar ? (c, p) => setMidiendo(paqueteAMedirDe(c, p)) : undefined
                    }
                  />
                  {Math.round(ptDeLosPaquetes) !== datos.totales.pt && (
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Los paquetes suman {fmtPt(ptDeLosPaquetes)} PT medidos al cubicar; el día dice{" "}
                      {fmtPt(datos.totales.pt)} PT porque sale del m³ × 424.
                    </p>
                  )}
                </>
              ) : vista === "especieTipo" ? (
                <TablaPorDiaEspecieTipo datos={datos} />
              ) : (
                <TablaPorEspecie datos={datos} />
              )}
            </>
          )}

          {/* Adentro del árbol de este modal: Radix lo apila encima como hijo. */}
          {midiendo && (
            <CtpEscuadriaPaqueteModal
              paquete={midiendo}
              onCerrar={() => setMidiendo(null)}
              onGuardar={guardarEscuadria}
            />
          )}
        </div>
      </AdminModal>

      {/* En una capa de Radix, al `body`: la tira vive en una ventana que se
          mueve con `translate` (un `fixed` adentro quedaría atado a esa caja),
          y desde «Registrar producción» —un AdminModal de Radix— un portal
          suelto quedaba sin clics ni foco (revisión 23-09). */}
      {editando && (
        <EncimaDeRadix titulo={`Editar corrida N° ${editando.lineNo}`}>
          <CtpEditarLineaModal
            linea={editando}
            onCerrar={() => setEditando(null)}
            onListo={(resumen) => {
              invalidarCtp();
              despuesDeEscribir(resumen);
            }}
          />
        </EncimaDeRadix>
      )}
    </>
  );
}
