"use client";

/**
 * La clave de una conexión nueva, que el servidor da UNA sola vez: se muestra
 * con copiar y con las instrucciones ya armadas con ella. Al cerrar no vuelve.
 */
import { WarningAlert } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Button } from "@/components/ui-system/Button";
import type { ConexionCreada } from "@/hooks/use-buleje-ia-conexiones";
import { BotonCopiar } from "./BotonCopiar";
import { InstruccionesApps } from "./InstruccionesApps";

export function ClaveUnaVez({ creada, urlMcp, onCerrar }: { creada: ConexionCreada; urlMcp: string; onCerrar: () => void }) {
  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={`Conexión «${creada.conexion.nombre}» lista`}
      size="lg"
      footer={
        <Button variant="primary" onClick={onCerrar}>
          Ya la guardé
        </Button>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <WarningAlert
          title="Copia la clave ahora"
          description="Por seguridad no se vuelve a mostrar. Si la pierdes, corta esta conexión y crea otra."
        />
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          <p className="break-all font-mono text-sm text-[var(--text-primary)]">{creada.token}</p>
          <div className="mt-2">
            <BotonCopiar texto={creada.token} etiqueta="Copiar la clave" variante="primary" />
          </div>
        </div>
        {urlMcp && <InstruccionesApps urlMcp={urlMcp} clave={creada.token} />}
      </div>
    </AdminModal>
  );
}
