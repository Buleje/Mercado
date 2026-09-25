"use client";

/**
 * Contratos — el papel bajo el que se trabaja, y su balance (ADR-421).
 *
 * Dos niveles y un solo camino entre ellos:
 *  1. la lista de permisos, con la banda para sembrar los que ya están escritos
 *     en el libro y todavía no son contrato;
 *  2. el balance del que se elija: lo que se puso, lo que debería volver y a
 *     cuánto sale el m³.
 *
 * La ficha abierta vive en la URL (`?contrato=<id>`, ADR-432): un link abre ese
 * permiso, el «atrás» del navegador vuelve a la lista y el chip de la banda
 * («Ver volumen y trazabilidad») salta directo acá.
 *
 * No lee el período del libro a propósito: un contrato se mira entero —desde
 * que se firmó hasta hoy—, no por trimestre. El endpoint acepta rango por si
 * alguna vez hace falta acotarlo.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSignature, RefreshCw } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  useContratos,
  type CandidatoContrato,
  type ResultadoSembrado,
} from "@/hooks/use-contratos";
import CtpContratoFicha from "./CtpContratoFicha";
import CtpContratosCandidatos from "./CtpContratosCandidatos";
import CtpContratosLista from "./CtpContratosLista";
import CtpPermisosIncompletos from "./CtpPermisosIncompletos";
import { contratoDeUrl, escribirContratoEnUrl } from "./ficha-del-permiso-url";

/** «3 ingresos, 1 corrida y 2 lotes», sin listar los bloques en cero. */
function loAtado(r: ResultadoSembrado): string {
  const partes = [
    r.madera > 0 ? `${r.madera} ${r.madera === 1 ? "ingreso" : "ingresos"}` : null,
    r.produccion > 0 ? `${r.produccion} ${r.produccion === 1 ? "corrida" : "corridas"}` : null,
    r.lotes > 0 ? `${r.lotes} ${r.lotes === 1 ? "lote" : "lotes"}` : null,
  ].filter((p): p is string => p !== null);
  if (partes.length === 0) return "No había registros sueltos para atar.";
  return `Quedaron atados ${partes.join(", ").replace(/, ([^,]*)$/, " y $1")}.`;
}

export default function CtpContratosView() {
  const { contratos, balances, candidatos, cargando, error, sembrando, recargar, sembrar } =
    useContratos();
  /** Qué contrato está abierto. Null = la lista. Lo dice la URL. */
  const [elegido, setElegido] = useState<string | null>(() => contratoDeUrl());
  const [ultimoSembrado, setUltimoSembrado] = useState<ResultadoSembrado | null>(null);

  /* El «atrás» del navegador, y el salto desde el chip de la banda con el
     libro ya abierto (`abrirFichaDelPermiso` dispara un popstate). */
  useEffect(() => {
    const onPop = () => setElegido(contratoDeUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const abrir = (id: string | null) => {
    setElegido(id);
    escribirContratoEnUrl(id);
  };

  const alSembrar = (lista: CandidatoContrato[]) => {
    setUltimoSembrado(null);
    void sembrar(lista).then((r) => {
      if (r.creados > 0) setUltimoSembrado(r);
    });
  };

  if (elegido) {
    /* `key`: al saltar de un permiso a otro la ficha se monta de nuevo, así
       nunca pinta las cifras del anterior bajo el código del nuevo. */
    return (
      <CtpContratoFicha
        key={elegido}
        contratoId={elegido}
        inicial={contratos.find((c) => c.id === elegido) ?? null}
        onVolver={() => abrir(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <SectionTitle as="h2" className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
              Contratos ({contratos.length})
            </SectionTitle>
            <InfoTip
              title="Contratos"
              what="El permiso, la concesión o el contrato bajo el que se trabaja."
              affects="Todo lo que se registra con uno —madera, gastos, fletes, adelantos y cuenta corriente— suma en su balance."
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void recargar()}
          disabled={cargando || sembrando}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
          Actualizar
        </button>
      </header>

      {error && (
        <p className="flex items-start gap-1.5 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}

      {ultimoSembrado && (
        <p className="flex items-start gap-1.5 rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {ultimoSembrado.creados === 1
              ? "Se creó 1 contrato. "
              : `Se crearon ${ultimoSembrado.creados} contratos. `}
            {loAtado(ultimoSembrado)}
          </span>
        </p>
      )}

      <CtpContratosCandidatos candidatos={candidatos} sembrando={sembrando} onSembrar={alSembrar} />

      {/* Primero lo que falta, después el detalle: un papel sin área ni
          vigencia no se ve en la tabla —las columnas dicen «—»— y así nadie lo
          completa nunca. Si no falta nada, el bloque no se monta. La recarga va
          en silencio: el aviso de guardado lo da el propio bloque. */}
      <CtpPermisosIncompletos
        contratos={contratos}
        balances={balances}
        onGuardado={() => void recargar({ silenciosa: true })}
      />

      {cargando && contratos.length === 0 ? (
        <p className="flex items-center gap-2 px-1 py-8 text-sm text-[var(--text-tertiary)]">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> Buscando los contratos del
          libro…
        </p>
      ) : (
        <CtpContratosLista
          contratos={contratos}
          balances={balances}
          onElegir={(c) => abrir(c.id)}
        />
      )}
    </div>
  );
}
