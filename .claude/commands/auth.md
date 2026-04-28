---
description: Login admin (qaadmin/main) + persiste cookies/CSRF en /tmp/bsm-auth.env para uso curl/fetch
allowed-tools: Bash(node scripts/dev-helpers/admin-auth.mjs)
---

Ejecutá `node scripts/dev-helpers/admin-auth.mjs`. Reportá si OK + 1 línea con instrucción de uso:

```
source /tmp/bsm-auth.env
curl $BSM_BASE/api/admin/X $BSM_CURL_FLAGS
```

Si fall login (HTTP != 200), sugerí correr antes `DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/create-qa-admin-raw.mjs` para crear el QA admin.
