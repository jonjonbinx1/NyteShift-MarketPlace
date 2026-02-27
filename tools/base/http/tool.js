import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export default {
  name: "http",
  version: "1.1.0",
  contributor: "base",
  description: "Perform HTTP GET/POST requests and download files.",

  run: async ({ input, context }) => {
    const { action } = input;

    switch (action) {
      case "get": {
        const response = await fetch(input.url, {
          headers: input.headers ?? {},
        });
        const body = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        };
      }

      case "post": {
        const headers = { "Content-Type": "application/json", ...(input.headers ?? {}) };
        const response = await fetch(input.url, {
          method: "POST",
          headers,
          body: typeof input.body === "string" ? input.body : JSON.stringify(input.body),
        });
        const body = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        };
      }

      case "download": {
        const response = await fetch(input.url, {
          headers: input.headers ?? {},
        });
        if (!response.ok) {
          return { ok: false, status: response.status, error: response.statusText };
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const dest = resolve(input.dest);
        await writeFile(dest, buffer);
        return { ok: true, path: dest, size: buffer.length };
      }

      default:
        return {
          ok: false,
          error: `Unknown action "${action}". Supported: get, post, download.`,
        };
    }
  },
};

/**
 * Interface contract — consumed by the SolixAI runtime for call validation.
 * Schema format: JSON Schema draft-07.
 * @since 1.1.0
 */
export const spec = {
  name: "http",
  version: "1.1.0",
  inputSchema: {
    type: "object",
    required: ["action", "url"],
    properties: {
      action: {
        type: "string",
        enum: ["get", "post", "download"],
        description: "HTTP operation to perform.",
      },
      url: { type: "string", format: "uri", description: "Target URL." },
      headers: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Optional HTTP headers.",
      },
      body: {
        description: "Request body. Required for action=post.",
        oneOf: [{ type: "string" }, { type: "object" }],
      },
      dest: {
        type: "string",
        description: "Local file path to save download. Required for action=download.",
      },
    },
  },
  outputSchema: {
    type: "object",
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
      status: { type: "number", description: "HTTP status code." },
      headers: { type: "object", additionalProperties: { type: "string" } },
      body: { type: "string", description: "Response body. Returned for action=get and action=post." },
      path: { type: "string", description: "Saved file path. Returned for action=download." },
      size: { type: "number", description: "Downloaded bytes. Returned for action=download." },
      error: { type: "string", description: "Present when ok=false." },
    },
  },
  sideEffects: true,
  verify: ["filesystem.stat"],
};
