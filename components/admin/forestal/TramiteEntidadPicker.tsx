"use client";

/**
 * TramiteEntidadPicker — traer un emisor del Directorio forestal dentro de un
 * trámite (ADR-317).
 *
 * Desde 2026-09-20 es un **envoltorio** de `DirectorioPicker`: había dos
 * pickers de la misma libreta, con dos listas, dos buscadores y dos altas. Se
 * notaba en lo que le faltaba a éste — el aviso de «ya existe una ficha que se
 * llama casi igual», los vehículos del transportista y «usar la que ya está»
 * sólo existían en el otro, y las diez pantallas de trámites no los veían.
 *
 * Lo único propio de este trámite es la **traducción**: el formulario de
 * oficios no trabaja con una `Parte` entera sino con diez campos sueltos
 * (`EntidadElegida`), que `CAMPO_A_EMISOR` de `TramiteCamposPanel` reparte
 * según los campos que tenga ESE formato.
 *
 * Un titular es, en términos del Directorio, un `proveedor`: «trae la madera al
 * CTP» es exactamente eso.
 */

import DirectorioPicker from "./DirectorioPicker";
import type { DocTipo, Parte } from "@/lib/forestal/directorio";

export interface EntidadElegida {
  nombre: string;
  docTipo: DocTipo | null;
  docNumero: string;
  representante: string;
  direccion: string;
  region: string;
  provincia: string;
  distrito: string;
  telefono: string;
  email: string;
  /** Código de CTP de la parte, cuando ella misma es otro aserradero/CTP. */
  codigoCtp: string;
}

/** Los diez campos que el trámite sabe rellenar, sacados de la ficha completa. */
export function aEntidadElegida(p: Parte): EntidadElegida {
  return {
    nombre: p.nombre,
    docTipo: p.docTipo,
    docNumero: p.docNumero ?? "",
    representante: p.representante ?? "",
    direccion: p.direccion ?? "",
    region: p.region ?? "",
    provincia: p.provincia ?? "",
    distrito: p.distrito ?? "",
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    codigoCtp: p.codigoCtp ?? "",
  };
}

export default function TramiteEntidadPicker({ onElegir }: { onElegir: (e: EntidadElegida) => void }) {
  return (
    <DirectorioPicker
      rol="proveedor"
      label="Usar un emisor guardado"
      ayuda="Los mismos emisores del Libro CTP → Gestión → Directorio"
      onElegir={(p) => onElegir(aEntidadElegida(p))}
    />
  );
}
