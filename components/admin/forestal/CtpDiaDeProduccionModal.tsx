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
import { AlertTriangle, Boxes, Info, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import EncimaDeRadix from "@/components/admin/shared/encima-de-radix";
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
import type { OrigenYSalida } from "@/lib/forestal/origen-y-salida-del-dia";
import { avisoSinEscuadria, filasPiezaPorPieza, totalesDeLasCorridas } from "@/lib/forestal/piezas-del-dia";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import { Cifra, TablaPorDiaEspecieTipo, TablaPorEspecie } from "./ctp-resumen-jornadas-tablas";
import CtpPiezaPorPiezaTabla from "./CtpPiezaPorPiezaTabla";
import CtpEscuadriaPaqueteModal, { type PaqueteAMedir } from "./CtpEscuadriaPaqueteModal";
import CtpEditarLineaModal, { type LineaEditable } from "./CtpEditarLineaModal";
import CtpVincularMixtoModal, { puedeFirmarVinculo } from "./CtpVincularMixtoModal";
import CtpVincularCubicacionModal from "./CtpVincularCubicacionModal";
import CtpOrigenYSalidaDelDia from "./CtpOrigenYSalidaDelDia";
import CtpDiaDeProduccionBarra, { type VistaDelDia } from "./CtpDiaDeProduccionBarra";
import { corridaPideCubicacion, necesarioDelDia } from "./marcas-del-dia";
import { useJornadasConPaquetes } from "./hooks/use-jornadas-con-paquetes";
import { useAccionesDelDia } from "./hooks/use-acciones-del-dia";
import { lineaEditableDe, paqueteAMedirDe } from "./dia-de-produccion-puertas";

const AVISO = "flex items-start gap-2 rounded-xl px-3 py-2 text-sm";
const AVISO_INFO = `${AVISO} bg-[var(--data-info-500)]/12 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]`;
const AVISO_OJO = `${AVISO} bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`;

export default function CtpDiaDeProduccionModal({
  dia,
  onClose,
  onCopiarAlCubicado,
  onEditado,
  origenYSalida,
}: {
  /** El día, `YYYY-MM-DD`. */
  dia: string;
  onClose: () => void;
  /** Sólo quien tiene un cubicador montado sabe recibir las piezas. */
  onCopiarAlCubicado?: (piezas: PiezaCubicada[]) => void;
  /** Se guardó algo en el libro: la tira y la tabla de atrás releen. */
  onEditado?: () => void;
  /** Origen y salida del día, de la tira (ADR-445). Sin él, no se muestra. */
  origenYSalida?: OrigenYSalida;
}) {
  const { datos, error, releyendo, recargar } = useJornadasConPaquetes([dia]);
  const rol = useMiRol();
  const puedeEditar = puedePedir("PATCH /api/admin/forestal/ctp", rol);
  /* Vincular con un lote mixto (ADR-441): sólo dueño o administrador. */
  const [vinculando, setVinculando] = useState(false);
  const [vista, setVista] = useState<VistaDelDia>("piezas");
  const [midiendo, setMidiendo] = useState<PaqueteAMedir | null>(null);
  const [editando, setEditando] = useState<LineaEditable | null>(null);
  /* Agregar cubicación a lo declarado por tipo (ADR-445): `""` = el día entero. */
  const [cubicando, setCubicando] = useState<string | null>(null);

  const filas = useMemo(() => (datos ? filasPiezaPorPieza(datos.detalle) : []), [datos]);
  const { nota, setNota, traido, bajando, aTraer, traerTodo, bajarExcel } = useAccionesDelDia({
    dia,
    datos,
    filas,
    onCopiarAlCubicado,
  });
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
  /* Sólo si alguna corrida está por tipo o cubicada en parte: sin el dato, no se ofrece. */
  const pideCubicacion = (() => {
    const detalle = datos?.detalle ?? [];
    const necesario = necesarioDelDia(detalle);
    return detalle.some((c) => corridaPideCubicacion(c.origenYSalida, necesario));
  })();

  const despuesDeEscribir = useCallback(
    (mensaje: string) => {
      setNota(mensaje);
      void recargar();
      onEditado?.();
    },
    [recargar, onEditado, setNota],
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

              {/* De dónde salió y a dónde fue (ADR-445), antes de la tabla. */}
              {origenYSalida && (
                <div className="rounded-xl border border-[var(--rule-base)] px-3 pb-2">
                  <CtpOrigenYSalidaDelDia os={origenYSalida} dosColumnas="sm" />
                </div>
              )}

              <CtpDiaDeProduccionBarra
                vista={vista}
                onVista={setVista}
                releyendo={releyendo}
                bajando={bajando}
                onExcel={() => void bajarExcel()}
                onVincularMixto={puedeFirmarVinculo(rol) ? () => setVinculando(true) : undefined}
                onAgregarCubicacion={pideCubicacion ? () => setCubicando("") : undefined}
                traer={
                  onCopiarAlCubicado
                    ? { onTraer: traerTodo, traido, deshabilitado: !aTraer || aTraer.piezas.length === 0 }
                    : undefined
                }
              />

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
                    onAgregarCubicacion={(c) => setCubicando(c.id)}
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
          {vinculando && (
            <CtpVincularMixtoModal
              aboveModals
              dia={dia}
              onClose={() => setVinculando(false)}
              onVinculado={despuesDeEscribir}
            />
          )}
          {cubicando !== null && (
            <CtpVincularCubicacionModal
              aboveModals
              dia={dia}
              corridaInicial={cubicando || undefined}
              onClose={() => setCubicando(null)}
              onVinculada={despuesDeEscribir}
            />
          )}
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
