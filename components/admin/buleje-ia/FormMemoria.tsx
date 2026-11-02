"use client";

/** Agregar o corregir algo que Buleje IA recuerda del negocio. */
import { useState } from "react";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Button } from "@/components/ui-system/Button";
import { TIPOS_MEMORIA, type MemoriaItem, type TipoMemoria } from "@/lib/ia-proveedores/tipos";
import type { DatosMemoria } from "@/hooks/use-buleje-ia-memoria";
import type { Resultado } from "./api";
import { AREA_IA, CAMPO_IA, ETIQUETA_IA, TEXTO_ERROR_IA } from "./campos";

export const NOMBRE_TIPO_MEMORIA: Record<TipoMemoria, string> = {
  alias: "Cómo le dices",
  dato: "Dato del negocio",
  preferencia: "Cómo te gusta",
  persona: "Persona",
  vehiculo: "Vehículo",
  proveedor: "Proveedor",
};

const EJEMPLO: Record<TipoMemoria, string> = {
  alias: "«el blanco» = camión Volvo placa N12-345",
  dato: "El petróleo lo compro en el grifo Primax de la Centenario",
  preferencia: "Las cotizaciones van con IGV incluido",
  persona: "Juan Pérez es el chofer del camión blanco",
  vehiculo: "Camión blanco N12: Volvo, rinde 8 km por galón",
  proveedor: "Maderera Ucayali: paga a 30 días",
};

export function FormMemoria({
  item,
  onCerrar,
  onGuardar,
}: {
  item: MemoriaItem | null;
  onCerrar: () => void;
  onGuardar: (d: DatosMemoria) => Promise<Resultado<unknown>>;
}) {
  const [tipo, setTipo] = useState<TipoMemoria>(item?.tipo ?? "dato");
  const [titulo, setTitulo] = useState(item?.titulo ?? "");
  const [texto, setTexto] = useState(item?.texto ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!titulo.trim() || !texto.trim()) return setError("Escribe de qué se trata y qué tiene que recordar.");
    setGuardando(true);
    const r = await onGuardar({ tipo, titulo: titulo.trim(), texto: texto.trim() });
    setGuardando(false);
    if (r.ok) onCerrar();
    else setError(r.error);
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={item ? "Corregir lo que recuerda" : "Enseñarle algo"}
      footer={
        <>
          <Button variant="secondary" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={guardar} disabled={guardando}>
            Guardar
          </Button>
        </>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <div>
          <label htmlFor="mem-tipo" className={ETIQUETA_IA}>
            Qué es
          </label>
          <select id="mem-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMemoria)} className={CAMPO_IA}>
            {TIPOS_MEMORIA.map((t) => (
              <option key={t} value={t}>
                {NOMBRE_TIPO_MEMORIA[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mem-titulo" className={ETIQUETA_IA}>
            De qué se trata
          </label>
          <input id="mem-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="Camión blanco" className={CAMPO_IA} />
        </div>
        <div>
          <label htmlFor="mem-texto" className={ETIQUETA_IA}>
            Qué tiene que recordar
          </label>
          <textarea id="mem-texto" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} placeholder={EJEMPLO[tipo]} className={AREA_IA} />
        </div>
        {error && (
          <p role="alert" className={TEXTO_ERROR_IA}>
            {error}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
