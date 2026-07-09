import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALES,
  MESSAGES,
  format,
  resolveInitialLocale,
  t,
  type MessageId,
} from "../src/lib/ui/i18n";

describe("DEFAULT_LOCALE / LOCALES", () => {
  it("defaults to es-AR", () => {
    expect(DEFAULT_LOCALE).toBe("es");
  });

  it("lists exactly es and en", () => {
    expect(LOCALES).toEqual(["es", "en"]);
  });
});

describe("MESSAGES", () => {
  it("has a non-empty es and en string for every entry, and no em dashes", () => {
    // Drives t()/format() through a representative sample of every id in
    // the dictionary (see the full-table walk below for exhaustive coverage
    // of MESSAGES itself).
    const sampleIds: MessageId[] = [
      "action.retry",
      "action.confirm",
      "action.cancel",
      "action.copied",
      "action.refresh",
      "action.approve",
      "action.deny",
      "action.resume",
      "action.send",
      "society.loading",
      "error.server_unreachable",
      "toggle.language.label",
      "app.title",
      "app.tagline",
      "session.loading",
      "account.error",
      "society.error",
      "chat.empty",
      "role.user",
      "role.agent",
      "chat.preview.replaced",
      "chat.thinking",
      "chat.input.placeholder",
      "tool.preview_society.pending",
      "tool.preview_society.done",
      "tool.good_standing.pending",
      "tool.good_standing.done",
      "tool.my_society.pending",
      "tool.my_society.done",
      "tool.generic.pending",
      "tool.generic.done",
      "tool.error",
      "agentError.cap",
      "agentError.no_model_configured",
      "agentError.provider_no_credit",
      "agentError.provider_saturated",
      "agentError.network",
      "agentError.unknown",
      "journey.heading",
      "stage.idea",
      "stage.validacion",
      "stage.spec",
      "stage.constitucion",
      "stage.operacion",
      "dashboard.society.heading",
      "dashboard.society.subtitle",
      "dashboard.goodStanding.noData",
      "dashboard.status.active",
      "dashboard.status.suspended",
      "dashboard.pendingApprovals.badge",
      "dashboard.agent.heading",
      "dashboard.agent.deployedIn",
      "dashboard.agent.projectInfo",
      "dashboard.agent.deployState",
      "dashboard.agent.manualExplain",
      "dashboard.agent.deployToVercel",
      "dashboard.agent.envVarsLabel",
      "dashboard.agent.copyEnvVars",
      "dashboard.agent.saveKeyWarning",
      "dashboard.agent.notDeployedYet",
      "dashboard.agent.deployRateLimited",
      "dashboard.agent.deployError",
      "dashboard.agent.deploying",
      "dashboard.agent.deployCta",
      "dashboard.approvals.heading",
      "dashboard.approvals.error",
      "dashboard.approvals.empty",
      "dashboard.approvals.defaultTool",
      "dashboard.killswitch.heading",
      "dashboard.killswitch.explain",
      "dashboard.suspend.action",
      "dashboard.resume.title",
      "dashboard.suspend.explainWill",
      "dashboard.suspend.explainResume",
      "dashboard.suspend.reasonLabel",
      "dashboard.suspend.reasonPlaceholder",
      "dashboard.suspend.confirmCheckbox",
      "dashboard.suspend.applyError",
      "dashboard.suspend.applying",
      "dashboard.usage.heading",
      "dashboard.usage.error",
      "dashboard.usage.tokens",
      "dashboard.usage.realCost",
      "dashboard.usage.priceIfOperative",
      "dashboard.usage.capRemaining",
      "constitution.error.alreadyExists",
      "constitution.error.art102Required",
      "constitution.error.cuitInvalid",
      "constitution.error.adminNameRequired",
      "constitution.error.rateLimited",
      "constitution.error.generic",
      "constitution.alreadyHasSociety",
      "constitution.draftLabel",
      "constitution.noName",
      "constitution.capitalSocial",
      "constitution.credentialsWarning",
      "constitution.copyAdmin",
      "constitution.copyGate",
      "constitution.cta",
      "constitution.dialog.title",
      "constitution.dialog.explain",
      "constitution.adminNameLabel",
      "constitution.adminNamePlaceholder",
      "constitution.adminCuitLabel",
      "constitution.adminCuitPlaceholder",
      "constitution.cuitInvalid",
      "constitution.art102Accept",
      "constitution.submitting",
    ];

    for (const id of sampleIds) {
      for (const locale of LOCALES) {
        const value = t(locale, id);
        expect(value, `${id}/${locale} should be a non-empty string`).toEqual(expect.any(String));
        expect(value.length, `${id}/${locale} should be non-empty`).toBeGreaterThan(0);
        expect(value, `${id}/${locale} must not contain an em dash`).not.toContain("—");
      }
    }
  });

  it("every entry in the dictionary is non-empty for both locales and free of em dashes", () => {
    expect(Object.keys(MESSAGES).length).toBeGreaterThan(0);
    for (const [id, entry] of Object.entries(MESSAGES)) {
      for (const locale of LOCALES) {
        const value = entry[locale];
        expect(value, `${id}/${locale} should be defined`).toBeTruthy();
        expect(value).not.toContain("—");
      }
    }
  });
});

describe("t", () => {
  it("returns strings for both locales for a sampled set of known ids", () => {
    for (const id of ["action.confirm", "app.tagline", "stage.idea"] as MessageId[]) {
      expect(typeof t("es", id)).toBe("string");
      expect(typeof t("en", id)).toBe("string");
    }
  });
});

describe("resolveInitialLocale", () => {
  it("falls back to es for null, undefined, empty, or unrecognized values", () => {
    expect(resolveInitialLocale(null)).toBe("es");
    expect(resolveInitialLocale(undefined)).toBe("es");
    expect(resolveInitialLocale("")).toBe("es");
    expect(resolveInitialLocale("EN")).toBe("es");
    expect(resolveInitialLocale("fr")).toBe("es");
  });

  it("recognizes es and en", () => {
    expect(resolveInitialLocale("en")).toBe("en");
    expect(resolveInitialLocale("es")).toBe("es");
  });
});

describe("format", () => {
  it("replaces known placeholders", () => {
    const value = format("es", "tool.generic.pending", { name: "x" });
    expect(value).toContain("x");
    expect(value).not.toContain("{name}");
  });

  it("leaves unknown placeholders untouched", () => {
    const value = format("es", "tool.error", {});
    expect(value).toContain("{name}");
  });
});
