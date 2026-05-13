"use client";

/**
 * Client-side Mermaid renderer. Used on /architecture to replace the ASCII
 * composition flow with an actual diagram. Heavy (~150KB gzipped) but
 * code-split, only the architecture page pays for it.
 */

import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
  /** Optional caption rendered under the diagram. */
  caption?: string;
}

export function MermaidDiagram({ chart, caption }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            // Tuned to match the doc-shell tokens.
            fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui",
            fontSize: "13px",
            primaryColor: "#0f172a",
            primaryTextColor: "#f8fafc",
            primaryBorderColor: "#334155",
            lineColor: "#94a3b8",
            secondaryColor: "#1e293b",
            tertiaryColor: "#0c4a6e",
            background: "transparent",
            mainBkg: "#0f172a",
            // Edge label background, same as page background so labels read clean.
            edgeLabelBackground: "var(--bg, #ffffff)",
          },
          flowchart: {
            curve: "basis",
            padding: 12,
            nodeSpacing: 32,
            rankSpacing: 36,
            useMaxWidth: true,
          },
          sequence: {
            actorMargin: 60,
            messageFontSize: 12,
          },
          securityLevel: "strict",
        });
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div
        style={{
          background: "var(--bg-tint)",
          padding: 16,
          borderRadius: 8,
          fontSize: 12,
          color: "var(--text-muted)",
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        }}
      >
        Diagram failed to render: {error}
      </div>
    );
  }

  return (
    <figure style={{ margin: "0 0 24px", padding: 0 }}>
      <div
        ref={ref}
        // dangerouslySetInnerHTML is the canonical way to mount Mermaid's SVG output.
        // The chart string is a static literal in the importing server component,
        // never user input, no XSS surface.
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        style={{
          background: "var(--bg-tint)",
          borderRadius: 8,
          padding: "24px 16px",
          boxShadow: "var(--shadow-border)",
          minHeight: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
        }}
      >
        {!svg ? (
          <span
            style={{
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            Rendering diagram…
          </span>
        ) : null}
      </div>
      {caption ? (
        <figcaption
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            textAlign: "center",
            marginTop: 8,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          }}
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
