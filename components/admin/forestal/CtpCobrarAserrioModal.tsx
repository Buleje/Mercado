"use client";

/**
 * Cobrar el aserrío de una corrida YA declarada (ADR-412).
 *
 * Medido en el tenant real (2026-09-13): 14 corridas · 85.443 m³ sin dueño
 * declarado — todas de antes de esta feature. Esto no corrige un olvido del
 * operador, es la puerta para ponerles dueño y precio ahora. Se cotiza sobre
 * los MISMOS paquetes que la corrida ya declaró: el volumen del libro no se
 * vuelve a preguntar.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Coins, Loader2, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { bloquesDeCorrida, corridaSinPt, type CobroAserrioValor, type ResultadoCobro } from "@/lib/forestal/tarifa-aserrio";
import { paquetesYaDeclarados, mensajeCobroAserrio } from "./hooks/guardar-produccion-corrida";
import CtpCobroAserrio from "./CtpCobroAserrio";
import { Btn, ModalBody, ModalFooter, formatDate } from "./ctp-shared";
import { UNIT_LABELS, type CtpEntry } from "./ctp-section-shared";

/** Forma mínima de un paquete ya guardado, tal como la devuelve `paquetesYaDeclarados`. */
interface PaqueteGuardado {
  codigo: string;
  productType?: string | null;
  volumenM3?: number | string | null;
  espesorCm?: number | string | null;
  anchoCm?: number | string | null;
  largoM?: number | string | null;
  /** PT medido al cubicar (ADR-429): el cargo del servidor lo usa, la vista previa también. */
  pieTablar?: number | string | null;
}

export default function CtpCobrarAserrioModal({
  entry,
  onCerrar,
  onListo,
}: {
  entry: CtpEntry;
  onCerrar: () => void;
  onListo: (mensaje: string, detalle: string) => void;
}) {
  const [paquetes, setPaquetes] = useState<PaqueteGuardado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [valor, setValor] = useState<CobroAserrioValor>({
    duenoParteId: entry.duenoParteId ?? null,
    // Arranca con el trato REAL de la corrida — si ya cobraba a mano, el
    // bloque tiene que mostrar "Precio a mano" con ese número, no "según la
    // tarifa" (MEDIO, revisión 2026-09-14).
    precioManualPt: entry.aserrioPrecioManualPt ?? null,
  });
  /* `duenoParteId` viajaba SIEMPRE desde la foto del listado (`entry`, tomada
   * al abrir el modal): si otra pestaña cambió el cobro mientras este modal
   * estaba abierto, "guardar sin tocar el dueño" podía pisarlo con un valor
   * viejo (BAJO, revisión 2026-09-14). Ahora sigue el mismo contrato que
   * declarar/ampliar: ausente = mantiene el dueño actual, y sólo viaja si el
   * operador lo tocó de verdad. Lo mismo para `precioManualPt` (ALTO previo). */
  const [duenoTocado, setDuenoTocado] = useState(false);
  const [precioTocado, setPrecioTocado] = useState(false);
  /* "A mano" con el campo vacío mientras el botón sigue en "a mano" no se
     puede guardar (ver `CtpCobroAserrio`). */
  const [aserrioValido, setAserrioValido] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    paquetesYaDeclarados(entry.id)
      .then((p) => { if (vivo) setPaquetes(p as unknown as PaqueteGuardado[]); })
      /* Sin los paquetes se cotiza sobre la corrida entera (un solo bloque con
         su `quantity`): es menos preciso pero sigue permitiendo cobrar. */
      .catch(() => { if (vivo) setPaquetes([]); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [entry.id]);

  const bloques = useMemo(
    () =>
      bloquesDeCorrida(
        {
          lineNo: entry.lineNo,
          speciesCommon: entry.speciesCommon,
          productType: entry.productType,
          quantity: Number(entry.quantity ?? 0),
          // Sin esto, ausente = m³: una corrida en PT o en kg se leía como si
          // su cantidad YA fuera m³ (ALTO, revisión 2026-09-14 — 5000 PT sin
          // paquetes se mostraban como 5000 m³, 2.120.000 PT).
          unit: entry.unit,
        },
        paquetes.map((p) => ({
          codigo: p.codigo,
          productType: p.productType ?? entry.productType,
          volumenM3: Number(p.volumenM3) || 0,
          espesorCm: p.espesorCm != null ? Number(p.espesorCm) : null,
          anchoCm: p.anchoCm != null ? Number(p.anchoCm) : null,
          largoM: p.largoM != null ? Number(p.largoM) : null,
          pieTablar: p.pieTablar != null ? Number(p.pieTablar) : null,
        })),
      ),
    [entry, paquetes],
  );
  /** Sin paquetes y en una unidad que no pesa en PT (kg, unidad) no hay de
   *  dónde sacar el pie tablar — cobrarla como si fuera m³ inventaría un
   *  importe que el servidor no va a dar. */
  const sinPt = corridaSinPt(entry.unit, paquetes.length > 0);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "cobrar_aserrio",
          id: entry.id,
          // Ausente si no se tocó: mantiene el dueño / el trato de precio
          // que ya tenía — no la foto con la que se abrió el modal.
          ...(duenoTocado ? { duenoParteId: valor.duenoParteId } : {}),
          ...(precioTocado ? { precioManualPt: valor.precioManualPt } : {}),
        }),
      });
      const json = (await r.json().catch(() => ({}))) as { aserrio?: ResultadoCobro; message?: string; error?: string };
      if (!r.ok) throw new Error(json.message ?? json.error ?? `El servidor respondió ${r.status}`);
      invalidarCtp("/forestal/");
      const detalle =
        mensajeCobroAserrio(json.aserrio) ??
        (valor.duenoParteId ? "Se quitó el cobro: quedó sin dueño." : "Se guardó sin cargar nada en ninguna cuenta.");
      onListo(`Corrida N° ${entry.lineNo}`, detalle);
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
      title="Cobrar aserrío"
      description={`Corrida N° ${entry.lineNo} · ${entry.speciesCommon ?? "sin especie"}`}
      icon={Coins}
      variant="wide"
      /* Se abre desde la fila del libro, que puede estar dentro del AdminModal
         de «Producción · Todos y registrados» (ZonaLibro) — sin esto quedaba
         montado y tapado detrás (z-50 contra z-50, gana el que pintó primero). */
      aboveModals
      footer={
        <ModalFooter error={error}>
          <Btn variant="secondary" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Btn>
          <Btn
            variant="primary"
            onClick={() => void guardar()}
            disabled={guardando || cargando || !aserrioValido || (sinPt && Boolean(valor.duenoParteId))}
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Guardar
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody>
        {cargando ? (
          <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando los paquetes de la corrida…
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-[var(--text-tertiary)]">
              Se cotiza sobre {bloques.length} {bloques.length === 1 ? "bloque" : "bloques"} de esta corrida —
              {" "}{entry.quantity != null ? Number(entry.quantity).toFixed(3) : "—"} {entry.unit ? (UNIT_LABELS[entry.unit] ?? entry.unit) : ""} ya declarados el{" "}
              {formatDate(entry.entryDate)}.
            </p>
            {sinPt && (
              <p className="mb-3 flex items-start gap-1.5 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Esta corrida no está en m³: el aserrío se cobra por pie tablar y no se puede calcular.
              </p>
            )}
            <CtpCobroAserrio
              fecha={entry.entryDate.slice(0, 10)}
              bloques={bloques}
              valor={valor}
              nombreGuardado={entry.titularNombre}
              onValidez={setAserrioValido}
              onChange={(v, tocado) => {
                setValor(v);
                if (tocado.dueno) setDuenoTocado(true);
                if (tocado.precio) setPrecioTocado(true);
              }}
            />
          </>
        )}
      </ModalBody>
    </AdminModal>
  );
}
