"use client";

/**
 * «Imprimir en talonario» de una guía del Libro TH: arma sus valores y abre el
 * talonario (`TalonarioModal`, el mismo que usa la guía de salida del CTP).
 *
 * Los valores son los de «Imprimir hoja SERFOR» (`entradasDeLaGuia`): esto no
 * recalcula nada. Una guía anotada a mano necesita la carátula del libro para
 * su identidad (casilleros 6 y 7): se pide sólo en ese caso.
 */

import { useEffect, useMemo, useState } from "react";
import { entradasDeLaGuia } from "@/lib/forestal/gtf-matricial-valores";
import type { GuiaDelTalonario } from "@/lib/forestal/gtf-matricial-fuente";
import type { LothGtfCaratula, LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import type { Gtf } from "./gtf-tabla-columnas";
import TalonarioModal from "./TalonarioModal";

export default function GtfMatricialModal({ g, onClose }: { g: Gtf; onClose: () => void }) {
  const [caratula, setCaratula] = useState<LothGtfCaratula | null>(null);
  const necesitaCaratula = !g.gtfDatos;

  useEffect(() => {
    if (!necesitaCaratula) return;
    fetch("/api/admin/forestal/loth/caratula", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCaratula(j?.active ?? null))
      .catch((err) => console.warn("[gtf-matricial] no se pudo leer la carátula", err));
  }, [necesitaCaratula]);

  const ref = useMemo((): GuiaDelTalonario => ({ tipo: "gtf", id: g.id }), [g.id]);
  const entradas = useMemo(() => entradasDeLaGuia(g as unknown as LothGtfDoc, caratula), [g, caratula]);
  return <TalonarioModal fuente={{ ref, numero: g.gtfNumber, titular: g.titularName, entradas }} onClose={onClose} />;
}
