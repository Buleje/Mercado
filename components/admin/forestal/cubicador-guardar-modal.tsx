"use client";

/**
 * «Guardar cubicación» del Cubicador de madera (Brandon 24-10): antes era un
 * panelcito con nombre, fecha, cliente y notas. Ahora es una ventana con todo
 * lo que se anota del lote —a quién se vende, de qué CCNN salió, permiso, GTF,
 * camión—, el precio por pie, el resumen detallado (por especie y los demás) y,
 * si se quiere, la subida a la cuenta de una persona.
 *
 * Lo que se escribe vive en ESTA ventana (no redibuja la tabla en cada tecla) y
 * pasa al lote al guardar o al cerrar. La cuenta va por el camino de siempre:
 * primero se guarda el lote y después la cubicación comercial lo referencia
 * (`useSubirMaderaACuenta`); el dueño o el admin sigue a Valorizar.
 *
 * «¿Ya se llevó la madera?» (28-10) va igual: el viaje queda pendiente y se
 * anota con su PATCH cuando el lote ya tiene id; si falla, el lote igual quedó.
 */
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Save } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { esDelCubicador, personaDelComprador } from "@/lib/forestal/cubicacion-madera-cuenta";
import { saldoDeLaCubicacion, type SalidaCubicacion } from "@/lib/forestal/cubicacion-salidas";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import CuentaDeGuardar from "./cubicador-guardar-cuenta";
import DatosDeGuardar from "./cubicador-guardar-datos";
import PagoDeGuardar from "./cubicador-guardar-pago";
import PrecioDeGuardar from "./cubicador-guardar-precio";
import ResumenDeGuardar from "./cubicador-guardar-resumen";
import type { DatosDeLaCubicacion } from "./cubicador-guardar-tipos";
import { SalidasAlGuardar } from "./cubicador-salidas-guardar";
import { entradaDelBorrador, respaldoDeGuardada, type BorradorSalida } from "./cubicador-salidas-logica";
import { anotarSalida } from "./hooks/use-salidas-de-cubicacion";
import { ERROR_CUENTA } from "./cubicador-madera-cuenta-avisos";
import { useCuentaDeMaderaDelLote } from "./cubicador-madera-cuenta-contexto";
import { useLibretaDeLaFicha } from "./hooks/use-libreta-de-la-ficha";
import { useCelularDelComprador } from "./hooks/use-celular-del-comprador";
import type { PrecioCubicador } from "./hooks/use-precio-cubicador";
import { fechaValidaCuenta, useSubirMaderaACuenta } from "./hooks/use-subir-madera-a-cuenta";

const sinReintento = () => {};
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default function GuardarCubicacionModal({
  inicial, nombreSugerido, actualizando, valorGuardado = null, rows, precios, especiesLote, especieDelLote, onGuardar, onCerrar,
}: {
  inicial: DatosDeLaCubicacion;
  nombreSugerido: string;
  /** El nombre de la guardada que se actualiza (null = lote nuevo). */
  actualizando: string | null;
  /** El importe con que quedó guardada: si con los precios de ahora cambia, se avisa antes de pisarlo. */
  valorGuardado?: number | null;
  rows: PiezaCubicada[];
  precios: PrecioCubicador;
  especiesLote: string[];
  especieDelLote: string | null;
  /** Guarda el lote con estos datos; `silencioso` = sin el aviso propio (lo da la cuenta). */
  onGuardar: (datos: DatosDeLaCubicacion, opciones: { silencioso: boolean }) => Promise<{ id: string; nombre: string } | null>;
  /** Al cerrar sin guardar, lo escrito queda en el lote (como el panel de antes). */
  onCerrar: (datos: DatosDeLaCubicacion | null) => void;
}) {
  const [datos, setDatos] = useState<DatosDeLaCubicacion>(() => ({ ...inicial, nombre: inicial.nombre || nombreSugerido }));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardado = useRef(false);
  const libreta = useLibretaDeLaFicha(true);
  const comprador = libreta.compradores.find((p) => p.id === datos.ficha.clienteParteId) ?? null;
  const celular = useCelularDelComprador(comprador);
  /* La cubicación ya quedó guardada pero el celular no: se avisa y lo único que queda es cerrar. */
  const [avisoCelular, setAvisoCelular] = useState<string | null>(null);
  const cuenta = useCuentaDeMaderaDelLote();
  const conCuenta = !!cuenta?.activo;
  const [aCuenta, setACuenta] = useState(false);
  const subida = useSubirMaderaACuenta({
    activo: conCuenta && aCuenta,
    rows,
    especieDelLote,
    cliente: datos.cliente,
    delLote: cuenta?.delLote ?? null,
    reintentar: cuenta?.recargar ?? sinReintento,
    /* Ya está en una cuenta y sin descontar: se sigue actualizando esa (si no, quedaría con las medidas viejas). */
    alIniciar: (v) => { if (v.estado === "borrador" && esDelCubicador(v)) setACuenta(true); },
  });
  const subir = conCuenta && aCuenta;
  /* «Subir a la cuenta de …» (28-10): Blas tenía 3 de 3 guardadas con comprador y 0 en una cuenta.
     Se esconde si ya está en su cuenta, o si con las personas a la vista no hay una con ese nombre. */
  const compradorEscrito = { parteId: datos.ficha.clienteParteId, nombre: datos.cliente.trim() };
  const delComprador = subida.personas ? personaDelComprador(subida.personas, compradorEscrito) : null;
  const sinSuCuenta = subir && !!subida.personas && (!delComprador || subida.persona?.clave === delComprador.clave);
  const aLaCuenta = conCuenta && compradorEscrito.nombre && !sinSuCuenta
    ? {
        nombre: compradorEscrito.nombre.length > 28 ? `${compradorEscrito.nombre.slice(0, 27)}…` : compradorEscrito.nombre,
        onClick: () => {
          setACuenta(true);
          subida.elegirComprador(compradorEscrito);
          document.getElementById("cubg-cuenta")?.scrollIntoView({ block: "center", behavior: "smooth" });
        },
      }
    : null;
  /* El viaje (si ya salió madera): pendiente hasta que el lote tenga id. Los ya anotados, sólo se muestran. */
  const [viaje, setViaje] = useState<BorradorSalida | null>(null);
  const [previas, setPrevias] = useState<SalidaCubicacion[]>(() => inicial.salidas ?? []);
  const salidasCambiaron = useRef(false);
  const { precioDe } = precios;
  const saldo = useMemo(
    () => saldoDeLaCubicacion(precios.conValor ? rows.map((r) => ({ ...r, precio: precioDe(r) })) : rows, previas),
    [rows, previas, precios.conValor, precioDe],
  );
  const respaldo = respaldoDeGuardada({ cliente: datos.cliente, ficha: datos.ficha, gtfNumber: datos.gtf });
  const delViaje = viaje ? entradaDelBorrador(viaje, saldo, respaldo, previas.length === 0) : null;
  const listo = rows.length > 0 && FECHA.test(datos.fecha) && !celular.invalido && (!subir || subida.puede) && (!delViaje || delViaje.ok);

  /* Ya guardada: si se anotó un viaje, el lote se queda con sus viajes nuevos (para la próxima vez que se abra esta ventana). */
  const cuentaPendiente = useRef<(() => void) | null>(null);
  const cerrarGuardada = (salidas = previas) => {
    onCerrar(salidasCambiaron.current ? { ...datos, salidas } : null);
    cuentaPendiente.current?.();
    cuentaPendiente.current = null;
  };
  const cerrar = () => (guardado.current ? cerrarGuardada() : onCerrar(datos));
  const abrirEnLaCuenta = (id: string) => { cerrar(); cuenta?.setAbierta(id); };

  const guardar = async () => {
    if (!listo || enviando) return;
    setEnviando(true);
    setError(null);
    /* 1) El lote tal como se ve, con sus datos y el precio de cada pieza. */
    const ref = await onGuardar(datos, { silencioso: subir });
    if (!ref) {
      setEnviando(false);
      setError(subir ? "No se pudo guardar la cubicación: no se subió nada a la cuenta. Prueba de nuevo." : "No se pudo guardar la cubicación. Prueba de nuevo.");
      return;
    }
    guardado.current = true;
    /* El celular va a la ficha del comprador; si falla, la cubicación igual quedó guardada y no se sigue. */
    const falloCelular = await celular.guardar();
    if (falloCelular) {
      setEnviando(false);
      setAvisoCelular(`La cubicación quedó guardada, pero no se pudo anotar el celular de ${comprador?.nombre ?? "el comprador"}: ${falloCelular}. Anótalo en el Directorio.${subir ? " No se subió a la cuenta: ábrela de nuevo y vuelve a guardar." : ""}${delViaje?.ok ? " Tampoco el viaje: anótalo desde Guardadas › Salidas." : ""}`);
      return;
    }
    /* 2) La cubicación comercial que lo referencia (nunca manda piezas ni PT). Va ANTES que el
       viaje: un viaje que falla (p. ej. el tope de viajes) no deja la cuenta sin subir (revisión 28-10). */
    const enCuenta = subir && cuenta
      ? await subida.subir(ref, { fecha: fechaValidaCuenta(datos.fecha), gtf: datos.gtf, notas: datos.notas })
      : null;
    /* Lo que sigue en la cuenta (abrir Valorizar) va DESPUÉS de cerrar esta ventana, no encima del aviso. */
    if (enCuenta?.ok) cuentaPendiente.current = () => cuenta?.alGuardar(enCuenta.data);
    /* 3) El viaje, a la guardada. */
    let salidas = previas;
    let falloViaje: string | null = null;
    if (delViaje?.ok) {
      const r = await anotarSalida(ref.id, delViaje.entrada);
      if (r.ok) {
        salidas = r.cubicacion.salidas ?? [];
        salidasCambiaron.current = true;
        setPrevias(salidas);
        setViaje(null);
      } else falloViaje = r.mensaje;
    }
    setEnviando(false);
    if (enCuenta && !enCuenta.ok) {
      setError(`La cubicación quedó guardada como «${ref.nombre}», pero no se subió a la cuenta: ${enCuenta.mensaje}${falloViaje ? `. Tampoco se anotó el viaje: ${falloViaje}` : ""}`);
      return;
    }
    if (falloViaje) {
      setAvisoCelular(`La cubicación quedó guardada${enCuenta?.ok ? " y subida a la cuenta" : ""}, pero no se pudo anotar el viaje: ${falloViaje}. Anótalo desde Guardadas › Salidas.`);
      return;
    }
    cerrarGuardada(salidas);
  };

  const { valorLote: total, conValor } = precios;
  const pt = rows.reduce((a, r) => a + (Number.isFinite(r.pieTablar) ? r.pieTablar : 0), 0);
  /* 24-10 (medido): una guardada cuyos precios no se pueden reponer al reabrirla
     (sin especie, tratos por dueño) se re-valoriza con los de hoy al actualizarla. */
  const importeAhora = conValor ? total : 0;
  const cambiaImporte = actualizando !== null && valorGuardado !== null && Math.abs(valorGuardado - importeAhora) >= 0.01;
  const etiqueta = subir
    ? subida.actualiza ? `Guardar y actualizar ${subida.actualiza.codigo}` : "Guardar y subir a la cuenta"
    : actualizando ? "Actualizar" : "Guardar";

  return (
    <AdminModal
      open
      onClose={cerrar}
      size="planilla"
      title={actualizando ? `Actualizar «${actualizando}»` : "Guardar cubicación"}
      description={`${rows.length} ${rows.length === 1 ? "fila" : "filas"} · ${fmtPt(pt)} PT${conValor ? ` · S/ ${fmtSoles(total)}` : ""}`}
      icon={Save}
      claveVentana="cubicador-madera-guardar"
      aboveModals
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto hidden text-sm text-[var(--text-tertiary)] sm:inline">Queda en tu cuenta: la ves desde cualquier dispositivo.</span>
          {avisoCelular ? (
            <button type="button" className={button({ className: "gap-2 px-4" })} onClick={() => cerrarGuardada()} data-accion="cerrar-guardada">Cerrar</button>
          ) : (<>
          <button type="button" className={BOTON_SECUNDARIO} onClick={cerrar}>Cancelar</button>
          <button type="button" className={BOTON_PRIMARIO} disabled={!listo || enviando} onClick={() => void guardar()} data-accion="guardar-cubicacion">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {enviando ? "Guardando…" : etiqueta}
          </button>
          </>)}
        </div>
      }
    >
      {/* El resumen de la derecha es sticky: con «¿Ya se llevó?» dentro de la misma grilla se le montaba encima al bajar. */}
      <div className={`${MODAL_BODY} space-y-6`} data-vista="cubicador-madera-guardar">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0 space-y-6">
            <DatosDeGuardar datos={datos} actualizar={setDatos} nombreSugerido={nombreSugerido} libreta={libreta} celular={celular}
              actualizando={actualizando} aLaCuenta={aLaCuenta} />
            <PrecioDeGuardar precios={precios} especiesLote={especiesLote} rows={rows} />
            <PagoDeGuardar datos={datos} actualizar={setDatos} importe={conValor ? total : null} />
            {cambiaImporte && valorGuardado !== null && (
              <p role="status" data-aviso="importe-cambia" className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Se guardó con S/ {fmtSoles(valorGuardado)}; con estos precios queda en S/ {fmtSoles(importeAhora)}. Si no quieres cambiarlo, pon los precios de ese día.
              </p>
            )}
            {conCuenta && cuenta && (
              <CuentaDeGuardar cuenta={cuenta} subida={subida} encendido={aCuenta} onEncendido={setACuenta}
                importe={conValor ? total : null} onAbrir={abrirEnLaCuenta} />
            )}
          </div>
          <ResumenDeGuardar rows={rows} precioDe={precios.precioDe} conValor={conValor} />
        </div>
        <SalidasAlGuardar previas={previas} saldo={saldo} viaje={viaje} onViaje={setViaje} fechaSugerida={datos.fecha} respaldo={respaldo}
          sugerencias={{ compradores: libreta.nombresCompradores, placas: libreta.placas, choferes: libreta.choferes, destinos: libreta.nombresDestinos }}
          aviso={delViaje && !delViaje.ok ? delViaje.mensaje : null} />
        {/* Al final, pegados al «Guardar» que los provoca (con el viaje abajo, arriba no se veían). */}
        {avisoCelular && <p role="alert" className={ERROR_CUENTA}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {avisoCelular}</p>}
        {error && <p role="alert" className={ERROR_CUENTA}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
      </div>
    </AdminModal>
  );
}
