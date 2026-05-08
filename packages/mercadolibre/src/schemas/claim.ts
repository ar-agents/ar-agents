import { z } from "zod";

// ---------------------------------------------------------------------------
// Claim / Mediation — `/post-purchase/v1/claims/{id}` + `/v2/claims/{id}/returns`
// ---------------------------------------------------------------------------

export const ClaimStage = z.enum([
  "claim",
  "dispute",
  "mediation",
  "resolved",
  "cancelled",
]);
export type ClaimStage = z.infer<typeof ClaimStage>;

export const ClaimStatus = z.enum([
  "opened",
  "closed",
  "expired",
  "potential_claim",
]);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

export const ClaimReason = z.object({
  id: z.string(),
  name: z.string(),
  detail: z.string().optional(),
});
export type ClaimReason = z.infer<typeof ClaimReason>;

export const ClaimPlayer = z.object({
  role: z.enum(["complainant", "respondent", "mediator"]),
  type: z.enum(["buyer", "seller", "ml"]),
  user_id: z.number().int(),
  available_actions: z.array(z.string()).optional(),
});
export type ClaimPlayer = z.infer<typeof ClaimPlayer>;

export const Claim = z.object({
  id: z.number().int(),
  resource: z.enum(["order", "shipment", "payment"]),
  resource_id: z.number().int(),
  status: ClaimStatus,
  stage: ClaimStage,
  parent_id: z.number().int().nullable().optional(),
  type: z.string().optional(),
  reason_id: z.string().optional(),
  reason: ClaimReason.optional(),
  fulfilled: z.boolean().optional(),
  quantity_type: z.string().optional(),
  date_created: z.string(),
  last_updated: z.string().optional(),
  resolution: z
    .object({
      reason: z.string().nullable().optional(),
      decision: z.string().nullable().optional(),
      benefited: z.array(z.string()).optional(),
      date_created: z.string().optional(),
    })
    .nullable()
    .optional(),
  players: z.array(ClaimPlayer).optional(),
  related_entities: z.array(z.unknown()).optional(),
  site_id: z.string().optional(),
});
export type Claim = z.infer<typeof Claim>;

// ---------------------------------------------------------------------------
// Evidence upload — one-shot, immutable per spec.
// ---------------------------------------------------------------------------

export const EvidenceType = z.enum([
  "PROOF_OF_SHIPMENT",
  "ITEM_DESCRIPTION_VS_RECEIVED",
  "VIDEO_OF_PRODUCT",
  "INVOICE",
  "MESSAGE_THREAD",
  "DELIVERY_PROOF",
  "RETURN_PROOF",
  "OTHER",
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const ClaimEvidence = z.object({
  id: z.string().optional(),
  type: EvidenceType,
  /** Free-form text evidence description. */
  text: z.string().optional(),
  /** URL of the uploaded file (returned by attachment upload). */
  attachment_url: z.string().url().optional(),
  /** Attachment id once uploaded via /messages/attachments. */
  attachment_id: z.string().optional(),
  /** ISO 8601. */
  date_created: z.string().optional(),
});
export type ClaimEvidence = z.infer<typeof ClaimEvidence>;

export const EvidenceUploadRequest = z.object({
  evidence_type: EvidenceType,
  text: z.string().optional(),
  attachment_id: z.string().optional(),
});
export type EvidenceUploadRequest = z.infer<typeof EvidenceUploadRequest>;

// ---------------------------------------------------------------------------
// Claim message thread
// ---------------------------------------------------------------------------

export const ClaimMessage = z.object({
  id: z.string().optional(),
  date: z.string().optional(),
  sender_role: z.enum(["complainant", "respondent", "mediator"]).optional(),
  sender_user_id: z.number().int().optional(),
  message: z.string(),
  attachments: z
    .array(z.object({ url: z.string().url().optional(), name: z.string().optional() }))
    .optional(),
});
export type ClaimMessage = z.infer<typeof ClaimMessage>;
