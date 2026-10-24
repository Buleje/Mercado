"use client";

/**
 * «Guardar en la cuenta» del Cubicador de madera (aserrada, en PT): el MISMO
 * camino de plata que el patio de trozas (ADR-478/483/484), sin otro.
 *
 *   1. El lote se guarda (o se actualiza) en el Cubicador, para que lo que se
 *      cobre sea EXACTAMENTE lo que se ve en la tabla.
 *   2. La cubicación comercial lo referencia por `cubicacionRefId`: el servidor
 *      copia sus piezas, re-cubica el PT y congela las medidas. Nunca toma el
 *      PT de la pantalla.
 *   3. Valorizar (precio por PT) y descontar del adelanto va después, en la
 *      misma ventana que la de trozas.
 *
 * Anti doble cobro: guardar otra vez el mismo lote ACTUALIZA su cubicación en
 * borrador; si ya se descontó en ese sentido, no deja (anúlala primero); si
 * está en el despacho, se abre allá. Tras cualquier falla se vuelve a pedir la
 * lista antes de dejar guardar otra vez: si la red cortó con la cubicación ya
 * creada, llega y se actualiza esa (y un 409 `DESACTUALIZADA` trae la versión
 * nueva). El servidor igual responde 409 `REF_YA_VALORIZADA` si llegara a
 * aplicarse otra.
 */
import { useState } from "react";
import { AlertTriangle, Loader2, Save } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { useTenant } from "@/contexts/tenant-context";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fmtVolumen } from "@/lib/forestal/cubicacion-cuenta";
import { limaDateKey } from "@/lib/utils";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import {
  CAMPO_CUENTA, CampoPersonaCuenta, CampoSentidoCuenta, ETIQUETA_CUENTA as ETIQUETA,
} from "./cubicacion-cuenta-persona";
import { AvisosDelLote, ERROR_CUENTA as ERROR, EstadoDelLoteEnLaCuenta } from "./cubicador-madera-cuenta-avisos";
import type { CubicacionTrozas } from "./hooks/use-cubicaciones-trozas";
import { fechaValidaCuenta as fechaValida, useSubirMaderaACuenta } from "./hooks/use-subir-madera-a-cuenta";

export default function GuardarMaderaEnLaCuentaModal({
  rows, especieDelLote, cliente, fechaDelLote, delLote, errorDelLote, reintentar, guardarLote, onGuardada, onAbrir, onCerrar,
}: {
  rows: PiezaCubicada[];
  /** La especie del lote (la de las piezas sin especie propia, igual que el servidor). */
  especieDelLote: string | null;
  /** El «cliente» escrito a mano en el lote: sólo para sugerir la persona. */
  cliente: string;
  fechaDelLote: string;
  /** Lo ya hecho con este lote (`mezclarDelLote`); null = todavía cargando. */
  delLote: CubicacionTrozas[] | null;
  /** No se pudo ver si el lote ya está en una cuenta: no se guarda a ciegas (podría duplicarla). */
  errorDelLote: string | null;
  reintentar: () => void;
  /** Guarda (o actualiza) el lote en el Cubicador y devuelve su id; null = no se pudo. */
  guardarLote: () => Promise<{ id: string; nombre: string } | null>;
  onGuardada: (c: CubicacionTrozas) => void;
  onAbrir: (id: string) => void;
  onCerrar: () => void;
}) {
  const { branding } = useTenant();
  const [fecha, setFecha] = useState(() => fechaValida(fechaDelLote));
  const [gtf, setGtf] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Con la cubicación vigente de este lote en borrador, sus datos (una vez). */
  const subida = useSubirMaderaACuenta({
    rows, especieDelLote, cliente, delLote, reintentar,
    alIniciar: (vigente) => {
      if (vigente.estado !== "borrador") return;
      setFecha(fechaValida(vigente.fecha));
      setGtf(vigente.gtfNumber ?? "");
      setNotas(vigente.notas ?? "");
    },
  });
  const { ordenadas, persona, clave, setClave, sentido, setSentido, cargando, errorPersonas, vista, actualiza, cobrada, enDespacho } = subida;
  const listo = subida.puede && /^\d{4}-\d{2}-\d{2}$/.test(fecha);

  const guardar = async () => {
    if (!listo || enviando) return;
    setEnviando(true);
    setError(null);
    /* 1) El lote tal como se ve, guardado: el servidor cobra SUS piezas. */
    const ref = await guardarLote();
    if (!ref) {
      setEnviando(false);
      setError("No se pudo guardar el lote en el Cubicador: no se subió nada a la cuenta. Prueba de nuevo.");
      return;
    }
    /* 2) La cubicación comercial que lo referencia (nunca manda piezas ni PT). */
    const r = await subida.subir(ref, { fecha, gtf, notas });
    setEnviando(false);
    if (r.ok) { onGuardada(r.data); return; }
    setError(r.mensaje);
  };

  const pt = vista.ok ? vista.pt : 0;
  return (
    /* Se abre también desde «Producir sin lote» (otra ventana): por encima, como la trasera y el variado. */
    <AdminModal
      aboveModals
      open
      onClose={onCerrar}
      title="Guardar en la cuenta"
      description={`${branding.name ?? "Este negocio"} · ${vista.ok ? `${vista.piezas} ${vista.piezas === 1 ? "pieza" : "piezas"} · ${fmtVolumen(pt, "tablar")}` : `${rows.length} filas`}`}
      icon={Save}
      claveVentana="cubicador-madera-guardar-cuenta"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>Cancelar</button>
          <button type="button" className={BOTON_PRIMARIO} disabled={!listo || enviando} onClick={() => void guardar()} data-accion="guardar-madera-cuenta">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {actualiza ? `Actualizar ${actualiza.codigo}` : "Guardar"}
          </button>
        </div>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`} data-vista="cubicador-madera-guardar-cuenta">
        <AvisosDelLote subida={subida} />

        <CampoPersonaCuenta id="cubm-persona" ordenadas={ordenadas} persona={persona} clave={clave} onClave={setClave}
          sentido={sentido} cargando={cargando} error={errorPersonas} />

        <div className="grid gap-3 sm:grid-cols-2">
          <CampoSentidoCuenta sentido={sentido} onSentido={setSentido} />
          <div>
            <label htmlFor="cubm-fecha" className={ETIQUETA}>Fecha</label>
            <input id="cubm-fecha" type="date" className={CAMPO_CUENTA} value={fecha} max={limaDateKey()} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label htmlFor="cubm-gtf" className={ETIQUETA}>Guía (si salió con una)</label>
            <input id="cubm-gtf" className={CAMPO_CUENTA} value={gtf} maxLength={80} placeholder="N° de la GTF" onChange={(e) => setGtf(e.target.value)} />
          </div>
          <div>
            <label htmlFor="cubm-notas" className={ETIQUETA}>Nota (opcional)</label>
            <input id="cubm-notas" className={CAMPO_CUENTA} value={notas} maxLength={500} placeholder="Ej.: tablas para el techo" onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <EstadoDelLoteEnLaCuenta subida={subida} delLote={delLote} errorDelLote={errorDelLote} reintentar={reintentar} onAbrir={onAbrir} />

        {persona && !cobrada && !enDespacho && (
          <p className="rounded-2xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Se guarda en <b className="text-[var(--text-primary)]">{branding.name ?? "este negocio"}</b>, a la cuenta de{" "}
            <b className="text-[var(--text-primary)]">{persona.nombre}</b>. Todavía no mueve plata: después le pones el precio por PT y se descuenta de sus adelantos.
          </p>
        )}
        {error && <p role="alert" className={ERROR}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
      </div>
    </AdminModal>
  );
}
