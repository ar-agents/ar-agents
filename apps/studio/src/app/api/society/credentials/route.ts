/**
 * `GET /api/society/credentials` + `POST /api/society/credentials` (auth):
 * the credentials onboarding wizard, ROADMAP.md M3-1. See
 * docs/CONTRACT.md's "Society lifecycle" section for the shared shape of
 * these routes and src/lib/credential-integrations.ts for the fixed catalog
 * of five integrations this wizard configures, one at a time.
 *
 * A credential can only be saved once the society has an already-provisioned
 * Vercel project (`StoredSociety.deploy.projectName`, set by
 * `POST /api/society/deploy` in "provisioned" mode): studio's only channel
 * to hand the deployed agent app a secret is that project's env vars, so
 * without a project there is nowhere to put it. `sin_deploy` (404) signals
 * that precondition; the UI shows "deploy first" instead of a form.
 *
 * POST body: `{ integration, modelChoice? , fields? }`.
 *  - `integration: "model_key"`, `modelChoice: "platform"`: records the
 *    choice only, no env var, no live/local validation, no redeploy (nothing
 *    changed on the deployed app).
 *  - `integration: "model_key"`, `modelChoice: "own"`, `fields.apiKey`: live
 *    -validates against Anthropic, then behaves like any other integration.
 *  - every other integration: `fields` carries that integration's inputs
 *    (see the switch below); validated (live where cheap and real, local
 *    -only for AFIP's cert/key pair, format-only for the treasury off-ramp),
 *    then written to the Vercel project as env vars (never to this KV store
 *    -- only metadata is persisted here, see src/lib/credentials.ts), then a
 *    redeploy is triggered so the change takes effect.
 *
 * On any validation failure: nothing is saved (no Vercel call, no KV write),
 * a 422 with a field-safe message. On a Vercel env-write failure after
 * validation passed: nothing is saved either (the credential did not
 * actually reach the deployed app), a 502. The redeploy step, once the env
 * write itself succeeded, is best-effort and reported separately: a
 * redeploy failure does not undo the (already real) credential save.
 */

import { z } from "zod";
import { authenticate, getStoredSociety } from "@/lib/account";
import { INTEGRATION_IDS, isIntegrationId, type IntegrationId } from "@/lib/credential-integrations";
import {
  validateAfipCert,
  validateMercadoPago,
  validateModelKey,
  validateTreasuryOfframp,
  validateWhatsApp,
  type ValidationOutcome,
} from "@/lib/credential-validators";
import { getAllCredentialMeta, maskedHint, setCredentialMeta, type CredentialMeta } from "@/lib/credentials";
import { kvRateLimit } from "@/lib/ratelimit";
import { canonicalCuit } from "@/lib/society";
import {
  redeploySocietyApp,
  setSocietyCredentialEnvVars,
  type ProvisionEnvVar,
} from "@/lib/vercel-provision";

export const runtime = "nodejs"; // secrets pass through this route; never edge

const BodySchema = z.object({
  integration: z.string(),
  modelChoice: z.enum(["platform", "own"]).optional(),
  fields: z.record(z.string(), z.string()).optional(),
});

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const society = await getStoredSociety(auth.accountId);
  if (!society) {
    return Response.json({ ok: false, error: "sin_sociedad" }, { status: 404 });
  }

  const credentials = await getAllCredentialMeta(auth.accountId, INTEGRATION_IDS);
  return Response.json({
    ok: true,
    credentials,
    deployProjectName: society.deploy?.projectName ?? null,
  });
}

interface FieldResolution {
  ok: true;
  envVars: ProvisionEnvVar[];
  outcome: ValidationOutcome & { ok: true };
  primaryHintSource: string;
}
interface FieldFailure {
  ok: false;
  message: string;
}

function field(fields: Record<string, string>, key: string): string {
  return fields[key]?.trim() ?? "";
}

/** Validates + shapes one integration's submitted fields into the exact env
 *  vars `INTEGRATION_ENV_VARS` promises for it. Returns a failure (nothing
 *  to save) or the env vars + validation outcome to save. */
async function resolveIntegration(
  integration: IntegrationId,
  fields: Record<string, string>,
): Promise<FieldResolution | FieldFailure> {
  switch (integration) {
    case "model_key": {
      const apiKey = field(fields, "apiKey");
      if (!apiKey) return { ok: false, message: "Falta la clave de API." };
      const outcome = await validateModelKey(apiKey);
      if (!outcome.ok) return { ok: false, message: outcome.message };
      return {
        ok: true,
        envVars: [{ name: "ANTHROPIC_API_KEY", value: apiKey }],
        outcome,
        primaryHintSource: apiKey,
      };
    }
    case "mercadopago": {
      const accessToken = field(fields, "accessToken");
      if (!accessToken) return { ok: false, message: "Falta el access token." };
      const outcome = await validateMercadoPago(accessToken);
      if (!outcome.ok) return { ok: false, message: outcome.message };
      return {
        ok: true,
        envVars: [{ name: "MERCADOPAGO_ACCESS_TOKEN", value: accessToken }],
        outcome,
        primaryHintSource: accessToken,
      };
    }
    case "whatsapp": {
      const accessToken = field(fields, "accessToken");
      const phoneNumberId = field(fields, "phoneNumberId");
      if (!accessToken || !phoneNumberId) {
        return { ok: false, message: "Faltan el token de acceso o el ID del número." };
      }
      const outcome = await validateWhatsApp(accessToken, phoneNumberId);
      if (!outcome.ok) return { ok: false, message: outcome.message };
      return {
        ok: true,
        envVars: [
          { name: "WHATSAPP_ACCESS_TOKEN", value: accessToken },
          { name: "WHATSAPP_PHONE_NUMBER_ID", value: phoneNumberId },
        ],
        outcome,
        primaryHintSource: accessToken,
      };
    }
    case "afip": {
      const certPem = field(fields, "certPem");
      const keyPem = field(fields, "keyPem");
      const rawCuit = field(fields, "cuit");
      const env = field(fields, "env") || "homo";
      if (env !== "homo" && env !== "prod") {
        return { ok: false, message: "El entorno debe ser 'homo' o 'prod'." };
      }
      const cuit = canonicalCuit(rawCuit);
      if (!cuit) return { ok: false, message: "El CUIT no es válido." };
      const outcome = validateAfipCert({ certPem, keyPem, cuit });
      if (!outcome.ok) return { ok: false, message: outcome.message };
      return {
        ok: true,
        envVars: [
          { name: "AFIP_CERT_PEM", value: certPem },
          { name: "AFIP_KEY_PEM", value: keyPem },
          { name: "AFIP_CUIT", value: cuit },
          { name: "AFIP_ENV", value: env },
        ],
        outcome,
        primaryHintSource: cuit,
      };
    }
    case "treasury_offramp": {
      const apiKey = field(fields, "apiKey");
      const userId = field(fields, "userId");
      const bankAccountId = field(fields, "bankAccountId");
      const outcome = validateTreasuryOfframp({ apiKey, userId, bankAccountId });
      if (!outcome.ok) return { ok: false, message: outcome.message };
      return {
        ok: true,
        envVars: [
          { name: "MANTECA_API_KEY", value: apiKey },
          { name: "MANTECA_USER_ID", value: userId },
          { name: "MANTECA_BANK_ACCOUNT_ID", value: bankAccountId },
        ],
        outcome,
        primaryHintSource: apiKey,
      };
    }
  }
}

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  // Durable-write path (a real Vercel env-var write + redeploy): fail CLOSED
  // if the durable cross-isolate quota is down, same posture as
  // society-constitute / society-deploy.
  if (!(await kvRateLimit("society-credentials", auth.accountId, 20, 60 * 60, { failClosed: true }))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const society = await getStoredSociety(auth.accountId);
  if (!society) {
    return Response.json({ ok: false, error: "sin_sociedad" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "cuerpo_invalido", detail: parsed.error.format() },
      { status: 400 },
    );
  }
  if (!isIntegrationId(parsed.data.integration)) {
    return Response.json({ ok: false, error: "integracion_desconocida" }, { status: 400 });
  }
  const integration = parsed.data.integration;

  // The platform-default model choice: metadata only, nothing set on the
  // deployed app, so no project/deploy is required for this branch.
  if (integration === "model_key" && parsed.data.modelChoice === "platform") {
    const meta: CredentialMeta = {
      integration,
      configured: true,
      verified: false,
      maskedHint: null,
      modelChoice: "platform",
      updatedAt: new Date().toISOString(),
    };
    await setCredentialMeta(auth.accountId, integration, meta);
    return Response.json({ ok: true, integration, status: meta, redeploy: { triggered: false } });
  }

  const projectName = society.deploy?.projectName;
  if (!projectName) {
    return Response.json({ ok: false, error: "sin_deploy" }, { status: 404 });
  }

  const resolved = await resolveIntegration(integration, parsed.data.fields ?? {});
  if (!resolved.ok) {
    return Response.json(
      { ok: false, error: "validation_failed", message: resolved.message },
      { status: 422 },
    );
  }

  const envResult = await setSocietyCredentialEnvVars(projectName, resolved.envVars);
  if (envResult === null) {
    return Response.json({ ok: false, error: "no_provision_capability" }, { status: 501 });
  }
  if (!envResult.ok) {
    return Response.json(
      { ok: false, error: "env_save_failed", detail: envResult.error },
      { status: 502 },
    );
  }

  const meta: CredentialMeta = {
    integration,
    configured: true,
    verified: resolved.outcome.verified,
    maskedHint: maskedHint(resolved.primaryHintSource),
    ...(integration === "model_key" ? { modelChoice: "own" as const } : {}),
    updatedAt: new Date().toISOString(),
  };
  await setCredentialMeta(auth.accountId, integration, meta);

  const redeploy = await redeploySocietyApp(projectName);
  const redeployStatus =
    redeploy === null
      ? { triggered: false }
      : redeploy.ok
        ? { triggered: true, state: redeploy.deploymentState }
        : { triggered: true, error: redeploy.error };

  return Response.json({ ok: true, integration, status: meta, redeploy: redeployStatus });
}
