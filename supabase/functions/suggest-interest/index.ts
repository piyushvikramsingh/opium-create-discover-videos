// Edge function: AI-powered interest category suggestion for clippy uploads.
// Uses Lovable AI Gateway (free Gemini Flash) to classify caption text into
// one of our preset categories. Falls back gracefully on errors.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = [
  "comedy", "music", "dance", "sports", "fitness", "food",
  "travel", "fashion", "beauty", "tech", "gaming", "education",
  "news", "art", "diy", "pets", "nature", "lifestyle",
  "motivation", "vlog",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json().catch(() => ({ text: "" }));
    const input = String(text || "").slice(0, 2000).trim();

    if (!input) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ suggestions: [], error: "AI not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const prompt = `Classify the following short video caption into up to 3 of these categories (most relevant first). Respond with ONLY a JSON array of lowercase strings from this list, no prose.\n\nCategories: ${CATEGORIES.join(", ")}\n\nCaption: """${input}"""`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a strict JSON-only classifier." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => "");
      console.warn("AI gateway error", aiResp.status, errText);
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiResp.json();
    const raw = String(data?.choices?.[0]?.message?.content || "").trim();
    let parsed: unknown = [];
    try {
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // try to extract bracketed array
      const match = raw.match(/\[[^\]]*\]/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = []; }
      }
    }

    const suggestions = (Array.isArray(parsed) ? parsed : [])
      .map((v) => String(v).toLowerCase().trim())
      .filter((v) => CATEGORIES.includes(v))
      .slice(0, 3);

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("suggest-interest error", err);
    return new Response(
      JSON.stringify({ suggestions: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
