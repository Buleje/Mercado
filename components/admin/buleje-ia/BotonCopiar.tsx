"use client";

/** Copia al portapapeles y dice «Copiado» un momento (con respaldo si el navegador no deja). */
import { useEffect, useState } from "react";
import { Check, Copy } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin permiso de portapapeles (http, iframe): el truco del textarea.
    const t = document.createElement("textarea");
    t.value = texto;
    t.setAttribute("readonly", "");
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

export function BotonCopiar({ texto, etiqueta = "Copiar", variante = "secondary" }: { texto: string; etiqueta?: string; variante?: "secondary" | "primary" }) {
  const [hecho, setHecho] = useState<null | boolean>(null);
  useEffect(() => {
    if (hecho === null) return;
    const t = setTimeout(() => setHecho(null), 2000);
    return () => clearTimeout(t);
  }, [hecho]);

  return (
    <Button variant={variante} onClick={async () => setHecho(await copiar(texto))} aria-live="polite">
      {hecho ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {hecho === true ? "Copiado" : hecho === false ? "No se pudo copiar" : etiqueta}
    </Button>
  );
}
