"use client";

/**
 * «Ver en otra pantalla» (pedido de Brandon 07-10: «ver mis cámaras y pasarlas
 * a mi celular, estilo duplicación de pantalla; mi televisor es Smart TV»).
 *
 * Tres formas, una por pestaña:
 *  · **En el televisor** — Modo TV: el TV abre `/tv`, muestra un código y aquí
 *    se vincula con sus cámaras y su duración (`lib/camaras/pantallas-tv.ts`).
 *  · **En tu celular** — el QR de esta vista, con tu usuario.
 *  · **Duplicar la pantalla** — lo que ya trae cada aparato (Smart View,
 *    AirPlay, Chromecast).
 */

import { useEffect, useState } from "react";
import { Copy, MonitorSmartphone, Smartphone, Tv } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { OtraPantallaCelular, OtraPantallaDuplicar } from "./OtraPantallaGuias";
import OtraPantallaTv from "./OtraPantallaTv";
import { usePantallaAngosta } from "./use-pantalla-angosta";
import { usePantallasTv } from "./use-pantallas-tv";

export type PestanaOtraPantalla = "tv" | "celular" | "duplicar";

interface Props {
  camaras: readonly { id: string; nombre: string }[];
  pestanaInicial?: PestanaOtraPantalla;
  /** El código que trajo el QR del TV (`?vincularTv=`). */
  codigoInicial?: string;
  onCerrar: () => void;
}

export default function OtraPantallaModal({ camaras, pestanaInicial = "tv", codigoInicial, onCerrar }: Props) {
  const [pestana, setPestana] = useState<PestanaOtraPantalla>(pestanaInicial);
  const [origen, setOrigen] = useState("");
  useEffect(() => setOrigen(window.location.origin), []);
  /* La lista vive acá: cambiar de pestaña y volver no la vuelve a pedir. */
  const p = usePantallasTv();
  /* A 400 px los tres rótulos largos con ícono no entran en una fila: cortos y sin ícono. */
  const angosta = usePantallaAngosta();
  const icono = (I: typeof Tv) => (angosta ? undefined : <I className="h-4 w-4" aria-hidden />);

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Ver en otra pantalla"
      description="Las cámaras en tu televisor o en tu celular"
      icon={MonitorSmartphone}
      variant="wide"
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <SegmentedControl<PestanaOtraPantalla>
          value={pestana}
          onChange={setPestana}
          label="Dónde verlas"
          className="max-w-full overflow-x-auto whitespace-nowrap"
          options={[
            { value: "tv", label: angosta ? "Televisor" : "En el televisor", icon: icono(Tv) },
            { value: "celular", label: angosta ? "Celular" : "En tu celular", icon: icono(Smartphone) },
            { value: "duplicar", label: angosta ? "Duplicar" : "Duplicar la pantalla", icon: icono(Copy) },
          ]}
        />
        {pestana === "tv" && <OtraPantallaTv camaras={camaras} origen={origen} codigoInicial={codigoInicial} p={p} />}
        {pestana === "celular" && <OtraPantallaCelular origen={origen} />}
        {pestana === "duplicar" && <OtraPantallaDuplicar />}
      </div>
    </AdminModal>
  );
}
