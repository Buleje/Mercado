"use client";

/**
 * Cargar (o corregir) la escuadría de un paquete que ya está en el libro.
 *
 * ## Dónde vive y por qué
 *
 * De los 33 paquetes del libro real de Blas, **27 no tienen escuadría** y el
 * único lugar donde los 33 se ven de a uno —con su código, sus piezas, su
 * volumen y su columna MEDIDAS— es «Productos disponibles»
 * (`CtpProductosDisponibles`, una fila por paquete). Los otros dos candidatos no
 * llegan al paquete: `CtpLoteProductosModal` dibuja una fila por CORRIDA (dice
 * «· 3 paquetes» y nada más) y `CtpProduccionDetalleModal` muestra consumos,
 * costo y trozas, no paquetes. Por eso la puerta está en la celda MEDIDAS de
 * Productos disponibles y en la ficha del paquete (`CtpPaqueteFicha`), que es la
 * misma fila abierta por su código.
 *
 * ## Se carga en pulgadas y pies, se guarda en cm y m
 *
 * Es como habla la plaza («dos por ocho de cinco») y como lo pide el formato
 * LO-CTP, respectivamente. La conversión es la del cubicador, en
 * `escuadria-del-paquete.ts`. Un paquete que YA tiene medidas se abre en cm y m
 * —que es como está escrito— para no mostrar «4.99 pies» donde alguien midió 5.
 *
 * ## El volumen NO se pisa
 *
 * Cargar la escuadría recalcula el volumen y **muestra la diferencia** contra lo
 * declarado; no lo sobrescribe. Quién de los dos está mal lo sabe el que midió
 * la pila. La tolerancia del cuadre es la del libro (10 %, `TOLERANCIA_MEDIDA`),
 * reusada vía `cuadreDeEscuadria` → `avisosDeCifra`.
 */

import { useMemo, useState } from "react";
import { Loader2, Ruler, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn, I, ModalBody, ModalFooter } from "./ctp-shared";
import { PanelDeCuadre } from "./ctp-celda-escuadria";
import {
  ESCUADRIA_EN_BLANCO,
  aEscuadriaDelLibro,
  aEscuadriaTipeada,
  cuadreDeEscuadria,
  escuadriaCompleta,
  type EscuadriaTipeada,
} from "@/lib/forestal/escuadria-del-paquete";
import type { Unidad } from "@/lib/forestal/cubicacion";
import type { EscuadriaAGuardar } from "@/lib/forestal/escuadria-guardar";

/** El paquete que se está midiendo, en lo que este modal necesita de él. */
export interface PaqueteAMedir {
  id: string;
  codigo: string;
  /** La corrida a la que pertenece: es la que el servidor audita. */
  ctpEntryId: string;
  lineNo?: number | null;
  producto?: string | null;
  especie?: string | null;
  /** Piezas declaradas. `0` en los 19 paquetes importados de Blas. */
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
}

type Dimension = "espesor" | "ancho" | "largo";

/* El tipo va explícito: con `as const`, las tres `opciones` quedan tuplas
   distintas y `.map()` sobre su unión no tiene una firma común. */
const DIMS: readonly {
  clave: Dimension;
  unidad: "uEspesor" | "uAncho" | "uLargo";
  label: string;
  /** En qué se canta esta dimensión en la plaza, y su equivalente del libro. */
  opciones: readonly Unidad[];
}[] = [
  { clave: "espesor", unidad: "uEspesor", label: "Espesor", opciones: ["pulg", "cm"] },
  { clave: "ancho", unidad: "uAncho", label: "Ancho", opciones: ["pulg", "cm"] },
  { clave: "largo", unidad: "uLargo", label: "Largo", opciones: ["pies", "m"] },
];

/* Escritas a mano y no con una clave calculada: `{ ...t, [clave]: v }` con
   `clave` de tipo unión ensancha el objeto y deja de ser `EscuadriaTipeada`. */
const conMedida = (t: EscuadriaTipeada, clave: Dimension, valor: string): EscuadriaTipeada =>
  clave === "espesor"
    ? { ...t, espesor: valor }
    : clave === "ancho"
      ? { ...t, ancho: valor }
      : { ...t, largo: valor };

const conUnidad = (t: EscuadriaTipeada, clave: Dimension, u: Unidad): EscuadriaTipeada =>
  clave === "espesor"
    ? { ...t, uEspesor: u }
    : clave === "ancho"
      ? { ...t, uAncho: u }
      : { ...t, uLargo: u };

export default function CtpEscuadriaPaqueteModal({
  paquete,
  onCerrar,
  onGuardar,
}: {
  paquete: PaqueteAMedir;
  onCerrar: () => void;
  /**
   * Escribe la escuadría en el libro. Lo pone quien monta el modal porque cada
   * pantalla recarga lo suyo de distinta forma; acá sólo se arma el dato.
   */
  onGuardar: (medidas: EscuadriaAGuardar) => Promise<void>;
}) {
  const yaTiene = escuadriaCompleta(paquete);
  const [tipeada, setTipeada] = useState<EscuadriaTipeada>(() =>
    yaTiene ? aEscuadriaTipeada(paquete) : ESCUADRIA_EN_BLANCO,
  );
  /* Las piezas se piden SÓLO cuando el paquete no las tiene: 19 de los 33 de
     Blas entraron con `cantidad = 0`, y sin piezas las medidas no dan volumen. */
  const [piezas, setPiezas] = useState(() =>
    paquete.cantidad > 0 ? String(paquete.cantidad) : "",
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const delLibro = useMemo(() => aEscuadriaDelLibro(tipeada), [tipeada]);
  const piezasNum = Math.trunc(Number(piezas.replace(",", ".")) || 0);
  const cuadre = useMemo(
    () =>
      cuadreDeEscuadria({
        codigo: paquete.codigo,
        cantidad: piezasNum,
        volumenM3: paquete.volumenM3,
        ...delLibro,
      }),
    [delLibro, piezasNum, paquete.codigo, paquete.volumenM3],
  );

  const completa = escuadriaCompleta(delLibro);
  const puedeGuardar = completa && piezasNum > 0 && !guardando;

  async function guardar() {
    const { espesorCm, anchoCm, largoM } = delLibro;
    if (espesorCm == null || anchoCm == null || largoM == null || !(piezasNum > 0)) return;
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({
        paqueteId: paquete.id,
        ctpEntryId: paquete.ctpEntryId,
        espesorCm,
        anchoCm,
        largoM,
        ...(paquete.cantidad !== piezasNum ? { cantidad: piezasNum } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onCerrar}
      /* Se abre desde una fila de tabla y también desde la ficha del paquete,
         que ya es un modal: sin esto queda detrás y los clics no llegan. */
      aboveModals
      variant="default"
      icon={Ruler}
      title={`Escuadría del paquete ${paquete.codigo}`}
      description={[
        paquete.lineNo != null ? `Corrida N.º ${paquete.lineNo}` : null,
        paquete.producto,
        paquete.especie,
      ]
        .filter(Boolean)
        .join(" · ")}
      footer={
        <ModalFooter
          nota={
            completa
              ? "Se guarda en cm y m, como lo pide el Libro. El volumen declarado no se toca."
              : "Carga las tres medidas para poder recalcular el volumen."
          }
        >
          <Btn onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Btn>
          <Btn variant="primary" onClick={() => void guardar()} disabled={!puedeGuardar}>
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            Guardar escuadría
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {DIMS.map((d) => (
            <div key={d.clave}>
              <label
                htmlFor={`escuadria-${d.clave}`}
                className="mb-1 block text-sm font-bold text-[var(--text-secondary)]"
              >
                {d.label}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id={`escuadria-${d.clave}`}
                  inputMode="decimal"
                  value={tipeada[d.clave]}
                  onChange={(e) => setTipeada((t) => conMedida(t, d.clave, e.target.value))}
                  placeholder={d.clave === "largo" ? "5" : "2"}
                  className={`${I} font-mono tabular-nums`}
                />
                <select
                  aria-label={`Unidad de ${d.label.toLowerCase()}`}
                  value={tipeada[d.unidad]}
                  onChange={(e) =>
                    setTipeada((t) => conUnidad(t, d.clave, e.target.value as Unidad))
                  }
                  className="h-11 shrink-0 rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-secondary)]"
                >
                  {d.opciones.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        {/* Las piezas sólo cuando faltan: pedirlas de nuevo al que ya las
            declaró es invitarlo a pisarlas con un número de memoria. */}
        {paquete.cantidad > 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            El paquete declara{" "}
            <strong className="font-mono tabular-nums text-[var(--text-primary)]">
              {paquete.cantidad.toLocaleString("es-PE")}
            </strong>{" "}
            pieza{paquete.cantidad === 1 ? "" : "s"}.
          </p>
        ) : (
          <div>
            <label
              htmlFor="escuadria-piezas"
              className="mb-1 block text-sm font-bold text-[var(--text-secondary)]"
            >
              Piezas del paquete
            </label>
            <input
              id="escuadria-piezas"
              inputMode="numeric"
              value={piezas}
              onChange={(e) => setPiezas(e.target.value)}
              placeholder="0"
              className={`${I} max-w-[12rem] font-mono tabular-nums`}
            />
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              Este paquete entró sin piezas declaradas. Sin ellas, la escuadría no da un volumen.
            </p>
          </div>
        )}

        <PanelDeCuadre cuadre={cuadre} declaradoM3={paquete.volumenM3} />

        {error && (
          <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            No se pudo guardar la escuadría: {error}
          </p>
        )}
      </ModalBody>
    </AdminModal>
  );
}
