"use client";

import { useState, useTransition } from "react";

interface VerifyStep {
  label: string;
  ok: boolean;
  detail?: string;
}

interface VerifyResponse {
  ok: boolean;
  steps?: VerifyStep[];
  reason?: string;
  sdHash?: string;
  innerCheckout?: { order_id?: string; merchant?: { id?: string }; total_price?: number; currency?: string };
  header?: { alg?: string; typ?: string };
  resolvedPayload?: unknown;
}

interface IssueResponse {
  presentation: string;
  closed_mandate: { checkout_hash: string; vct: string };
  inner_checkout: { order_id: string };
}

export function AP2Verifier() {
  const [presentation, setPresentation] = useState("");
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [pending, startTransition] = useTransition();
  const [issuing, startIssuing] = useTransition();

  const onIssueDemo = () => {
    startIssuing(async () => {
      setResult(null);
      const res = await fetch("/api/ap2/issue-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as IssueResponse;
      setPresentation(data.presentation);
    });
  };

  const onVerify = () => {
    if (!presentation.trim()) return;
    startTransition(async () => {
      const res = await fetch("/api/ap2/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presentation }),
      });
      const data = (await res.json()) as VerifyResponse;
      setResult(data);
    });
  };

  return (
    <div className="ap2">
      <div className="ap2-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onIssueDemo}
          disabled={issuing}
        >
          {issuing ? "Issuing..." : "Issue a demo mandate"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onVerify}
          disabled={pending || !presentation.trim()}
        >
          {pending ? "Verifying..." : "Verify"}
        </button>
      </div>
      <textarea
        className="ap2-textarea"
        value={presentation}
        onChange={(e) => setPresentation(e.target.value)}
        placeholder="Paste an AP2 SD-JWT VC compact presentation here, or click 'Issue a demo mandate' to start with a known-valid one."
        rows={6}
      />

      {result && (
        <div className={`ap2-result ${result.ok ? "ap2-ok" : "ap2-fail"}`}>
          <div className="ap2-result-header">
            <span className="ap2-status-pill">{result.ok ? "VERIFIED" : "REJECTED"}</span>
            {result.sdHash && (
              <span className="ap2-sd-hash">
                sd_hash: <code>{result.sdHash}</code>
              </span>
            )}
          </div>
          {result.reason && (
            <div className="ap2-reason">
              <strong>Reason:</strong> {result.reason}
            </div>
          )}
          {result.steps && result.steps.length > 0 && (
            <div className="ap2-steps">
              <h3>Verification trail</h3>
              <ol>
                {result.steps.map((s, i) => (
                  <li key={i} className={s.ok ? "step-ok" : "step-fail"}>
                    <span className="step-marker">{s.ok ? "✓" : "✗"}</span>
                    <span className="step-label">{s.label}</span>
                    {s.detail && <span className="step-detail">{s.detail}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {result.innerCheckout && (
            <div className="ap2-inner">
              <h3>Inner checkout payload (verified)</h3>
              <pre>{JSON.stringify(result.innerCheckout, null, 2)}</pre>
            </div>
          )}
          {result.header && (
            <div className="ap2-header">
              <h3>Issuer JWS header</h3>
              <pre>{JSON.stringify(result.header, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
