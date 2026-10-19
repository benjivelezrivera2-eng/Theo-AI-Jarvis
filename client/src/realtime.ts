export type OrbState = "idle" | "connecting" | "listening" | "speaking" | "error";

export type TranscriptLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

type Handlers = {
  onState: (state: OrbState) => void;
  onTranscript: (line: TranscriptLine) => void;
  onError: (message: string) => void;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function runGatedTool(name: string, args: Record<string, unknown>) {
  const res = await fetch(`/api/tools/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      ok: false,
      error: data?.error || `Tool ${name} failed`,
      code: data?.code,
    };
  }
  return data;
}

/**
 * Browser WebRTC session against OpenAI Realtime.
 * Tool calls are executed only via our local gate (/api/tools/*).
 */
export class TheoRealtimeSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private handlers: Handlers;
  private closed = false;

  constructor(handlers: Handlers) {
    this.handlers = handlers;
  }

  async connect() {
    this.closed = false;
    this.handlers.onState("connecting");

    const sessionRes = await fetch("/api/realtime/session", { method: "POST" });
    const session = await sessionRes.json();
    if (!sessionRes.ok) {
      throw new Error(session?.error || "Could not create realtime session");
    }

    const ephemeralKey = session?.client_secret?.value;
    if (!ephemeralKey) {
      throw new Error("Realtime session missing client_secret");
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.pc = new RTCPeerConnection();
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    document.body.appendChild(this.audioEl);

    this.pc.ontrack = (event) => {
      if (this.audioEl) {
        this.audioEl.srcObject = event.streams[0];
      }
    };

    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.onmessage = (event) => this.handleServerEvent(event.data);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const sdpRes = await fetch(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
          "OpenAI-Beta": "realtime=v1",
        },
        body: offer.sdp || "",
      },
    );

    if (!sdpRes.ok) {
      const errText = await sdpRes.text();
      throw new Error(`Realtime SDP exchange failed: ${errText}`);
    }

    const answer: RTCSessionDescriptionInit = {
      type: "answer",
      sdp: await sdpRes.text(),
    };
    await this.pc.setRemoteDescription(answer);
    this.handlers.onState("listening");
    this.handlers.onTranscript({
      id: uid(),
      role: "system",
      text: "Connected. Talk naturally — try “Audit my Obsidian vault.”",
    });
  }

  private async handleServerEvent(raw: string) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    const type = String(event.type || "");

    if (type === "input_audio_buffer.speech_started") {
      this.handlers.onState("listening");
    }
    if (type === "output_audio_buffer.started" || type === "response.audio.delta") {
      this.handlers.onState("speaking");
    }
    if (
      type === "output_audio_buffer.stopped" ||
      type === "response.done" ||
      type === "response.audio.done"
    ) {
      this.handlers.onState("listening");
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      const text = String(event.transcript || "").trim();
      if (text) {
        this.handlers.onTranscript({ id: uid(), role: "user", text });
      }
    }

    if (type === "response.audio_transcript.done") {
      const text = String(event.transcript || "").trim();
      if (text) {
        this.handlers.onTranscript({ id: uid(), role: "assistant", text });
      }
    }

    if (type === "response.function_call_arguments.done") {
      await this.handleFunctionCall(event);
    }

    // Newer Realtime payloads may nest the call on output_item.done
    if (type === "response.output_item.done") {
      const item = event.item as
        | { type?: string; name?: string; call_id?: string; arguments?: string }
        | undefined;
      if (item?.type === "function_call") {
        await this.handleFunctionCall({
          name: item.name,
          call_id: item.call_id,
          arguments: item.arguments,
        });
      }
    }

    if (type === "error") {
      const msg =
        (event.error as { message?: string } | undefined)?.message ||
        "Realtime error";
      this.handlers.onError(msg);
      this.handlers.onState("error");
    }
  }

  private async handleFunctionCall(event: Record<string, unknown>) {
    const name = String(event.name || "");
    const callId = String(event.call_id || "");
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(String(event.arguments || "{}"));
    } catch {
      args = {};
    }

    this.handlers.onTranscript({
      id: uid(),
      role: "system",
      text: `Gate checking tool: ${name}`,
    });

    const result = await runGatedTool(name, args);
    this.handlers.onTranscript({
      id: uid(),
      role: "system",
      text: result.ok
        ? `audit_vault complete — ${result.result?.counts?.markdownNotes ?? "?"} notes scanned`
        : `Gate/tool result: ${result.error}`,
    });

    this.dc?.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
        },
      }),
    );
    this.dc?.send(JSON.stringify({ type: "response.create" }));
  }

  disconnect() {
    this.closed = true;
    this.dc?.close();
    this.pc?.close();
    this.localStream?.getTracks().forEach((t) => t.stop());
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl.remove();
    }
    this.pc = null;
    this.dc = null;
    this.localStream = null;
    this.audioEl = null;
    this.handlers.onState("idle");
  }

  get isClosed() {
    return this.closed;
  }
}
