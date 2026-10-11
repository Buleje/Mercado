import { useRef } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Upload, AlertTriangle, FileText, Landmark, Hash, Percent, Timer, ChevronRight, HandCoins } from "@buleje/design-system/icons";
import { FieldLabel, TextInput, NumberInput, Toggle, SectionCard, Plegable } from "@/components/admin/settings/campos";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { topeCajeroParaGuardar } from "@/lib/pos/descuento-cajero";
import { button } from "@/components/ui-system/button-variants";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { InterruptorCierreACiegas } from "@/components/admin/turnos/cierre-a-ciegas";

/* La conexión con SUNAT (plan «panel unificado», ola 2): la configuración
   SUNAT estaba partida entre esta sección y Facturación › Conexión SUNAT.
   Se monta la MISMA pantalla, que trae la tarjeta «Modo oficial» una sola
   vez. Facturación la sigue mostrando hasta la ola 3. */
const SunatConexionTab = dynamic(() => import("@/components/admin/sunat/SunatConexionTab"), { ssr: false });

/**
 * Subir el QR de Yape o de Plin: un botón de 48 px y, si ya hay uno, la
 * miniatura con «Quitar». Antes eran dos bloques distintos (el de Yape con
 * `capture="environment"`, que en el celular abría la cámara y no dejaba
 * elegir la captura del QR que da la app).
 */
function SubirQr({ id, nombre, imagen, onQuitar, onUpload }: {
  id?: string; nombre: string; imagen: string; onQuitar: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      {imagen && <Image src={imagen} alt={`QR de ${nombre}`} width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg border border-[var(--rule-base)] object-contain" unoptimized />}
      <button id={id} type="button" onClick={() => ref.current?.click()} className={button({ variant: "secondary", className: "flex-1 rounded-xl" })}>
        <Upload className="h-4 w-4" aria-hidden />{imagen ? `Cambiar QR de ${nombre}` : `Subir QR de ${nombre}`}
      </button>
      {imagen && <button type="button" onClick={onQuitar} className={button({ variant: "ghost", className: "rounded-xl" })}>Quitar</button>}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onUpload} />
    </div>
  );
}

export function SeccionCobros({ aj, onNavigateTab }: { aj: AjustesEstado; onNavigateTab?: (tab: string) => void }) {
  const { yapeEnabled, setYapeEnabled, yapeImage, setYapeImage, yapeName, setYapeName, yapePhone, setYapePhone, cashEnabled, setCashEnabled, plinEnabled, setPlinEnabled, plinImage, setPlinImage, plinName, setPlinName, plinPhone, setPlinPhone, transferEnabled, setTransferEnabled, transferBankName, setTransferBankName, transferAccountNum, setTransferAccountNum, transferAccountHolder, setTransferAccountHolder, taxRate, setTaxRate, sunatRuc, setSunatRuc, sunatDenominacion, setSunatDenominacion, cashAlertMax, setCashAlertMax, autoCloseTime, setAutoCloseTime, maxDiscountPercent, setMaxDiscountPercent, adelantoTopeCajero, setAdelantoTopeCajero, handleFileUpload } = aj;
  return (
    <div className="space-y-4">
      {/* Cada método con sus datos debajo; en 2 columnas a lo ancho (antes, una lista de 4 filas con los datos intercalados). */}
      <SectionCard title="Métodos de pago" desc="Los que aceptas en tu tienda y en el POS. El número y el QR de Yape y Plin salen en el pago de tu tienda.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
          <div className="space-y-3">
            <Toggle enabled={cashEnabled} onChange={setCashEnabled} label="Efectivo" desc="Pago contra entrega" />
            <Toggle enabled={transferEnabled} onChange={setTransferEnabled} label="Transferencia bancaria" desc="Depósito o transferencia" />
            {transferEnabled && (
              <div className="pl-3 border-l-2 border-[var(--rule-base)] grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><FieldLabel htmlFor="settings-transferBankName" icon={<Landmark className="h-3.5 w-3.5" />}>Banco</FieldLabel><TextInput id="settings-transferBankName" value={transferBankName} onChange={setTransferBankName} placeholder="BCP" /></div>
                <div><FieldLabel htmlFor="settings-transferAccountNum">N° de cuenta</FieldLabel><TextInput id="settings-transferAccountNum" value={transferAccountNum} onChange={setTransferAccountNum} mono /></div>
                <div className="sm:col-span-2"><FieldLabel htmlFor="settings-transferAccountHolder">Titular</FieldLabel><TextInput id="settings-transferAccountHolder" value={transferAccountHolder} onChange={setTransferAccountHolder} /></div>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <Toggle enabled={yapeEnabled} onChange={setYapeEnabled} label="Yape" desc="Pago con QR de Yape" />
            {yapeEnabled && (
              <div className="pl-3 border-l-2 border-[var(--rule-base)] space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><FieldLabel htmlFor="settings-yapeName">Titular</FieldLabel><TextInput id="settings-yapeName" value={yapeName} onChange={setYapeName} placeholder="Juan Pérez" /></div>
                  <div><FieldLabel htmlFor="settings-yapePhone">Número</FieldLabel><TextInput id="settings-yapePhone" value={yapePhone} onChange={setYapePhone} placeholder="987654321" mono /></div>
                </div>
                <SubirQr id="settings-yape-qr" nombre="Yape" imagen={yapeImage} onQuitar={() => setYapeImage("")} onUpload={handleFileUpload(setYapeImage, "yape", "payments")} />
              </div>
            )}
            <Toggle enabled={plinEnabled} onChange={setPlinEnabled} label="Plin" desc="Pago con Plin" />
            {plinEnabled && (
              <div className="pl-3 border-l-2 border-[var(--rule-base)] space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><FieldLabel htmlFor="settings-plinName">Titular</FieldLabel><TextInput id="settings-plinName" value={plinName} onChange={setPlinName} /></div>
                  <div><FieldLabel htmlFor="settings-plinPhone">Número</FieldLabel><TextInput id="settings-plinPhone" value={plinPhone} onChange={setPlinPhone} mono /></div>
                </div>
                <SubirQr nombre="Plin" imagen={plinImage} onQuitar={() => setPlinImage("")} onUpload={handleFileUpload(setPlinImage, "plin", "payments")} />
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 2xl:items-start">
        <SectionCard title="Caja" desc="Aviso de efectivo acumulado, hora de cierre, descuento, adelantos y cierre a ciegas del cajero">
          {/* `items-end`: unos rótulos parten en 2 líneas y los campos quedaban a distinta altura. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 items-end gap-x-4 gap-y-3">
            <div><FieldLabel htmlFor="settings-cashAlertMax" icon={<AlertTriangle className="h-3.5 w-3.5" />}>Alerta de exceso</FieldLabel><NumberInput id="settings-cashAlertMax" value={cashAlertMax} onChange={setCashAlertMax} min={0} suffix="soles" /></div>
            <div><FieldLabel htmlFor="settings-autoCloseTime" icon={<Timer className="h-3.5 w-3.5" />}>Hora de cierre</FieldLabel><TextInput id="settings-autoCloseTime" value={autoCloseTime} onChange={setAutoCloseTime} placeholder="22:00" /></div>
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
            <div>
              <FieldLabel htmlFor="settings-adelantoTopeCajero" icon={<HandCoins className="h-3.5 w-3.5" />}>
                Tope de adelantos
                <InfoTip
                  title="Tope del cajero para entregar adelantos"
                  what="Lo más que un cajero puede entregar en un adelanto desde la caja (Adelantos › Entregar). El dueño y los admin no tienen tope."
                  affects="Vacío = S/ 500. Con 0 el cajero no entrega adelantos: lo hace el dueño o un admin."
                  example="Con 300, el cajero entrega hasta S/ 300,00; un adelanto de S/ 450,00 lo entrega el dueño."
                />
              </FieldLabel>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-secondary)] font-medium shrink-0">S/</span>
                <TextInput id="settings-adelantoTopeCajero" type="number" value={adelantoTopeCajero} onChange={setAdelantoTopeCajero} placeholder="500" mono />
              </div>
            </div>
            {/* Se guarda solo (no pasa por la barra de cambios): vive en los flags del negocio. */}
            <div className="sm:col-span-2"><InterruptorCierreACiegas /></div>
          </div>
        </SectionCard>

        <SectionCard
          title="Comprobantes"
          desc="Emisor e IGV de tus boletas y facturas"
          accion={
            <button type="button" onClick={() => onNavigateTab?.("facturacion")} className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--surface-sunken)]" title="Tus boletas, facturas y notas emitidas, en Facturación">
              Emitidos <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 items-end gap-x-4 gap-y-3">
            <div><FieldLabel htmlFor="settings-sunatRuc" icon={<Hash className="h-3.5 w-3.5" />}>RUC del emisor</FieldLabel><TextInput id="settings-sunatRuc" value={sunatRuc} onChange={setSunatRuc} placeholder="20123456789" mono /></div>
            <div><FieldLabel htmlFor="settings-taxRate" icon={<Percent className="h-3.5 w-3.5" />}>IGV</FieldLabel><NumberInput id="settings-taxRate" value={taxRate} onChange={setTaxRate} min={0} max={100} step={0.1} suffix="%" /></div>
            <div className="sm:col-span-2"><FieldLabel htmlFor="settings-sunatDenominacion" icon={<FileText className="h-3.5 w-3.5" />}>Denominación</FieldLabel><TextInput id="settings-sunatDenominacion" value={sunatDenominacion} onChange={setSunatDenominacion} placeholder="Inversiones San Martín S.A.C." /></div>
          </div>
        </SectionCard>
      </div>

      {/* La conexión con Nubefact tiene su propio botón y guarda en otro lado:
          la barra de «cambios sin guardar» no la toca. Se veía en Facturación
          (plan Enterprise) y en Documentos › Facturación (Pro): sólo para quien
          la veía ahí (R2, permiso por origen). */}
      <PermisoDe origen={["facturacion", "documentos"]}>
        <Plegable clave="cobros-sunat" titulo="Conexión con SUNAT" resumen="Modo oficial, RUC, token de Nubefact, ambiente y series">
          <SunatConexionTab />
        </Plegable>
      </PermisoDe>
    </div>
  );
}
