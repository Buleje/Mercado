"use client";

/**
 * «Lo que mandaron» — el historial de fotos con lo que leyó la IA.
 *
 * Se busca por lo que se VE («camión», una placa, «dos personas») y se filtra
 * por cámara. Muestra de a 12: con 60 fotos en la lista, la pantalla eran ocho
 * de scroll antes de llegar a nada más.
 */

import { useMemo, useState } from "react";
import { ChevronDown, Image as ImageIcon, Loader2, Upload } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { buscarCapturas, type Captura } from "@/lib/camaras/camaras";
import type { CamaraConConexion } from "./ConectarCamaraModal";
import CapturaTarjeta from "./CapturaTarjeta";
import BotonEnVivo, { tieneVisorPropio } from "./BotonEnVivo";
import { BLOQUE, BTN, type ChalecosPantalla } from "./camaras-ui";

const DE_A = 12;

interface Props {
  camaras: CamaraConConexion[];
  capturas: Captura[];
  cargando: boolean;
  guardando: boolean;
  onBorrar: (id: string) => void;
  onConfirmar: (capturaId: string, refId: string) => Promise<unknown>;
  onAsignarChaleco: (numero: string) => void;
  /** Número de chaleco → dueño HOY: las fotos viejas también dicen de quién es. */
  chalecosVivos: ChalecosPantalla;
  onIrACamaras: () => void;
  /** «En vivo» de una cámara con visor propio: llevarla a la vista «Cámaras». */
  onVerVisor: (id: string) => void;
}

export default function HistorialFotos({
  camaras,
  capturas,
  cargando,
  guardando,
  onBorrar,
  onConfirmar,
  onAsignarChaleco,
  chalecosVivos,
  onIrACamaras,
  onVerVisor,
}: Props) {
  const [filtro, setFiltro] = useState("");
  const [texto, setTexto] = useState("");
  const [cuantas, setCuantas] = useState(DE_A);
  const [confirmando, setConfirmando] = useState<{ captura: string; ref: string } | null>(null);

  const visibles = useMemo(() => {
    const deLaCamara = filtro ? capturas.filter((c) => c.camaraId === filtro) : capturas;
    return buscarCapturas(deLaCamara, texto);
  }, [capturas, filtro, texto]);
  const porId = useMemo(() => new Map(capturas.map((c) => [c.id, c])), [capturas]);
  const nombreDe = (id: string) => camaras.find((c) => c.id === id)?.nombre ?? "Cámara quitada";
  /* Una foto de una cámara quitada no tiene «En vivo»: ya no hay a quién mirar. */
  const enVivoDe = (id: string) => {
    const camara = camaras.find((c) => c.id === id);
    if (!camara) return null;
    return (
      <BotonEnVivo
        nombre={camara.nombre}
        camaraId={camara.id}
        forma="tarjeta"
        onVisorPropio={tieneVisorPropio(camara) ? () => onVerVisor(camara.id) : undefined}
      />
    );
  };

  const confirmar = async (capturaId: string, refId: string) => {
    setConfirmando({ captura: capturaId, ref: refId });
    try {
      await onConfirmar(capturaId, refId);
    } finally {
      setConfirmando(null);
    }
  };

  return (
    <section className={BLOQUE} aria-labelledby="camaras-historial-titulo">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-auto flex items-center gap-1.5">
          <CardTitle
            as="h3"
            id="camaras-historial-titulo"
            className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"
          >
            <ImageIcon className="h-4 w-4 text-[var(--accent-ink)]" aria-hidden /> Lo que mandaron (
            {visibles.length})
          </CardTitle>
          <InfoTip
            title="Lo que mandaron"
            what="Cada foto que mandó la cámara, con lo que la IA leyó: chalecos, placa, actividad y la pila."
            affects="La placa y el chaleco son propuestas: «Confirmar» marca la foto, no escribe en la guía."
            example="Busca «camión» o una placa para encontrar la foto sin mirar todas."
          />
        </span>
        <input
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setCuantas(DE_A);
          }}
          placeholder="Buscar: camión, placa, persona…"
          aria-label="Buscar en lo que se ve en las fotos"
          className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] sm:w-64"
        />
        {camaras.length > 1 && (
          <select
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value);
              setCuantas(DE_A);
            }}
            aria-label="Filtrar por cámara"
            className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)]"
          >
            <option value="">Todas las cámaras</option>
            {camaras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {cargando && capturas.length === 0 ? (
        <p className="flex items-center gap-2 px-1 py-6 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las fotos…
        </p>
      ) : visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-1 py-8 text-center">
          <Upload className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-sm text-[var(--text-secondary)]">
            {capturas.length > 0
              ? "Ninguna foto coincide con la búsqueda."
              : camaras.length === 0
                ? "Todavía no hay cámaras: agrega la primera y copia su dirección."
                : "Todavía no llegó ninguna foto. Cuando la cámara mande la primera, aparece aquí con su hora."}
          </p>
          {camaras.length === 0 && (
            <button type="button" onClick={onIrACamaras} className={BTN}>
              Agregar una cámara
            </button>
          )}
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibles.slice(0, cuantas).map((c) => (
              <CapturaTarjeta
                key={c.id}
                captura={c}
                nombreCamara={nombreDe(c.camaraId)}
                anteriorUrl={
                  c.pila?.comparadaCon ? (porId.get(c.pila.comparadaCon)?.url ?? null) : null
                }
                guardando={guardando}
                confirmando={
                  confirmando?.captura === c.id ? confirmando.ref : confirmando ? "" : null
                }
                onBorrar={() => onBorrar(c.id)}
                onConfirmar={(refId) => void confirmar(c.id, refId)}
                onAsignarChaleco={onAsignarChaleco}
                chalecosVivos={chalecosVivos}
                enVivo={enVivoDe(c.camaraId)}
              />
            ))}
          </ul>
          {visibles.length > cuantas && (
            <div className="mt-3 flex justify-center">
              <button type="button" onClick={() => setCuantas((n) => n + DE_A)} className={BTN}>
                <ChevronDown className="h-4 w-4" aria-hidden />
                Ver {Math.min(DE_A, visibles.length - cuantas)} más de {visibles.length - cuantas}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
