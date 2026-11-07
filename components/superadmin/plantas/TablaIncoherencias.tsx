"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeStatus, DataTable } from "@buleje/design-system";
import { ExternalLink } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { suplantarTienda } from "@/components/superadmin/tenants/abrir-panel-tienda";
import type { IncoherenciaPlanta } from "@/lib/superadmin/plantas-forestales/tipos";
import { GRAVEDAD, m3, ORIGEN } from "./formato";

interface Props {
  items: IncoherenciaPlanta[];
  /** El slug de cada planta: sin él no se puede entrar a su libro. */
  slugDe: (tenantId: string) => string | null;
  /** En la lista de todas las plantas: columna «Planta» con enlace a su ficha. */
  conPlanta?: boolean;
}

function M3EnJuego({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-[var(--text-tertiary)]" title="Esta no se mide en m³">—</span>;
  return <span className="tabular-nums">{m3(valor)}</span>;
}

/** «Ver en su libro»: entra como esa planta (respeta el candado: 423 → Credenciales) en la vista exacta. */
function VerEnLibro({ it, slug }: { it: IncoherenciaPlanta; slug: string | null }) {
  const [estado, setEstado] = useState<"listo" | "abriendo" | "error">("listo");
  if (!slug) return <span className="text-[var(--text-tertiary)]">—</span>;
  const abrir = async () => {
    setEstado("abriendo");
    const r = await suplantarTienda(slug, undefined, it.enlaceLibro);
    setEstado(r === "error" ? "error" : "listo");
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" onClick={() => void abrir()} disabled={estado === "abriendo"} title="Entra como esta planta y abre su libro donde está la diferencia">
        <ExternalLink className="h-4 w-4" aria-hidden />
        {estado === "abriendo" ? "Abriendo…" : "Ver en su libro"}
      </Button>
      {estado === "error" && <span role="alert" className="text-[length:var(--ts-xs)] text-[var(--data-error)]">No se pudo entrar. Prueba de nuevo.</span>}
    </div>
  );
}

function Planta({ it }: { it: IncoherenciaPlanta }) {
  return (
    <Link href={`/superadmin/plantas/${encodeURIComponent(it.tenantId)}`} className="font-semibold text-[var(--text-primary)] hover:underline">
      {it.plantaNombre}
    </Link>
  );
}

function Que({ it }: { it: IncoherenciaPlanta }) {
  return (
    <div className="min-w-0">
      <div className="font-semibold text-[var(--text-primary)]">{it.titulo}</div>
      <div className="text-[var(--text-secondary)]">{it.detalle}</div>
    </div>
  );
}

/** Incoherencias del libro: tabla en computadora, tarjetas en el celular. */
export function TablaIncoherencias({ items, slugDe, conPlanta }: Props) {
  return (
    <>
      <div className="hidden md:block">
        <DataTable>
          <thead>
            <tr>
              <th>Gravedad</th>
              {conPlanta && <th>Planta</th>}
              <th>Qué pasa</th>
              <th>Dónde</th>
              <th className="text-right">m³ en juego</th>
              <th aria-label="Acción" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={`${it.tenantId}:${it.id}`} className="align-top">
                <td><BadgeStatus variant={GRAVEDAD[it.gravedad].variante} label={GRAVEDAD[it.gravedad].rotulo} size="sm" dot /></td>
                {conPlanta && <td><Planta it={it} /></td>}
                <td className="max-w-md"><Que it={it} /></td>
                <td className="whitespace-nowrap text-[var(--text-secondary)]">{ORIGEN[it.origen]}</td>
                <td className="text-right"><M3EnJuego valor={it.m3EnJuego} /></td>
                <td className="text-right"><VerEnLibro it={it} slug={slugDe(it.tenantId)} /></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <ul className="space-y-3 md:hidden">
        {items.map((it) => (
          <li key={`${it.tenantId}:${it.id}`} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <BadgeStatus variant={GRAVEDAD[it.gravedad].variante} label={GRAVEDAD[it.gravedad].rotulo} size="sm" dot />
              <span className="font-semibold"><M3EnJuego valor={it.m3EnJuego} /></span>
            </div>
            {conPlanta && <div className="mt-2"><Planta it={it} /></div>}
            <div className="mt-1"><Que it={it} /></div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[var(--text-tertiary)]">{ORIGEN[it.origen]}</span>
              <VerEnLibro it={it} slug={slugDe(it.tenantId)} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
