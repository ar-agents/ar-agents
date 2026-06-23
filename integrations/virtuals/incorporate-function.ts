/**
 * Virtuals Protocol — G.A.M.E. custom function: `incorporate_argentine_entity`
 *
 * Lets any Virtuals (G.A.M.E.) agent constitute an Argentine "Sociedad Automatizada"
 * by calling the live ar-agents.ar backend. This is the lowest-friction Virtuals path:
 * it needs only a free GAME API key (console.game.virtuals.io) — no onchain agent,
 * no $VIRTUAL, no graduation. The agent's planner decides when to call it.
 *
 * For the agent-to-agent marketplace (other agents discovering and PAYING for
 * incorporation-as-a-service with onchain escrow on Base), additionally register
 * this as an ACP Provider — see ../README.md.
 *
 * SDK: `npm i @virtuals-protocol/game @ar-agents/incorporate`
 * NOTE: confirm the exact exported class/enum names against the installed
 * @virtuals-protocol/game version (game-node README) before shipping; the shape
 * below matches the documented GameFunction(name/description/args/executable) +
 * ExecutableGameFunctionResponse(status, message) contract.
 */

import {
  GameFunction,
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
} from "@virtuals-protocol/game";
import { incorporate, type SocietyType } from "@ar-agents/incorporate";

export const incorporateArgentineEntity = new GameFunction({
  name: "incorporate_argentine_entity",
  description:
    "Constitute an Argentine 'Sociedad Automatizada' (Autonomous Legal Entity) for this agent: " +
    "a real legal wrapper with limited liability, a CUIT, banking and contract capacity, and a " +
    "public signed audit log. Call this when the agent (or its operator) wants legal standing, a " +
    "bank account, invoicing, or to become a recognized company rather than just a token/wallet.",
  args: [
    { name: "denominacion", description: "Corporate name, 3-200 chars. Avoid reserved words (Nacional, Estatal)." },
    { name: "objeto", description: "Specific corporate purpose, 20-2000 chars. What the agent actually does. Generic text is rejected." },
    { name: "capital_social", description: "Capital in ARS. Default 1 for the SOCIEDAD-IA regime.", optional: true },
    { name: "representante_nombre", description: "Optional human attachment point (administrador, art. 88/92).", optional: true },
    { name: "representante_cuit", description: "CUIT of the human representante, if provided.", optional: true },
  ] as const,
  executable: async (args, logger) => {
    try {
      const representante =
        args.representante_nombre && args.representante_cuit
          ? { nombre: String(args.representante_nombre), cuit: String(args.representante_cuit) }
          : undefined;

      const result = await incorporate({
        denominacion: String(args.denominacion),
        tipo: "SOCIEDAD-IA" as SocietyType,
        capitalSocial: Number(args.capital_social ?? 1),
        objeto: String(args.objeto),
        representante,
      });

      if (!result.ok) {
        const reasons = result.validation.findings
          .map((f) => `[${f.severity}] ${f.field}: ${f.message}`)
          .join("; ");
        logger?.(`incorporation rejected: ${reasons}`);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Incorporation rejected by validation: ${reasons}`,
        );
      }

      // Success: hand back the deploy + the public audit trail. The audit URL is the
      // agent's recomputable proof-of-conduct (verify, don't trust) and the supervisory surface.
      const payload = {
        deployUrl: result.deploy.oneClickUrl,
        auditUrl: result.audit.url,
        note:
          "Generated and ready to deploy. Full legal effect of the SOCIEDAD-IA form depends on " +
          "Argentina's AI-society bill becoming law; surface that honestly to the user.",
      };
      logger?.(`incorporated: deploy=${payload.deployUrl} audit=${payload.auditUrl}`);
      return new ExecutableGameFunctionResponse(
        ExecutableGameFunctionStatus.Done,
        JSON.stringify(payload),
      );
    } catch (err) {
      return new ExecutableGameFunctionResponse(
        ExecutableGameFunctionStatus.Failed,
        `Incorporation call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});

export default incorporateArgentineEntity;
