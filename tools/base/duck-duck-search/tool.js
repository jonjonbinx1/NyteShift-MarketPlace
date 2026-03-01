/**
 * DuckDuckGo search using the officially documented non-JavaScript HTML
 * endpoint (https://html.duckduckgo.com/html/) for real web results, with
 * the Instant Answers JSON API (https://api.duckduckgo.com/) as a second
 * pass for factual quick-answers (definitions, calculations, etc.).
 *
 * Both endpoints are explicitly listed in DDG's own help pages and require
 * no API key.  No redirect URLs are followed — result hrefs are decoded from
 * the DDG redirect wrapper where needed.
 */

const DDG_HTML = "https://html.duckduckgo.com/html/";
const DDG_API  = "https://api.duckduckgo.com/";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; SolixAI/1.0; +https://solixai.dev)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// kp values: 1=strict, -1=moderate, -2=off
const KP = { strict: "1", moderate: "-1", off: "-2" };

/**
 * DDG's HTML endpoint wraps real URLs inside redirect hrefs like:
 *   //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F&rut=...
 * Extract and decode the actual destination.
 */
function decodeHref(href) {
  if (!href) return null;
  try {
    // Normalise protocol-relative URLs
    const full = href.startsWith("//") ? "https:" + href : href;
    const u = new URL(full);
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    // Already a real URL (sometimes DDG skips the redirect)
    if (u.hostname && u.hostname !== "duckduckgo.com") return full;
  } catch {
    // fall through
  }
  return null;
}

/** Pull all web results from the DDG HTML search page */
async function fetchHtmlResults(query, kp, maxResults) {
  const body = new URLSearchParams({ q: query, kp, b: "" });
  const res = await fetch(DDG_HTML, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`DDG HTML endpoint returned HTTP ${res.status}`);

  const html = await res.text();
  const results = [];

  /**
   * Each web result looks like:
   *   <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=...">Title text</a>
   *   …
   *   <a class="result__snippet" …>Snippet text</a>
   *   …
   *   <span class="result__url">example.com/page</span>
   *
   * We walk the raw HTML with regex; no DOM parser needed.
   */
  const resultBlockRe =
    /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  let m;
  while ((m = resultBlockRe.exec(html)) !== null) {
    if (results.length >= maxResults) break;
    const href    = m[1];
    const title   = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const snippet = m[3].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const url     = decodeHref(href);
    if (title && url) {
      results.push({ type: "web", title, snippet, url });
    }
  }

  return results;
}

/** Optional: pull a factual Instant Answer from the JSON API */
async function fetchInstantAnswer(query) {
  const url = new URL(DDG_API);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_redirect", "1");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) return null;

  const data = await res.json();

  // Only surface high-value instant fields; skip empty strings
  if (data.Answer)       return { type: "answer",   text: data.Answer,       url: null };
  if (data.AbstractText) return { type: "abstract",  text: data.AbstractText, url: data.AbstractURL || null };
  if (data.Definition)   return { type: "definition",text: data.Definition,   url: data.DefinitionURL || null };

  return null;
}

export default {
  name: "duck-duck-search",
  version: "2.0.0",
  contributor: "base",
  description:
    "Web search via DuckDuckGo's officially documented non-JS HTML endpoint. " +
    "Returns real web results. No API key required.",

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

    const kp = KP[safeSearch] ?? "-1";

    try {
      // Run both requests in parallel for speed.
      const [webResults, instant] = await Promise.all([
        fetchHtmlResults(query, kp, maxResults),
        fetchInstantAnswer(query),
      ]);

      // Prepend the instant answer if one was found.
      const results = instant ? [instant, ...webResults] : webResults;

      return {
        ok: true,
        query,
        results: results.slice(0, maxResults),
        total: results.length,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },
};

/**
 * Interface contract — consumed by the SolixAI runtime for call validation.
 * Schema format: JSON Schema draft-07.
 * @since 2.0.0
 */
export const spec = {
  name: "duck-duck-search",
  version: "2.0.0",
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
      total: { type: "number", description: "Number of results returned." },
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["web", "answer", "abstract", "definition"],
              description:
                "web = standard link result; answer/abstract/definition = instant answer.",
            },
            title:   { type: "string", description: "Result title (web results only)." },
            snippet: { type: "string", description: "Result excerpt (web results only)." },
            text:    { type: "string", description: "Instant answer text." },
            url:     { type: ["string", "null"] },
          },
        },
      },
      error: { type: "string", description: "Present when ok=false." },
    },
  },
  sideEffects: false,
  verify: [],
};
