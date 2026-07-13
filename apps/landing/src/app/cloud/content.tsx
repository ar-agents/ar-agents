import Link from "next/link";
import { DocCode, DocH2, DocP, DocShell } from "../doc-shell";

type Lang = "es" | "en";

function L({ es, en, lang }: { es: React.ReactNode; en: React.ReactNode; lang: Lang }) {
  return <>{lang === "es" ? es : en}</>;
}

interface Tier {
  name: string;
  tagline: { es: string; en: string };
  audience: { es: string; en: string };
  price: { es: string; en: string };
  status: "available" | "preview" | "planned";
  features: { es: string; en: string }[];
  cta: { label: { es: string; en: string }; href: string };
  highlighted?: boolean;
}

const TIERS: ReadonlyArray<Tier> = [
  {
    name: "Self-host",
    tagline: { es: "Open source. Para siempre.", en: "Open source. Forever." },
    audience: {
      es: "Devs que quieren operar su propia stack",
      en: "Devs who want to run their own stack",
    },
    price: {
      es: "Free · MIT + CC-BY-4.0",
      en: "Free · MIT + CC-BY-4.0",
    },
    status: "available",
    features: [
      { es: "39 packages npm bajo @ar-agents/*", en: "39 npm packages under @ar-agents/*" },
      { es: "6 RFCs CC-BY-4.0 + test vectors", en: "6 CC-BY-4.0 RFCs + test vectors" },
      { es: "Reference implementation completa", en: "Complete reference implementation" },
      { es: "Deploy a Vercel / Cloudflare / Deno / cualquier Edge", en: "Deploy to Vercel / Cloudflare / Deno / any Edge" },
      { es: "Documentación + cookbook + AGENTS.md por package", en: "Docs + cookbook + AGENTS.md per package" },
      { es: "Issues + discussions en GitHub público", en: "Issues + discussions on public GitHub" },
      { es: "Sin telemetría · sin caps · sin lock-in", en: "No telemetry · no caps · no lock-in" },
    ],
    cta: { label: { es: "Empezar en npm", en: "Start on npm" }, href: "/sdk" },
  },
  {
    name: "Cloud",
    tagline: {
      es: "Managed hosting + audit pipeline.",
      en: "Managed hosting + audit pipeline.",
    },
    audience: {
      es: "Sociedades automatizadas que prefieren no operar infra",
      en: "automated companies that prefer not to operate infra",
    },
    price: {
      es: "Ver /precios · bundle completo en preview",
      en: "See /precios · full bundle in preview",
    },
    status: "preview",
    highlighted: true,
    features: [
      { es: "Audit log persistido con SLA · 99.9% uptime", en: "Persisted audit log with SLA · 99.9% uptime" },
      { es: "Dashboard forense regulator-ready (multi-sesión)", en: "Regulator-ready forensic dashboard (multi-session)" },
      { es: "Rotación automática de claves Ed25519 (RFC-005 § 4)", en: "Automatic Ed25519 key rotation (RFC-005 § 4)" },
      { es: "Export periódico a JSON + CSV + ASiC-E containers", en: "Periodic export to JSON + CSV + ASiC-E containers" },
      { es: "Conformance monitoring automático (RFC-002 + RFC-004)", en: "Automatic conformance monitoring (RFC-002 + RFC-004)" },
      { es: "Webhook reenviado con HMAC + dedup garantizado", en: "Forwarded webhooks with HMAC + guaranteed dedup" },
      { es: "Email + Slack support, SLO 24hs", en: "Email + Slack support, 24h SLO" },
      { es: "Backups cifrados, 5 años de retención (RFC-004 § 7)", en: "Encrypted backups, 5-year retention (RFC-004 § 7)" },
    ],
    cta: {
      label: { es: "Solicitar invitación", en: "Request invitation" },
      href: "mailto:naza@naza.ar?subject=ar-agents%20Cloud%20preview",
    },
  },
  {
    name: "Government",
    tagline: {
      es: "Para el Estado argentino.",
      en: "For the Argentine state.",
    },
    audience: {
      es: "Organismos públicos · auditores externos · entidades reguladas con requisito LPDP",
      en: "Public agencies · external auditors · LPDP-regulated entities",
    },
    price: {
      es: "Acuerdo bilateral · pricing por proyecto",
      en: "Bilateral agreement · per-project pricing",
    },
    status: "planned",
    features: [
      { es: "Residencia de datos en territorio argentino (Datacenter local)", en: "Data residency in Argentine territory (local datacenter)" },
      { es: "DPA Ley 25.326 firmado + cláusula de transferencia restringida", en: "Signed Law 25.326 DPA + restricted transfer clause" },
      { es: "Custodia de claves Ed25519 en HSM auditable (modelo CABA)", en: "Ed25519 key custody in auditable HSM (CABA model)" },
      { es: "Auditoría SOC 2 Type II + roadmap ISO/IEC 27001", en: "SOC 2 Type II audit + ISO/IEC 27001 roadmap" },
      { es: "SLA contractual con penalidades + support 24/7", en: "Contractual SLA with penalties + 24/7 support" },
      { es: "Multi-tenant aislado por jurisdicción", en: "Multi-tenant isolated by jurisdiction" },
      { es: "Capacitación interna para auditores + asesores", en: "Internal training for auditors + advisors" },
      { es: "Roadmap de feature alineado con AAIP, AFIP/ARCA, IGJ", en: "Feature roadmap aligned with AAIP, AFIP/ARCA, IGJ" },
      { es: "Código fuente bajo escrow para continuidad", en: "Source code under escrow for continuity" },
    ],
    cta: {
      label: { es: "Reunión técnica", en: "Technical meeting" },
      href: "mailto:naza@naza.ar?subject=ar-agents%20Government%20tier",
    },
  },
  {
    name: "Bespoke",
    tagline: {
      es: "Implementaciones llave en mano.",
      en: "Turnkey implementations.",
    },
    audience: {
      es: "Sociedades grandes · empresas en migración",
      en: "Large companies · businesses in migration",
    },
    price: { es: "Cotización por proyecto", en: "Per-project quote" },
    status: "available",
    features: [
      { es: "Implementación full-stack guiada (2-8 semanas)", en: "Guided full-stack implementation (2-8 weeks)" },
      { es: "Integración con sistemas legacy (SAP, Oracle, ERPs AR)", en: "Legacy system integration (SAP, Oracle, AR ERPs)" },
      { es: "Custom adapters para tools propietarias", en: "Custom adapters for proprietary tools" },
      { es: "Migration path desde stacks existentes (Stripe, Twilio, etc.)", en: "Migration path from existing stacks (Stripe, Twilio, etc.)" },
      { es: "Training del equipo técnico interno", en: "Internal tech-team training" },
      { es: "On-call post-launch · 90 días incluidos", en: "Post-launch on-call · 90 days included" },
      { es: "Auditoría inicial RFC-002+004 + plan de remediación", en: "Initial RFC-002+004 audit + remediation plan" },
    ],
    cta: {
      label: { es: "Cotizar implementación", en: "Quote an implementation" },
      href: "mailto:naza@naza.ar?subject=ar-agents%20Bespoke%20engagement",
    },
  },
];

const STATUS_LABEL: Record<Tier["status"], { es: string; en: string }> = {
  available: { es: "Disponible", en: "Available" },
  preview: { es: "Preview · waitlist abierto", en: "Preview · waitlist open" },
  planned: { es: "En diseño · prelaunch", en: "In design · prelaunch" },
};

const STATUS_COLOR: Record<Tier["status"], string> = {
  available: "var(--success)",
  preview: "var(--accent)",
  planned: "var(--warning)",
};

export function CloudContent({ lang }: { lang: Lang }) {
  return (
    <DocShell
      eyebrow={
        lang === "es"
          ? "ar-agents cloud · hosted platform · 2026"
          : "ar-agents cloud · hosted platform · 2026"
      }
      title={
        lang === "es"
          ? "El código es open-source. La plataforma, no necesariamente."
          : "The code is open-source. The platform, not necessarily."
      }
      subtitle={
        lang === "es"
          ? "Self-hostear ar-agents es gratis y siempre lo será. Operar un audit log firmado con SLA, residencia de datos AR, rotación de claves, dashboards regulator-ready y soporte 24/7 es otra cosa. Si tu sociedad automatizada prefiere consumir eso como servicio, hay un tier para vos."
          : "Self-hosting ar-agents is free and always will be. Running a signed audit log with SLA, AR data residency, key rotation, regulator-ready dashboards, and 24/7 support is another thing. If your automated company prefers to consume that as a service, there's a tier for you."
      }
    >
      <DocP>
        <L
          lang={lang}
          es={
            <>
              Esta página responde la pregunta que cualquier periodista
              AR hace en el minuto dos:{" "}
              <strong>
                &ldquo;¿De qué vivís con esto si todo es código abierto?&rdquo;
              </strong>
            </>
          }
          en={
            <>
              This page answers the question any journalist asks in
              minute two:{" "}
              <strong>
                &ldquo;How do you make a living from this if everything
                is open source?&rdquo;
              </strong>
            </>
          }
        />
      </DocP>

      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>Modelo open-core.</strong> La librería, los RFCs y la
              reference implementation están bajo MIT + CC-BY-4.0, gratis
              para siempre. Se cobra la operación: hosting con SLA, custodia
              de claves criptográficas, residencia de datos en territorio
              argentino, integraciones con sistemas legacy y soporte
              contractual. Es el modelo de Vercel sobre Next.js, Resend
              sobre nodemailer, Supabase sobre Postgres, Linear sobre el
              repo público de su CLI.
            </>
          }
          en={
            <>
              <strong>Open-core model.</strong> The library, the RFCs, and
              the reference implementation are under MIT + CC-BY-4.0, free
              forever. What's charged is operation: hosting with SLA,
              cryptographic key custody, data residency in Argentine
              territory, legacy-system integrations, and contractual
              support. It's the model of Vercel over Next.js, Resend over
              nodemailer, Supabase over Postgres, Linear over their public
              CLI repo.
            </>
          }
        />
      </DocP>

      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>Quién paga.</strong> Paga el que necesita confiar, no el
              que es verificado. El empleador paga el background check, no el
              candidato. Acá igual: la sociedad se verifica, y el banco, la
              aseguradora o el Estado pagan por confiar en ella. Por eso la
              atestación es creíble, el auditado no nos paga. El detalle, en{" "}
              <Link href="/precios" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                /precios
              </Link>
              . El Auditor ya está vivo.
            </>
          }
          en={
            <>
              <strong>Who pays.</strong> The party who needs the trust pays, not
              the party being verified. The employer pays for the background
              check, not the applicant. Same here: the company gets verified,
              and the bank, the insurer, or the state pays to trust it. That is
              why the attestation is credible, the audited party does not pay
              us. The detail is in{" "}
              <Link href="/en/pricing" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                pricing
              </Link>
              . The Auditor is already live.
            </>
          }
        />
      </DocP>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          margin: "32px 0",
        }}
      >
        {TIERS.map((t) => (
          <TierCard key={t.name} tier={t} lang={lang} />
        ))}
      </div>

      <DocH2>
        <L
          lang={lang}
          es="Por qué el código sigue open-source"
          en="Why the code stays open-source"
        />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Credibilidad regulatoria.</strong> Un asesor del
                Ministerio no puede recomendar una stack que controla un
                único proveedor cerrado. Si es open source, el Estado puede
                fork-earla y seguir si el mantenedor desaparece. Esa
                continuidad es <em>la</em> razón por la que es viable
                legislar sobre la infra.
              </>
            }
            en={
              <>
                <strong>Regulatory credibility.</strong> A Ministry advisor
                can't recommend a stack one closed vendor controls. If it's
                open source, the state can fork it and keep going if the
                maintainer disappears. That continuity is <em>the</em>{" "}
                reason it's viable to legislate over the infrastructure.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Adopción amplia.</strong> Si fuera cerrada, ninguna
                sociedad automatizada sin presupuesto de licencia podría usarla. Open,
                la adopta todo el ecosistema. Pagan los que necesitan SLA,
                residencia o auditoría, no los que pueden ensamblarlo solos.
              </>
            }
            en={
              <>
                <strong>Broad adoption.</strong> If it were closed, no
                automated company without a licensing budget could use it. Open,
                the whole ecosystem adopts it. Payers are those who need
                SLA, residency, or auditing, not those who can assemble it
                themselves.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Código abierto, servicios encima.</strong> Cualquiera
                puede ofrecer servicios sobre el código abierto; el código
                sigue siendo libre. Lo que se paga es el servicio gestionado y
                el soporte, no la licencia.
              </>
            }
            en={
              <>
                <strong>Open code, services on top.</strong> Anyone can offer
                services over the open code; the code stays free. What you pay
                for is the managed service and support, not the license.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Compatibilidad con cite-by-reference.</strong>{" "}
                La ley argentina puede citar RFC-004 con un commit hash
                inmutable de GitHub (ver{" "}
                <Link href="/cite" style={linkSty}>
                  /cite
                </Link>
                ). Eso requiere que el documento sea CC-BY-4.0 y que el
                código de referencia sea MIT verificable.
              </>
            }
            en={
              <>
                <strong>Compatibility with cite-by-reference.</strong>{" "}
                Argentine law can cite RFC-004 with an immutable GitHub
                commit hash (see{" "}
                <Link href="/cite" style={linkSty}>
                  /cite
                </Link>
                ). That requires the document to be CC-BY-4.0 and the
                reference code to be MIT-verifiable.
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="Cómo se compara con stacks open-core conocidas"
          en="How it compares to known open-core stacks"
        />
      </DocH2>
      <div style={{ overflowX: "auto", margin: "16px 0" }}>
        <table
          style={{
            width: "100%",
            minWidth: 640,
            borderCollapse: "collapse",
            fontSize: 13,
            background: "var(--bg-tint)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <thead>
            <tr>
              <th style={thSty}>
                <L lang={lang} es="Proyecto" en="Project" />
              </th>
              <th style={thSty}>
                <L lang={lang} es="Lo que es OSS" en="What's OSS" />
              </th>
              <th style={thSty}>
                <L lang={lang} es="Lo que es paid" en="What's paid" />
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Vercel", "Next.js, Turborepo, AI SDK", { es: "Hosting, AI Gateway, KV, Postgres, support", en: "Hosting, AI Gateway, KV, Postgres, support" }],
              ["Supabase", "supabase-js, Postgres extensions, CLI", { es: "Hosting, auth, storage, dashboard", en: "Hosting, auth, storage, dashboard" }],
              ["Resend", "react-email primitives", { es: "Sending pipeline, dashboard, SLA", en: "Sending pipeline, dashboard, SLA" }],
              ["Linear", "CLI primitives, integrations", { es: "Issue tracking SaaS, enterprise SSO", en: "Issue tracking SaaS, enterprise SSO" }],
              ["Cal.com", { es: "Toda la stack open-source", en: "Whole stack open-source" }, { es: "Hosting, white-label, enterprise", en: "Hosting, white-label, enterprise" }],
              ["ar-agents", { es: "39 npm packages, 6 RFCs, reference impl", en: "39 npm packages, 6 RFCs, reference impl" }, { es: "Cloud · Government · Bespoke (esta página)", en: "Cloud · Government · Bespoke (this page)" }],
            ].map((row, i) => {
              const [name, oss, paid] = row;
              const isAr = name === "ar-agents";
              return (
                <tr
                  key={i}
                  style={{
                    borderTop: "1px solid var(--border-color)",
                    background: isAr
                      ? "color-mix(in srgb, var(--accent) 6%, transparent)"
                      : "transparent",
                  }}
                >
                  <td style={tdMonoSty}>{name as string}</td>
                  <td style={tdSty}>
                    {typeof oss === "string" ? oss : (oss as { es: string; en: string })[lang]}
                  </td>
                  <td style={tdSty}>
                    {typeof paid === "string" ? paid : (paid as { es: string; en: string })[lang]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DocH2>
        <L
          lang={lang}
          es="Para inversores y partners"
          en="For investors and partners"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              El proyecto está{" "}
              <strong>pre-revenue</strong>: la librería está publicada, el
              ecosistema regulatorio se está armando, y la plataforma
              comercial está en diseño. El revenue llega en secuencia:
            </>
          }
          en={
            <>
              The project is{" "}
              <strong>pre-revenue</strong>: the library is published, the
              regulatory ecosystem is forming, and the commercial platform
              is in design. Revenue arrives in sequence:
            </>
          }
        />
      </DocP>
      <ol style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                El managed hosting sale en preview a medida que crece la
                demanda de sociedades automatizadas que prefieren no operar
                su propia infra.
              </>
            }
            en={
              <>
                Managed hosting ships in preview as demand grows from
                automated companies that prefer not to operate their own
                infra.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Government</strong> requiere ley sancionada +
                decisión ministerial de tercerizar la infra. Esperable
                entre Q4 2026 y Q1 2027.
              </>
            }
            en={
              <>
                <strong>Government</strong> requires enacted law +
                ministerial decision to outsource the infrastructure.
                Expected between Q4 2026 and Q1 2027.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Bespoke</strong> está disponible hoy mismo para
                early-adopters que estén montando su sociedad automatizada en
                anticipación a la ley.
              </>
            }
            en={
              <>
                <strong>Bespoke</strong> is available today for
                early-adopters building their automated company in
                anticipation of the law.
              </>
            }
          />
        </li>
      </ol>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              Contactá a{" "}
              <a href="mailto:naza@naza.ar" style={linkSty}>
                naza@naza.ar
              </a>{" "}
              si querés ver el deck completo, el modelo financiero, o
              coordinar advisory equity en early sociedades automatizadas.
            </>
          }
          en={
            <>
              Email{" "}
              <a href="mailto:naza@naza.ar" style={linkSty}>
                naza@naza.ar
              </a>{" "}
              if you want to see the full deck, financial model, or
              coordinate advisory equity in early automated companies.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="Honestidad pre-revenue"
          en="Pre-revenue honesty"
        />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>La plataforma comercial es pre-revenue.</strong>{" "}
                Managed hosting y Government están en diseño. Bespoke está
                en etapa de early-adopters.
              </>
            }
            en={
              <>
                <strong>The commercial platform is pre-revenue.</strong>{" "}
                Managed hosting and Government are in design. Bespoke is
                in the early-adopter stage.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>El maintainer es uno.</strong> Continuidad
                operacional es un riesgo real que se mitiga con escrow
                de código, RFCs CC-BY-4.0, y npm provenance, pero no
                se elimina.
              </>
            }
            en={
              <>
                <strong>One maintainer.</strong> Operational continuity
                is a real risk mitigated by code escrow, CC-BY-4.0
                RFCs, and npm provenance, but not eliminated.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>
                  Government tier depende de variables que no controlo.
                </strong>{" "}
                La ley puede no sancionarse, el ministerio puede tercerizar
                la infraestructura a otro proveedor, el régimen puede
                mutar. El modelo comercial respeta esa incertidumbre.
              </>
            }
            en={
              <>
                <strong>
                  Government tier depends on variables I don't control.
                </strong>{" "}
                The law may not pass, the ministry may outsource the
                infrastructure to another provider, the regime may mutate.
                The commercial model respects that uncertainty.
              </>
            }
          />
        </li>
      </ul>
    </DocShell>
  );
}

function TierCard({ tier, lang }: { tier: Tier; lang: Lang }) {
  return (
    <div
      style={{
        padding: 18,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: tier.highlighted
          ? `0 0 0 2px var(--accent), var(--card-shadow)`
          : "var(--card-shadow)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <h3
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text)",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {tier.name}
          </h3>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "3px 8px",
              background: `color-mix(in srgb, ${STATUS_COLOR[tier.status]} 18%, transparent)`,
              color: STATUS_COLOR[tier.status],
              borderRadius: 4,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {STATUS_LABEL[tier.status][lang]}
          </span>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-body)", margin: "0 0 6px" }}>
          {tier.tagline[lang]}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 4px" }}>
          {tier.audience[lang]}
        </p>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            margin: 0,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          }}
        >
          {tier.price[lang]}
        </p>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {tier.features.map((f) => (
          <li
            key={f.es}
            style={{
              fontSize: 13,
              color: "var(--text-body)",
              lineHeight: 1.5,
              paddingLeft: 16,
              position: "relative",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                top: 8,
                width: 6,
                height: 6,
                borderRadius: 9999,
                background: "var(--accent)",
                opacity: 0.6,
              }}
            />
            {f[lang]}
          </li>
        ))}
      </ul>
      <a
        href={tier.cta.href}
        style={{
          marginTop: "auto",
          padding: "10px 14px",
          background: tier.highlighted ? "var(--primary-bg)" : "transparent",
          color: tier.highlighted ? "var(--primary-text)" : "var(--text)",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          textDecoration: "none",
          textAlign: "center",
          boxShadow: tier.highlighted ? "none" : "var(--shadow-ring-light)",
        }}
      >
        {tier.cta.label[lang]} →
      </a>
    </div>
  );
}

const ulSty: React.CSSProperties = { paddingLeft: 24, marginBottom: 16 };
const liSty: React.CSSProperties = { marginBottom: 8, lineHeight: 1.55 };
const linkSty: React.CSSProperties = { color: "var(--accent)", textDecoration: "underline" };
const thSty: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--border-color)",
};
const tdSty: React.CSSProperties = {
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--text-body)",
  verticalAlign: "top",
};
const tdMonoSty: React.CSSProperties = {
  ...tdSty,
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  color: "var(--text)",
  fontWeight: 500,
};
