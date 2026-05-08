import { describe, it, expect } from "vitest";
import { mockFetch, makeMeliClient } from "../src/testing";
import {
  searchClaims,
  getClaim,
  uploadClaimEvidence,
  listClaimEvidences,
  postClaimMessage,
  reviewReturn,
  defendClaim,
} from "../src";

const CLAIM_FIXTURE = {
  id: 5555,
  resource: "order" as const,
  resource_id: 1234,
  status: "opened" as const,
  stage: "claim" as const,
  date_created: "2026-05-09T00:00:00.000Z",
  type: "missing_product",
  reason_id: "PNR0001",
};

describe("claims API", () => {
  it("searchClaims hits /post-purchase/v1/claims/search with stage filter", async () => {
    const fm = mockFetch()
      .on("GET", "/post-purchase/v1/claims/search", () => ({
        status: 200,
        body: { paging: { total: 1 }, data: [CLAIM_FIXTURE] },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await searchClaims(client, { stage: "mediation" });
    expect(r.data).toHaveLength(1);
    expect(new URL(fm.requests[0]!.url).searchParams.get("stage")).toBe("mediation");
  });

  it("getClaim hits /post-purchase/v1/claims/{id}", async () => {
    const fm = mockFetch()
      .on("GET", "/post-purchase/v1/claims/5555", () => ({
        status: 200,
        body: CLAIM_FIXTURE,
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await getClaim(client, 5555);
    expect(r.id).toBe(5555);
  });

  it("uploadClaimEvidence POSTs to /claims/{id}/evidences", async () => {
    const fm = mockFetch()
      .on("POST", "/post-purchase/v1/claims/5555/evidences", (req) => ({
        status: 201,
        body: {
          type: (req.body as { evidence_type: string }).evidence_type,
          text: (req.body as { text?: string }).text,
        },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await uploadClaimEvidence(client, 5555, {
      evidence_type: "PROOF_OF_SHIPMENT",
      text: "Tracking 1234",
    });
    expect(r.type).toBe("PROOF_OF_SHIPMENT");
  });

  it("listClaimEvidences returns the evidences array", async () => {
    const fm = mockFetch()
      .on("GET", "/post-purchase/v1/claims/5555/evidences", () => ({
        status: 200,
        body: { evidences: [{ type: "PROOF_OF_SHIPMENT", text: "x" }] },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await listClaimEvidences(client, 5555);
    expect(r.evidences).toHaveLength(1);
  });

  it("postClaimMessage posts to /claims/{id}/messages", async () => {
    const fm = mockFetch()
      .on("POST", "/post-purchase/v1/claims/5555/messages", (req) => ({
        status: 200,
        body: { message: (req.body as { message: string }).message },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await postClaimMessage(client, 5555, "Adjuntamos prueba de envío.");
    expect(r.message).toBe("Adjuntamos prueba de envío.");
  });

  it("reviewReturn POSTs to /returns/{id}/return-review", async () => {
    const fm = mockFetch()
      .on("POST", "/post-purchase/v1/returns/777/return-review", (req) => ({
        status: 200,
        body: {
          status: "decided",
          decision: (req.body as { decision: string }).decision,
        },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await reviewReturn(client, 777, {
      decision: "accepted",
      reason: "shipping damage",
    });
    expect(r.decision).toBe("accepted");
  });

  it("defendClaim composes get + parallel evidence uploads + optional message", async () => {
    let getCalls = 0;
    let evidenceCalls = 0;
    let messageCalls = 0;
    const fm = mockFetch()
      .on("GET", "/post-purchase/v1/claims/5555", () => {
        getCalls++;
        return { status: 200, body: CLAIM_FIXTURE };
      })
      .on("POST", "/post-purchase/v1/claims/5555/evidences", (req) => {
        evidenceCalls++;
        return {
          status: 201,
          body: { type: (req.body as { evidence_type: string }).evidence_type },
        };
      })
      .on("POST", "/post-purchase/v1/claims/5555/messages", (req) => {
        messageCalls++;
        return { status: 200, body: { message: (req.body as { message: string }).message } };
      })
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await defendClaim(client, {
      claimId: 5555,
      evidences: [
        { evidence_type: "PROOF_OF_SHIPMENT", text: "tracking 1" },
        { evidence_type: "INVOICE", text: "factura A 0001" },
      ],
      message: "Defensa enviada.",
    });
    expect(getCalls).toBe(1);
    expect(evidenceCalls).toBe(2);
    expect(messageCalls).toBe(1);
    expect(r.uploadedEvidences).toHaveLength(2);
    expect(r.messagePosted).not.toBeNull();
  });
});
