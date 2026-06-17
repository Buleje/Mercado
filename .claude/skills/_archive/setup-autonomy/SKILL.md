---
name: setup-autonomy
description: Setup one-shot para máxima autonomía Claude. Imprime los comandos de sudo que Brandon debe correr UNA VEZ para habilitar Playwright headless, OCR (Tesseract), y otros componentes que requieren elevación. Usar cuando Brandon diga "instala lo que falta para autonomía" o "pasame los sudo".
user-invocable: true
model: sonnet
allowed-tools: Read, Bash, Grep, Glob
---

# /setup-autonomy — Comandos one-shot de elevación

## ¿Por qué un skill aparte?

Estos comandos requieren `sudo` y no podemos correrlos automáticamente.
Pegalos UNA VEZ en tu terminal — luego mi autonomía sube de golpe.

## Bloque 1 — Playwright headless real

```bash
sudo apt-get update && sudo apt-get install -y \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libasound2t64
```

→ Después: `npx playwright install chromium` (sin sudo) → Playwright queda 100% funcional, dejando libre el Chrome de Windows.

## Bloque 2 — Tesseract OCR

```bash
sudo apt-get install -y tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng
```

→ Después puedo extraer texto exacto de cualquier screenshot:
```bash
tesseract /tmp/screenshot.png - -l spa+eng
```

## Bloque 3 — Telegram bot (sin sudo, pero necesita tu input)

1. Telegram → buscá `@BotFather` → mandá `/newbot` → seguí pasos.
2. Copiá el token que te da (formato `123456:ABC-DEF...`).
3. Mandale `/start` al bot recién creado.
4. Abrí en navegador: `https://api.telegram.org/bot<TU_TOKEN>/getUpdates` → buscá `"chat":{"id":XXXX,...`.
5. Pegá:

```bash
cat > ~/.bsm-notify.env << 'EOF'
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789
EOF
chmod 600 ~/.bsm-notify.env
```

Test: `node .claude/skills/notify/send.mjs "test desde Claude"` — debería llegarte al chat.

## Bloque 4 — Verificación final

```bash
echo "tmux: $(tmux -V)"
echo "tesseract: $(tesseract --version 2>&1 | head -1)"
echo "playwright chromium: $(test -f ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome && echo OK || echo MISSING)"
echo "telegram cfg: $(test -f ~/.bsm-notify.env && echo OK || echo MISSING)"
```

Cuando todos digan OK / versión, mi autonomía está al máximo.
