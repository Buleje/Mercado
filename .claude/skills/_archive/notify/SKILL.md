---
name: notify
description: Envía notificación push a Brandon vía Telegram cuando termina una tarea larga. Usar al final de loops/sprints autónomos o cuando una tarea tarda >5 min.
user-invocable: true
model: sonnet
allowed-tools: Read, Bash, Grep, Glob
---

# /notify — Push notification a Brandon

## Cuándo usarlo

Cuando termino una tarea **larga** (loop, sprint, deploy, build) y Brandon no está mirando la sesión.

## Cómo funciona

```bash
node .claude/skills/notify/send.mjs "<mensaje>"
```

El script lee `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` desde `~/.bsm-notify.env` o variables de entorno.

## Setup inicial (una vez)

1. Hablale a `@BotFather` en Telegram → `/newbot` → seguí pasos.
2. Copiá el token (`123456:ABC-DEF1234...`).
3. Hablale al bot recién creado y mandale `/start`.
4. Visitá `https://api.telegram.org/bot<TOKEN>/getUpdates` → buscá `chat.id`.
5. Guardá:

```bash
cat > ~/.bsm-notify.env << 'EOF'
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789
EOF
chmod 600 ~/.bsm-notify.env
```

## Fallbacks

Si Telegram no está configurado, intenta en orden:
1. **Sound** — beep de Windows (PowerShell)
2. **Toast** — notificación de Windows
3. **Log** — escribe a `.claude/notify.log` (último recurso)
