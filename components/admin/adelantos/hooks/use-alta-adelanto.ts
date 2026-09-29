"use client";

/**
 * Estado del alta «Nuevo adelanto» (ADR-448). La pantalla sólo dibuja; el
 * guardado y sus reglas (clave por intento, `repetido`, reintento de los
 * campos propios, recargar al cerrar) viven en `use-guardar-alta`.
 *
 * Conserva la segunda pulsación para pasar el tope de crédito y Ctrl/⌘+Enter
 * para guardar. Suma los modos: la misma pantalla registra la plata que DAS,
 * el abono de lo que te deben y la plata que RECIBES (por un servicio o prestada).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { estadoDeCredito, saldoParaLimite } from "@/lib/adelantos/limite-credito";
import { plazoHabitualDe, sugerirRepetir, yaTuvoAdelantoHoy } from "@/lib/adelantos/sugerencias";
import {
  MODO,
  abonablesDe,
  adelantosDelModo,
  cuentaDePersona,
  cuerpoAbonoEntrega,
  cuerpoAdelanto,
  esModoRecibido,
  intencionAbonoRepartido,
  lineaCaja,
  metodoCajaPorDefecto,
  modalidadValida,
  proyeccionCuenta,
  repartoDelAbono,
  aIsoLocal,
  type ModoAlta,
} from "@/lib/adelantos/modos-alta";
import type { AdelantoModalidad, DbAdelanto } from "@/lib/db/adelantos.db";
import { pendientesVacios as camposVacios, type PendientesCampos } from "@/components/admin/shared/CamposPersonalizados";
import { fmtMon } from "../shared";
import { HOY } from "../crear-adelanto/campos-monto";
import type { BeneficiarioConSaldo, CuotaBorrador } from "../crear-adelanto/tipos";
import { useGuardarAlta } from "./use-guardar-alta";
import { useTarifaAserrio } from "./use-tarifa-aserrio";

/** Id estable de los campos personalizados (ADR-427): el mismo que la ficha. */
export const FORMULARIO_ADELANTO = "adelantos.adelanto";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function useAltaAdelanto({
  beneficiarios,
  adelantos,
  initialBeneficiarioId,
  admiteRecibido,
  onCreated,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  adelantos: DbAdelanto[];
  initialBeneficiarioId?: string;
  /** El servidor ya guarda la dirección: sin eso, lo recibido se guardaría como dado. */
  admiteRecibido: boolean;
  onCreated: () => void;
}) {
  const [modo, setModoRaw] = useState<ModoAlta>("dar");
  /* Por defecto la primera persona ACTIVA: una dada de baja «se deja de
     ofrecer» (baja lógica) y salía elegida sola en el alta (visto 28-09). */
  const [beneficiarioId, setBeneficiarioId] = useState(
    initialBeneficiarioId ?? beneficiarios.find((b) => b.activo !== false)?.id ?? "",
  );
  const [modalidad, setModalidad] = useState<AdelantoModalidad>("CUENTA_CORRIENTE");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<"PEN" | "USD">("PEN");
  const [fecha, setFechaRaw] = useState(HOY);
  const [vencimiento, setVencimiento] = useState("");
  const [notas, setNotas] = useState("");
  const [reciboManual, setReciboManual] = useState("");
  /** "" = no mover la caja. Sigue a la fecha hasta que alguien lo elige a mano. */
  const [metodoCaja, setMetodoCajaRaw] = useState<string>("efectivo");
  const cajaElegida = useRef(false);
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [contratoId, setContratoId] = useState<string | null>(null);
  const [cuotas, setCuotas] = useState<CuotaBorrador[]>([]);
  const [piesTablares, setPiesTablares] = useState("");
  const [piesTablaresTipo, setPiesTablaresTipo] = useState<"COMPRADO" | "VENDIDO" | "">("");
  /** Adelanto por servicio: pt × S/ por pt = monto. */
  const [ptServicio, setPtServicioRaw] = useState("");
  const [precioPt, setPrecioPtRaw] = useState("");
  /** Abono: "fifo" = la más vieja primero; si no, el id del adelanto elegido. */
  const [destino, setDestino] = useState<string>("fifo");
  /** La cuota que cumple el abono a un adelanto con plan; `"ninguna"` = no marcar. */
  const [cuota, setCuota] = useState<string | null>(null);
  const [camposPendientes, setCamposPendientes] = useState<PendientesCampos>(() => camposVacios(FORMULARIO_ADELANTO));
  const [confirmandoTope, setConfirmandoTope] = useState(false);
  const guardar = useGuardarAlta({ camposPendientes, onCreated });

  const def = MODO[modo];
  const persona = beneficiarios.find((b) => b.id === beneficiarioId);
  const montoNum = Number(monto) || 0;

  const setModo = (m: ModoAlta) => {
    setModoRaw(m);
    setModalidad((prev) => modalidadValida(m, prev));
    guardar.setErr(null);
  };
  const setFecha = (f: string) => {
    setFechaRaw(f);
    if (!cajaElegida.current) setMetodoCajaRaw(metodoCajaPorDefecto(f, HOY()));
  };
  const setMetodoCaja = (m: string) => {
    cajaElegida.current = true;
    setMetodoCajaRaw(m);
  };
  /* pt × precio = monto. Lo calculado se recuerda: si después falta uno de los
     dos, se borra sólo ese monto — nunca uno que se tipeó a mano. */
  const montoCalculado = useRef<string | null>(null);
  const calcular = (pt: string, precio: string) => {
    const v = r2((Number(pt) || 0) * (Number(precio) || 0));
    if (v > 0) {
      montoCalculado.current = String(v);
      setMonto(String(v));
    } else if (montoCalculado.current != null) {
      setMonto((m) => (m === montoCalculado.current ? "" : m));
      montoCalculado.current = null;
    }
  };
  const setPtServicio = (v: string) => { setPtServicioRaw(v); calcular(v, precioPt); };
  const setPrecioPt = (v: string) => { setPrecioPtRaw(v); calcular(ptServicio, v); };

  /* La tarifa del cliente, si está vinculado. Llega DESPUÉS de tipear los pt
     (es un pedido) y cambia con la persona: se recalcula el monto en los dos
     casos. Un precio tipeado a mano no se pisa (revisión 28-09). */
  const tarifa = useTarifaAserrio(persona?.forestPartyId, modo === "servicio", fecha);
  const precioDeTarifa = useRef<string | null>(null);
  const precioSugerido = tarifa ? String(tarifa.precioPt) : null;
  useEffect(() => {
    if (modo !== "servicio") return;
    const aMano = precioPt !== "" && precioPt !== precioDeTarifa.current;
    if (aMano || precioSugerido === precioDeTarifa.current) return;
    precioDeTarifa.current = precioSugerido;
    setPrecioPtRaw(precioSugerido ?? "");
    calcular(ptServicio, precioSugerido ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo cuando cambia la tarifa sugerida
  }, [precioSugerido, modo]);

  /* Abono: qué le debe y a dónde va. */
  const abonables = useMemo(() => abonablesDe(adelantos, beneficiarioId), [adelantos, beneficiarioId]);
  /* Si nada entra al reparto (todo en dólares o con cuotas), va al primero que te debe. */
  const elegido =
    abonables.elegibles.find((a) => a.id === destino) ?? (abonables.adentro.length === 0 ? (abonables.elegibles[0] ?? null) : null);
  const porAntiguedad = !elegido && abonables.adentro.length > 0;
  const reparto = porAntiguedad
    ? repartoDelAbono(abonables.adentro, montoNum)
    : elegido
      ? [{ adelantoId: elegido.id, codigo: elegido.codigo, monto: r2(montoNum) }]
      : [];
  const totalAdentro = r2(abonables.adentro.reduce((s, a) => s + a.saldo, 0));
  useEffect(() => setDestino("fifo"), [beneficiarioId]);
  useEffect(() => setCuota(null), [elegido?.id]);
  /* Un adelanto con plan: el abono marca una cuota (la primera sin cumplir, o la que se elija). */
  const cuotaElegida =
    !porAntiguedad && elegido && elegido.cuotas.length > 0 && cuota !== "ninguna"
      ? (elegido.cuotas.find((c) => c.id === cuota) ?? elegido.cuotas[0])
      : null;

  /* El abono va en la moneda de su adelanto; lo demás, en la que se elija. */
  const monedaAlta = modo === "abono" ? (elegido?.moneda ?? "PEN") : moneda;

  const credito = estadoDeCredito(
    persona?.limiteCredito,
    saldoParaLimite(persona?.saldoPendiente ?? {}),
    modo === "dar" && monedaAlta === "PEN" ? montoNum : 0,
  );
  const excedeTope = modo === "dar" && credito.estado === "excede";
  useEffect(() => setConfirmandoTope(false), [beneficiarioId, monto, modo]);

  const cuenta = persona ? cuentaDePersona(persona) : { teDebe: {}, leDebes: {} };
  /* Contra el adelanto elegido: pagarle de más no baja «te debe», pasa a «le debes». */
  const proyeccion = proyeccionCuenta(modo, cuenta, montoNum, monedaAlta, modo === "abono" && elegido && !porAntiguedad ? elegido.saldo : null);
  const caja = lineaCaja(modo, metodoCaja, montoNum);

  /* «Repetir el último» dentro del mismo modo: un préstamo que te hicieron no
     se repite como un adelanto por servicio (las sugerencias filtran por
     dirección; el concepto lo separa `adelantosDelModo`). */
  const delModo = useMemo(() => adelantosDelModo(adelantos, modo), [adelantos, modo]);
  const dirModo = def.direccion ?? "DADO";
  const repetible = useMemo(() => sugerirRepetir(delModo, beneficiarioId, Date.now(), dirModo), [delModo, beneficiarioId, dirModo]);
  const adelantoDeHoy = useMemo(() => yaTuvoAdelantoHoy(delModo, beneficiarioId, Date.now(), dirModo), [delModo, beneficiarioId, dirModo]);
  const plazoHabitual = useMemo(() => (modo === "dar" ? plazoHabitualDe(delModo, beneficiarioId, "DADO") : null), [delModo, beneficiarioId, modo]);
  const historial = useMemo(
    () =>
      adelantos
        .filter((a) => a.beneficiarioId === beneficiarioId)
        .sort((x, y) => new Date(y.fechaAdelanto).getTime() - new Date(x.fechaAdelanto).getTime()),
    [adelantos, beneficiarioId],
  );
  /** Las 3 personas con más adelantos: acceso directo antes de buscar entre todas. */
  const recurrentes = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const a of adelantos) conteo.set(a.beneficiarioId, (conteo.get(a.beneficiarioId) ?? 0) + 1);
    return [...conteo.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => beneficiarios.find((b) => b.id === id))
      .filter((b): b is BeneficiarioConSaldo => !!b && b.activo !== false)
      .slice(0, 3);
  }, [adelantos, beneficiarios]);

  const usarRepetible = () => {
    if (!repetible) return;
    setMonto(String(repetible.monto));
    setModalidad(modalidadValida(modo, repetible.modalidad as AdelantoModalidad));
    if (repetible.notas) setNotas(repetible.notas);
  };

  /** Por qué todavía no se puede guardar; `null` = se puede. */
  const problema: string | null = !persona
    ? "Elige a la persona."
    : !(montoNum > 0)
      ? "Pon el monto."
      : esModoRecibido(modo) && !admiteRecibido
        ? "Falta actualizar el servidor para guardar plata recibida."
        : modo === "abono" && abonables.elegibles.length === 0
          ? "No te debe nada en adelantos abiertos."
          : modo === "abono" && porAntiguedad && montoNum > totalAdentro + 0.005
            ? `Te debe ${fmtMon(totalAdentro)} en lo que se reparte: el abono no puede pasar de eso.`
            : null;

  const plan = () =>
    cuotas
      .filter((c) => c.descripcion.trim() && Number(c.valor) > 0)
      .map((c) => ({ descripcionEsperada: c.descripcion.trim(), valorEsperado: Number(c.valor), fechaEsperada: c.fecha ? aIsoLocal(c.fecha) : undefined }));

  const submit = async () => {
    if (guardar.saving) return;
    if (await guardar.continuar()) return;
    if (problema) { guardar.setErr(problema); return; }
    /* Pasar el tope es una decisión, no un descuido: segunda pulsación. */
    if (excedeTope && !confirmandoTope) { setConfirmandoTope(true); return; }

    const base = { beneficiarioId, monto: montoNum, moneda: monedaAlta, fecha, hoy: HOY(), notas, reciboManual, metodoCaja, comprobante };
    const moverCaja = !!metodoCaja;
    if (modo === "abono") {
      await guardar.ejecutar(
        reparto.length === 1
          ? { tipo: "abono-uno", adelantoId: reparto[0].adelantoId, body: cuerpoAbonoEntrega({ ...base, pactadaId: cuotaElegida?.id }), moverCaja }
          : { tipo: "abono-repartido", beneficiarioId, intencion: intencionAbonoRepartido(base, reparto), moverCaja },
      );
      return;
    }
    await guardar.ejecutar({
      tipo: "adelanto",
      esperaRecibido: def.direccion === "RECIBIDO",
      moverCaja,
      body: cuerpoAdelanto({
        ...base,
        modo,
        modalidad,
        vencimiento,
        forzarLimite: excedeTope,
        plan: plan(),
        piesTablares: modo === "servicio" ? ptServicio : piesTablares,
        piesTablaresTipo,
        contratoId,
      }),
    });
  };

  /** Ctrl/⌘+Enter guarda: el botón está al pie. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void submit(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return {
    modo, setModo, def, persona, beneficiarioId, setBeneficiarioId, recurrentes, historial,
    repetible, usarRepetible, adelantoDeHoy, plazoHabitual,
    monto, setMonto, montoNum, moneda: monedaAlta, setMoneda, fecha, setFecha, metodoCaja, setMetodoCaja,
    modalidad: modalidadValida(modo, modalidad), setModalidad, vencimiento, setVencimiento, cuotas, setCuotas,
    notas, setNotas, reciboManual, setReciboManual, comprobante, setComprobante, contratoId, setContratoId,
    piesTablares, setPiesTablares, piesTablaresTipo, setPiesTablaresTipo,
    servicio: { pt: ptServicio, setPt: setPtServicio, precioPt, setPrecioPt, tarifa },
    abono: {
      ...abonables, destino: elegido ? elegido.id : "fifo", setDestino, porAntiguedad, reparto, totalAdentro,
      elegido: porAntiguedad ? null : elegido, cuota: cuotaElegida, setCuota,
      /* Repartido va por Liquidar, que no guarda esta foto: se esconde en vez de perderla callada. */
      sinFoto: porAntiguedad && reparto.length > 1,
    },
    camposPendientes, setCamposPendientes, credito, excedeTope, confirmandoTope,
    cuenta, proyeccion, caja, problema, submit,
    err: guardar.err, saving: guardar.saving, hecho: guardar.hecho, registrado: guardar.registrado,
    camposPorReintentar: guardar.camposPorReintentar,
  };
}

export type AltaAdelanto = ReturnType<typeof useAltaAdelanto>;
