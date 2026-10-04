"use client";

/**
 * La vista previa de «Importar guías despachadas» (ADR-461), agrupada por
 * permiso: arriba de cada grupo, a qué plan van (y si se arma la tala
 * referencial); debajo, cada guía con sus avisos, trozas y talas.
 */

import { Loader2, RefreshCw } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { GrupoVista } from "./hooks/importar-guias-pantalla";
import type { ImportarGuias } from "./hooks/use-importar-guias";
import LothImportarGuiasGuia from "./LothImportarGuiasGuia";
import LothImportarGuiasPermiso, { ChipPermiso } from "./LothImportarGuiasPermiso";
import { Btn } from "./ctp-shared";

export default function LothImportarGuiasVista({ s }: { s: ImportarGuias }) {
  if (s.vista.cargando)
    return (
      <p className="flex items-center gap-2 p-8 text-sm text-[var(--text-secondary)]" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Trayendo{" "}
        {s.fuentes.length === 1 ? "la guía" : `las ${s.fuentes.length} guías`} y armando lo que
        entraría al libro…
      </p>
    );
  if (s.vista.error)
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
      >
        {s.vista.error}
        <Btn size="sm" variant="secondary" onClick={() => void s.pedirVistaPrevia()}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </Btn>
      </div>
    );
  if (s.grupos.length === 0)
    return <p className="p-6 text-sm text-[var(--text-secondary)]">No llegó ninguna guía.</p>;

  /* Hasta 3 guías, sus datos arrancan abiertos; con más, plegados (si no, un muro). */
  const totalGuias = s.grupos.reduce((a, g) => a + g.guias.length, 0);
  return (
    <div className="space-y-4">
      {s.grupos.map((grupo) => (
        <GrupoDeGuias key={grupo.clave} grupo={grupo} s={s} pocas={totalGuias <= 3} />
      ))}
    </div>
  );
}

function GrupoDeGuias({
  grupo,
  s,
  pocas,
}: {
  grupo: GrupoVista;
  s: ImportarGuias;
  pocas: boolean;
}) {
  const decision = s.decisiones[grupo.clave];
  const m3 = grupo.guias.reduce((a, g) => a + (g.guia?.volumenTrozasM3 ?? 0), 0);
  const sinPermiso = grupo.clave === "sin-permiso";

  return (
    <section className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`text-sm font-bold text-[var(--text-primary)] [overflow-wrap:anywhere] ${sinPermiso ? "" : "font-mono"}`}
        >
          {sinPermiso
            ? "Guías que no se pudieron traer"
            : (grupo.titulo ?? "Sin título habilitante")}
        </span>
        <ChipPermiso permiso={grupo.permiso} />
        <span className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]">
          {grupo.guias.length} {grupo.guias.length === 1 ? "guía" : "guías"} ·{" "}
          <span className="font-mono">{fmtM3(m3)} m³</span>
        </span>
      </header>
      {!sinPermiso && (
        <LothImportarGuiasPermiso
          grupo={grupo}
          decision={decision}
          onDecidir={(c) => s.decidir(grupo.clave, c)}
          onElegirPlan={(planId, crearTala) => void s.elegirPlanDelGrupo(grupo, planId, crearTala)}
          recalculando={s.recalculando.has(grupo.clave)}
        />
      )}
      <div className="space-y-2">
        {grupo.guias.map((g) => (
          <LothImportarGuiasGuia
            key={g.clave}
            g={g}
            incluida={!s.excluidas.has(g.clave)}
            onIncluir={(on) => s.incluir(g.clave, on)}
            conTala={decision?.crearTala ?? false}
            alDirectorio={s.alDirectorio[g.clave]}
            onDirectorio={(ficha, cambio) => s.decidirDirectorio(g.clave, ficha, cambio)}
            abiertaDeEntrada={pocas}
            motivoCupo={s.motivosCupo[g.clave] ?? ""}
            onMotivoCupo={(texto) => s.escribirMotivoCupo(g.clave, texto)}
          />
        ))}
      </div>
    </section>
  );
}
