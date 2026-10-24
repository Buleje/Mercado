"use client";

/**
 * «Armar escaneando» en un modal, con la pistola en la computadora: el mismo
 * armado del patio (`CtpArmarLoteEscaneando`). Al guardar, cada lote creado
 * trae su paso siguiente en su fila —producir con él o seguir cargándolo en
 * Consumos— porque una pila mezclada deja VARIOS lotes, y un único «Producir
 * con…» en el pie elegía por el operador cuál.
 *
 * Dos puertas:
 *   · la pestaña Lotes (`CtpArmarLoteEscaneoModal`), que ya tiene el patio
 *     cargado y sabe llevar a Producción y a Consumos;
 *   · la ficha de una troza (`CtpArmarLoteEscaneoSuelto`), que no tiene el
 *     patio: lo lee recién al abrirse y, al terminar, ofrece ir a Lotes.
 */

import { useState } from "react";
import { Flame, Layers, PackageOpen, ScanBarcode } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn, CTP_MODULE_TAB_ID, ModalBody, ModalFooter } from "./ctp-shared";
import CtpArmarLoteEscaneando, {
  AvisoLotesArmados,
  type LoteArmado,
} from "./CtpArmarLoteEscaneando";
import { useLotesAserrio, type EstadoLotesAserrio } from "./hooks/use-lotes-aserrio";
import type { LoteAProducir } from "./CtpLotesView";

export default function CtpArmarLoteEscaneoModal({
  estado,
  onClose,
  onProducir,
  onCargar,
  onIrALotes,
  inicial,
}: {
  estado: Pick<
    EstadoLotesAserrio,
    "lotes" | "trozas" | "cargando" | "error" | "crearConTrozas" | "agregarTrozas" | "deshacer"
  >;
  onClose: () => void;
  /** Producir con ese lote (Lotes → Producción). */
  onProducir?: (lote: LoteAProducir) => void;
  /** Seguir cargándolo en Consumos. */
  onCargar?: (lote: LoteAProducir) => void;
  /** Sin Producción a mano (la ficha de una troza): llevar a la pestaña Lotes. */
  onIrALotes?: () => void;
  inicial?: readonly string[];
}) {
  /** Todo lo guardado mientras el modal estuvo abierto, lo último arriba. */
  const [armados, setArmados] = useState<LoteArmado[]>([]);

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      icon={ScanBarcode}
      title="Armar lotes escaneando"
      description="Escanea la pila mezclada: se reparte en un lote por especie y permiso."
      footer={
        <ModalFooter>
          <Btn variant="secondary" onClick={onClose}>
            Cerrar
          </Btn>
          {onIrALotes && armados.some((r) => r.agregadas > 0) && (
            <Btn variant="primary" onClick={onIrALotes}>
              <Layers className="h-4 w-4" aria-hidden /> Ir a Lotes
            </Btn>
          )}
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        <AvisoLotesArmados
          lotes={armados}
          acciones={
            onProducir || onCargar
              ? (r) => {
                  const lote = { id: r.loteId, code: r.code ?? "" };
                  return (
                    <>
                      {onCargar && (
                        <Btn variant="secondary" onClick={() => onCargar(lote)}>
                          <PackageOpen className="h-4 w-4" aria-hidden /> Ver en Consumos
                        </Btn>
                      )}
                      {onProducir && (
                        <Btn variant="primary" onClick={() => onProducir(lote)}>
                          <Flame className="h-4 w-4" aria-hidden /> Producir
                        </Btn>
                      )}
                    </>
                  );
                }
              : undefined
          }
        />
        <CtpArmarLoteEscaneando
          estado={estado}
          inicial={inicial}
          onArmado={(nuevos) => setArmados((prev) => [...nuevos, ...prev])}
        />
      </ModalBody>
    </AdminModal>
  );
}

/**
 * Llevar el libro a la vista Lotes sin salir del módulo. `admin:navigate` al
 * MISMO tab no cambia la vista: se escribe la URL y se avisa con `popstate`,
 * que es lo que `useVistaModulo` escucha (el «atrás» vuelve a Trozas).
 */
export function irALaVistaLotes() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", CTP_MODULE_TAB_ID);
    url.searchParams.set("vista", "lotes");
    window.history.pushState(null, "", url.toString());
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch {
    window.location.assign(`/admin?tab=${CTP_MODULE_TAB_ID}&vista=lotes`);
  }
}

/**
 * La puerta desde la ficha de una troza: Trozas no carga lotes, así que el
 * patio se lee recién al abrir (el hook vive acá adentro y este componente
 * sólo se monta abierto).
 */
export function CtpArmarLoteEscaneoSuelto({
  inicial,
  onClose,
}: {
  inicial: readonly string[];
  onClose: () => void;
}) {
  const estado = useLotesAserrio();
  return (
    <CtpArmarLoteEscaneoModal
      estado={estado}
      inicial={inicial}
      onClose={onClose}
      onIrALotes={() => {
        onClose();
        irALaVistaLotes();
      }}
    />
  );
}
