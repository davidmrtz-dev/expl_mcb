# Explain My Codebase Agent (EMCB)

Agente **100% local** para indexar un repositorio y (en fases siguientes) responder preguntas sobre arquitectura, flujo y dependencias.

## Stack

| Capa | Tecnología |
|------|------------|
| Runtime | Node.js 20+ / TypeScript |
| Parsing | tree-sitter (JS/TS) |
| Embeddings | Ollama + `nomic-embed-text` |
| Storage | SQLite (`better-sqlite3`) |
| LLM (Fase 2) | Ollama + `qwen2.5-coder:7b` o `deepseek-coder` |

Sin LangChain, sin APIs cloud.

## Estructura de carpetas

```
expl_mcb/
├── src/
│   ├── cli.ts              # Entrada CLI
│   ├── config.ts           # Defaults + env
│   ├── scanner/            # Recorrido del repo
│   ├── parser/             # tree-sitter → símbolos
│   ├── chunker/            # Chunks por función/clase/bloque
│   ├── embeddings/         # Cliente Ollama embeddings
│   ├── storage/            # SQLite schema + CRUD
│   ├── retrieval/          # Cosine similarity + top-k
│   ├── context/            # Prompt / context builder
│   ├── llm/                # Ollama chat streaming
│   ├── pipeline/           # index + ask
│   ├── server.ts           # Fastify POST /ask
│   └── utils/              # Logger, hash
├── data/                   # index.db (gitignored)
├── TODO.md                 # Plan incremental por fases
└── package.json
```

## Arquitectura MVP (pipeline observable)

```
Repo path
    │
    ▼
[1] Scanner ──► lista de .ts/.js (ignora node_modules, dist, .git)
    │
    ▼
[2] Parser (tree-sitter) ──► símbolos con líneas (function, class, …)
    │
    ▼
[3] Chunker ──► texto + metadata (archivo, símbolo, líneas, hash)
    │
    ▼
[4] Embeddings (Ollama, batches pequeños) ──► vectores
    │
    ▼
[5] SQLite ──► repos | chunks | embeddings
```

**Fase 2 — ask:**

```
Pregunta
    ▼
Embed pregunta (mismo modelo que index)
    ▼
Cosine top-k sobre chunks en SQLite
    ▼
Context builder → prompt
    ▼
Ollama chat (stream) → respuesta
```

**Fase 3:** grafo de imports, endpoints, flujos entre archivos.  
**Fase 3:** grafo de imports, endpoints, flujos entre archivos.

## Requisitos previos

**Node.js (nvm)** — el proyecto fija **Node 20 LTS** en `.nvmrc` (buen soporte para módulos nativos: `tree-sitter`, `better-sqlite3`).

```bash
# Desde la raíz del repo
nvm install    # lee .nvmrc e instala Node 20 si falta
nvm use        # activa esa versión en la shell actual

# Instalar Ollama: https://ollama.com
ollama pull nomic-embed-text
ollama pull qwen2.5-coder:7b   # o deepseek-coder, según OLLAMA_CHAT_MODEL
```

## Uso — Fase 1 (indexar)

```bash
nvm use
npm install
npm run index -- --repo /ruta/a/tu/proyecto

# Indexar este mismo repo (prueba rápida)
npm run index -- --repo .
```

Variables opcionales (ver `.env.example`):

- `OLLAMA_HOST` — default `http://127.0.0.1:11434`
- `OLLAMA_EMBED_MODEL` — default `nomic-embed-text`
- `EMCB_DB_PATH` — default `./data/index.db`
- `OLLAMA_CHAT_MODEL` — default `qwen2.5-coder:7b`
- `EMCB_TOP_K` — chunks recuperados (default `4`)
- `EMCB_MAX_CONTEXT_CHARS` — techo de contexto (default `6000`)
- `EMCB_CHAT_MAX_TOKENS` — largo máx. respuesta (default `768`; baja a `384` si priorizas velocidad)

Si sigue lento: modelo más pequeño (`OLLAMA_CHAT_MODEL=deepseek-coder:1.3b`) o baja `EMCB_TOP_K` a `3`.

## Uso — Fase 2 (preguntar)

**CLI** (streaming a stdout):

```bash
npm run ask -- "¿Qué hace el pipeline de indexación?"
npm run ask -- --repo . "¿Dónde se generan los embeddings?"
```

**Servidor** (SSE):

```bash
npm run serve
# POST http://127.0.0.1:3040/ask  body: { "question": "..." }
curl -N -X POST http://127.0.0.1:3040/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"¿Cómo funciona el chunker?"}'
```

Eventos SSE: `sources` → `token` (×N) → `done`. Sin streaming: `"stream": false`.

## Scripts npm

| Script | Descripción |
|--------|-------------|
| `npm run index` | Indexa un repo (`--repo`) |
| `npm run ask` | Pregunta con RAG local |
| `npm run serve` | API HTTP `POST /ask` |
| `npm run build` | Compila TypeScript → `dist/` |
| `npm run index:build` | Index con build previo |
| `npm run typecheck` | Verificación de tipos |

## Decisiones de diseño (Fase 1)

1. **Sin sqlite-vec aún**: vectores en JSON; búsqueda brute-force en memoria en Fase 2 (suficiente para repos medianos y modelos pequeños).
2. **Batches de 4 embeddings**: menor pico de RAM.
3. **Chunks por símbolo AST**: mejor contexto que ventanas fijas; fallback por líneas si el parse falla.
4. **Logs con timestamp**: pipeline depurable sin frameworks.

Ver progreso detallado en [TODO.md](./TODO.md).
