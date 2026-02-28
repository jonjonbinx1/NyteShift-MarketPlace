export default {
  name: "search",
  version: "1.1.0",
  contributor: "base",
  description:
    "Provider-agnostic web search wrapper. Delegates to the configured search provider in context.",

  config: [
    {
      key: "apiKey",
      label: "API Key",
      type: "secret",
      required: true,
      description: "API key for the configured search provider.",
      placeholder: "sk-…",
    },
    {
      key: "provider",
      label: "Search Provider",
      type: "select",
      options: ["google", "bing", "duckduckgo", "tavily", "serper"],
      default: "google",
      description: "Which search backend to use.",
    },
    {
      key: "defaultMaxResults",
      label: "Default Max Results",
      type: "number",
      default: 10,
      min: 1,
      max: 100,
      step: 1,
      description: "Default maximum number of results to return per query.",
    },
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "boolean",
      default: true,
      description: "Filter explicit content from search results.",
    },
    {
      key: "regions",
      label: "Regions",
      type: "multiselect",
      options: ["us", "eu", "asia", "global"],
      description: "Restrict search results to specific geographic regions.",
    },
  ],

  run: async ({ input, context }) => {
    const { query, maxResults = 10 } = input;

    if (!query || typeof query !== "string") {
      return { ok: false, error: "A non-empty query string is required." };
    }

    const provider = context?.searchProvider;

    if (!provider || typeof provider.search !== "function") {
      return {
        ok: false,
        error:
          "No search provider configured. Set context.searchProvider with a { search(query, opts) } implementation.",
      };
    }

    try {
      const results = await provider.search(query, { maxResults });
      return {
        ok: true,
        query,
        results: Array.isArray(results) ? results : [],
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },
};

/**
 * Interface contract — consumed by the SolixAI runtime for call validation.
 * Schema format: JSON Schema draft-07.
 * @since 1.1.0
 */
export const spec = {
  name: "search",
  version: "1.1.0",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", description: "Search query string." },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return. Defaults to 10.",
        minimum: 1,
        maximum: 100,
        default: 10,
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
        description: "Array of result objects. Shape defined by the configured search provider.",
        items: { type: "object" },
      },
      error: { type: "string", description: "Present when ok=false." },
    },
  },
  sideEffects: false,
  verify: [],
};
