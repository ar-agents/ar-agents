import { NextRequest, NextResponse } from "next/server";
import { parseWebhookEvent } from "@ar-agents/mercadopago";
import { getMpClient, getMpState } from "@/lib/agent";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const event = parseWebhookEvent(body, url.searchParams);

  console.log("[MP webhook]", {
    topic: event?.topic,
    dataId: event?.dataId,
    action: event?.action,
  });

  if (!event) {
    return NextResponse.json({ received: true, ignored: "missing topic or id" });
  }

  if (event.topic === "preapproval") {
    try {
      const mp = getMpClient();
      const state = getMpState();
      const sub = await mp.getPreapproval(event.dataId);
      await state.set(sub.id, {
        status: sub.status,
        lastWebhookStatus: sub.status,
        lastWebhookAt: new Date().toISOString(),
      });
      console.log("[MP webhook] subscription updated", {
        id: sub.id,
        status: sub.status,
      });
    } catch (err) {
      console.error("[MP webhook] failed to fetch preapproval", err);
    }
  }

  return NextResponse.json({
    received: true,
    topic: event.topic,
    dataId: event.dataId,
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return NextResponse.json({
    ok: true,
    note: "MP webhook endpoint. Configure this URL in your MP Sandbox webhook settings.",
    example_url: `${url.origin}/api/webhook/mercadopago`,
  });
}
