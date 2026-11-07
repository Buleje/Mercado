"use client";

/**
 * FichaSeccionCuenta — la pestaña «Cuenta y usuario» de la ficha (sólo el
 * dueño): su cuenta en Mi Plata, su usuario del panel, sus otras cuentas en el
 * sistema (24-10) y sus papeles ligados. Salió de `FichaColaboradorModal` para
 * que la ficha no pase las 300 líneas.
 */

import { LinkedDocumentsSection } from "@/components/admin/documentos/LinkedDocumentsSection";
import type { useRrhhFicha } from "@/hooks/use-rrhh-ficha";
import type { FichaColaboradorDTO } from "@/lib/rrhh/tipos";
import FichaCuenta from "./FichaCuenta";
import FichaSusCuentas from "./FichaSusCuentas";
import FichaUsuarioPanel from "./FichaUsuarioPanel";

interface Props {
  colaboradorId: string;
  ficha: FichaColaboradorDTO;
  guardando: boolean;
  accion: ReturnType<typeof useRrhhFicha>["accion"];
  onCambio: () => void;
}

export default function FichaSeccionCuenta({
  colaboradorId,
  ficha,
  guardando,
  accion,
  onCambio,
}: Props) {
  const vincular = (id: string | null) =>
    accion({ action: "vincular_beneficiario", beneficiarioId: id });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <FichaCuenta
        vinculo={ficha.vinculo}
        cuenta={ficha.cuenta ?? null}
        guardando={guardando}
        onVincular={vincular}
        onCambio={onCambio}
      />
      <FichaUsuarioPanel
        adminUser={ficha.vinculo.adminUser}
        guardando={guardando}
        accion={accion}
        onCambio={onCambio}
      />
      <div className="lg:col-span-2">
        <FichaSusCuentas
          colaboradorId={colaboradorId}
          version={ficha.vinculo.beneficiario?.id ?? ""}
          guardando={guardando}
          onVincular={vincular}
          onCambio={onCambio}
        />
      </div>
      {/* ADR-502: sus pagos semanales archivados (carpeta Equipo/Pagos),
          sólo admin/dueño; excluye las fotos de asistencia del mismo tag. */}
      <div className="lg:col-span-2">
        <LinkedDocumentsSection
          entity="colaborador"
          id={colaboradorId}
          nombre={ficha.colaborador.nombre}
        />
      </div>
    </div>
  );
}
