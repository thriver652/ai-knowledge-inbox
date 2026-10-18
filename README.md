# AI Knowledge Inbox

**Save notes and web links. Ask questions about them. Get answers that show exactly where they came from.**

![Knowledge Inbox: saved items on the left, a cited answer with its source on the right](docs/screenshot.png)

> 📐 **Reviewing this project?** Design decisions, tradeoffs, what breaks at scale and production changes are in **[docs/DESIGN.md](docs/DESIGN.md)**.

---

## What it does

1. **You save things:** a plain-text note, or a web page URL (the server downloads the page and keeps its readable text).
2. **You ask a question** in plain English, like *"Who do I escalate to if payments are stuck?"*
3. **You get an answer** written only from what you saved, with numbered citations like **[1]**. Click one to see the exact snippet it came from.

If your saved content doesn't contain the answer, the app says so. It doesn't make things up.

## How it works (in 30 seconds)

This is a small **RAG** app (*Retrieval-Augmented Generation*):

```
 Save:  note / URL ──► split into chunks ──► turn each chunk into numbers ("embeddings") ──► store in SQLite

 Ask:   question ──► embed it ──► find the most similar chunks ──► give those chunks + question to an LLM
                                                                         │
                                                       answer with [1] [2] citations ◄┘
```

- **Chunks** are pieces of about 800 characters, split at paragraph and sentence boundaries, so each piece is about one thing.
- **Embeddings** are lists of numbers that capture meaning, so "backups" can match "nightly snapshot".
- Saving returns instantly; chunking and embedding run **in the background**. Items show *Indexing…* and then *Ready*.

## Run it locally

You need **[Node.js](https://nodejs.org) 22.13 or newer** (Node 24 recommended). Nothing else: no database to install and nothing to compile.

```bash
git clone https://github.com/thriver652/ai-knowledge-inbox.git
cd ai-knowledge-inbox
npm run install:all     # installs everything (root, server, web)
npm start               # builds the UI and starts the app
```

Open **http://localhost:3001**. That's it.

### No API key? It still works.

With no key, the app runs in **offline mode**. Search matches shared words rather than meaning, and answers are the best-matching sentences from your notes, still cited. Every answer says which mode produced it.

### Turn on real AI (optional)

Copy the example settings file:

```bash
cp server/.env.example server/.env      # Windows PowerShell: copy server\.env.example server\.env
```

Then edit `server/.env` and pick **one** option:

| Option | Cost | What to set in `server/.env` |
|---|---|---|
| **OpenAI** | Paid | `OPENAI_API_KEY=sk-...` |
| **Google Gemini** | Free tier | Get a key at [aistudio.google.com](https://aistudio.google.com), set `OPENAI_API_KEY=<your key>`, then uncomment the Gemini block in the file |

Restart with `npm start`. The grey line under each answer shows the model being used.

> 🔒 `server/.env` holds your key and is git-ignored. Never commit it.

## Using the app

| To… | Do this |
|---|---|
| Save a note | **Note** tab → type or paste → **Save note**. The first line becomes the title. |
| Save a web page | **URL** tab → paste a link → **Save URL** |
| Ask a question | Type in the **Ask** box → **Ask** (wait until the item shows *Ready*) |
| Check where an answer came from | Click a citation number such as **[1]** to jump to its source snippet |
| Delete an item | Hover over it in the list → **Delete** |

## All commands

Run these from the project root:

| Command | What it does |
|---|---|
| `npm run install:all` | Install all dependencies (do this first) |
| `npm start` | Production mode: build the UI, serve the app and API on **:3001** |
| `npm run dev` | Development mode: API on :3001 plus a hot-reloading UI on **:5173** |
| `npm test` | Run the 40 automated tests (offline, no key needed) |
| `npm run build` | Build the UI only |

## Where things live

```
ai-knowledge-inbox/
├── server/                 Backend (Node + Express)
│   ├── src/
│   │   ├── index.js        Starts the server
│   │   ├── app.js          Wires all the pieces together
│   │   ├── config.js       All settings (read from server/.env)
│   │   ├── http/           API routes, input validation, error responses
│   │   ├── services/       The two main flows: ingest (save) and query (ask)
│   │   ├── rag/            Chunking, vector search, LLM prompt
│   │   ├── ai/             AI providers: OpenAI-compatible, and the offline fallback
│   │   ├── ingest/         Fetching web pages safely, background job queue
│   │   └── db/             SQLite tables and queries
│   ├── test/               Automated tests
│   └── .env.example        Copy to .env to configure
├── web/                    Frontend (React + Vite + Tailwind)
│   └── src/
│       ├── App.jsx         Page layout
│       ├── components/     UI pieces: form, item list, answer, sources
│       ├── hooks/          State logic: useItems (list), useAsk (questions)
│       └── api/client.js   Talks to the backend
└── docs/
    ├── DESIGN.md           Design decisions, tradeoffs, scaling, API reference
    └── screenshot.png
```

**New to the code?** Read in this order:
1. `server/src/services/ingestService.js`: what happens when you save something.
2. `server/src/services/queryService.js`: what happens when you ask.
3. `server/src/rag/chunker.js` and `server/src/rag/vectorStore.js`: the RAG core.
4. `web/src/App.jsx`, then `web/src/hooks/`: the frontend.

## The API in one minute

The UI uses three main endpoints, and you can call them directly too:

```bash
# Save a note
curl -X POST localhost:3001/api/ingest -H "content-type: application/json" \
  -d '{"type":"note","content":"Backups run nightly at 02:00 UTC."}'

# List saved items
curl localhost:3001/api/items

# Ask a question
curl -X POST localhost:3001/api/query -H "content-type: application/json" \
  -d '{"question":"When do backups run?"}'
```

Every error has the same shape: `{ "error": { "code", "message", "requestId" } }`. Full reference: [docs/DESIGN.md → API](docs/DESIGN.md#api).

## Troubleshooting

| Problem | Fix |
|---|---|
| `'vite' is not recognized` or `Cannot find package 'express'` | Dependencies aren't installed. Run `npm run install:all`. |
| `node:sqlite` error, or Node version warning | Upgrade Node to 22.13+ (`node -v` shows your version) |
| Port 3001 already in use | Set `PORT=3002` in `server/.env` |
| Item stuck on *Indexing…* for a long URL | Normal on free AI tiers: the app waits out rate limits. Large pages take a minute or two. |
| Item shows *Failed* | Its error message says why: page not reachable, no readable text (JavaScript-only or login-required pages), or an AI key problem |
| Answers ignore obviously related notes | Wait until the item shows *Ready*. With Gemini, keep `RETRIEVAL_MIN_SCORE=0.6`. |
| A URL is rejected as "not allowed" | Intentional: local and private-network addresses are blocked for security |

## Tech stack

**Backend:** Node.js, Express 5, SQLite (built into Node), Zod (validation), Pino (structured JSON logs), Cheerio (HTML extraction), OpenAI SDK (works with any OpenAI-compatible API)
**Frontend:** React 19 with hooks, Vite, Tailwind CSS
**Quality:** 40 tests with Node's built-in test runner; GitHub Actions CI on every push
