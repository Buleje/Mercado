"use client";

/**
 * La guía de transporte de una línea YA registrada — verla, corregirla, emitirla
 * (ADR-374).
 *
 * El registro de despacho y la guía eran el mismo acto: se llenaban sesenta
 * casilleros y recién ahí entraba la línea al libro. Pero el camión se despacha
 * antes de que estén todos los datos —falta el N° de comprobante, el chofer
 * cambió a último momento— y no había dónde volver: la línea quedaba en el
 * libro y su guía, a medio llenar, en ningún lado.
 *
 * Ahora la guía tiene dos momentos:
 *
 *   BORRADOR · se guarda y se corrige las veces que haga falta. Todavía no es
 *              un documento.
 *   EMITIDA  · «Emitir GTF» le asigna su correlativo único y desde ahí no se
 *              toca: identifica un traslado ante la autoridad y puede estar
 *              impresa viajando en la cabina del camión.
 *
 * El N° NO se tipea. Lo asigna el servidor con un lock sobre los despachos del
 * tenant (`emitirGtf`), que es lo único que garantiza una serie sin huecos ni
 * repetidos — dos personas emitiendo a la vez desde dos tablets no pueden
 * sacar el mismo número.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Lock, Save, Truck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { useFichaCtp } from "@/hooks/use-ficha-ctp";
import { csrfHeaders } from "@/lib/csrf-client";
import { gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { ESTADO_GUIA_LABEL, estadoDeGuia, guiaEditable, motivoNoEditable } from "@/lib/forestal/gtf-estado";
import type { Parte, RolParte } from "@/lib/forestal/directorio";
import CtpGuiaDatosTab from "./CtpGuiaDatosTab";
import type { ValorParte } from "./CtpParteBarra";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";

/** Lo que el modal necesita de la línea del libro. */
export interface LineaConGuia {
  id: string;
  lineNo: number | null;
  entryDate: string;
  gtfNumber: string | null;
  docType?: string | null;
  gtfDatos?: unknown;
  speciesCommon?: string | null;
  speciesCites?: boolean;
  productType?: string | null;
}

export default function CtpGuiaDeLineaModal({
  linea,
  onClose,
  onCambio,
}: {
  linea: LineaConGuia;
  onClose: () => void;
  /** Se llama tras guardar o emitir: la tabla tiene que reflejarlo. */
  onCambio: () => void;
}) {
  const ficha = useFichaCtp();
  const directorio = useDirectorioForestal({ activo: true });

  /* El cuerpo guardado manda; si la línea nunca tuvo guía, se arranca de una
     vacía en vez de un formulario roto. `gtfDatosSchema` ya normalizó lo que
     está en la base, así que se toma tal cual. */
  const [datos, setDatos] = useState<GtfDatos>(() => {
    const g = linea.gtfDatos;
    return g && typeof g === "object" ? ({ ...gtfDatosVacio(), ...(g as Partial<GtfDatos>) } as GtfDatos) : gtfDatosVacio();
  });
  const [emision, setEmision] = useState(linea.entryDate.slice(0, 10));
  const [docType, setDocType] = useState(linea.docType ?? "GTF");
  const [gtfNumber, setGtfNumber] = useState(linea.gtfNumber ?? "");
  const [guardando, setGuardando] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const estado = estadoDeGuia(gtfNumber);
  const editable = guiaEditable(gtfNumber);
  const bloqueo = motivoNoEditable(gtfNumber);

  /** Lo tipeado se pierde si el modal se cierra sin guardar: hay que decirlo. */
  const [sucio, setSucio] = useState(false);
  const setDatosSucio = useCallback<typeof setDatos>((v) => { setSucio(true); setDatos(v); }, []);

  useEffect(() => { setAviso(null); }, [datos]);

  async function guardarBorrador() {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ id: linea.id, action: "gtf_datos", datos }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.message ?? "No se pudo guardar el borrador."); return; }
      setSucio(false);
      contarUsos();
      setAviso("Borrador guardado. Se puede seguir corrigiendo las veces que haga falta.");
      onCambio();
    } catch (e) {
      setError(`No se pudo guardar: ${String(e)}`);
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Emitir guarda ANTES de numerar.
   *
   * Si se numerara primero y el guardado fallara, quedaría una guía con
   * correlativo oficial y el cuerpo viejo — un número quemado apuntando a
   * datos que nadie revisó. Guardar primero deja el peor caso en «se guardó
   * pero no se emitió», que se reintenta sin consecuencias.
   */
  async function emitir() {
    setEmitiendo(true);
    setError(null);
    try {
      const guardado = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ id: linea.id, action: "gtf_datos", datos }),
      });
      if (!guardado.ok) {
        const j = await guardado.json().catch(() => ({}));
        setError(j.message ?? "No se pudo guardar la guía antes de emitirla.");
        return;
      }
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ id: linea.id, action: "emitir_gtf" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.message ?? "No se pudo emitir la GTF."); return; }
      setGtfNumber(j.gtf);
      setSucio(false);
      contarUsos();
      setAviso(`GTF ${j.gtf} emitida. La guía queda cerrada: ya identifica este traslado.`);
      onCambio();
    } catch (e) {
      setError(`No se pudo emitir: ${String(e)}`);
    } finally {
      setEmitiendo(false);
    }
  }

  /** Uso de la libreta en ESTA guía: se cuenta recién al guardar o emitir. */
  const usados = useRef<{ partes: Set<string>; vehiculos: Set<string> }>({ partes: new Set(), vehiculos: new Set() });
  const anotarParte = useCallback((p: Parte) => { usados.current.partes.add(p.id); }, []);
  const anotarVehiculo = useCallback((id: string) => { usados.current.vehiculos.add(id); }, []);
  const guardarEnLibreta = useCallback(
    async (v: ValorParte, rol: RolParte) => {
      const parte = await directorio.guardarParte({
        roles: [rol], nombre: v.nombre, docTipo: v.docTipo, docNumero: v.docNumero,
        direccion: v.direccion, registroMtc: v.registroMtc,
      });
      anotarParte(parte);
    },
    [directorio, anotarParte],
  );
  /** Lo elegido de la libreta sube en el ranking sólo si el acto se concretó. */
  const contarUsos = useCallback(() => {
    directorio.marcarUso({ partes: [...usados.current.partes], vehiculos: [...usados.current.vehiculos] });
  }, [directorio]);

  const trabajando = guardando || emitiendo;

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      title={`Guía de transporte · línea #${linea.lineNo ?? "—"}`}
      description={
        estado === "emitida"
          ? `${ESTADO_GUIA_LABEL.emitida} · ${gtfNumber}`
          : "Borrador · se guarda y se corrige hasta emitirla"
      }
      icon={Truck}
      className="sm:w-[min(96vw,100rem)] sm:max-w-none sm:max-h-[95vh]"
      footer={
        <ModalFooter
          error={error}
          aviso={aviso}
          nota={
            bloqueo ? (
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {bloqueo}
              </span>
            ) : sucio ? (
              <span className="flex items-center gap-1.5 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Hay cambios sin guardar
              </span>
            ) : (
              "Borrador: todavía no es un documento"
            )
          }
        >
          <Btn variant="ghost" onClick={onClose} disabled={trabajando}>Cerrar</Btn>
          {editable && (
            <>
              <Btn variant="secondary" onClick={guardarBorrador} disabled={trabajando}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar borrador
              </Btn>
              {/* Emitir es el acto irreversible: va al final y se anuncia. */}
              <Btn variant="primary" onClick={emitir} disabled={trabajando}>
                {emitiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                Emitir GTF
              </Btn>
            </>
          )}
        </ModalFooter>
      }
    >
      <ModalBody>
        {/* `fieldset` deshabilitado y no campos ocultos: la guía emitida se
            sigue leyendo entera —para cotejarla contra el papel— pero no se
            edita. El guard de verdad está en el endpoint. */}
        <fieldset disabled={!editable} className={editable ? "" : "opacity-90"}>
          <CtpGuiaDatosTab
            datos={datos}
            setDatos={setDatosSucio}
            ficha={ficha}
            directorio={directorio}
            emision={emision}
            onEmision={setEmision}
            gtfNumber={gtfNumber}
            onGtfNumber={setGtfNumber}
            docType={docType}
            onDocType={setDocType}
            onAnotarParte={anotarParte}
            onAnotarVehiculo={anotarVehiculo}
            onGuardarEnLibreta={guardarEnLibreta}
            llevaCites={linea.speciesCites === true}
          />
        </fieldset>
      </ModalBody>
    </AdminModal>
  );
}
