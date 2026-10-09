import { useRef } from "react";
import Image from "next/image";
import { Upload, AlertTriangle, FileText, Landmark, Hash, Percent, Timer, ChevronRight } from "@buleje/design-system/icons";
import { FieldLabel, TextInput, NumberInput, Toggle, SectionCard, SaveButton } from "@/components/admin/settings/campos";
import { LINK_A_OTRA_PANTALLA } from "@/components/admin/settings/enlaces";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { topeCajeroParaGuardar } from "@/lib/pos/descuento-cajero";

export function SeccionCobros({ aj, onNavigateTab }: { aj: AjustesEstado; onNavigateTab?: (tab: string) => void }) {
  const { yapeEnabled, setYapeEnabled, yapeImage, setYapeImage, yapeName, setYapeName, yapePhone, setYapePhone, cashEnabled, setCashEnabled, plinEnabled, setPlinEnabled, plinImage, setPlinImage, plinName, setPlinName, plinPhone, setPlinPhone, transferEnabled, setTransferEnabled, transferBankName, setTransferBankName, transferAccountNum, setTransferAccountNum, transferAccountHolder, setTransferAccountHolder, taxRate, setTaxRate, sunatRuc, setSunatRuc, sunatDenominacion, setSunatDenominacion, cashAlertMax, setCashAlertMax, autoCloseTime, setAutoCloseTime, maxDiscountPercent, setMaxDiscountPercent, patch, handleFileUpload, saving, savedSection } = aj;
  const yapeImgRef = useRef<HTMLInputElement>(null);
  const plinImgRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-6">
      <SectionCard title="Métodos de pago" desc="Configura los métodos que aceptas">
        <div className="space-y-3">
          <Toggle enabled={cashEnabled} onChange={setCashEnabled} label="Efectivo" desc="Pago contra entrega" />
          <Toggle enabled={yapeEnabled} onChange={setYapeEnabled} label="Yape" desc="Pago con QR de Yape" />
          {yapeEnabled && (
            <div className="pl-4 border-l-2 border-[var(--rule-base)] space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><FieldLabel>Titular</FieldLabel><TextInput value={yapeName} onChange={setYapeName} placeholder="Juan Pérez" /></div>
                <div><FieldLabel>Número</FieldLabel><TextInput id="settings-yapePhone" value={yapePhone} onChange={setYapePhone} placeholder="987654321" mono /></div>
              </div>
              <div>
                <FieldLabel>QR de Yape</FieldLabel>
                <button id="settings-yape-qr" type="button" onClick={() => yapeImgRef.current?.click()} className="w-full min-h-11 rounded-xl border border-dashed border-[var(--rule-base)] hover:border-[var(--rule-base)]0 text-sm font-semibold text-[var(--text-secondary)] bg-[var(--surface-sunken)] transition-colors"><Upload className="h-4 w-4 inline mr-1.5" />Subir QR</button>
                <input ref={yapeImgRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload(setYapeImage, "yape", "payments")} />
                {yapeImage && <div className="mt-2 flex items-center gap-3 p-2 bg-[var(--surface-sunken)] rounded-lg"><Image src={yapeImage} alt="QR" width={64} height={64} className="rounded-lg object-contain border" unoptimized /><button onClick={() => setYapeImage("")} className="text-xs text-[var(--data-error-500)] hover:text-[var(--data-error-500)]">Quitar</button></div>}
              </div>
            </div>
          )}
          <Toggle enabled={plinEnabled} onChange={setPlinEnabled} label="Plin" desc="Pago con Plin" />
          {plinEnabled && (
            <div className="pl-4 border-l-2 border-[var(--data-success-500)]/30 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><FieldLabel>Titular</FieldLabel><TextInput value={plinName} onChange={setPlinName} /></div>
                <div><FieldLabel>Número</FieldLabel><TextInput id="settings-plinPhone" value={plinPhone} onChange={setPlinPhone} mono /></div>
              </div>
              <div>
                <button onClick={() => plinImgRef.current?.click()} className="w-full py-3 rounded-xl border-2 border-dashed border-[var(--data-success-500)]/30 hover:border-[var(--data-success-500)]/30 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 transition-colors"><Upload className="h-4 w-4 inline mr-1.5" />Subir QR Plin</button>
                <input ref={plinImgRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload(setPlinImage, "plin", "payments")} />
                {plinImage && <div className="mt-2 flex items-center gap-3 p-2 bg-primary/10 rounded-lg"><Image src={plinImage} alt="QR" width={64} height={64} className="rounded-lg object-contain border" unoptimized /><button onClick={() => setPlinImage("")} className="text-xs text-[var(--data-error-500)]">Quitar</button></div>}
              </div>
            </div>
          )}
          <Toggle enabled={transferEnabled} onChange={setTransferEnabled} label="Transferencia bancaria" desc="Deposito o transferencia" />
          {transferEnabled && (
            <div className="pl-4 border-l-2 border-[var(--data-success-500)]/30 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><FieldLabel icon={<Landmark className="h-3.5 w-3.5" />}>Banco</FieldLabel><TextInput value={transferBankName} onChange={setTransferBankName} placeholder="BCP" /></div>
                <div><FieldLabel>N° de cuenta</FieldLabel><TextInput id="settings-transferAccountNum" value={transferAccountNum} onChange={setTransferAccountNum} mono /></div>
                <div><FieldLabel>Titular</FieldLabel><TextInput value={transferAccountHolder} onChange={setTransferAccountHolder} /></div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Caja" desc="Aviso de efectivo acumulado, hora de cierre y descuento del cajero">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><FieldLabel htmlFor="settings-cashAlertMax" icon={<AlertTriangle className="h-3.5 w-3.5" />}>Alerta de exceso en caja</FieldLabel><NumberInput id="settings-cashAlertMax" value={cashAlertMax} onChange={setCashAlertMax} min={0} suffix="soles" /></div>
          <div><FieldLabel icon={<Timer className="h-3.5 w-3.5" />}>Hora de cierre</FieldLabel><TextInput value={autoCloseTime} onChange={setAutoCloseTime} placeholder="22:00" /></div>
          <div>
            <FieldLabel htmlFor="settings-maxDiscountPercent" icon={<Percent className="h-3.5 w-3.5" />}>
              Descuento máx. cajero
              <InfoTip
                title="Descuento máximo del cajero"
                what="Lo más que un cajero puede descontar en el POS: por producto y en el total de la venta (trueque). El dueño y los admin no tienen tope."
                affects="Si el cajero pide más, la venta no pasa y le pide que la cobre el dueño o un admin."
                example="Con 15 %, en una venta de S/ 40,00 descuenta hasta S/ 6,00. De fábrica: 15 %."
              />
            </FieldLabel>
            <NumberInput id="settings-maxDiscountPercent" value={maxDiscountPercent} onChange={(v) => setMaxDiscountPercent(topeCajeroParaGuardar(v))} min={0} max={99} step={1} suffix="%" />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Comprobantes" desc="Emisor e IGV de tus boletas y facturas">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><FieldLabel htmlFor="settings-sunatRuc" icon={<Hash className="h-3.5 w-3.5" />}>RUC del emisor</FieldLabel><TextInput id="settings-sunatRuc" value={sunatRuc} onChange={setSunatRuc} placeholder="20123456789" mono /></div>
          <div><FieldLabel htmlFor="settings-sunatDenominacion" icon={<FileText className="h-3.5 w-3.5" />}>Denominación</FieldLabel><TextInput id="settings-sunatDenominacion" value={sunatDenominacion} onChange={setSunatDenominacion} placeholder="Inversiones San Martín S.A.C." /></div>
          <div><FieldLabel htmlFor="settings-taxRate" icon={<Percent className="h-3.5 w-3.5" />}>IGV</FieldLabel><NumberInput id="settings-taxRate" value={taxRate} onChange={setTaxRate} min={0} max={100} step={0.1} suffix="%" /></div>
        </div>
        <button type="button" onClick={() => onNavigateTab?.("facturacion")} className={LINK_A_OTRA_PANTALLA}>
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--text-primary)]">Series, correlativos y conexión con SUNAT</span>
          <span className="text-xs text-[var(--text-secondary)]">en Facturación</span>
          <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        </button>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "cobros"} onClick={() => patch({
        cashEnabled, yapeEnabled, yapeImage, yapeName, yapePhone,
        plinEnabled, plinImage, plinName, plinPhone,
        transferEnabled, transferBankName, transferAccountNum, transferAccountHolder,
        cashAlertMax, autoCloseTime, sunatRuc, sunatDenominacion, taxRate,
        maxDiscountPercent: topeCajeroParaGuardar(maxDiscountPercent),
      })} />
    </div>
  );
}
