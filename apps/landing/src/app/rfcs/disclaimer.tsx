/**
 * Honest disclaimer block shared by every RFC page. The adversarial regulator
 * review flagged that calling these "RFC" piggybacks IETF/IRTF authority that
 * doesn't apply. This block makes the relationship explicit, in-place, on
 * every spec, so a skeptical reader sees it before evaluating the content.
 *
 * Lives next to the RFCs so a future rename ("AR-SPEC", "AR-STD") is a single
 * find-replace.
 */
export function RfcDisclaimer() {
  return (
    <div
      role="note"
      style={{
        padding: 14,
        background: "var(--bg-tint)",
        borderLeft: "3px solid var(--text-muted)",
        borderRadius: 4,
        margin: "16px 0 24px",
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--text-muted)",
      }}
    >
      <strong style={{ color: "var(--text-body)" }}>
        Not an IETF RFC.
      </strong>{" "}
      These specs are open-source drafts authored by an independent
      developer (Naza). The &ldquo;RFC&rdquo; naming follows
      the IETF style (numbered, versioned, status, CC-licensed) but does{" "}
      <strong>not</strong> imply IETF, IRTF, or any standards-body
      endorsement. The documents are technical proposals open to public
      comment at{" "}
      <a
        href="https://github.com/ar-agents/ar-agents/discussions"
        style={{ color: "var(--accent)", textDecoration: "underline" }}
      >
        github.com/ar-agents/ar-agents/discussions
      </a>
      . For citation in legislation, link to a specific commit hash or
      tagged release on GitHub, not to the canonical{" "}
      <code style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
        /rfcs/&#123;n&#125;
      </code>{" "}
      URL. The{" "}
      <a
        href="/cite"
        style={{ color: "var(--accent)", textDecoration: "underline" }}
      >
        /cite
      </a>{" "}
      page generates BibTeX, APA and Chicago citations anchored to a
      commit hash automatically.
    </div>
  );
}
