"use client";

import React, { useState, useEffect } from "react";
import { UserCircle, Mail, Phone, Shield, Key, Save, Loader2, CheckCircle } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { cn } from "@/lib/utils";

interface UserProfile {
  username: string;
  email: string;
  phone: string;
  role: string;
  createdAt?: string;
}

export default function MiPerfilTab() {
  const [profile, setProfile] = useState<UserProfile>({
    username: "",
    email: "",
    phone: "",
    role: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setProfile({
            username: d.username ?? d.name ?? "",
            email: d.email ?? "",
            phone: d.phone ?? "",
            role: d.role ?? "admin",
            createdAt: d.createdAt,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: profile.username,
          phone: profile.phone,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setEditMode(false);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordError("");
    if (newPassword.length < 6) {
      setPasswordError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Las contraseñas no coinciden");
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setShowPasswordForm(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const d = await res.json().catch(() => null);
        setPasswordError(d?.error ?? "Error al cambiar contraseña");
      }
    } catch {
      setPasswordError("Error de conexión");
    } finally {
      setPasswordSaving(false);
    }
  };

  const initials = profile.username
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <AdminModuleHeader
        title="Mi Perfil"
        description="Tu información personal y preferencias de seguridad"
        icon={UserCircle}
      />

      {/* Profile Card */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden">
        {/* Header banner */}
        <div className="h-20 bg-linear-to-r from-primary/80 to-primary/40" />

        <div className="px-6 pb-6">
          {/* Avatar overlapping banner */}
          <div className="flex items-end gap-4 -mt-10 mb-6">
            <div className="relative">
              <div className="h-20 w-20 rounded-2xl bg-primary flex items-center justify-center border-4 border-white dark:border-card shadow-lg">
                <span className="text-white text-2xl font-bold">{initials}</span>
              </div>
            </div>
            <div className="pb-1">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white capitalize">{profile.username || "Usuario"}</h2>
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                profile.role === "admin" ? "bg-primary/10 text-primary" :
                profile.role === "cajero" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
              )}>
                <Shield className="h-3 w-3" />
                {profile.role === "admin" ? "Administrador" :
                 profile.role === "cajero" ? "Cajero" :
                 profile.role === "almacenero" ? "Almacenero" : profile.role}
              </span>
            </div>
          </div>

          {/* Info fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Username */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 block">Nombre</label>
                {editMode ? (
                  <input
                    type="text"
                    value={profile.username}
                    onChange={e => setProfile(p => ({ ...p, username: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-900 dark:text-white capitalize px-3 py-2.5">{profile.username || "—"}</p>
                )}
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> Correo electrónico
                </label>
                <p className="text-sm font-medium text-gray-900 dark:text-white px-3 py-2.5">{profile.email || "—"}</p>
              </div>

              {/* Phone */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> Teléfono
                </label>
                {editMode ? (
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+51 999 999 999"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-900 dark:text-white px-3 py-2.5">{profile.phone || "No registrado"}</p>
                )}
              </div>

              {/* Role (read-only) */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 flex items-center gap-1.5">
                  <Shield className="h-3 w-3" /> Rol
                </label>
                <p className="text-sm font-medium text-gray-900 dark:text-white px-3 py-2.5 capitalize">{profile.role}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              {editMode ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-card-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-accent transition-colors"
                >
                  Editar perfil
                </button>
              )}
              {saved && (
                <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400 font-medium">
                  <CheckCircle className="h-4 w-4" /> Guardado
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Security Section */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Key className="h-5 w-5 text-gray-500" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Seguridad</h3>
        </div>

        {!showPasswordForm ? (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-card-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-accent transition-colors"
          >
            <Key className="h-4 w-4" />
            Cambiar contraseña
          </button>
        ) : (
          <div className="space-y-3 max-w-sm">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 block">Contraseña actual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 block">Nueva contraseña</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 block">Confirmar contraseña</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            {passwordError && (
              <p className="text-xs text-red-500 font-medium">{passwordError}</p>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handlePasswordChange}
                disabled={passwordSaving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {passwordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                Cambiar
              </button>
              <button
                onClick={() => { setShowPasswordForm(false); setPasswordError(""); }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
