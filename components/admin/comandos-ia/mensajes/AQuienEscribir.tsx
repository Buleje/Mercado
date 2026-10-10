"use client";
/**
 * Comandos IA › «A quién escribir».
 *
 * 1. «Para escribir hoy»: a quién conviene escribirle (fiados, clientes que no
 *    vuelven, adelantos, seguimientos que ya tocan). Armar la lista no cuesta IA.
 * 2. [Redactar]: la IA escribe la plantilla; el servidor pone los datos que
 *    acaba de releer. El borrador se abre en un modal: copiar, recordar o
 *    abrir WhatsApp. Nada se envía solo.
 * 3. «Escríbelo por mí»: aviso libre → WhatsApp, cartel A4 o texto de tienda.
 * Con la bandeja vacía, «Escríbelo por mí» va primero.
 */
import { useMemo, useRef, useState } from "react";
import { ErrorAlert } from "@buleje/design-system";
import { Inbox, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Candidato } from "@/lib/admin/comandos-ia/candidatos";
import type { Tono } from "@/lib/admin/comandos-ia/plantillas-sin-ia";
import BandejaHoy, { type Hecho } from "./BandejaHoy";
import BorradorModal from "./BorradorModal";
import EscribeloPorMi from "./EscribeloPorMi";
import { BOTON_SECUNDARIO, cerrarSeguimiento, pedirBorradores, registrarRecibo, textoDeError, useBandeja, type RespuestaRedactar } from "./use-mensajes";

type SubComandos = "papel" | "precios" | "mensajes" | "historial";

function Esqueleto() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando a quién escribir">
      <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />
      <div className="h-24 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />
    </div>
  );
}

// `irA` es el contrato del armazón; esta sub-vista no manda a otra.
export default function AQuienEscribir(_props: { irA: (sub: SubComandos) => void }) {
  const { bandeja, cargando, error, recargar } = useBandeja();
  const [redaccion, setRedaccion] = useState<RespuestaRedactar | null>(null);
  const [indice, setIndice] = useState<number | null>(null);
  const [redactando, setRedactando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [hechos, setHechos] = useState<Record<string, Hecho>>({});
  const [cerrando, setCerrando] = useState<string | null>(null);
  // El botón que abrió el borrador: se deshabilita mientras la IA escribe (pierde el
  // foco) y el modal se monta ya abierto, así que el foco vuelve acá a mano al cerrar.
  const disparador = useRef<HTMLElement | null>(null);

  const conBorrador = useMemo(() => new Set(redaccion?.borradores.map((b) => b.id) ?? []), [redaccion]);

  const redactar = async (ids: string[], tono: Tono) => {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) disparador.current = document.activeElement;
    // Un borrador que ya está hecho (mismo tono) se abre sin volver a gastar IA.
    if (ids.length === 1 && redaccion && redaccion.tono === tono) {
      const i = redaccion.borradores.findIndex((b) => b.id === ids[0]);
      if (i >= 0) return setIndice(i);
    }
    setRedactando(true);
    setErrorAccion(null);
    try {
      const r = await pedirBorradores(ids, tono);
      if (r.borradores.length === 0) {
        setErrorAccion("Los datos cambiaron desde que abriste la lista. La actualicé.");
        void recargar();
        return;
      }
      // Los que ya no estaban se dicen en el borrador y la lista se pone al día.
      if (r.faltan.length > 0) void recargar();
      setRedaccion(r);
      setIndice(0);
    } catch (err) {
      setErrorAccion(textoDeError(err, "No pude redactar."));
    } finally {
      setRedactando(false);
    }
  };

  const cerrar = async (c: Candidato) => {
    if (!c.recordatorioId) return;
    setCerrando(c.id);
    setErrorAccion(null);
    try {
      await cerrarSeguimiento(c.recordatorioId);
      setHechos((h) => ({ ...h, [c.id]: "cerrado" }));
      registrarRecibo({ tipo: "recordatorio", resumen: `Cerraste el seguimiento de ${c.nombre}: ya pagó`, filas: 1, refId: c.recordatorioId });
    } catch (err) {
      setErrorAccion(textoDeError(err, "No pude cerrar el seguimiento."));
    } finally {
      setCerrando(null);
    }
  };

  if (cargando && !bandeja) return <Esqueleto />;
  if (error && !bandeja) {
    return (
      <ErrorAlert
        title="No pude armar la lista"
        description={error}
        action={<button type="button" className={BOTON_SECUNDARIO} onClick={() => void recargar()}><RefreshCw className="h-4 w-4" aria-hidden /> Reintentar</button>}
      />
    );
  }
  if (!bandeja) return null;

  const vacia = bandeja.candidatos.length === 0;
  const f = bandeja.fuentes;
  const avisoVacio = (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-3 text-sm text-[var(--text-secondary)]" data-bandeja-vacia>
      <Inbox className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <span className="min-w-0">Hoy nadie te debe ni dejó de venir. Agrega teléfonos a tus clientes para encontrarlos aquí.</span>
      <InfoTip
        title="Lo que miré"
        what={`${f.fiados} fiados, ${f.clientesConCompras} clientes con compras y teléfono${f.adelantos ? ", adelantos abiertos" : ""} y tus seguimientos.`}
        affects="Un cliente entra si debe, si dejó de venir más del doble de su ritmo o si le pusiste un recordatorio."
        example="Juan compraba cada 7 días y lleva 20 sin venir."
        side="bottom"
        className="shrink-0"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {errorAccion && <ErrorAlert title={errorAccion} />}
      {vacia ? (
        <>
          <EscribeloPorMi vacio />
          {avisoVacio}
        </>
      ) : (
        <>
          <BandejaHoy
            bandeja={bandeja}
            hechos={hechos}
            redactando={redactando}
            conBorrador={conBorrador}
            onRedactar={(ids, tono) => void redactar(ids, tono)}
            onCerrarSeguimiento={(c) => void cerrar(c)}
            cerrando={cerrando}
          />
          <EscribeloPorMi />
        </>
      )}

      {redaccion && indice !== null && (
        <BorradorModal
          borradores={redaccion.borradores}
          indice={indice}
          onIndice={setIndice}
          hoy={bandeja.hoy}
          costoIaUsd={redaccion.costoIaUsd}
          motivoSinIa={redaccion.motivoSinIa}
          faltan={redaccion.faltan.length}
          onHecho={(id, accion) => setHechos((h) => ({ ...h, [id]: accion }))}
          onCerrar={() => {
            setIndice(null);
            window.setTimeout(() => {
              if (disparador.current?.isConnected) disparador.current.focus({ preventScroll: true });
            }, 0);
          }}
        />
      )}
    </div>
  );
}
