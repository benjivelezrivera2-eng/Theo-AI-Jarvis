import { useEffect, useRef, useState } from "react";
import { Orb } from "./Orb";
import {
  TheoRealtimeSession,
  type OrbState,
  type TranscriptLine,
} from "./realtime";
import "./App.css";

type Health = {
  ok: boolean;
  hasOpenAIKey: boolean;
  hasVaultPath: boolean;
  allowedTools: string[];
};

export default function App() {
  const [state, setState] = useState<OrbState>("idle");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const sessionRef = useRef<TheoRealtimeSession | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() =>
        setHealth({
          ok: false,
          hasOpenAIKey: false,
          hasVaultPath: false,
          allowedTools: [],
        }),
      );
  }, []);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [lines]);

  useEffect(() => {
    return () => {
      sessionRef.current?.disconnect();
    };
  }, []);

  async function connect() {
    setError(null);
    try {
      const session = new TheoRealtimeSession({
        onState: setState,
        onTranscript: (line) => setLines((prev) => [...prev, line]),
        onError: (message) => setError(message),
      });
      sessionRef.current = session;
      await session.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connect failed";
      setError(message);
      setState("error");
      sessionRef.current = null;
    }
  }

  function disconnect() {
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    setState("idle");
  }

  async function runAuditDirect() {
    setError(null);
    setLines((prev) => [
      ...prev,
      {
        id: `${Date.now()}-sys`,
        role: "system",
        text: "Running gated audit_vault…",
      },
    ]);
    try {
      const res = await fetch("/api/tools/audit_vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Audit failed");
      }
      const c = data.result?.counts;
      setLines((prev) => [
        ...prev,
        {
          id: `${Date.now()}-asst`,
          role: "assistant",
          text: `Vault audit (read-only): ${c?.markdownNotes ?? "?"} notes, ${c?.folders ?? "?"} folders. Top folders: ${(data.result?.topLevelFolders || []).slice(0, 8).join(", ") || "—"}. Naming issues: ${JSON.stringify(data.result?.namingIssueCounts || {})}. Tags sample: ${(data.result?.topTags || []).slice(0, 8).map((t: { tag: string; count: number }) => `${t.tag}(${t.count})`).join(", ") || "none"}. No files were changed.`,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audit failed";
      setError(message);
    }
  }

  const connected = state !== "idle" && state !== "error";

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">THEO</span>
          <span className="brand-sub">AI JARVIS · v1</span>
        </div>
        <div className={`status pill state-${state}`}>
          {state.toUpperCase()}
        </div>
      </header>

      <main className="stage">
        <Orb state={state} />

        <div className="controls">
          {!connected ? (
            <button className="primary" type="button" onClick={connect}>
              Start voice
            </button>
          ) : (
            <button className="danger" type="button" onClick={disconnect}>
              End session
            </button>
          )}
          <button className="ghost" type="button" onClick={runAuditDirect}>
            Run vault audit
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <aside className="meta">
          <div>
            OpenAI key:{" "}
            <strong>{health?.hasOpenAIKey ? "ready" : "missing"}</strong>
          </div>
          <div>
            Vault path:{" "}
            <strong>{health?.hasVaultPath ? "set" : "missing"}</strong>
          </div>
          <div>
            Gate allows:{" "}
            <strong>{(health?.allowedTools || []).join(", ") || "—"}</strong>
          </div>
        </aside>
      </main>

      <section className="transcript" aria-label="Transcript">
        <div className="transcript-head">Live transcript</div>
        <div className="transcript-body" ref={scrollerRef}>
          {lines.length === 0 && (
            <p className="muted">
              Press Start voice, then ask Theo to audit your Obsidian vault.
            </p>
          )}
          {lines.map((line) => (
            <p key={line.id} className={`line role-${line.role}`}>
              <span className="role">{line.role}</span>
              {line.text}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
