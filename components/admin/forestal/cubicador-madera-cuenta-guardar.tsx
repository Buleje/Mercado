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
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Save } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useTenant } from "@/contexts/tenant-context";
import { formatCurrency } from "@/lib/currency";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fmtVolumen } from "@/lib/forestal/cubicacion-cuenta";
import {
  cubicacionVigente, duenosDelLote, personaSugerida, queHacerAlGuardar, vistaPreviaMadera,
} from "@/lib/forestal/cubicacion-madera-cuenta";
import { limaDateKey } from "@/lib/utils";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import {
  CAMPO_CUENTA, CampoPersonaCuenta, CampoSentidoCuenta, ETIQUETA_CUENTA as ETIQUETA, usePersonasOrdenadas,
} from "./cubicacion-cuenta-persona";
import { guardarCubicacionComercial, type CuerpoAserrada } from "./hooks/use-cubicacion-comercial-despacho";
import {
  jsonPost, pedir, RUTA_CUBICACIONES_TROZAS, unaCubicacion, usePersonasDeLaCuenta,
  type CubicacionTrozas, type SentidoCubicacion,
} from "./hooks/use-cubicaciones-trozas";

const AVISO = "inline-flex items-center gap-1 font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const ERROR = "flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

/** La fecha del lote si sirve (date-only, no futura); si no, hoy en Lima. */
const fechaValida = (f: string | null | undefined) => {
  const d = f?.slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= limaDateKey() ? d : limaDateKey();
};

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
  const { personas, cargando, error: errorPersonas } = usePersonasDeLaCuenta(true);
  const vigente = cubicacionVigente(delLote);
  const [clave, setClave] = useState("");
  const [sentido, setSentido] = useState<SentidoCubicacion>("venta");
  const [fecha, setFecha] = useState(() => fechaValida(fechaDelLote));
  const [gtf, setGtf] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* La lista con la que falló el último intento: mientras siga siendo esa, no
     se decide (puede que el servidor sí la haya guardado). */
  const [falloCon, setFalloCon] = useState<readonly CubicacionTrozas[] | null>(null);
  const verificando = !!falloCon && falloCon === delLote;
  /* La de AHORA al fallar (no la del clic): guardar el lote puede haber cambiado su id y su lista. */
  const delLoteAhora = useRef(delLote);
  useEffect(() => { delLoteAhora.current = delLote; }, [delLote]);

  /* Una vez: con la cubicación vigente de este lote, sus datos; si no, la persona que el lote ya nombra. */
  const iniciado = useRef({ lote: false, persona: false });
  useEffect(() => {
    if (iniciado.current.lote || delLote === null) return;
    iniciado.current.lote = true;
    if (!vigente) return;
    setSentido(vigente.sentido);
    if (vigente.estado === "borrador") {
      setFecha(fechaValida(vigente.fecha));
      setGtf(vigente.gtfNumber ?? "");
      setNotas(vigente.notas ?? "");
    }
  }, [delLote, vigente]);
  useEffect(() => {
    if (iniciado.current.persona || delLote === null || !personas) return;
    iniciado.current.persona = true;
    const dePrevia = vigente && personas.find((p) =>
      vigente.beneficiarioId ? p.beneficiarioId === vigente.beneficiarioId : !!vigente.parteId && p.parteId === vigente.parteId);
    const p = dePrevia ?? personaSugerida(personas, rows, cliente);
    if (p) setClave(p.clave);
  }, [delLote, personas, vigente, rows, cliente]);

  const ordenadas = usePersonasOrdenadas(personas, sentido);
  const persona = ordenadas.find((p) => p.clave === clave) ?? null;
  const vista = useMemo(() => vistaPreviaMadera(rows, especieDelLote), [rows, especieDelLote]);
  const duenos = useMemo(() => duenosDelLote(rows), [rows]);
  const accion = delLote === null ? null : queHacerAlGuardar(delLote, sentido);
  const actualiza = accion?.tipo === "actualizar" ? accion.cub : null;
  const cobrada = accion?.tipo === "cobrada" ? accion.cub : null;
  const enDespacho = accion?.tipo === "despacho" ? accion.cub : null;
  const listo = !!persona && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && vista.ok && !!accion && !cobrada && !enDespacho && !verificando;

  const guardar = async () => {
    if (!persona || !listo || enviando || !accion) return;
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
    const cuerpo: CuerpoAserrada = {
      material: "aserrada",
      modo: "pieza",
      fecha,
      sentido,
      origen: "libre",
      cubicacionRefId: ref.id,
      ...(persona.beneficiarioId ? { beneficiarioId: persona.beneficiarioId } : {}),
      ...(persona.parteId ? { parteId: persona.parteId } : {}),
      ...(gtf.trim() ? { gtfNumber: gtf.trim() } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
    };
    const r = actualiza
      ? await pedir(`${RUTA_CUBICACIONES_TROZAS}/${actualiza.id}`, jsonPost("PATCH", { ...cuerpo, version: actualiza.version }), unaCubicacion)
      : await guardarCubicacionComercial(cuerpo);
    setEnviando(false);
    if (r.ok) { onGuardada(r.data); return; }
    setError(r.mensaje);
    /* Volver a mirar: un corte de red con la cubicación ya creada no crea otra. */
    setFalloCon(delLoteAhora.current);
    reintentar();
  };

  const pt = vista.ok ? vista.pt : 0;
  return (
    <AdminModal
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
        {(!vista.ok || duenos.length > 1) && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {!vista.ok && (
              <span role="alert" className={ERROR}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {vista.mensaje}</span>
            )}
            {duenos.length > 1 && (
              <span className={AVISO}>
                <AlertTriangle className="h-4 w-4" /> Piezas de {duenos.length} dueños: todo va a UNA cuenta
                <InfoTip
                  what={`Este lote tiene piezas de ${duenos.join(", ")}.`}
                  affects="Se guarda entero a la cuenta de la persona que elijas. Si son cuentas distintas, separa las piezas en lotes y guarda cada uno."
                />
              </span>
            )}
          </div>
        )}

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

        {errorDelLote ? (
          <div role="alert" className="flex flex-wrap items-center gap-2">
            <span className={`${ERROR} min-w-0 flex-1`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No se pudo ver si este lote ya está en una cuenta: {errorDelLote}</span>
            <button type="button" className={BOTON_SECUNDARIO} onClick={reintentar}>Reintentar</button>
          </div>
        ) : (delLote === null || verificando) && (
          <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Viendo si este lote ya está en una cuenta…</p>
        )}
        {actualiza && (
          <p className="text-sm text-[var(--text-secondary)]">
            Este lote ya está guardado como <b className="font-mono text-[var(--text-primary)]">{actualiza.codigo}</b> (sin descontar): se actualiza esa misma.
          </p>
        )}
        {enDespacho && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <span className="min-w-0 flex-1">
              Este lote está en el despacho como <b className="font-mono">{enDespacho.codigo}</b>
              {enDespacho.personaNombre ? ` (${enDespacho.personaNombre})` : ""}: se valoriza desde ahí, no se guarda otra.
            </span>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => onAbrir(enDespacho.id)}>Abrir {enDespacho.codigo}</button>
          </div>
        )}
        {cobrada && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <span className="min-w-0 flex-1">
              Este lote ya se descontó como <b className="font-mono">{cobrada.codigo}</b>{cobrada.monto != null ? ` (${formatCurrency(cobrada.monto)})` : ""}
              {cobrada.personaNombre ? ` a ${cobrada.personaNombre}` : ""}. Guardarlo otra vez lo cobraría dos veces: anúlala primero, o empieza un lote nuevo si son otras piezas.
            </span>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => onAbrir(cobrada.id)}>Abrir {cobrada.codigo}</button>
          </div>
        )}

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
