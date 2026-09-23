"use client";

/**
 * Cobrar el aserrío de VARIAS corridas de una sola vez (ADR-412).
 *
 * Pedido de Brandon: estrenar el tarifario con la producción real del tenant
 * — 14 corridas sin dueño, Tornillo el 99.7 % del volumen. Ponerle dueño y
 * precio una por una a las 14 es el mismo trabajo catorce veces; esto es la
 * puerta para hacerlo de una, con la vista previa de cada corrida antes de
 * guardar (regla 6 del repo: el importe definitivo lo fija el servidor).
 *
 * El servidor cobra de a 3 con un tope de 45 s por tanda (~2 s por corrida en
 * dev): una tanda grande puede volver con algunas `cobrado:false` y el motivo
 * «No alcanzó el tiempo…» — no es un error, es trabajo que sigue pendiente, y
 * la pantalla ofrece reintentar sólo esas.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Coins, Loader2, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  esDadaDeBaja,
  esPendientePorTiempo,
  fusionarResultadosTanda,
  mapConLimite,
  PAQUETES_EN_PARALELO,
  precioParaCotizar,
  resumirFilasTanda,
  superaUmbralDeTanda,
  type ResultadoFilaTanda,
} from "@/lib/forestal/cobrar-en-tanda";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import {
  bloquesDeCorrida,
  corridaSinPt,
  versionVigente,
  type CobroAserrioValor,
  type Cotizacion,
} from "@/lib/forestal/tarifa-aserrio";
import { cotizarCorrida } from "@/lib/forestal/argumentos-del-cobro";
import { paquetesYaDeclarados } from "./hooks/guardar-produccion-corrida";
import { useTarifaAserrio } from "./hooks/use-tarifa-aserrio";
import { useTratoDelCliente } from "./hooks/use-trato-del-cliente";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import CtpCobroAserrio from "./CtpCobroAserrio";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { UNIT_LABELS, type CtpEntry } from "./ctp-section-shared";
import { formatCurrency } from "@/lib/format";

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

export default function CtpCobrarEnTandaModal({
  corridas,
  onCerrar,
  onListo,
}: {
  /** Ya filtradas por quien llama: sólo `registrado` (ADR-412 no cobra anuladas). */
  corridas: CtpEntry[];
  onCerrar: () => void;
  /**
   * `idsSinCobrar`: las que quedaron sin cobrar en esta pasada, INCLUIDAS las
   * cortadas por tiempo — para que quien llama las deje marcadas y el
   * reintento sea un click, no volver a buscarlas en la tabla (MEDIO,
   * revisión 2026-09-14). Nunca incluye las dadas de baja a propósito.
   * `cobradas`: cuántas se cobraron de verdad — 0 no es un éxito (BAJO,
   * revisión 2026-09-14: el aviso salía verde con "0 de 14 cobradas").
   */
  onListo: (mensaje: string, detalle: string, idsSinCobrar: string[], cobradas: number) => void;
}) {
  const tarifa = useTarifaAserrio();
  const [paquetesPorCorrida, setPaquetesPorCorrida] = useState<Map<string, PaqueteGuardado[]>>(new Map());
  /** Corridas cuyos paquetes no se pudieron leer — se avisa en su fila en vez
   *  de cotizar en silencio con la cantidad total (MEDIO, revisión
   *  2026-09-14: sin el detalle por paquete, el tipo/dimensión que decide el
   *  ajuste de la tarifa puede salir distinto al que cobra el servidor). */
  const [fallaronPaquetes, setFallaronPaquetes] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [valor, setValor] = useState<CobroAserrioValor>({ duenoParteId: null, precioManualPt: null });
  /* El trato del dueño elegido y los grupos de la planta (ADR-430): el servidor
     cotiza cada corrida con el trato vigente en SU fecha, la tabla también. Se
     leen acá y se le pasan al bloque de arriba para no pedirlos dos veces. */
  const trato = useTratoDelCliente(valor.duenoParteId);
  const catalogo = useEspeciesCatalogo();
  /** Si el operador YA eligió algo en «¿A quién se le asierra?» (aunque haya
   *  elegido explícitamente «Madera del centro»). Antes de esto, el botón
   *  de guardar queda deshabilitado: en la tanda el dueño SIEMPRE se manda
   *  explícito, así que un valor inicial sin elegir (`null`) enviado tal cual
   *  le QUITA el cobro a toda corrida que ya tuviera dueño (ALTO, medido por
   *  Brandon: un clic sin tocar nada borró dos cobros reales). */
  const [duenoTocado, setDuenoTocado] = useState(false);
  const [precioTocado, setPrecioTocado] = useState(false);
  const [aserrioValido, setAserrioValido] = useState(true);
  const [guardando, setGuardando] = useState(false);
  /** Cuántas van EN ESTA pasada — para «Cobrando N corridas…» (puede ser
   *  menos que el total si es un reintento de las que se quedaron sin tiempo). */
  const [idsEnCurso, setIdsEnCurso] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Acumula resultados entre pasadas (por id): un reintento no borra lo que
   *  ya se cobró en la pasada anterior, sólo agrega/corrige lo suyo. */
  const [resultadosPorId, setResultadosPorId] = useState<Map<string, ResultadoFilaTanda>>(new Map());

  useEffect(() => {
    let vivo = true;
    /* De a lo sumo `PAQUETES_EN_PARALELO` a la vez: el endpoint tiene un
       límite de 100/min y una tanda de 200 corridas dispararía 200 pedidos
       simultáneos de una sola vez (MEDIO, revisión 2026-09-14). */
    void mapConLimite(corridas, PAQUETES_EN_PARALELO, async (c) => {
      try {
        return [c.id, (await paquetesYaDeclarados(c.id)) as unknown as PaqueteGuardado[]] as const;
      } catch {
        return [c.id, null] as const;
      }
    }).then((pares) => {
      if (!vivo) return;
      setPaquetesPorCorrida(new Map(pares.map(([id, ps]) => [id, ps ?? []])));
      setFallaronPaquetes(new Set(pares.filter(([, ps]) => ps === null).map(([id]) => id)));
      setCargando(false);
    });
    return () => { vivo = false; };
    // Sólo al montar: la lista de corridas de la tanda no cambia mientras el modal está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Los bloques de CADA corrida, con la MISMA regla que cobra una sola (ADR-412). */
  const bloquesPorCorrida = useMemo(() => {
    const m = new Map<string, ReturnType<typeof bloquesDeCorrida>>();
    for (const c of corridas) {
      m.set(
        c.id,
        bloquesDeCorrida(
          {
            lineNo: c.lineNo,
            speciesCommon: c.speciesCommon,
            productType: c.productType,
            quantity: Number(c.quantity ?? 0),
            // Sin esto, ausente = m³: una corrida en PT o en kg se leía como
            // si su cantidad YA fuera m³ (ALTO, revisión 2026-09-14).
            unit: c.unit,
          },
          (paquetesPorCorrida.get(c.id) ?? []).map((p) => ({
            codigo: p.codigo,
            productType: p.productType ?? c.productType,
            volumenM3: Number(p.volumenM3) || 0,
            espesorCm: p.espesorCm != null ? Number(p.espesorCm) : null,
            anchoCm: p.anchoCm != null ? Number(p.anchoCm) : null,
            largoM: p.largoM != null ? Number(p.largoM) : null,
            pieTablar: p.pieTablar != null ? Number(p.pieTablar) : null,
          })),
        ),
      );
    }
    return m;
  }, [corridas, paquetesPorCorrida]);

  /** Corridas sin paquetes y en una unidad que no pesa en PT (kg, unidad): no
   *  hay de dónde sacar el pie tablar — cobrarlas como si fueran m³
   *  inventaría un importe que el servidor no va a dar (ALTO, revisión
   *  2026-09-14: 5000 PT sin paquetes se veían como 5000 m³). */
  const sinPtIds = useMemo(
    () => new Set(corridas.filter((c) => corridaSinPt(c.unit, (paquetesPorCorrida.get(c.id)?.length ?? 0) > 0)).map((c) => c.id)),
    [corridas, paquetesPorCorrida],
  );
  const corridasCobrables = useMemo(() => corridas.filter((c) => !sinPtIds.has(c.id)), [corridas, sinPtIds]);

  /** Para el bloque de dueño/precio: TODOS los bloques juntos, con la fecha de
   *  la corrida más reciente (referencia — cada fila de abajo cotiza con SU
   *  propia fecha, igual que el servidor). */
  const bloquesTotal = useMemo(() => [...bloquesPorCorrida.values()].flat(), [bloquesPorCorrida]);
  const fechaReferencia = useMemo(
    () => corridas.reduce((max, c) => (c.entryDate > max ? c.entryDate : max), corridas[0]?.entryDate ?? "").slice(0, 10),
    [corridas],
  );

  /** La cotización de CADA corrida con SU propia fecha — lo que el servidor va
   *  a calcular de verdad, no un total mezclado con tarifas de otros días. Sin
   *  tocar el precio, cada una cotiza con SU propio trato (a mano si ya lo
   *  tenía, si no la tarifa de su fecha) — mandar el mismo valor de pantalla a
   *  todas desde el principio le cambiaba el trato a la que ya tenía uno
   *  pactado (ALTO relacionado, revisión 2026-09-14). */
  const cotizacionesPorCorrida = useMemo(() => {
    const m = new Map<string, Cotizacion>();
    for (const c of corridas) {
      const version = versionVigente(tarifa.tarifario, c.entryDate);
      const precioManualPt = precioParaCotizar(precioTocado, valor.precioManualPt, c.aserrioPrecioManualPt);
      m.set(
        c.id,
        cotizarCorrida(version, bloquesPorCorrida.get(c.id) ?? [], {
          precioManualPt,
          tarifasCliente: trato.tarifas,
          grupos: catalogo.grupos,
          fecha: c.entryDate,
        }),
      );
    }
    return m;
  }, [corridas, bloquesPorCorrida, tarifa.tarifario, valor.precioManualPt, precioTocado, trato.tarifas, catalogo.grupos]);
  /** Sin saber el trato (o la tarifa) todavía, los importes de la tabla no son los del servidor. */
  const calculando = Boolean(valor.duenoParteId) && (trato.cargando || tarifa.cargando || catalogo.cargando);
  /* Sin los paquetes de una corrida, su cotización de acá es una suposición
     (cantidad total, sin tipo/dimensión) — no entra al total para no
     mezclarla con las que sí se pudieron leer bien. Una corrida sin PT
     tampoco: su "importe" sería la cantidad mal leída como m³. */
  const totalPreview = useMemo(
    () =>
      [...cotizacionesPorCorrida.entries()].reduce(
        (a, [id, c]) => (fallaronPaquetes.has(id) || sinPtIds.has(id) ? a : a + c.importe),
        0,
      ),
    [cotizacionesPorCorrida, fallaronPaquetes, sinPtIds],
  );

  /** Las que YA tienen dueño/cobro hoy — si se manda «Madera del centro» a
   *  toda la tanda, son las que se van a quedar sin cobrar. */
  const corridasConCobro = useMemo(() => corridas.filter((c) => c.duenoParteId), [corridas]);
  const importeYaCobrado = useMemo(
    () => corridasConCobro.reduce((a, c) => a + Number(c.aserrioImporte ?? 0), 0),
    [corridasConCobro],
  );
  const nombresActuales = useMemo(
    () => [...new Set(corridasConCobro.map((c) => c.titularNombre?.trim()).filter((n): n is string => Boolean(n)))],
    [corridasConCobro],
  );
  /** El operador eligió explícitamente «Madera del centro» y esta tanda
   *  incluye corridas que hoy sí tienen cobro: guardar se las va a quitar. La
   *  acción destructiva nunca es el valor por defecto — sólo se activa
   *  después de un toque real (`duenoTocado`). */
  const esDejarDeCobrar = duenoTocado && !valor.duenoParteId && corridasConCobro.length > 0;

  /** Lo ya resuelto, en el mismo orden que se marcaron. */
  const filasResultado = useMemo(
    () => corridas.map((c) => resultadosPorId.get(c.id)).filter((f): f is ResultadoFilaTanda => Boolean(f)),
    [corridas, resultadosPorId],
  );
  const mostrarResultados = filasResultado.length > 0;
  const cobradas = filasResultado.filter((f) => f.cobrado);
  const dadasDeBaja = filasResultado.filter(esDadaDeBaja);
  const noCobradas = filasResultado.filter((f) => !f.cobrado && !esDadaDeBaja(f));
  const pendientesPorTiempo = noCobradas.filter(esPendientePorTiempo);
  const resumen = resumirFilasTanda(filasResultado);

  async function guardar(ids: string[]) {
    if (ids.length === 0) return;
    setGuardando(true);
    setError(null);
    setIdsEnCurso(ids);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "cobrar_aserrio_tanda",
          ids,
          // En tanda el dueño SIEMPRE se manda explícito: no hay "el que ya
          // tenía" que preservar cuando se está eligiendo uno para todas.
          duenoParteId: valor.duenoParteId,
          ...(precioTocado ? { precioManualPt: valor.precioManualPt } : {}),
        }),
      });
      const json = (await r.json().catch(() => ({}))) as { resultados?: ResultadoFilaTanda[]; message?: string; error?: string };
      if (!r.ok) throw new Error(json.message ?? json.error ?? `El servidor respondió ${r.status}`);
      invalidarCtp("/forestal/");
      setResultadosPorId((prev) => fusionarResultadosTanda(prev, json.resultados ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  /** Mientras corre no se puede cerrar: Escape, el click afuera y la × pasan
   *  todos por acá (`onClose` de `AdminModal`). Con un resultado a la vista,
   *  cerrar por cualquiera de esos tres caminos hace lo MISMO que «Listo»
   *  —recargar el libro y vaciar la selección— porque ya se guardó algo: salir
   *  sin eso dejaba la pantalla con corridas cobradas que la tabla de atrás
   *  seguía mostrando sin cobrar (MEDIO, revisión 2026-09-14). */
  function intentarCerrar() {
    if (guardando) return;
    if (mostrarResultados) cerrarConResultado();
    else onCerrar();
  }

  function cerrarConResultado() {
    onListo(
      `Se cobraron ${cobradas.length} de ${corridas.length} corridas`,
      `${formatCurrency(Number(resumen.importeCobrado))} en total` +
        (resumen.dadasDeBaja > 0
          ? ` · se dejaron de cobrar ${formatCurrency(Number(resumen.importeDadoDeBaja))} en ${resumen.dadasDeBaja}`
          : "") +
        (noCobradas.length > 0 ? ` · ${noCobradas.length} sin cobrar` : ""),
      noCobradas.map((f) => f.id),
      cobradas.length,
    );
  }

  return (
    <AdminModal
      open
      onClose={intentarCerrar}
      hideCloseButton={guardando}
      title="Cobrar aserrío en tanda"
      description={`${corridas.length} ${corridas.length === 1 ? "corrida marcada" : "corridas marcadas"}`}
      icon={Coins}
      variant="wide"
      /* Se abre desde la barra del libro, que puede estar dentro del AdminModal
         de «Producción · Todos y registrados» (ZonaLibro). */
      aboveModals
      footer={
        <ModalFooter error={error}>
          {mostrarResultados ? (
            <>
              {pendientesPorTiempo.length > 0 && (
                <Btn
                  variant="secondary"
                  onClick={() => void guardar(pendientesPorTiempo.map((f) => f.id))}
                  disabled={guardando}
                >
                  {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  Cobrar las {pendientesPorTiempo.length} que faltaron
                </Btn>
              )}
              <Btn variant="primary" onClick={cerrarConResultado} disabled={guardando}>
                Listo
              </Btn>
            </>
          ) : (
            <>
              <Btn variant="secondary" onClick={onCerrar} disabled={guardando}>
                Cancelar
              </Btn>
              <Btn
                variant={esDejarDeCobrar ? "danger" : "primary"}
                onClick={() => void guardar(corridas.map((c) => c.id))}
                disabled={
                  guardando || cargando || !aserrioValido || !duenoTocado || (!esDejarDeCobrar && corridasCobrables.length === 0)
                }
              >
                {guardando ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : esDejarDeCobrar ? (
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                {guardando
                  ? `Cobrando ${idsEnCurso.length} ${idsEnCurso.length === 1 ? "corrida" : "corridas"}…`
                  : esDejarDeCobrar
                    ? `Dejar de cobrar ${corridasConCobro.length} ${corridasConCobro.length === 1 ? "corrida" : "corridas"}`
                    : /* Las que no están en m³ no se pueden cobrar por PT — no cuentan
                         acá aunque igual viajen (el servidor las va a marcar «sin
                         cobrar» con su motivo, ALTO revisión 2026-09-14). */
                      `Cobrar ${corridasCobrables.length} ${corridasCobrables.length === 1 ? "corrida" : "corridas"}`}
              </Btn>
            </>
          )}
        </ModalFooter>
      }
    >
      <ModalBody>
        {guardando && (
          <p className="mb-3 flex items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            Cobrando {idsEnCurso.length} {idsEnCurso.length === 1 ? "corrida" : "corridas"}… no cierres esta ventana.
          </p>
        )}

        {cargando ? (
          <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando los paquetes de cada corrida…
          </p>
        ) : mostrarResultados ? (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                Cobradas ({cobradas.length})
              </p>
              {cobradas.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)]">Ninguna todavía.</p>
              ) : (
                <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
                  {cobradas.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="font-bold text-[var(--text-primary)]">N° {f.lineNo}</span>
                      <span className="font-mono font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                        {formatCurrency(f.importe ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {dadasDeBaja.length > 0 && (
              <div>
                <p className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  Se dejaron de cobrar ({dadasDeBaja.length})
                </p>
                <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
                  {dadasDeBaja.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="font-bold text-[var(--text-primary)]">N° {f.lineNo}</span>
                      <span className="font-mono font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                        Se dejó de cobrar {formatCurrency(f.importeDadoDeBaja ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {noCobradas.length > 0 && (
              <div>
                <p className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  Sin cobrar ({noCobradas.length})
                </p>
                <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
                  {noCobradas.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="font-bold text-[var(--text-primary)]">N° {f.lineNo}</span>
                      <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                        {f.motivo ?? "No se cobró nada."}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <>
            {superaUmbralDeTanda(corridas.length) && (
              <p className="mb-3 flex items-start gap-1.5 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Son {corridas.length}: el servidor cobra de a 3 y puede tardar — puede que no todas entren en esta
                pasada. Las que se queden se pueden cobrar en otra, sin perder lo ya hecho.
              </p>
            )}

            {esDejarDeCobrar && (
              <p className="mb-3 flex items-start gap-1.5 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Vas a dejar de cobrar {formatCurrency(importeYaCobrado)} en {corridasConCobro.length}{" "}
                {corridasConCobro.length === 1 ? "corrida" : "corridas"}
                {nombresActuales.length === 1
                  ? ` a ${nombresActuales[0]}`
                  : nombresActuales.length > 1
                    ? " a varias personas"
                    : ""}
                .
              </p>
            )}

            <CtpCobroAserrio
              fecha={fechaReferencia}
              bloques={bloquesTotal}
              valor={valor}
              labelSinElegir="Elige a quién se le asierra"
              ocultarImportePreview
              trato={trato}
              onTarifaGuardada={() => void tarifa.recargar()}
              onValidez={setAserrioValido}
              onChange={(v, tocado) => {
                setValor(v);
                if (tocado.dueno) setDuenoTocado(true);
                if (tocado.precio) setPrecioTocado(true);
              }}
            />

            <p className="mb-1.5 mt-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Vista previa por corrida
            </p>
            <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-[var(--text-primary)]">Corrida</th>
                    <th className="px-3 py-2 text-left font-bold text-[var(--text-primary)]">Especie</th>
                    <th className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">Cantidad</th>
                    {/* Lo que YA tiene hoy — para no reasignar a ciegas una corrida
                        que otra persona ya está pagando (MEDIO, revisión 2026-09-14). */}
                    <th className="px-3 py-2 text-left font-bold text-[var(--text-primary)]">Dueño actual</th>
                    <th className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">Importe actual</th>
                    <th className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">Importe nuevo</th>
                  </tr>
                </thead>
                <tbody>
                  {corridas.map((c) => {
                    const cot = cotizacionesPorCorrida.get(c.id);
                    const sinPaquetes = fallaronPaquetes.has(c.id);
                    const sinPt = sinPtIds.has(c.id);
                    return (
                      <tr key={c.id} className="border-t border-[var(--rule-soft)]">
                        <td className="px-3 py-2 font-mono text-xs text-[var(--text-tertiary)]">N° {c.lineNo}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{c.speciesCommon ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                          {Number(c.quantity ?? 0).toFixed(3)} {c.unit ? (UNIT_LABELS[c.unit] ?? c.unit) : ""}
                        </td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">
                          {c.duenoParteId ? (c.titularNombre?.trim() || "Con dueño") : "Madera del centro"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                          {c.duenoParteId ? `${formatCurrency(Number(c.aserrioImporte ?? 0))}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                          {sinPt ? (
                            <span className="font-sans text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                              No se puede cobrar: no está en m³
                            </span>
                          ) : sinPaquetes ? (
                            <span className="font-sans text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                              No se pudo leer
                            </span>
                          ) : valor.duenoParteId && calculando ? (
                            <span className="font-sans text-xs font-normal text-[var(--text-tertiary)]">calculando…</span>
                          ) : valor.duenoParteId && cot ? (
                            `${formatCurrency(Number(cot.importe))}`
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {valor.duenoParteId && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold text-[var(--text-primary)]">
                      <td className="px-3 py-2" colSpan={5}>
                        Total{fallaronPaquetes.size > 0 || sinPtIds.size > 0 ? " (sin las que no se pueden cotizar acá)" : ""}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{calculando ? "—" : formatCurrency(totalPreview)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {fallaronPaquetes.size > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                No se pudieron leer los paquetes de {fallaronPaquetes.size}{" "}
                {fallaronPaquetes.size === 1 ? "corrida" : "corridas"}: el servidor igual las cotiza bien al guardar,
                esta vista previa no.
              </p>
            )}
            {sinPtIds.size > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {sinPtIds.size} {sinPtIds.size === 1 ? "corrida" : "corridas"} no{" "}
                {sinPtIds.size === 1 ? "está" : "están"} en m³ y no {sinPtIds.size === 1 ? "tiene" : "tienen"} paquetes:
                el aserrío se cobra por pie tablar y esa{sinPtIds.size === 1 ? "" : "s"} no se{" "}
                {sinPtIds.size === 1 ? "va" : "van"} a poder cobrar.
              </p>
            )}
            <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              El importe definitivo de cada corrida lo calcula el servidor al guardar.
            </p>
          </>
        )}
      </ModalBody>
    </AdminModal>
  );
}
