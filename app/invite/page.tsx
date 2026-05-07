"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, Mail, Building2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

interface InviteInfo {
  email: string;
  role: string;
  tenantName: string;
  tenantSlug: string;
  expiresAt: string;
}

export default function InvitePage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "accepted">("loading");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [reason, setReason] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("invalid"); setReason("Token faltante"); return; }

    fetch(`/api/invite?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { valid?: boolean; reason?: string } & Partial<InviteInfo>) => {
        if (data.valid) {
          setInfo({
            email: data.email!,
            role: data.role!,
            tenantName: data.tenantName!,
            tenantSlug: data.tenantSlug!,
            expiresAt: data.expiresAt!,
          });
          setStatus("valid");
        } else {
          const msg =
            data.reason === "already_accepted"
              ? "Esta invitación ya fue aceptada."
              : data.reason === "expired"
              ? "Esta invitación ha expirado. Solicita una nueva."
              : "Invitación no encontrada o inválida.";
          setReason(msg);
          setStatus("invalid");
        }
      })
      .catch(() => { setReason("Error de red"); setStatus("invalid"); });
  }, [token]);

  const handleAccept = async () => {
    if (!token || accepting) return;
    setAccepting(true);
    try {
      const res = await fetch("/api/invite", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setReason(d.error ?? "Error al aceptar");
        setStatus("invalid");
        return;
      }
      setStatus("accepted");
      // Redirect to admin login after a short delay
      setTimeout(() => router.push("/admin/login"), 2500);
    } finally {
      setAccepting(false);
    }
  };

  const roleLabel: Record<string, string> = {
    admin: "Administrador",
    editor: "Editor",
    viewer: "Viewer",
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-6">
        {/* Loading */}
        {status === "loading" && (
          <>
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mx-auto" />
            <p className="text-gray-400">Verificando invitación…</p>
          </>
        )}

        {/* Invalid */}
        {status === "invalid" && (
          <>
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
            <h1 className="text-xl font-bold text-white">Invitación inválida</h1>
            <p className="text-gray-400 text-sm">{reason}</p>
            <Link
              href="/"
              className="inline-block mt-2 text-indigo-400 hover:text-indigo-300 text-sm underline"
            >
              Volver al inicio
            </Link>
          </>
        )}

        {/* Valid — awaiting acceptance */}
        {status === "valid" && info && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Tienes una invitación</h1>
              <p className="text-gray-400 text-sm mt-1">
                Para unirte a la tienda como{" "}
                <span className="text-indigo-300 font-semibold">
                  {roleLabel[info.role] ?? info.role}
                </span>
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm text-left">
              <div className="flex items-center gap-2 text-gray-300">
                <Building2 className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="font-medium">{info.tenantName}</span>
                <span className="text-gray-600 font-mono text-xs">({info.tenantSlug})</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                <span>{info.email}</span>
              </div>
              <p className="text-gray-600 text-xs">
                Expira:{" "}
                {new Date(info.expiresAt).toLocaleString("es-PE", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold transition-colors"
            >
              {accepting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Aceptando…</>
              ) : (
                "Aceptar invitación"
              )}
            </button>

            <p className="text-gray-600 text-xs">
              Al aceptar podrás iniciar sesión en el panel de administración.
            </p>
          </>
        )}

        {/* Accepted */}
        {status === "accepted" && (
          <>
            <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto" />
            <h1 className="text-xl font-bold text-white">¡Invitación aceptada!</h1>
            <p className="text-gray-400 text-sm">
              Redirigiendo al panel de administración…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
