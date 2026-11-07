"use client";

/**
 * «¿Descontar esta madera del adelanto?» en el momento justo: cuando la guía de
 * una persona que tiene adelanto ya tiene su costo (Brandon 25-10: «adelanto
 * de madera que baja solo»).
 *
 * No inventa un camino de plata: confirma lo mismo que «Registrar pago» con
 * «Descontar de lo adelantado» (una liquidación LIQ de sólo cruce, esta guía
 * imputada, sin caja). El servidor vuelve a calcular todo con candado
 * (`LiquidacionCuentaDB.crear`): la llave del intento evita el doble descuento
 * con un doble clic o un reintento, y una guía ya cubierta rechaza un segundo
 * cruce aunque llegue con otra llave. Anular la LIQ (Cuenta por persona) lo
 * deshace.
 *
 * Sin precio no hay cifra (se pide el precio arriba). Sin unir las dos fichas
 * no se cruza: si hay una persona de Adelantos que parece la misma, se ofrece
 * unirlas (sólo admin o dueño, como liquidar).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, HandCoins, Link2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import type { usePagoDeGuia } from "@/hooks/use-plata-de-guia";
import { estadoDescuentoGuia, fmtPt, maderaDeLaGuia, sugerirPersonaDeAdelantos, type MaderaDeLaGuia } from "@/lib/adelantos/madera-adelanto";
import { unirConFicha } from "@/lib/adelantos/unir-con-ficha";
import type { PlataDeGuiaDTO } from "@/lib/forestal/plata-de-guia";
import { limaDateKey } from "@/lib/utils";
import { avisarPersonasCambiaron, usePersonasDeLaCuenta } from "../hooks/use-cubicaciones-trozas";
import { Btn } from "../ctp-shared";
import { soles } from "./comun";

type Pago = ReturnType<typeof usePagoDeGuia>;

const CAJA = "mt-2 rounded-xl px-3 py-2 text-sm";

/** «Tornillo 977 pt × S/ 2.50 = S/ 2,442.50» — lo que la guía ya tiene anotado. */
function CuentaDeLaMadera({ m }: { m: MaderaDeLaGuia }) {
  const partes = m.porEspecie.slice(0, 3).map((e) =>
    e.cantidad != null && e.precio != null && e.unidad
      ? `${e.especie} ${e.unidad === "pt" ? fmtPt(e.cantidad) : `${e.cantidad} m³`} × ${soles(e.precio)}`
      : `${e.especie} ${soles(e.monto)}`,
  );
  const mas = m.porEspecie.length > 3 ? ` + ${m.porEspecie.length - 3} más` : "";
  return (
    <p className="text-[var(--text-secondary)]" data-cuenta-madera>
      {partes.join(" + ")}
      {mas} = <span className="font-bold tabular-nums text-[var(--text-primary)]">{soles(m.monto)}</span>
      {m.pt != null && !m.precioUnico && m.precioPt != null && <> · {fmtPt(m.pt)}, promedio {soles(m.precioPt)} el pt</>}
      {m.sinCosto > 0 && <> · {m.sinCosto} {m.sinCosto === 1 ? "línea" : "líneas"} sin precio</>}
    </p>
  );
}

/** «¿WASACO es Wasaco de Adelantos?» — sin la unión no se cruza. */
function UnirParaDescontar({ parteId, parteNombre, onUnida }: { parteId: string; parteNombre: string; onUnida: () => void }) {
  const { personas } = usePersonasDeLaCuenta(true);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const sugerida = useMemo(() => {
    if (!personas) return null;
    /* Unida por documento en «Cuenta por persona» pero sin la unión explícita: es ella. */
    const porDoc = personas.find((p) => p.parteId === parteId && p.beneficiarioId);
    if (porDoc) return { fila: porDoc, motivo: "mismo documento" };
    const s = sugerirPersonaDeAdelantos({ nombre: parteNombre }, personas);
    return s ? { fila: s.candidata.fila, motivo: "mismo nombre" } : null;
  }, [personas, parteId, parteNombre]);
  const teDebe = sugerida?.fila.adelantos?.teDebe ?? 0;
  if (!sugerida?.fila.beneficiarioId || teDebe <= 0.005) return null;
  const beneficiarioId = sugerida.fila.beneficiarioId;

  return (
    <div className={`${CAJA} space-y-2 bg-[var(--data-info)]/10`} data-unir-para-descontar>
      <p className="text-[var(--text-primary)]">
        ¿<span className="font-bold">{parteNombre}</span> es <span className="font-bold">{sugerida.fila.nombre}</span> de Adelantos ({sugerida.motivo})? Tiene{" "}
        <span className="font-bold tabular-nums">{soles(teDebe)}</span> de adelanto.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Btn
          size="sm"
          variant="secondary"
          disabled={guardando}
          onClick={async () => {
            setGuardando(true);
            setFallo(null);
            const r = await unirConFicha(beneficiarioId, parteId);
            setGuardando(false);
            if (!r.ok) { setFallo(r.mensaje); return; }
            avisarPersonasCambiaron();
            onUnida();
          }}
        >
          <Link2 className="h-4 w-4" aria-hidden /> {guardando ? "Uniendo…" : "Sí, únelas"}
        </Btn>
        <span className="text-[var(--text-secondary)]">y te digo cuánto baja con esta guía.</span>
      </div>
      {fallo && <p role="alert" className="font-medium text-[var(--data-error-ink,var(--data-error-700))]">{fallo}</p>}
    </div>
  );
}

export default function AvisoDescontarAdelanto({
  dto,
  pago,
  onPagado,
  onRecargar,
}: {
  dto: PlataDeGuiaDTO;
  pago: Pago;
  onPagado: (codigo?: string, mensaje?: string) => void;
  /** Tras unir las dos fichas: releer la guía (la persona cambia). */
  onRecargar: () => void;
}) {
  const rol = useMiRol();
  const puede = rol === "admin" || rol === "owner";
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const madera = useMemo(() => maderaDeLaGuia(dto.lineas), [dto.lineas]);
  const est = dto.pago;
  const nombre = dto.persona?.nombre ?? dto.cuenta?.parteNombre ?? "Tu proveedor";
  const estado = estadoDescuentoGuia({
    totalMadera: dto.totalMadera,
    pendiente: dto.cuenta && est ? est.pendiente : null,
    cruzado: est?.desglose?.cruzado ?? 0,
    cruzable: pago.cruzable,
    adelantoTeDebe: pago.adelantosTeDebe,
  });
  /* Recién anotado el precio, la pregunta nace debajo de lo que se ve del
     modal («Guardado. Ya puedes llevar el pago abajo.»): se la trae a la vista
     una sola vez. Al abrir una guía que ya tenía precio no se mueve nada. */
  const caja = useRef<HTMLDivElement>(null);
  const tipoAntes = useRef(estado.tipo);
  const traer = useRef(false);
  useEffect(() => {
    if (tipoAntes.current === "sin_costo" && estado.tipo !== "sin_costo") traer.current = true;
    tipoAntes.current = estado.tipo;
    if (traer.current && estado.tipo === "ofrecer" && !pago.cargando && caja.current) {
      traer.current = false;
      caja.current.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
  }, [estado.tipo, pago.cargando]);

  if (dto.tipo !== "compra" || pago.cargando) return null;

  if (estado.tipo === "sin_costo") {
    const debe = dto.persona?.deAdelantos ?? 0;
    if (debe <= 0.005) return null;
    return (
      <p className={`${CAJA} bg-[var(--surface-sunken)] text-[var(--text-secondary)]`} data-aviso-adelanto="sin_costo">
        {nombre} tiene <span className="font-bold tabular-nums text-[var(--text-primary)]">{soles(debe)}</span> de adelanto. Anota arriba
        el precio de esta madera (pt × precio) para descontarla.
      </p>
    );
  }

  if (estado.tipo === "sin_unir") {
    if (!puede || !dto.cuenta) return null;
    return (
      <UnirParaDescontar
        parteId={dto.cuenta.parteId}
        parteNombre={dto.cuenta.parteNombre}
        onUnida={() => {
          void pago.recargar();
          onRecargar();
        }}
      />
    );
  }

  if (estado.tipo === "ya_descontado") {
    return (
      <p className={`${CAJA} flex items-center gap-2 bg-[var(--data-success)]/10 text-[var(--text-primary)]`} data-aviso-adelanto="ya_descontado">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success)]" aria-hidden />
        Ya bajó <span className="font-bold tabular-nums">{soles(estado.monto)}</span> del adelanto de {nombre} con esta guía.
      </p>
    );
  }

  if (estado.tipo !== "ofrecer") return null;

  async function descontar(baja: number) {
    setEnviando(true);
    setFallo(null);
    const r = await pago.registrar({
      monto: 0,
      metodo: "efectivo",
      fecha: limaDateKey(),
      moverCaja: false,
      compensar: baja,
      comprobantes: [],
      notas: `Madera de la guía ${dto.gtfNumber} descontada del adelanto`,
    });
    setEnviando(false);
    if (r.ok) onPagado(r.codigo, `Bajó ${soles(baja)} del adelanto de ${nombre}${r.codigo ? ` · ${r.codigo}` : ""} · guía ${dto.gtfNumber}`);
    else setFallo(r.mensaje);
  }

  return (
    <div ref={caja} className={`${CAJA} space-y-1.5 border border-[var(--data-warning)]/40 bg-[var(--data-warning)]/10`} data-aviso-adelanto="ofrecer">
      <p className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
        <span>
          {nombre} tiene <span className="tabular-nums">{soles(pago.adelantosTeDebe)}</span> de adelanto: ¿descontar esta madera?
        </span>
        <InfoTip
          title="Descontar la madera del adelanto"
          what="Lo que falta pagar de esta guía baja de lo que te debe de adelantos, del más antiguo al más nuevo. No mueve la caja: es una liquidación LIQ de sólo cruce."
          affects="Si la madera vale más que el adelanto, lo que sobra se lo sigues debiendo por la guía. Para deshacerlo, anula la LIQ en Cuenta por persona."
          example="Adelanto S/ 2,442 · guía 977 pt × S/ 2.50 = S/ 2,442.50 → baja S/ 2,442 y le debes S/ 0.50."
        />
      </p>
      {madera && <CuentaDeLaMadera m={madera} />}
      <p className="text-[var(--text-secondary)]">
        {estado.yaBajo > 0.005 && <>Ya bajó {soles(estado.yaBajo)} con esta guía · </>}
        Baja <span className="font-bold tabular-nums text-[var(--text-primary)]">{soles(estado.baja)}</span> · le queda{" "}
        <span className="tabular-nums">{soles(estado.quedaAdelanto)}</span> de adelanto
        {estado.quedaPorPagar > 0.005 && <> · le debes {soles(estado.quedaPorPagar)} por la guía</>}
      </p>
      {puede ? (
        <Btn size="sm" variant="primary" disabled={enviando} onClick={() => void descontar(estado.baja)} data-descontar-adelanto>
          <HandCoins className="h-4 w-4" aria-hidden /> {enviando ? "Descontando…" : `Descontar ${soles(estado.baja)} del adelanto`}
        </Btn>
      ) : (
        <p className="text-[var(--text-secondary)]">Lo descuenta el administrador o el dueño.</p>
      )}
      {fallo && <p role="alert" className="font-medium text-[var(--data-error-ink,var(--data-error-700))]">{fallo}</p>}
    </div>
  );
}
