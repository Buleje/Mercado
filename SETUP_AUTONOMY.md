# SETUP AUTONOMY — Bloque sudo (1 vez, 30 segundos)

> Brandon: corré ESTO en tu **terminal Windows** (WSL bash), **fuera de Claude Code** porque el bash-guard bloquea `sudo`.
> Después de correrlo, todo lo demás funciona automático para siempre.

## 1. Habilitar linger (Qdrant + servicios sobreviven reinicio sin abrir shell)

```bash
sudo loginctl enable-linger usuario
```

**Verificación**: `loginctl show-user usuario | grep Linger` → `Linger=yes`

**Beneficio**: después de un `wsl --shutdown`, Qdrant y tus servicios systemd user (dev-buleje, health-monitor, log-watcher) arrancan solos sin abrir bash.

---

## 2. Instalar `fd` (alternativa moderna a `find`, 5× más rápido)

```bash
sudo apt update && sudo apt install -y fd-find ripgrep build-essential
```

**Notas**:
- `fd-find` se instala como `fdfind`; ya tenés alias `fd` en `~/.bashrc.d/buleje.sh`.
- `build-essential` (gcc/make) es para paquetes node nativos (sharp, bcrypt, etc.).
- `ripgrep` ya estaba pero confirmamos versión.

---

## 3. DNS fix Supabase (desbloquear migrations)

Esto resuelve el bug del `improvement-radar` línea 49: P1001 — DNS WSL no resuelve `db.<ref>.supabase.co`.

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true

[user]
default=usuario

[network]
generateResolvConf=false
EOF

sudo rm -f /etc/resolv.conf
sudo tee /etc/resolv.conf > /dev/null <<'EOF'
nameserver 1.1.1.1
nameserver 1.0.0.1
nameserver 8.8.8.8
options edns0
EOF

sudo chattr +i /etc/resolv.conf
```

**Después**: en PowerShell de Windows: `wsl --shutdown` y reabrí WSL. Probá:
```bash
nslookup db.uunmgkysfngxjncrlchx.supabase.co  # tu ref real
```
Si responde IPv4, podés correr `prisma migrate deploy` sin workarounds SQL.

---

## 4. Permitir Claude Code escribir en logs system-wide (opcional, no recomendado)

NO lo hagas si querés mantener separación de privilegios. Saltear.

---

## ✅ Después de correr 1, 2 y 3:

Volvé a Claude Code y decime "ya corrí setup autonomy". Yo verifico:
- Linger activo
- `fd` resuelve
- DNS Supabase resuelve
- Reinicio servicios y arrancamos las migrations bloqueadas hace 5 días.

---

## Lo que YA quedó automático (sin sudo)

| Capa | Archivo |
|---|---|
| Aliases productivos | `~/.bashrc.d/buleje.sh` |
| Health monitor cada 5 min | `systemctl --user list-timers` |
| Nightly cleanup 03:00 | `crontab -l` |
| Qdrant persistente | `systemctl --user status qdrant` |
| Dev server opt-in | `systemctl --user start dev-buleje` |
| Log watcher opt-in | `systemctl --user start log-watcher` |

Comandos rápidos disponibles ahora en cualquier shell nuevo:
- `bsm` → cd al proyecto
- `bsm-status` → snapshot completo
- `bsm-health` → dev + qdrant
- `dev-health` → solo HTTP probe a localhost:3000
- `kill-dev` → mata dev server limpio
- `gs / gd / gl / gst` → git rápido
- `topmem / topcpu` → procesos pesados
- `ports` → qué escucha en puertos comunes
- `Ctrl+R` → fuzzy history (fzf)
- `Ctrl+T` → fuzzy file finder (fzf)
- `Alt+C` → fuzzy cd (fzf)
