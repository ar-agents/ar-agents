"use client";

import { useState } from "react";

interface Message {
  role: "user" | "agent" | "system";
  text: string;
  whatsappSends?: Array<{ method: string; args: { to?: string; text?: string; bodyText?: string; templateName?: string }; fakeMessageId: string }>;
  steps?: Array<{ toolCalls: Array<{ name: string; input: unknown }> }>;
}

const WHATSAPP_GREEN = "#dcf8c6";
const WHATSAPP_BG = "#e5ddd5";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      text: "Hablale como si fueras un cliente que escribe por WhatsApp. El agente combina @ar-agents/identity (CUIT + AFIP) + @ar-agents/mercadopago (suscripciones) + @ar-agents/whatsapp (reply via WhatsApp).",
    },
  ]);
  const [input, setInput] = useState("Hola, quiero contratar el plan Pro. Mi CUIT es 20-41758101-5");
  const [loading, setLoading] = useState(false);
  const [whatsappMode, setWhatsappMode] = useState<"live" | "mock" | null>(null);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", text: input };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      // Multi-turn: send full conversation so the agent can reference earlier
      // request_ids (e.g., to call submit_otp_code with the right id).
      const conversationHistory = nextMessages
        .filter((m) => m.role === "user" || m.role === "agent")
        .map((m) => ({
          role: m.role === "agent" ? "assistant" : "user",
          content: m.text,
        }));
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversationHistory }),
      });
      const data = await res.json();
      setWhatsappMode(data.whatsappMode ?? null);
      if (data.error) {
        setMessages((m) => [...m, { role: "system", text: `Error: ${data.error}` }]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "agent",
            text: data.text,
            whatsappSends: data.whatsappSends,
            steps: data.steps,
          },
        ]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "system", text: e instanceof Error ? e.message : String(e) },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f0f0f0", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 12px", fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif", color: "#0a0a0a" }}>
      <header style={{ width: "100%", maxWidth: 720, marginBottom: 16 }}>
        <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#71717a", margin: 0 }}>ar-agents · whatsapp-hello demo</p>
        <h1 style={{ fontSize: 28, margin: "4px 0 8px", fontWeight: 600 }}>Billing assistant para SaaS argentinos</h1>
        <p style={{ color: "#52525b", margin: "0 0 12px", fontSize: 14, lineHeight: 1.5 }}>
          Combina <code>@ar-agents/identity</code> (CUIT + AFIP padron) + <code>@ar-agents/mercadopago</code> (suscripciones) + <code>@ar-agents/whatsapp</code> (recibir/enviar). Probalo escribiendo como un cliente de WhatsApp.
        </p>
        {whatsappMode && (
          <div style={{ fontSize: 12, padding: "6px 10px", background: whatsappMode === "live" ? "#10b981" : "#f59e0b", color: "white", borderRadius: 4, display: "inline-block" }}>
            WhatsApp mode: <strong>{whatsappMode}</strong>
            {whatsappMode === "mock" && " (sin Meta creds — los mensajes salientes se muestran abajo en cada bubble)"}
          </div>
        )}
      </header>

      <div style={{ width: "100%", maxWidth: 720, background: WHATSAPP_BG, borderRadius: 12, padding: 16, minHeight: 400, display: "flex", flexDirection: "column", gap: 8, border: "1px solid #d1d5db" }}>
        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start", color: "#52525b", fontSize: 13, padding: "8px 12px" }}>
            agente escribiendo...
          </div>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: 720, marginTop: 12, display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Escribí como cliente de WhatsApp..."
          style={{ flex: 1, padding: "10px 14px", borderRadius: 24, border: "1px solid #d1d5db", fontSize: 14, outline: "none" }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{ padding: "10px 20px", borderRadius: 24, background: "#25d366", color: "white", border: "none", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}
        >
          Enviar
        </button>
      </div>

      <footer style={{ marginTop: 32, fontSize: 12, color: "#71717a", textAlign: "center" }}>
        <code>POST /api/agent</code> · <code>POST /api/whatsapp/webhook</code> ·{" "}
        <a href="https://github.com/ar-agents/ar-agents" style={{ color: "#71717a" }}>github</a>
      </footer>
    </main>
  );
}

function Bubble({ message }: { message: Message }) {
  if (message.role === "system") {
    return (
      <div style={{ alignSelf: "center", background: "rgba(0,0,0,0.05)", padding: "6px 12px", borderRadius: 12, fontSize: 12, color: "#52525b", maxWidth: "90%", textAlign: "center" }}>
        {message.text}
      </div>
    );
  }
  const isUser = message.role === "user";
  return (
    <div style={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "80%" }}>
      <div style={{ background: isUser ? WHATSAPP_GREEN : "white", padding: "8px 12px", borderRadius: 8, boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)", fontSize: 14, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
        {message.text}
      </div>
      {!isUser && message.steps && message.steps.length > 0 && (
        <details style={{ marginTop: 4, fontSize: 11, color: "#52525b" }}>
          <summary style={{ cursor: "pointer" }}>
            ver tool calls ({message.steps.flatMap((s) => s.toolCalls).length})
          </summary>
          <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
            {message.steps.flatMap((s) => s.toolCalls).map((tc, i) => (
              <li key={i}><code>{tc.name}</code></li>
            ))}
          </ul>
        </details>
      )}
      {!isUser && message.whatsappSends && message.whatsappSends.length > 0 && (
        <div style={{ marginTop: 6, padding: "6px 8px", background: "#fef3c7", borderRadius: 6, fontSize: 11, color: "#78350f" }}>
          <strong>[mock] mensajes enviados via WhatsApp:</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
            {message.whatsappSends.map((s, i) => (
              <li key={i}>
                <code>{s.method}</code> → {s.args.to ?? "?"}: {(s.args.text ?? s.args.bodyText ?? s.args.templateName ?? "").toString().slice(0, 80)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
