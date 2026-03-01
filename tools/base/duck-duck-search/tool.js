const DDG_API = "https://api.duckduckgo.com/";

export default {
  name: "duck-duck-search",
  version: "1.0.0",
  contributor: "base",
  description:
    "Web search via the DuckDuckGo Instant Answers API. No API key required.",

  config: [
    {
      key: "defaultMaxResults",
      label: "Default Max Results",
      type: "number",
      default: 10,
      min: 1,
      max: 50,
      step: 1,
      description: "Default maximum number of results to return per query.",
    },
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["strict", "moderate", "off"],
      default: "moderate",
      description: "Safe-search filtering level.",
    },
  ],

  run: async ({ input }) => {
    const { query, maxResults = 10, safeSearch = "moderate" } = input;

    if (!query || typeof query !== "string") {
      return { ok: false, error: "A non-empty query string is required." };
    }

    // Map human-readable safe-search level to DDG kp parameter
    const kpMap = { strict: "1", moderate: "-1", off: "-2" };
    const kp = kpMap[safeSearch] ?? "-1";

    const url = new URL(DDG_API);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("no_redirect", "1");
    url.searchParams.set("no_html", "1");
    url.searchParams.set("skip_disambig", "1");
    url.searchParams.set("kp", kp);

    let data;
    try {
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "SolixAI/1.0 (+https://solixai.dev)" },
      });
      if (!res.ok) {
        return {
          ok: false,
          error: `DuckDuckGo API returned HTTP ${res.status}.`,
        };
      }
      data = await res.json();
    } catch (err) {
      return { ok: false, error: `Network error: ${err.message}` };
    }

    const results = [];

    // 1. Direct answer (e.g. "The capital of France is Paris")
    if (data.Answer) {
      results.push({
        type: "answer",
        text: data.Answer,
        url: null,
        source: data.AnswerType || "ddg-answer",
      });
    }

    // 2. Abstract (Wikipedia-style summary)
    if (data.AbstractText) {
      results.push({
        type: "abstract",
        text: data.AbstractText,
        url: data.AbstractURL || null,
        source: data.AbstractSource || "ddg-abstract",
      });
    }

    // 3. Top web results
    for (const r of data.Results ?? []) {
      if (results.length >= maxResults) break;
      if (r.Text && r.FirstURL) {
        results.push({ type: "result", text: r.Text, url: r.FirstURL });
      }
    }

    // 4. Related topics (flatten nested groups)
    const topics = data.RelatedTopics ?? [];
    for (const t of topics) {
      if (results.length >= maxResults) break;
      // Flat topic
      if (t.Text && t.FirstURL) {
        results.push({ type: "related", text: t.Text, url: t.FirstURL });
        continue;
      }
      // Grouped topic — iterate sub-topics
      for (const sub of t.Topics ?? []) {
        if (results.length >= maxResults) break;
        if (sub.Text && sub.FirstURL) {
          results.push({ type: "related", text: sub.Text, url: sub.FirstURL });
        }
      }
    }

    return {
      ok: true,
      query,
      results,
      meta: {
        definition: data.Definition || null,
        definitionSource: data.DefinitionSource || null,
        definitionURL: data.DefinitionURL || null,
      },
    };
  },
};

/**
 * Interface contract — consumed by the SolixAI runtime for call validation.
 * Schema format: JSON Schema draft-07.
 * @since 1.0.0
 */
export const spec = {
  name: "duck-duck-search",
  version: "1.0.0",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", description: "Search query string." },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return. Defaults to 10.",
        minimum: 1,
        maximum: 50,
        default: 10,
      },
      safeSearch: {
        type: "string",
        enum: ["strict", "moderate", "off"],
        description: "Safe-search filtering level. Defaults to moderate.",
        default: "moderate",
      },
    },
  },
  outputSchema: {
    type: "object",
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
      query: { type: "string" },
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["answer", "abstract", "result", "related"],
            },
            text: { type: "string" },
            url: { type: ["string", "null"] },
            source: { type: "string" },
          },
        },
      },
      meta: {
        type: "object",
        properties: {
          definition: { type: ["string", "null"] },
          definitionSource: { type: ["string", "null"] },
          definitionURL: { type: ["string", "null"] },
        },
      },
      error: { type: "string", description: "Present when ok=false." },
    },
  },
  sideEffects: false,
  verify: [],
};
