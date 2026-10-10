"use client";

/**
 * CtpTrozaFichaModal — la ficha de una troza: qué es, en qué anda y de dónde
 * salió, para el que está parado frente al tronco.
 *
 * Rediseño 05-10 (Brandon: «mejora el modal de detalle de troza»): antes era
 * correcta pero plana —un título, cuatro cajitas y cuatro tarjetas iguales—, no
 * decía el estado ni los días, ni de dónde salían las medidas, ni el título
 * habilitante, ni dejaba actuar. Ahora se lee de arriba abajo por pregunta:
 *
 *   1. Cabecera: código, estado (el MISMO de la tabla), especie, días parada y
 *      dónde está su carga; ‹ › y ←/→ para pasar a la vecina.
 *   2. Medidas con la marca de su fuente y el control de Huber.
 *   3. Recorrido (línea de tiempo con fechas y tramos) junto al documento de
 *      origen (GTF, título, resolución, parcela, SNIFFS → SERFOR).
 *   4. Historial de cambios, si el registro de auditoría tiene algo de ella.
 *   5. Al pie, lo que se hace con ella: armar lote, etiqueta QR, copiar
 *      código, verla en el croquis. Anotar D1/D2 vive junto a las medidas.
 *
 * Nada se borró del diseño anterior: cada dato pasó a su bloque.
 */

import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { m } from "@/components/admin/providers";
import { DURATION, EASE } from "@/components/ui-system/motion";
import { consumibleDeFicha } from "@/lib/forestal/leer-escaneo-troza";
import { motivoFueraDeLaPila } from "@/lib/forestal/lote-por-escaneo";
import { diasDeLaPieza, estadoDeFicha, hoyDelLibro, trozaPatioDeFicha } from "@/lib/forestal/troza-ficha-recorrido";
import { estaEnPatio } from "@/lib/forestal/trozas-patio";
import { limaDateKey } from "@/lib/utils";
import CtpEtiquetasTrozasModal from "./CtpEtiquetasTrozasModal";
import CtpHistorial from "./CtpHistorial";
import { ModalBody } from "./ctp-shared";
import { AccionesDeFicha } from "./ctp-troza-ficha-acciones";
import { CabeceraDeFicha } from "./ctp-troza-ficha-cabecera";
import { irAlCroquis, useFichaDeTroza, useFlechasDeFicha } from "./ctp-troza-ficha-hooks";
import { MedidasDeLaTroza } from "./ctp-troza-ficha-medidas";
import { DocumentoDeOrigen } from "./ctp-troza-ficha-origen";
import { RecorridoDeLaTroza } from "./ctp-troza-ficha-recorrido";
import { usePlantaUbicacion } from "./hooks/use-planta-ubicacion";

export interface CtpTrozaFichaModalProps {
  trozaId: string;
  onClose: () => void;
  /** Para saltar de un pedazo a su madre sin cerrar y volver a buscar. */
  onVerOtra?: (id: string) => void;
  /**
   * «Armar un lote con esta troza» (2026-09-26): el QR de la etiqueta abre esta
   * ficha y desde acá la pieza va directo a la pila. Sólo se ofrece si la
   * troza se puede consumir; sin la prop, la ficha no lo ofrece.
   */
  onArmarLote?: (trozaId: string) => void;
  /** «Anotar D1 y D2» cuando le faltan puntas: quien abre la ficha abre la planilla. */
  onAnotar?: (trozaId: string) => void;
  /** Las vecinas en la lista que abrió la ficha (‹ › y ←/→). Sin esto no hay navegación. */
  vecinos?: { anterior?: string | null; siguiente?: string | null };
  onNavegar?: (trozaId: string) => void;
}

/** Los estados en los que tiene sentido decir por qué no entra a un lote. */
const PUEDE_IR_A_LOTE = new Set(["libre", "apartada", "por_recepcionar"]);

export default function CtpTrozaFichaModal({
  trozaId, onClose, onVerOtra, onArmarLote, onAnotar, vecinos, onNavegar,
}: CtpTrozaFichaModalProps) {
  const { ficha: f, error, cargando, eventos } = useFichaDeTroza(trozaId);
  const canchas = usePlantaUbicacion();
  const [etiquetando, setEtiquetando] = useState(false);
  const reducir = useReducedMotion();
  /* Hacia dónde se navegó, para que la ficha nueva entre del lado correcto. */
  const [sentido, setSentido] = useState(0);

  const navegar = onNavegar
    ? (id: string) => {
        setSentido(id === vecinos?.anterior ? -1 : 1);
        onNavegar(id);
      }
    : undefined;
  useFlechasDeFicha(!etiquetando, vecinos?.anterior, vecinos?.siguiente, navegar);

  const hoyKey = limaDateKey();
  const t = f?.troza;
  const estado = f ? estadoDeFicha(f) : null;
  const dias = f && estado ? diasDeLaPieza(f, estado, hoyDelLibro(hoyKey)) : null;
  const cancha = f ? canchas[f.ingreso.id] : undefined;
  const codigo = t?.codificacion ?? t?.codigoPlanta ?? "Troza";
  /* La MISMA regla que la pila del escáner (`motivoFueraDeLaPila`): ofrecer
     armar un lote con una pieza que la pila rechaza sería un botón que miente. */
  const motivo = f ? motivoFueraDeLaPila({ ...consumibleDeFicha(f), guiaRecepcionada: trozaPatioDeFicha(f).guiaRecepcionada }) : null;
  const armable = Boolean(onArmarLote) && f != null && motivo === null;

  return (
    <AdminModal
      open
      onClose={onClose}
      hideCloseButton
      claveVentana="ctp-troza-ficha"
      className="sm:max-w-[58rem]"
      footer={
        f && t && estado ? (
          <AccionesDeFicha
            codigo={codigo}
            onArmarLote={armable && onArmarLote ? () => onArmarLote(t.id) : undefined}
            motivoSinLote={onArmarLote && PUEDE_IR_A_LOTE.has(estado) ? motivo : null}
            onEtiqueta={estaEnPatio(estado) ? () => setEtiquetando(true) : undefined}
            onCroquis={cancha ? () => { onClose(); irAlCroquis(cancha.zonaId); } : undefined}
            canchaNombre={cancha?.nombre}
          />
        ) : undefined
      }
    >
      {/* La marca con la que ←/→ reconocen que la tecla nació en ESTA ficha. */}
      <span data-troza-ficha="" hidden />
      <CabeceraDeFicha
        codigo={f ? codigo : null}
        estado={estado}
        especieComun={t?.especieComun ?? null}
        especieCientifica={t?.especieCientifica ?? null}
        dias={dias}
        cancha={cancha?.nombre ?? null}
        vecinos={vecinos}
        onNavegar={navegar}
        onClose={onClose}
      />

      {!f && !error && (
        <p className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--text-secondary)] sm:px-6" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Buscando su historia…
        </p>
      )}
      {error && (
        <ModalBody>
          <p role="alert" className="rounded-xl border border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10 p-3 text-sm font-bold text-[var(--data-error-ink)]">
            {error}
          </p>
        </ModalBody>
      )}

      {f && t && estado && (
        <m.div
          key={t.id}
          aria-busy={cargando || undefined}
          initial={reducir ? false : { opacity: 0, x: sentido * 16 }}
          animate={{ opacity: cargando ? 0.55 : 1, x: 0 }}
          transition={{ duration: DURATION.base, ease: EASE.editorial }}
          className="@container"
        >
          <ModalBody className="space-y-4">
            <MedidasDeLaTroza ficha={f} onAnotar={onAnotar ? () => onAnotar(t.id) : undefined} />
            <div className="grid gap-4 @min-[44rem]:grid-cols-[minmax(0,1fr)_18rem]">
              <RecorridoDeLaTroza ficha={f} eventos={eventos} estado={estado} hoyKey={hoyKey} onVerOtra={onVerOtra} />
              <DocumentoDeOrigen ficha={f} hoyKey={hoyKey} />
            </div>
            <CtpHistorial entityId={t.id} />
          </ModalBody>
        </m.div>
      )}

      {etiquetando && t && (
        <CtpEtiquetasTrozasModal ids={[t.id]} contexto={codigo} aboveModals onClose={() => setEtiquetando(false)} />
      )}
    </AdminModal>
  );
}
