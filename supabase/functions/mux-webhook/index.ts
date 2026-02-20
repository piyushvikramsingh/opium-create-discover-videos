// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

const parseMuxSignature = (headerValue: string) => {
  const parts = headerValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  let timestamp = "";
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (!key || !value) continue;

    if (key === "t") {
      timestamp = value;
    }
    if (key === "v1") {
      signatures.push(value.toLowerCase());
    }
  }

  return { timestamp, signatures };
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
};

const verifyMuxSignature = async ({
  signatureHeader,
  rawBody,
  webhookSecret,
}: {
  signatureHeader: string;
  rawBody: string;
  webhookSecret: string;
}) => {
  const { timestamp, signatures } = parseMuxSignature(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > MAX_SIGNATURE_AGE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signedPayload = `${timestamp}.${rawBody}`;
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expectedSignature = toHex(new Uint8Array(signatureBuffer));

  return signatures.some((signature) => timingSafeEqual(signature, expectedSignature));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const muxWebhookSecret = Deno.env.get("MUX_WEBHOOK_SECRET") ?? "";

    if (!supabaseUrl || !supabaseServiceRole || !muxWebhookSecret) {
      return new Response(JSON.stringify({ error: "Supabase environment is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signatureHeader = req.headers.get("mux-signature") || req.headers.get("Mux-Signature") || "";
    if (!signatureHeader) {
      return new Response(JSON.stringify({ error: "Missing Mux signature header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const isValidSignature = await verifyMuxSignature({
      signatureHeader,
      rawBody,
      webhookSecret: muxWebhookSecret,
    });

    if (!isValidSignature) {
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    const eventType = String(payload?.type || "");
    const data = payload?.data || {};
    const passthrough = String(data?.passthrough || "").trim();

    if (!passthrough) {
      return new Response(JSON.stringify({ ok: true, ignored: "missing passthrough" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

    if (eventType === "video.upload.asset_created") {
      const assetId = String(data?.asset_id || "");
      await supabaseAdmin
        .from("videos")
        .update({
          stream_status: "processing",
          stream_asset_id: assetId || null,
          stream_error: null,
        })
        .eq("id", passthrough);

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (eventType === "video.asset.ready") {
      const playbackId = String(data?.playback_ids?.[0]?.id || "");
      const assetId = String(data?.id || "");

      if (!playbackId) {
        await supabaseAdmin
          .from("videos")
          .update({
            stream_status: "failed",
            stream_error: "Mux asset ready event missing playback id",
          })
          .eq("id", passthrough);
      } else {
        await supabaseAdmin
          .from("videos")
          .update({
            video_url: `https://stream.mux.com/${playbackId}.m3u8`,
            stream_provider: "mux",
            stream_status: "ready",
            stream_playback_id: playbackId,
            stream_asset_id: assetId || null,
            stream_error: null,
          })
          .eq("id", passthrough);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (eventType === "video.asset.errored" || eventType === "video.upload.errored") {
      const message = String(data?.errors?.messages?.[0] || data?.status || "Mux processing failed");
      await supabaseAdmin
        .from("videos")
        .update({
          stream_status: "failed",
          stream_error: message,
        })
        .eq("id", passthrough);

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, ignored: eventType || "unknown" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
