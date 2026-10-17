"use client";

/**
 * «Armar un lote con esta troza» desde la tarjeta del QR: el mismo armado por
 * escaneo del libro (`CtpArmarLoteEscaneoModal`), con esta pieza ya en la pila.
 *
 * No reusa `CtpArmarLoteEscaneoSuelto` a propósito: su «Ir a Lotes» cambia la
 * vista del libro escribiendo en la URL ACTUAL, y acá la URL es `/admin/q/<id>`
 * — el botón no llevaba a ningún lado. Esta puerta navega al libro de verdad.
 *
 * Se monta sólo abierto: el patio (`useLotesAserrio`) se lee recién al tocar.
 */

import { useRouter } from "next/navigation";
import CtpArmarLoteEscaneoModal from "../CtpArmarLoteEscaneoModal";
import { useLotesAserrio } from "../hooks/use-lotes-aserrio";
import { TAB_LIBRO_CTP } from "@/lib/forestal/ctp-troza-url";

export default function ArmarLoteDesdeTarjeta({ trozaId, onClose }: { trozaId: string; onClose: () => void }) {
  const estado = useLotesAserrio();
  const router = useRouter();
  return (
    <CtpArmarLoteEscaneoModal
      estado={estado}
      inicial={[trozaId]}
      onClose={onClose}
      onIrALotes={() => router.push(`/admin?tab=${TAB_LIBRO_CTP}&vista=lotes`)}
    />
  );
}
