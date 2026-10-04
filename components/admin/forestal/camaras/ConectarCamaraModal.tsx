"use client";

/**
 * Conectar la cámara directo, por su dirección (ADR-421).
 *
 * Hasta hoy la cámara sólo podía EMPUJAR: manda la foto del evento a una
 * dirección del panel. Eso funciona en cualquier lado —incluso con la SIM 4G
 * detrás del CGNAT del operador— pero no deja mirar el patio ahora mismo.
 *
 * Este formulario abre el otro camino: el servidor le habla a la cámara por su
 * dirección IP. Sirve cuando los dos están en la misma red —el caso real: el
 * panel abierto en la PC del aserradero— o cuando la cámara tiene una
 * dirección pública. Los dos caminos conviven: conectar no apaga el que ya
 * anda.
 *
 * ## Por qué NO pasa por Hik-Connect
 *
 * La app del celular habla con la nube del fabricante, y esa nube no tiene
 * puerta abierta: su API es sólo para partners de Hikvision. Decirlo acá evita
 * la pregunta de siempre («si en la app la veo, ¿por qué acá no?») y la
 * confusión que viene atrás, que es la que más veces rompe este formulario: el
 * usuario y la clave que se piden son **los del aparato**, no los de la cuenta
 * de Hik-Connect.
 *
 * ## Se prueba de verdad antes de guardar
 *
 * Guardar una IP que nadie probó deja una cámara «configurada» que no responde
 * y nadie se entera hasta la noche que hace falta. Al guardar, el servidor le
 * pregunta a la cámara quién es: si no contesta, no se guarda nada; si
 * contesta, se muestra el modelo y el firmware que devolvió. Ver
 * «DS-2CD2043G2-I · V5.7.3» es la única prueba de que conectó.
 */

import { useState } from "react";
import { AlertTriangle, Monitor, Wifi, WifiOff } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import FormularioConexionIp, { PieConexionIp } from "./FormularioConexionIp";
import PuentePcPanel, { PiePuente } from "./PuentePcPanel";
import {
  nombreDelAparato,
  type CamaraConConexion,
  type DatosConexion,
  type EstadoConexion,
  type ResultadoConexion,
} from "./conexion-camara";
import type { CamposPuente } from "./puente-pc";
import { useAjustesPuente } from "./use-ajustes-puente";
import { useFormularioIp } from "./use-formulario-ip";

/* Los tipos y lo puro de la conexión viven en `conexion-camara.ts`; se
   re-exportan porque la fila, los hooks y los avisos los importan de acá. */
export {
  estadoDeConexion,
  nombreDelAparato,
  queHacer,
  type CamaraConConexion,
  type ConexionCamara,
  type DatosConexion,
  type EstadoConexion,
  type ResultadoConexion,
} from "./conexion-camara";

interface Props {
  camara: CamaraConConexion;
  onCerrar: () => void;
  /** Prueba y guarda. Devuelve lo que contestó el aparato, o por qué falló. */
  onConectar: (datos: DatosConexion) => Promise<ResultadoConexion>;
  /** Deja de hablarle directo. La cámara sigue pudiendo mandar fotos. */
  onDesconectar: () => Promise<void>;
  /** Guarda la fuente, el recorte y los ajustes del puente. `true` = el servidor lo aceptó. */
  onGuardarPuente: (campos: CamposPuente) => Promise<boolean>;
  /** El error de la última escritura, para verlo sin cerrar el modal. */
  error?: string | null;
}

/**
 * Los dos caminos para VER la cámara (no para recibir sus fotos, que sigue
 * igual): directo por su IP (ADR-421) o el puente desde la PC con Hik-Connect
 * abierto (ADR-466) — el único que sirve para la cámara 4G de la oficina.
 */
type Camino = "directo" | "puente";

export default function ConectarCamaraModal({
  camara,
  onCerrar,
  onConectar,
  onDesconectar,
  onGuardarPuente,
  error,
}: Props) {
  const ip = useFormularioIp(camara, onConectar, onDesconectar, onCerrar);
  const puente = useAjustesPuente(camara);
  const [camino, setCamino] = useState<Camino>(puente.activo ? "puente" : "directo");
  const [guardando, setGuardando] = useState(false);
  const esPuente = camino === "puente";

  /* Guarda el puente (o lo apaga con `fuente: null`) y cierra si se aceptó. */
  const guardarPuente = async (campos: CamposPuente) => {
    setGuardando(true);
    try {
      if (await onGuardarPuente(campos)) onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={`Conectar ${camara.nombre}`}
      description={
        esPuente
          ? "Ver la cámara con Hik-Connect abierto en tu PC"
          : "Ver la cámara ahora, hablando directo con el aparato"
      }
      icon={esPuente ? Monitor : Wifi}
      variant="wide"
      claveVentana="camara-conectar"
      footer={
        esPuente ? (
          <PiePuente
            a={puente}
            guardando={guardando}
            onCerrar={onCerrar}
            onGuardar={() => void guardarPuente(puente.datos())}
            onQuitar={() => void guardarPuente({ fuente: null })}
          />
        ) : (
          <PieConexionIp f={ip} onCerrar={onCerrar} />
        )
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <SegmentedControl
          value={camino}
          onChange={setCamino}
          label="Cómo ver la cámara"
          className="max-w-full overflow-x-auto whitespace-nowrap"
          options={[
            { value: "directo", label: "Directo por IP", icon: <Wifi className="h-4 w-4" aria-hidden /> },
            { value: "puente", label: "Puente desde la PC", icon: <Monitor className="h-4 w-4" aria-hidden /> },
          ]}
        />
        {esPuente && error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2.5 text-sm text-[var(--text-primary)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error-ink)]" aria-hidden />
            {error}
          </p>
        )}
        {esPuente ? <PuentePcPanel camara={camara} a={puente} /> : <FormularioConexionIp f={ip} />}
      </div>
    </AdminModal>
  );
}

/** La pastilla de estado de la tarjeta: en cuál de los tres caminos está. */
export function PastillaConexion({ estado }: { estado: EstadoConexion }) {
  if (estado.tipo === "conectada") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-2 py-1 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <Wifi className="h-3.5 w-3.5" aria-hidden /> Conectada · {nombreDelAparato(estado.conexion)}
      </span>
    );
  }
  if (estado.tipo === "falla") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-2 py-1 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Falló la conexión
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)]">
      <WifiOff className="h-3.5 w-3.5" aria-hidden /> Sólo recibe fotos
    </span>
  );
}
