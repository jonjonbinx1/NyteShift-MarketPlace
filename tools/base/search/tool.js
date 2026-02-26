export default {
  name: "search",
  version: "1.0.0",
  contributor: "base",
  description:
    "Provider-agnostic web search wrapper. Delegates to the configured search provider in context.",

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
