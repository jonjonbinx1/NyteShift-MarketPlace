import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export default {
  name: "http",
  version: "1.0.0",
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
