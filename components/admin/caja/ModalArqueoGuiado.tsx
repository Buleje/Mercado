"use client";

import { useState } from "react";
import { Banknote, Calculator, Check, DollarSign, Loader2 } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { button } from "@/components/ui-system/button-variants";
import { useCierreACiegas } from "@/components/admin/turnos/cierre-a-ciegas";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import { BotonCancelar, MarcoModalCaja } from "./MarcoModalCaja";
import { VeredictoDiferencia } from "./ModalArqueoExpress";
import { FilasDeConteo, FotoDelCajon, ResultadoACiegas, VouchersPorMedio, type MedioArqueo } from "./ArqueoGuiadoPartes";
import { fmt, type CashRegister, type StatsCaja } from "./tipos";

const BILLETES = [200, 100, 50, 20, 10];
const MONEDAS = [5, 2, 1, 0.5];

interface Props {
  caja: CashRegister;
  stats: StatsCaja | null;
  ventasPorMedio: Record<string, number>;
  onCerrar: () => void;
  onHecho: () => void;
}

/** Arqueo guiado: cuenta billetes, monedas y vouchers, y CIERRA la caja con ese conteo. */
export function ModalArqueoGuiado({ caja, stats, ventasPorMedio, onCerrar, onHecho }: Props) {
  const { confirm } = useConfirm();
  const [billetes, setBilletes] = useState<Record<string, number>>({});
  const [monedas, setMonedas] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<MedioArqueo>("efectivo");
  const [digitales, setDigitales] = useState<Record<"yape" | "plin" | "tarjeta", string>>({ yape: "", plin: "", tarjeta: "" });
  const [foto, setFoto] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Cierre a ciegas: sin esperado ni diferencia hasta cerrar; después, el resultado y «Listo». */
  const { ciego } = useCierreACiegas();
  const oculto = ciego !== false;
  const [resultado, setResultado] = useState<{ esperado: number; contado: number; yaEstaba?: boolean } | null>(null);
  const listo = () => { onHecho(); onCerrar(); };

  const totalBilletes = BILLETES.reduce((s, b) => s + b * (billetes[String(b)] ?? 0), 0);
  const totalMonedas = MONEDAS.reduce((s, m) => s + m * (monedas[String(m)] ?? 0), 0);
  const total = totalBilletes + totalMonedas;
  const esperado = stats?.expectedCash ?? 0;
  const diferencia = total - esperado;
  const digital = (Number(digitales.yape) || 0) + (Number(digitales.plin) || 0) + (Number(digitales.tarjeta) || 0);

  const cerrarConConteo = async () => {
    if (guardando) return;
    /* Esto CIERRA la caja del día (manda `action: "close"`), no es sólo contar. */
    const ok = await confirm({
      title: "¿Cerrar la caja del día?",
      description:
        `Esto CIERRA la caja del día con ${formatCurrency(total)} contados en efectivo. ` +
        (oculto
          ? "Lo esperado y la diferencia salen después de cerrar. "
          : `Esperado: ${formatCurrency(esperado)} · Diferencia: ${diferencia >= 0 ? "+" : "−"}${formatCurrency(Math.abs(diferencia))}. `) +
        "Después de cerrar hay que abrir una caja nueva para seguir vendiendo.",
      intent: "warning",
      confirmLabel: "Sí, cerrar",
    });
    if (!ok) return;
    setGuardando(true);
    setError(null);
    try {
      const notaDigital =
        digital > 0
          ? ` | Yape: ${formatCurrency(Number(digitales.yape) || 0)} | Plin: ${formatCurrency(Number(digitales.plin) || 0)} | Tarjeta: ${formatCurrency(Number(digitales.tarjeta) || 0)}`
          : "";
      // Brandon 2026-06-17: la foto se sube al servidor (antes se perdía al limpiar el navegador). Best-effort.
      let notaFoto = "";
      if (foto) {
        try {
          const blob = await (await fetch(foto)).blob();
          const fd = new FormData();
          fd.append("file", new File([blob], `arqueo-${caja.id}.jpg`, { type: blob.type || "image/jpeg" }));
          fd.append("folder", "general");
          const upRes = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), body: fd });
          const up = upRes.ok ? ((await upRes.json()) as { url?: string }) : null;
          notaFoto = up?.url ? ` | Foto: ${up.url}` : " | Foto: adjunta";
        } catch {
          notaFoto = " | Foto: adjunta";
        }
      }
      const res = await fetch(`/api/cash-registers/${caja.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "close",
          closingAmount: total,
          notes: `Arqueo Guiado - ${formatDateTimeShort(new Date())} | Billetes: ${formatCurrency(totalBilletes)} | Monedas: ${formatCurrency(totalMonedas)} | Total efectivo: ${formatCurrency(total)}${notaDigital} | Total general: ${formatCurrency(total + digital)} | Diferencia: ${diferencia >= 0 ? "+" : ""}${formatCurrency(diferencia)}${notaFoto}`,
        }),
      });
      /* Reintento de un cierre que SÍ se hizo (la respuesta se perdió) u otra
         pestaña que cerró primero: el servidor devuelve la caja cerrada y se
         muestra ESE cierre, como en «Cerrar caja» (antes: el 409 como error). */
      if (res.status === 409) {
        const j = (await res.clone().json().catch(() => null)) as { yaCerrada?: boolean; caja?: CashRegister } | null;
        if (j?.yaCerrada && j.caja) {
          setResultado({ esperado: j.caja.expectedAmount ?? esperado, contado: j.caja.closingAmount ?? total, yaEstaba: true });
          return;
        }
      }
      // Si el cierre falla (409 de otra pestaña, 503 de la base), el conteo NO se pierde.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body?.error === "string" ? body.error : `No se pudo cerrar la caja (error ${res.status}). El conteo sigue acá.`);
        return;
      }
      /* A ciegas: primero el resultado; la caja se relee al tocar «Listo» (si no, el modal se desmonta). */
      if (oculto) { setResultado({ esperado, contado: total }); return; }
      onHecho();
      onCerrar();
    } catch (err) {
      console.warn("[caja] arqueo guiado falló", err);
      setError("Sin conexión con el servidor. La caja NO se cerró y el conteo sigue acá.");
    } finally {
      setGuardando(false);
    }
  };

  if (resultado) {
    return (
      <MarcoModalCaja
        claveMemoria="caja-arqueo-guiado"
        titulo="Arqueo guiado"
        subtitulo="La caja quedó cerrada"
        icono={Calculator}
        iconoClase="bg-[var(--surface-sunken)] text-primary"
        onCerrar={listo}
        pie={<button type="button" onClick={listo} className={button({ variant: "primary", className: "flex-1 rounded-xl" })}>Listo</button>}
      >
        <ResultadoACiegas
          titulo={resultado.yaEstaba ? "Esta caja ya estaba cerrada: este es el cierre guardado" : "Caja cerrada con tu conteo"}
          esperado={resultado.esperado}
          contado={resultado.contado}
        />
      </MarcoModalCaja>
    );
  }

  return (
    <MarcoModalCaja
      claveMemoria="caja-arqueo-guiado"
      titulo="Arqueo guiado"
      subtitulo="Cuenta billetes, monedas y vouchers; cierra la caja"
      icono={Calculator}
      iconoClase="bg-[var(--surface-sunken)] text-primary"
      ancho="lg"
      onCerrar={onCerrar}
      error={error}
      pie={
        <>
          <BotonCancelar onClick={onCerrar} />
          <button
            type="button"
            onClick={cerrarConConteo}
            disabled={guardando || total <= 0}
            className="flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl text-base font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {/* El botón dice lo que hace: esto cierra la caja del día. */}
            Cerrar caja con este conteo
          </button>
        </>
      }
    >
      <div className="bg-[var(--surface-alt)] rounded-xl p-4 space-y-2">
        {oculto ? (
          <p className="text-sm text-[var(--text-secondary)]">Cuenta sin mirar el sistema: lo esperado y la diferencia salen al cerrar.</p>
        ) : (
        <div className="flex justify-between items-center text-base">
          <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
            Saldo esperado
            <InfoTip what="Lo que debería haber en el cajón: apertura + ventas en efectivo + ingresos − retiros." affects={stats?.fueraDelCajon ?? undefined} />
          </span>
          <span className="font-bold text-[var(--text-primary)] tabular-nums">{fmt(esperado)}</span>
        </div>
        )}
        <div className="flex justify-between items-center text-base border-t border-[var(--rule-soft)] pt-2">
          <span className="text-[var(--text-secondary)]">Total contado</span>
          <span className="font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] tabular-nums">{fmt(total)}</span>
        </div>
      </div>

      <FilasDeConteo
        titulo="Billetes"
        icono={<Banknote className="h-4 w-4 text-[var(--data-success-500)]" aria-hidden />}
        valores={BILLETES}
        conteo={billetes}
        onCambiar={(v, n) => setBilletes((p) => ({ ...p, [String(v)]: n }))}
        subtotalClase="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      />
      <FilasDeConteo
        titulo="Monedas"
        icono={<DollarSign className="h-4 w-4 text-[var(--data-warning-500)]" aria-hidden />}
        valores={MONEDAS}
        conteo={monedas}
        onCambiar={(v, n) => setMonedas((p) => ({ ...p, [String(v)]: n }))}
        subtotalClase="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
      />
      <VouchersPorMedio
        tab={tab}
        onTab={setTab}
        digitales={digitales}
        onDigital={(m, v) => setDigitales((p) => ({ ...p, [m]: v }))}
        efectivoContado={total}
        ventasPorMedio={ventasPorMedio}
        ciego={oculto}
      />
      <FotoDelCajon foto={foto} onFoto={setFoto} />

      <div className="bg-primary/5 dark:bg-primary/10 rounded-xl p-3 border border-primary/20 text-center">
        <p className="text-xs font-semibold text-[var(--text-secondary)]">Total contado</p>
        <p className="text-2xl font-extrabold text-primary tabular-nums">{fmt(total + digital)}</p>
        {digital > 0 && <p className="text-xs text-[var(--text-tertiary)] mt-1">Efectivo: {fmt(total)} + Digital: {fmt(digital)}</p>}
      </div>
      {total > 0 && !oculto && <VeredictoDiferencia diferencia={diferencia} cuadra={Math.abs(diferencia) < 0.5} />}
    </MarcoModalCaja>
  );
}
