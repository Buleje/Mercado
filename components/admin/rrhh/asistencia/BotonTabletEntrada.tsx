"use client";

/**
 * BotonTabletEntrada — «Poner la tablet en la entrada» (Brandon 26-10: 123
 * marcas del mes, todas escritas a mano por el admin; el kiosko ya existía
 * pero ninguna pantalla lo prendía). Abre una ventana con el kiosko
 * (`components/rrhh/KioskoAsistenciaAjustes`): un botón prende la marcación y
 * muestra el QR para abrirlo en la tablet. Sólo dueño y administrador (el
 * servidor responde 403 al resto).
 */

import { useState } from "react";
import { Tablet } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import KioskoAsistenciaAjustes from "@/components/rrhh/KioskoAsistenciaAjustes";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { Button } from "@/components/ui-system";

export default function BotonTabletEntrada() {
  const [abierto, setAbierto] = useState(false);
  
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setAbierto(true)}>
        <Tablet className="h-4 w-4" aria-hidden /> Poner la tablet en la entrada
      </Button>
      <AdminModal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="La tablet de la entrada"
        description="Cada uno marca con su fotocheck y la asistencia se llena sola."
        icon={Tablet}
        size="lg"
      >
        <div className={MODAL_BODY}>
          <KioskoAsistenciaAjustes
            enVentana
            alImprimirFotochecks={() => {
              setAbierto(false);
              irAEnlace("/admin?tab=rrhh&vista=personal&fotochecks=1");
            }}
          />
        </div>
      </AdminModal>
    </>
  );
}
