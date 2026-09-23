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
 * `escuadria-del-paquete.ts`. Un paquete que YA tiene medidas TAMBIÉN se abre
 * en pulgadas y pies (Brandon, 2026-09-23): medido contra el libro real de
 * Blas, los 197 paquetes con escuadría miden una media pulgada exacta — se
 * cantaron en pulgadas, y el cm/m es sólo cómo lo guarda el libro. La vuelta
 * usa `acercarAEscala` para no mostrar «8.01 pies» donde se midió 8.
 *
 * ## Lo que el usuario no toca, no se reescribe
 *
 * Convertir de vuelta y para adelante mete redondeo (2.44 m → 8 pies → si se
 * recalculara, 2.4384 m: 1.6 mm menos que lo guardado). Guardar sin tocar un
 * campo debe dejar el cm/m **original**, no el de ida y vuelta — si no, cada
 * apertura del modal correría el libro en silencio. Por eso cada campo se
 * gatea con su propio flag «tocado»: sólo se recalcula lo que el usuario
 * escribió; lo demás viaja tal cual estaba.
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
  aEscuadriaEnPulgadas,
  cuadreDeEscuadria,
  escuadriaCompleta,
  type EscuadriaDelLibro,
  type EscuadriaTipeada,
} from "@/lib/forestal/escuadria-del-paquete";
import type { EscuadriaAGuardar } from "@/lib/forestal/escuadria-guardar";
import { formatNumber } from "@/lib/format";

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

/* Sin selector de unidad (ADR 2026-09-23): siempre se tipea en pulgadas —
   salvo el largo, en pies. */
const DIMS: readonly { clave: Dimension; label: string; placeholder: string }[] = [
  { clave: "espesor", label: "Espesor (pulg)", placeholder: "2" },
  { clave: "ancho", label: "Ancho (pulg)", placeholder: "8" },
  { clave: "largo", label: "Largo (pies)", placeholder: "5" },
];

/* Escritas a mano y no con una clave calculada: `{ ...t, [clave]: v }` con
   `clave` de tipo unión ensancha el objeto y deja de ser `EscuadriaTipeada`. */
const conMedida = (t: EscuadriaTipeada, clave: Dimension, valor: string): EscuadriaTipeada =>
  clave === "espesor"
    ? { ...t, espesor: valor }
    : clave === "ancho"
      ? { ...t, ancho: valor }
      : { ...t, largo: valor };

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
    yaTiene ? aEscuadriaEnPulgadas(paquete) : ESCUADRIA_EN_BLANCO,
  );
  /* Por dimensión: ¿el usuario la escribió en esta sesión? Si no, y el paquete
     ya la tenía, se guarda el cm/m ORIGINAL — nunca el de ida y vuelta por
     pulgadas, que mete hasta 1.6 mm de redondeo. Un flag propio, no comparar
     valores: comparar dejaría pasar un valor retipeado igual al original y
     rechazaría uno que cambia por redondeo sin que el usuario haya tocado nada. */
  const [tocado, setTocado] = useState<Record<Dimension, boolean>>({
    espesor: false,
    ancho: false,
    largo: false,
  });
  /* Las piezas se piden SÓLO cuando el paquete no las tiene: 19 de los 33 de
     Blas entraron con `cantidad = 0`, y sin piezas las medidas no dan volumen. */
  const [piezas, setPiezas] = useState(() =>
    paquete.cantidad > 0 ? String(paquete.cantidad) : "",
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convertido = useMemo(() => aEscuadriaDelLibro(tipeada), [tipeada]);
  const delLibro: EscuadriaDelLibro = useMemo(
    () => ({
      espesorCm: !tocado.espesor && yaTiene ? paquete.espesorCm : convertido.espesorCm,
      anchoCm: !tocado.ancho && yaTiene ? paquete.anchoCm : convertido.anchoCm,
      largoM: !tocado.largo && yaTiene ? paquete.largoM : convertido.largoM,
    }),
    [convertido, tocado, yaTiene, paquete.espesorCm, paquete.anchoCm, paquete.largoM],
  );
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
              ? "Se tipea en pulgadas y pies; el Libro lo guarda en cm y m. El volumen declarado no se toca."
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
              <input
                id={`escuadria-${d.clave}`}
                inputMode="decimal"
                value={tipeada[d.clave]}
                onChange={(e) => {
                  setTipeada((t) => conMedida(t, d.clave, e.target.value));
                  setTocado((t) => ({ ...t, [d.clave]: true }));
                }}
                placeholder={d.placeholder}
                className={`${I} font-mono tabular-nums`}
              />
            </div>
          ))}
        </div>

        {/* Las piezas sólo cuando faltan: pedirlas de nuevo al que ya las
            declaró es invitarlo a pisarlas con un número de memoria. */}
        {paquete.cantidad > 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            El paquete declara{" "}
            <strong className="font-mono tabular-nums text-[var(--text-primary)]">
              {formatNumber(paquete.cantidad)}
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
