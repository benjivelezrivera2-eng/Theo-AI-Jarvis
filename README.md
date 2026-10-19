# Theo AI Jarvis

Personal desktop-first Jarvis: center **orb** UI, **voice** via OpenAI Realtime, and one **code-gated** tool — a **read-only Obsidian vault audit** (folders, tags, dates, naming).

> The model proposes. The code decides.  
> v1 **cannot** move, rename, delete, or edit vault files.

Tracks: [#2](https://github.com/benjivelezrivera2-eng/Theo-AI-Jarvis/issues/2)

## Quick start

1. **Install**

```bash
npm run install:all
```

2. **Configure** — copy `server/.env.example` → `server/.env` and set:

- `OPENAI_API_KEY` — OpenAI key with Realtime access  
- `VAULT_PATH` — absolute path to your Obsidian vault  

3. **Run**

```bash
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:8787  

4. Click **Start voice**, allow the mic, then say something like:  
   *“Audit my Obsidian vault”* or *“How is my vault structured?”*

You can also click **Run vault audit** to hit the gate without voice.

## Security boundaries (v1)

| Allowed | Not allowed |
|--------|-------------|
| Read markdown under `VAULT_PATH` | Write / move / rename / delete |
| Report folders, tags, dates, naming | Shell, email, outreach |
| Skip `.env` / key-like files | Path escape outside the vault |

Tool execution only happens in `server/` after `gate.js` allowlists the name (`audit_vault` only).

## Stack

- **client/** — Vite + React (orb HUD + WebRTC Realtime)  
- **server/** — Express (ephemeral session mint + tool gate + vault walker)

## Later (not v1)

- Propose cleanup plans for your approval  
- Apply approved moves  
- Business outreach tools  
- Mobile / cross-device sync  

## Issues workflow

See `GITHUB_ISSUES_GUIDE.md` — no feature work without a GitHub Issue.
