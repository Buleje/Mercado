#!/usr/bin/env bash
# ubuntu-herramientas.sh — revisa y actualiza las herramientas de terminal de
# Ubuntu/WSL2 (binarios sueltos en ~/.local/bin, bajados de GitHub Releases).
#
# Uso:
#   bash scripts/ubuntu-herramientas.sh              # = --revisar (no instala nada)
#   bash scripts/ubuntu-herramientas.sh --revisar    # tabla herramienta | instalada | última | estado
#   bash scripts/ubuntu-herramientas.sh --actualizar # instala o actualiza SOLO lo que está atrás o falta
#
# Reglas: idempotente (2.ª corrida = 0 cambios) · el binario viejo se copia a
# ~/.local/bin/.respaldo/<nombre>-<versión> antes de reemplazarlo · un fallo de una
# herramienta no corta las demás · nada de `curl | sh` (se usa `gh release download`).
# La última línea es el resumen que lee el mantenimiento semanal:
#   herramientas: N al día, M actualizadas, K fallaron
#
# Requiere: gh autenticado, tar, xz. Se prefieren assets musl (estáticos).
# Para agregar una herramienta: una línea en HERRAMIENTAS (ver formato abajo).
set -euo pipefail

MODO="revisar"
case "${1:-}" in
  ""|--revisar) MODO="revisar" ;;
  --actualizar) MODO="actualizar" ;;
  *) echo "uso: $0 [--revisar|--actualizar]" >&2; exit 2 ;;
esac

DEST="$HOME/.local/bin"
RESPALDO="$DEST/.respaldo"
export PATH="$DEST:$PATH"
mkdir -p "$DEST"

# nombre|repo GitHub|asset ({t}=tag con v, {v}=sin v)|tipo (tar = archivo, raw = binario suelto)
HERRAMIENTAS=(
  "fzf|junegunn/fzf|fzf-{v}-linux_amd64.tar.gz|tar"
  "rg|BurntSushi/ripgrep|ripgrep-{v}-x86_64-unknown-linux-musl.tar.gz|tar"
  "delta|dandavison/delta|delta-{v}-x86_64-unknown-linux-musl.tar.gz|tar"
  "difft|Wilfred/difftastic|difft-{v}-x86_64-unknown-linux-musl.tar.gz|tar"
  "shfmt|mvdan/sh|shfmt_{t}_linux_amd64|raw"
  "shellcheck|koalaman/shellcheck|shellcheck-{t}.linux.x86_64.tar.xz|tar"
  "k6|grafana/k6|k6-{t}-linux-amd64.tar.gz|tar"
  "sd|chmln/sd|sd-{t}-x86_64-unknown-linux-musl.tar.gz|tar"
  "dust|bootandy/dust|dust-{t}-x86_64-unknown-linux-musl.tar.gz|tar"
  "duf|muesli/duf|duf_{v}_linux_x86_64.tar.gz|tar"
  "eza|eza-community/eza|eza_x86_64-unknown-linux-musl.tar.gz|tar"
  "tldr|tealdeer-rs/tealdeer|tealdeer-linux-x86_64-musl|raw"
  "zoxide|ajeetdsouza/zoxide|zoxide-{v}-x86_64-unknown-linux-musl.tar.gz|tar"
  "starship|starship/starship|starship-x86_64-unknown-linux-musl.tar.gz|tar"
  "lazygit|jesseduffield/lazygit|lazygit_{v}_linux_x86_64.tar.gz|tar"
  "atuin|atuinsh/atuin|atuin-x86_64-unknown-linux-musl.tar.gz|tar"
  "btop|aristocratos/btop|btop-x86_64-unknown-linux-musl.tar.gz|tar"
  "direnv|direnv/direnv|direnv.linux-amd64|raw"
  "yq|mikefarah/yq|yq_linux_amd64|raw"
  "just|casey/just|just-{v}-x86_64-unknown-linux-musl.tar.gz|tar"
  "watchexec|watchexec/watchexec|watchexec-{v}-x86_64-unknown-linux-musl.tar.xz|tar"
  "hyperfine|sharkdp/hyperfine|hyperfine-{t}-x86_64-unknown-linux-musl.tar.gz|tar"
  "bat|sharkdp/bat|bat-{t}-x86_64-unknown-linux-musl.tar.gz|tar"
)

# Versión que imprime el binario cuando difiere de la del tag (bug de upstream).
# sd v1.1.0 se publica pero `sd --version` dice 1.0.0.
declare -A REPORTA=( ["sd@1.1.0"]="1.0.0" )

TMP_RAIZ="$(mktemp -d "${TMPDIR:-/tmp}/ubuntu-herramientas.XXXXXX")"
trap 'rm -rf "$TMP_RAIZ"' EXIT

AL_DIA=0; ACTUALIZADAS=0; FALLARON=0; PENDIENTES=0
FILAS=(); DETALLES=()

# Primera versión x.y(.z) que imprime `<bin> --version`; vacío si no existe o no corre.
version_de() {
  local bin="$1"
  [[ -x "$bin" ]] || return 0
  "$bin" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 || true
}

# Binario a medir: el de ~/.local/bin; si no hay, el que resuelva el PATH (apt).
binario_actual() {
  local n="$1"
  if [[ -x "$DEST/$n" ]]; then echo "$DEST/$n"; else command -v "$n" 2>/dev/null || true; fi
}

# Instala una herramienta. Devuelve 1 con el motivo en $MOTIVO si falla.
instalar() {
  local n="$1" repo="$2" patron="$3" tipo="$4" tag="$5" actual_ver="$6"
  local v="${tag#v}" asset dir bin
  asset="${patron//\{t\}/$tag}"; asset="${asset//\{v\}/$v}"
  dir="$(mktemp -d "$TMP_RAIZ/$n.XXXXXX")"
  if ! gh release download -R "$repo" -p "$asset" -D "$dir" >/dev/null 2>&1; then
    MOTIVO="sin asset '$asset' en $tag"; return 1
  fi
  if [[ "$tipo" == "tar" ]]; then
    mkdir -p "$dir/x"
    tar -xf "$dir/$asset" -C "$dir/x" 2>/dev/null || { MOTIVO="no se pudo extraer $asset"; return 1; }
    bin="$(find "$dir/x" -type f -name "$n" | head -1)"
    [[ -n "$bin" ]] || { MOTIVO="el archivo no trae '$n'"; return 1; }
  else
    bin="$dir/$asset"
  fi
  chmod +x "$bin"
  # El binario nuevo tiene que correr y decir la versión esperada antes de tocar el viejo.
  local nueva; nueva="$(version_de "$bin")"
  [[ -n "$nueva" ]] || { MOTIVO="el binario nuevo no corre (--version vacío)"; return 1; }
  [[ "$nueva" == "${REPORTA[$n@$v]:-$v}" ]] || { MOTIVO="versión descargada $nueva ≠ $v"; return 1; }
  # Respaldo del viejo (cp -L: si era symlink, guarda el contenido real).
  if [[ -e "$DEST/$n" ]]; then
    mkdir -p "$RESPALDO"
    cp -L "$DEST/$n" "$RESPALDO/$n-${actual_ver:-desconocida}" || { MOTIVO="no se pudo respaldar"; return 1; }
  fi
  install -m 755 "$bin" "$DEST/.$n.nuevo" || { MOTIVO="install falló"; return 1; }
  mv -f "$DEST/.$n.nuevo" "$DEST/$n"   # mv reemplaza el symlink, no su destino
  # Hermano opcional del mismo archivo (uv trae uvx).
  if [[ -n "${EXTRA:-}" ]]; then
    local h; h="$(find "$dir/x" -type f -name "$EXTRA" | head -1)"
    [[ -n "$h" ]] && install -m 755 "$h" "$DEST/$EXTRA"
  fi
  rm -rf "$dir"
}

# atuin tiene una segunda copia en ~/.atuin/bin: queda como symlink a la de ~/.local/bin.
unificar_atuin() {
  local otra="$HOME/.atuin/bin/atuin"
  if [[ -f "$otra" && ! -L "$otra" && -x "$DEST/atuin" ]]; then
    mkdir -p "$RESPALDO"
    cp "$otra" "$RESPALDO/atuin-atuin-bin-$(version_de "$otra")"
    ln -sf "$DEST/atuin" "$otra"
    DETALLES+=("atuin: ~/.atuin/bin/atuin ahora es symlink a ~/.local/bin/atuin")
  fi
}

procesar() {
  local n="$1" repo="$2" patron="$3" tipo="$4"
  local tag actual_ver ver_ultima estado
  if ! tag="$(gh release view -R "$repo" --json tagName -q .tagName 2>/dev/null)" || [[ -z "$tag" ]]; then
    FILAS+=("$n|?|?|FALLÓ (no se pudo leer la última versión)"); FALLARON=$((FALLARON+1)); return
  fi
  ver_ultima="${tag#v}"
  local ver_cmp="${REPORTA[$n@$ver_ultima]:-$ver_ultima}"
  actual_ver="$(version_de "$(binario_actual "$n")")"

  if [[ -n "$actual_ver" && "$(printf '%s\n%s\n' "$actual_ver" "$ver_cmp" | sort -V | tail -1)" == "$actual_ver" ]]; then
    FILAS+=("$n|$actual_ver|$ver_ultima|al día"); AL_DIA=$((AL_DIA+1))
    if [[ "$n" == "atuin" && "$MODO" == "actualizar" ]]; then unificar_atuin; fi
    return 0
  fi
  estado="falta"; [[ -n "$actual_ver" ]] && estado="atrás"
  if [[ "$MODO" == "revisar" ]]; then
    FILAS+=("$n|${actual_ver:--}|$ver_ultima|$estado"); PENDIENTES=$((PENDIENTES+1)); return
  fi
  MOTIVO=""
  if instalar "$n" "$repo" "$patron" "$tipo" "$tag" "$actual_ver"; then
    FILAS+=("$n|${actual_ver:--}→$(version_de "$DEST/$n")|$ver_ultima|actualizada (era: $estado)"); ACTUALIZADAS=$((ACTUALIZADAS+1))
    if [[ "$n" == "atuin" ]]; then unificar_atuin; fi
  else
    FILAS+=("$n|${actual_ver:--}|$ver_ultima|FALLÓ: $MOTIVO"); FALLARON=$((FALLARON+1))
  fi
  return 0
}

# uv no sale de GitHub: se actualiza con su propio `uv self update`.
procesar_uv() {
  local antes ultima tag
  antes="$(version_de "$(binario_actual uv)")"
  if ! tag="$(gh release view -R astral-sh/uv --json tagName -q .tagName 2>/dev/null)" || [[ -z "$tag" ]]; then
    FILAS+=("uv|${antes:--}|?|FALLÓ (no se pudo leer la última versión)"); FALLARON=$((FALLARON+1)); return
  fi
  ultima="${tag#v}"
  if [[ -n "$antes" && "$(printf '%s\n%s\n' "$antes" "$ultima" | sort -V | tail -1)" == "$antes" ]]; then
    FILAS+=("uv|$antes|$ultima|al día"); AL_DIA=$((AL_DIA+1)); return
  fi
  if [[ "$MODO" == "revisar" ]]; then
    FILAS+=("uv|${antes:--}|$ultima|atrás"); PENDIENTES=$((PENDIENTES+1)); return
  fi
  if [[ -z "$antes" ]]; then
    FILAS+=("uv|-|$ultima|FALLÓ: uv no está instalado (instalarlo a mano una vez)"); FALLARON=$((FALLARON+1)); return
  fi
  mkdir -p "$RESPALDO"; cp -L "$(binario_actual uv)" "$RESPALDO/uv-$antes" 2>/dev/null || true
  # 1.º `uv self update`; si este uv no vino del instalador oficial (sin recibo),
  # se baja el asset musl del release, igual que el resto.
  local via="uv self update"
  if ! uv self update >/dev/null 2>&1; then
    via="release GitHub"
    MOTIVO=""
    if EXTRA=uvx instalar uv astral-sh/uv "uv-x86_64-unknown-linux-musl.tar.gz" tar "$tag" "$antes"; then
      :
    else
      FILAS+=("uv|$antes|$ultima|FALLÓ: $MOTIVO"); FALLARON=$((FALLARON+1)); return
    fi
  fi
  FILAS+=("uv|$antes→$(version_de "$(binario_actual uv)")|$ultima|actualizada ($via)"); ACTUALIZADAS=$((ACTUALIZADAS+1))
}

for fila in "${HERRAMIENTAS[@]}"; do
  IFS='|' read -r n repo patron tipo <<<"$fila"
  procesar "$n" "$repo" "$patron" "$tipo" || { FILAS+=("$n|?|?|FALLÓ (error inesperado)"); FALLARON=$((FALLARON+1)); }
done
procesar_uv || { FILAS+=("uv|?|?|FALLÓ (error inesperado)"); FALLARON=$((FALLARON+1)); }

# En la columna «instalada», una actualización se muestra como antes→ahora (medido de nuevo).
{
  echo "herramienta|instalada|última|estado"
  printf '%s\n' "${FILAS[@]}"
} | column -t -s'|'
for d in "${DETALLES[@]:-}"; do [[ -n "$d" ]] && echo "· $d"; done
[[ "$MODO" == "revisar" && $PENDIENTES -gt 0 ]] && echo "· pendientes: $PENDIENTES (correr con --actualizar)"
echo "herramientas: $AL_DIA al día, $ACTUALIZADAS actualizadas, $FALLARON fallaron"
[[ $FALLARON -eq 0 ]]
