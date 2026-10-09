"use client";

import { toast } from "sonner";
import { Maximize2, Printer } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmt } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";
import { tieneQR, type Billetera, type BilleteraNegocio } from "@/components/admin/pos/pago/useBilleteraNegocio";

const ETIQUETA: Record<Billetera, string> = { yape: "Yape", plin: "Plin" };

/** El QR que el negocio subió en Ajustes › Cobros (el de su app: ese sí se escanea y paga). */
function BilleteraDelNegocio({ metodo, negocio, total, onMostrar }: { metodo: Billetera; negocio: BilleteraNegocio; total: number; onMostrar: () => void }) {
  return (
    <div className="rounded-xl p-3 mb-3 border border-[var(--rule-base)] bg-[var(--surface-sunken)] flex items-center gap-3" data-pos-qr-negocio={metodo}>
      {/* Fondo blanco también en oscuro: la cámara del cliente no lee un QR sobre gris. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen subida por el negocio (URL de su almacenamiento) */}
      <img
        src={negocio.qr}
        alt={`QR ${ETIQUETA[metodo]} del negocio`}
        width={88}
        height={88}
        className="h-22 w-22 shrink-0 rounded-lg bg-[var(--surface-raised)] dark:bg-white p-1 object-contain"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--text-primary)]">
          {ETIQUETA[metodo]} · <span className="tabular-nums">{fmt(total)}</span>
        </p>
        {negocio.titular && <p className="text-xs text-[var(--text-secondary)] truncate">{negocio.titular}</p>}
        {negocio.numero && <p className="text-xs text-[var(--text-tertiary)] tabular-nums">{negocio.numero}</p>}
        <button
          type="button"
          onClick={onMostrar}
          className="mt-2 inline-flex items-center gap-1.5 min-h-10 px-3 rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-110 transition"
        >
          <Maximize2 className="h-4 w-4" aria-hidden />
          Mostrar QR al cliente
        </button>
      </div>
    </div>
  );
}

/**
 * Yape / Plin. Si el negocio subió su QR en Ajustes › Cobros, se usa ese (y al elegir el método se
 * abre en grande: YapeQRPayment). Si no, queda la caja de antes: número guardado en este equipo.
 */
export default function PagoBilletera({ p }: { p: PagoModal }) {
  const { yapeNumber, setYapeNumber, plinNumber, setPlinNumber, qrDataUrl, total, currentMethod, showQR, billeteras, setQrAbierto } = p;
  const metodo: Billetera | null = currentMethod === "yape" || currentMethod === "plin" ? currentMethod : null;
  const negocio = metodo ? billeteras?.[metodo] : undefined;
  if (showQR && metodo && tieneQR(negocio)) {
    return <BilleteraDelNegocio metodo={metodo} negocio={negocio} total={total} onMostrar={() => setQrAbierto(metodo)} />;
  }
  return (
    <>
                {/* QR configurable para Yape/Plin */}
                {showQR && (() => {
                  const isYape = currentMethod === "yape";
                  const savedNumber = isYape ? yapeNumber : plinNumber;
                  const setSavedNumber = isYape ? setYapeNumber : setPlinNumber;
                  const storageKey = isYape ? "yape-number" : "plin-number";

                  const handlePrintQR = () => {
                    if (!savedNumber) return;
                    // SECURITY 2026-05-17 (audit C4): validar formato estricto antes
                    // de imprimir. localStorage puede contener payloads contaminados
                    // de sesiones previas (legacy sin sanitize). Si el número no es
                    // 100% dígitos opcional con + inicial → abortar impresión.
                    if (!/^\+?\d{6,15}$/.test(savedNumber)) {
                      toast.error("Número inválido para QR. Solo dígitos (opcional + al inicio).");
                      return;
                    }
                    const w = window.open("", "_blank", "width=400,height=500");
                    if (!w) return;
                    // DOM API en lugar de document.write con interpolación —
                    // textContent escapa automáticamente cualquier markup.
                    const doc = w.document;
                    doc.title = `QR ${isYape ? "Yape" : "Plin"}`;
                    const style = doc.createElement("style");
                    style.textContent = `body{text-align:center;font-family:sans-serif;padding:40px}h2{color:${isYape ? "#7c3aed" : "#0891b2"}}img{margin:20px auto}`;
                    doc.head.appendChild(style);
                    const h2 = doc.createElement("h2");
                    h2.textContent = `Paga con ${isYape ? "Yape" : "Plin"}`;
                    const img = doc.createElement("img");
                    if (qrDataUrl) img.src = qrDataUrl;
                    img.width = 250;
                    img.height = 250;
                    img.alt = "QR";
                    const numP = doc.createElement("p");
                    numP.style.fontSize = "18px";
                    numP.style.fontWeight = "bold";
                    numP.textContent = savedNumber;
                    const totP = doc.createElement("p");
                    totP.style.fontSize = "14px";
                    totP.style.color = "#666";
                    totP.textContent = `Total: ${fmt(total)}`;
                    doc.body.appendChild(h2);
                    doc.body.appendChild(img);
                    doc.body.appendChild(numP);
                    doc.body.appendChild(totP);
                    w.print();
                  };

                  return (
                    <div className="rounded-xl p-3 mb-3 border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                      <p className="text-xs font-bold mb-2 flex items-center justify-center gap-1 text-[var(--text-primary)]">
                        {isYape ? "Yape" : "Plin"} &middot; {fmt(total)}
                        <InfoTip
                          title="QR del número"
                          what="Este QR lleva sólo el número guardado en este equipo."
                          affects="Para que el cliente escanee y pague directo, sube la imagen del QR de tu app en Ajustes › Cobros: aparece aquí y en grande al elegir el método."
                          example="Yape › Mi QR › Compartir › guarda la imagen y súbela en Ajustes."
                          side="bottom"
                        />
                      </p>

                      {/* Input para configurar el número */}
                      <div className="flex gap-2 items-center mb-2">
                        <input
                          value={savedNumber}
                          onChange={e => {
                            const v = e.target.value.replace(/[^\d+]/g, "").slice(0, 15);
                            setSavedNumber(v);
                            try { localStorage.setItem(storageKey, v); } catch { /* ignore */ }
                          }}
                          placeholder={`Número ${isYape ? "Yape" : "Plin"} del negocio`}
                          className="flex-1 px-3 h-10 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                        />
                        {savedNumber && (
                          <button
                            onClick={handlePrintQR}
                            className="inline-flex items-center gap-1 min-h-10 px-3 text-xs font-bold rounded-xl bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)] hover:opacity-80 transition-opacity"
                            title="Imprimir QR"
                            aria-label={`Imprimir QR de ${isYape ? "Yape" : "Plin"}`}
                          >
                            <Printer className="h-3.5 w-3.5" aria-hidden /> QR
                          </button>
                        )}
                      </div>

                      {/* QR basado en el número guardado (generado localmente) */}
                      {savedNumber && qrDataUrl ? (
                        <div className="text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element -- data URL local, next/image no aplica */}
                          <img
                            src={qrDataUrl}
                            alt={`QR ${currentMethod}`}
                            width={180}
                            height={180}
                            className="mx-auto rounded-lg bg-[var(--surface-raised)] p-1"
                          />
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">Muéstrale este QR al cliente</p>
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--text-tertiary)] text-center py-2">
                          Ingresa el número para generar el QR
                        </p>
                      )}
                    </div>
                  );
                })()}
    </>
  );
}
