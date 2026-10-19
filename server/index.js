import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import { assertToolAllowed, listAllowedTools } from "./gate.js";
import { auditVault } from "./vaultAudit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VAULT_PATH = process.env.VAULT_PATH || "";
const REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "ash";

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    hasOpenAIKey: Boolean(OPENAI_API_KEY),
    hasVaultPath: Boolean(VAULT_PATH),
    allowedTools: listAllowedTools(),
  });
});

/**
 * Mint an ephemeral Realtime session for the browser.
 * Tools are declared here; execution still goes through /api/tools/*.
 */
app.post("/api/realtime/session", async (_req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error:
        "OPENAI_API_KEY missing. Copy server/.env.example to server/.env and set your key.",
    });
  }

  const instructions = [
    "You are Theo, Benji's personal Jarvis-style voice assistant.",
    "Speak concisely and clearly. Be warm but not fluffy.",
    "Security rule: you may ONLY use the audit_vault tool. You cannot move, rename, delete, edit, or tag files.",
    "When the user asks to organize, clean, or understand their Obsidian vault, call audit_vault, then summarize the report in plain language: folders, tags, dates, naming problems, and what to fix first.",
    "Never claim you changed the vault. You only find and report.",
    "If asked to send email, run shell, or write files, refuse and explain that v1 only audits the vault.",
  ].join(" ");

  const body = {
    model: REALTIME_MODEL,
    voice: REALTIME_VOICE,
    modalities: ["audio", "text"],
    instructions,
    tools: [
      {
        type: "function",
        name: "audit_vault",
        description:
          "Read-only Obsidian vault structure audit: folders, tags, date signals, naming issues. Never modifies files.",
        parameters: {
          type: "object",
          properties: {
            subpath: {
              type: "string",
              description:
                "Optional subfolder inside the vault to focus the audit. Leave empty for the whole vault.",
            },
          },
          additionalProperties: false,
        },
      },
    ],
    tool_choice: "auto",
    input_audio_transcription: { model: "whisper-1" },
  };

  try {
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.error?.message || "Failed to create realtime session",
        details: data,
      });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || "session_create_failed" });
  }
});

app.post("/api/tools/:toolName", async (req, res) => {
  const { toolName } = req.params;
  try {
    assertToolAllowed(toolName);

    if (toolName === "audit_vault") {
      const subpath =
        typeof req.body?.subpath === "string" ? req.body.subpath.trim() : "";
      const report = await auditVault(VAULT_PATH, subpath || undefined);
      return res.json({ ok: true, tool: toolName, result: report });
    }

    return res.status(500).json({ error: "Tool allowed but not implemented." });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      tool: toolName,
      code: err.code || "TOOL_ERROR",
      error: err.message || "tool_failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`[theo] server on http://localhost:${PORT}`);
  console.log(`[theo] allowed tools: ${listAllowedTools().join(", ")}`);
  console.log(
    `[theo] vault: ${VAULT_PATH ? VAULT_PATH : "(VAULT_PATH not set)"}`,
  );
});
