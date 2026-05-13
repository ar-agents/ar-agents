// Claims / Mediation — `/post-purchase/v1/claims/{id}`,
// `/post-purchase/v2/claims/{id}/returns`,
// `/post-purchase/v1/claims/{id}/evidences`,
// `/post-purchase/v1/claims/{id}/messages`.
//
// Implements the 2-day SLA defender pattern: list open claims, fetch
// details, upload evidence (one-shot, immutable per spec), respond in the
// mediation thread.

import type { MeliClient } from "./client";
import {
  Claim,
  ClaimEvidence,
  ClaimMessage,
  EvidenceUploadRequest,
  type Claim as TClaim,
  type ClaimEvidence as TClaimEvidence,
  type ClaimMessage as TClaimMessage,
  type EvidenceUploadRequest as TEvidenceUploadRequest,
} from "./schemas/claim";
import { z } from "zod";

// ---------------------------------------------------------------------------
// List claims — `/post-purchase/v1/claims/search?stage=...`
// ---------------------------------------------------------------------------

const ClaimsSearchResponse = z.object({
  paging: z.object({
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
  }),
  data: z.array(Claim),
});
export type ClaimsSearchResponse = z.infer<typeof ClaimsSearchResponse>;

export interface SearchClaimsOptions {
  stage?: "claim" | "dispute" | "mediation";
  status?: "opened" | "closed" | "expired";
  resource?: "order" | "shipment" | "payment";
  resourceId?: number;
  limit?: number;
  offset?: number;
}

export async function searchClaims(
  client: MeliClient,
  options: SearchClaimsOptions = {},
): Promise<ClaimsSearchResponse> {
  const query: Record<string, string | number> = {};
  if (options.stage !== undefined) query["stage"] = options.stage;
  if (options.status !== undefined) query["status"] = options.status;
  if (options.resource !== undefined) query["resource"] = options.resource;
  if (options.resourceId !== undefined) query["resource_id"] = options.resourceId;
  if (options.limit !== undefined) query["limit"] = options.limit;
  if (options.offset !== undefined) query["offset"] = options.offset;
  return client.fetch<ClaimsSearchResponse>({
    method: "GET",
    path: `/post-purchase/v1/claims/search`,
    query,
    responseSchema: ClaimsSearchResponse,
  });
}

export async function getClaim(client: MeliClient, claimId: number): Promise<TClaim> {
  return client.fetch<TClaim>({
    method: "GET",
    path: `/post-purchase/v1/claims/${claimId}`,
    responseSchema: Claim,
  });
}

// ---------------------------------------------------------------------------
// Evidence — one-shot upload per spec
// ---------------------------------------------------------------------------

const ClaimEvidenceListResponse = z.object({
  evidences: z.array(ClaimEvidence),
});
export type ClaimEvidenceListResponse = z.infer<typeof ClaimEvidenceListResponse>;

export async function listClaimEvidences(
  client: MeliClient,
  claimId: number,
): Promise<ClaimEvidenceListResponse> {
  return client.fetch<ClaimEvidenceListResponse>({
    method: "GET",
    path: `/post-purchase/v1/claims/${claimId}/evidences`,
    responseSchema: ClaimEvidenceListResponse,
  });
}

/**
 * Upload evidence to a claim. **Immutable per spec** — once submitted,
 * cannot be changed. The agent flow should compose all evidence in one
 * call; rejected submissions cannot be amended without opening a new
 * claim cycle.
 */
export async function uploadClaimEvidence(
  client: MeliClient,
  claimId: number,
  payload: TEvidenceUploadRequest,
): Promise<TClaimEvidence> {
  const validated = EvidenceUploadRequest.parse(payload);
  return client.fetch<TClaimEvidence>({
    method: "POST",
    path: `/post-purchase/v1/claims/${claimId}/evidences`,
    body: validated,
    responseSchema: ClaimEvidence,
  });
}

// ---------------------------------------------------------------------------
// Mediation message thread
// ---------------------------------------------------------------------------

const ClaimMessagesResponse = z.object({
  messages: z.array(ClaimMessage),
});
export type ClaimMessagesResponse = z.infer<typeof ClaimMessagesResponse>;

export async function listClaimMessages(
  client: MeliClient,
  claimId: number,
): Promise<ClaimMessagesResponse> {
  return client.fetch<ClaimMessagesResponse>({
    method: "GET",
    path: `/post-purchase/v1/claims/${claimId}/messages`,
    responseSchema: ClaimMessagesResponse,
  });
}

export async function postClaimMessage(
  client: MeliClient,
  claimId: number,
  message: string,
): Promise<TClaimMessage> {
  return client.fetch<TClaimMessage>({
    method: "POST",
    path: `/post-purchase/v1/claims/${claimId}/messages`,
    body: { message },
    responseSchema: ClaimMessage,
  });
}

// ---------------------------------------------------------------------------
// Returns — `/post-purchase/v2/claims/{id}/returns`
// ---------------------------------------------------------------------------

const ReturnReviewRequest = z.object({
  decision: z.enum(["accepted", "rejected"]),
  reason: z.string().optional(),
});
export type ReturnReviewRequest = z.infer<typeof ReturnReviewRequest>;

const ReturnReviewResponse = z.object({
  status: z.string(),
  decision: z.enum(["accepted", "rejected"]).optional(),
  date: z.string().optional(),
});
export type ReturnReviewResponse = z.infer<typeof ReturnReviewResponse>;

export async function reviewReturn(
  client: MeliClient,
  returnId: number,
  payload: ReturnReviewRequest,
): Promise<ReturnReviewResponse> {
  const validated = ReturnReviewRequest.parse(payload);
  return client.fetch<ReturnReviewResponse>({
    method: "POST",
    path: `/post-purchase/v1/returns/${returnId}/return-review`,
    body: validated,
    responseSchema: ReturnReviewResponse,
  });
}

// ---------------------------------------------------------------------------
// Defender pattern — orchestration helper
// ---------------------------------------------------------------------------

export interface DefendClaimInput {
  claimId: number;
  evidences: TEvidenceUploadRequest[];
  /** Optional message to post in the mediation thread alongside evidence. */
  message?: string;
}

export interface DefendClaimResult {
  claim: TClaim;
  uploadedEvidences: TClaimEvidence[];
  /** Evidences that failed to upload, in the same order they were submitted.
   *  When non-empty, the claim is partially defended — surface this to the
   *  human for manual review. */
  failedEvidences: { evidence: TEvidenceUploadRequest; error: unknown }[];
  messagePosted: TClaimMessage | null;
}

/**
 * The 2-day SLA defender flow. Loads claim metadata, uploads evidences
 * **sequentially** (NOT in parallel — see below), and optionally posts a
 * closing message.
 *
 * Why sequential. MELI's `/claims/{id}/evidences` endpoint has one-shot
 * semantics per evidence-type: if N requests land concurrently, MELI may
 * persist some, reject others as duplicates, or close the evidence window
 * mid-batch — leaving the claim half-defended with no way to amend.
 * Sequential uploads cap the blast radius: on failure, we stop and return
 * the partial state so the caller can decide whether to retry, escalate, or
 * proceed with the message.
 *
 * The cost is latency (~N × 200ms instead of ~200ms). For a typical 3-piece
 * defence under MELI's 2-day SLA, that's a non-issue.
 */
export async function defendClaim(
  client: MeliClient,
  input: DefendClaimInput,
): Promise<DefendClaimResult> {
  const claim = await getClaim(client, input.claimId);
  const uploaded: TClaimEvidence[] = [];
  const failed: { evidence: TEvidenceUploadRequest; error: unknown }[] = [];
  for (const evidence of input.evidences) {
    try {
      uploaded.push(await uploadClaimEvidence(client, input.claimId, evidence));
    } catch (err) {
      failed.push({ evidence, error: err });
      // Stop on first failure — we don't know whether MELI persisted partial
      // state, and we don't want the agent to keep stomping on the claim.
      break;
    }
  }
  let messagePosted: TClaimMessage | null = null;
  if (input.message && failed.length === 0) {
    messagePosted = await postClaimMessage(client, input.claimId, input.message);
  }
  return {
    claim,
    uploadedEvidences: uploaded,
    failedEvidences: failed,
    messagePosted,
  };
}
