export default {
  name: "pause",
  version: "1.0.0",
  contributor: "base",
  description:
    "Pause execution for a specified duration. Supports ISO-8601 and human-friendly durations (e.g. '1d 2h', 'PT1H30M', '1500ms').",

  config: [
    {
      key: "defaultMax",
      label: "Maximum Pause (ms)",
      type: "number",
      default: 604800000,
      min: 0,
      description:
        "Maximum allowed pause duration in milliseconds. Set to 0 to allow unlimited pauses (use with care). Default: 604800000 (7 days).",
    },
  ],

  run: async ({ input, context }) => {
    const cfg = context?.config ?? {};
    const max = typeof cfg.defaultMax === "number" ? cfg.defaultMax : 604800000;

    const toNumber = (v) => (v == null ? 0 : Number(v));

    const parseISO8601 = (s) => {
      // Accepts forms like PnDTnHnMnS (we only parse D/H/M/S)
      const iso = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;
      const m = iso.exec(s);
      if (!m) return null;
      const days = parseFloat(m[1] || 0);
      const hours = parseFloat(m[2] || 0);
      const minutes = parseFloat(m[3] || 0);
      const seconds = parseFloat(m[4] || 0);
      return Math.round((((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000);
    };

    const parseHuman = (s) => {
      // Matches tokens like '1d', '2h', '30m', '4s', '500ms' with optional spaces
      const token = /(\d+(?:\.\d+)?)(?:\s*)(d(?:ays?)?|h(?:ours?)?|m(?:ins?|in|inutes?)?|s(?:ecs?|econds?)?|ms|milliseconds?)/gi;
      let total = 0;
      let found = false;
      let match;
      while ((match = token.exec(s)) !== null) {
        found = true;
        const val = parseFloat(match[1]);
        const unit = (match[2] || "").toLowerCase();
        if (unit.startsWith("d")) total += val * 86400000;
        else if (unit.startsWith("h")) total += val * 3600000;
        else if (unit === "m" || unit.startsWith("min")) total += val * 60000;
        else if (unit.startsWith("s")) total += val * 1000;
        else if (unit === "ms" || unit.startsWith("millisecond")) total += val;
      }
      if (found) return total;
      // fall back: plain number -> treat as milliseconds
      if (/^\d+(?:\.\d+)?$/.test(s.trim())) return Number(s.trim());
      return null;
    };

    const parseDuration = (raw) => {
      if (raw == null) return null;
      if (typeof raw === "number") return raw;
      if (typeof raw === "string") {
        const str = raw.trim();
        // try ISO first
        const iso = parseISO8601(str);
        if (iso != null) return iso;
        // try human
        const human = parseHuman(str);
        if (human != null) return human;
        return null;
      }
      if (typeof raw === "object") {
        // explicit fields
        const days = toNumber(raw.days || raw.day);
        const hours = toNumber(raw.hours || raw.hour);
        const minutes = toNumber(raw.minutes || raw.min || raw.mins);
        const seconds = toNumber(raw.seconds || raw.second || raw.sec || raw.s);
        const milliseconds = toNumber(raw.milliseconds || raw.ms || raw.m);
        const total = Math.round(
          (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000 + milliseconds
        );
        if (total > 0) return total;
        // allow nested duration string
        if (typeof raw.duration === "string") return parseDuration(raw.duration);
        return null;
      }
      return null;
    };

    const requestedMs =
      parseDuration(input?.duration ?? input?.milliseconds ?? input?.ms ?? input) ?? parseDuration(input);

    if (requestedMs == null || !Number.isFinite(requestedMs)) {
      return {
        ok: false,
        error:
          'No valid duration provided. Pass `duration` (string, e.g. "1d 2h" or "PT1H"), or `milliseconds`/`ms` (number), or an object with `days`/`hours`/`minutes`/`seconds`/`milliseconds`.',
      };
    }

    if (requestedMs < 0) {
      return { ok: false, error: "Duration must be non-negative." };
    }

    if (max > 0 && requestedMs > max) {
      return {
        ok: false,
        error: `Requested pause ${requestedMs}ms exceeds configured defaultMax ${max}ms. Increase config.defaultMax to allow longer pauses.`,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, requestedMs));

    return {
      ok: true,
      pausedMs: requestedMs,
      message: `Paused for ${requestedMs} ms`,
    };
  },
};

export const spec = {
  name: "pause",
  version: "1.0.0",
  inputSchema: {
    type: "object",
    properties: {
      duration: {
        type: "string",
        description:
          "Duration string. Accepts ISO-8601 (e.g. 'P1DT2H'), or human tokens like '1d 2h 30m 5s 200ms'.",
      },
      milliseconds: { type: "number", description: "Duration in milliseconds." },
      ms: { type: "number", description: "Alias for milliseconds." },
      days: { type: "number" },
      hours: { type: "number" },
      minutes: { type: "number" },
      seconds: { type: "number" },
    },
  },
  outputSchema: {
    type: "object",
    required: ["ok", "pausedMs", "message"],
    properties: {
      ok: { type: "boolean" },
      pausedMs: { type: "number" },
      message: { type: "string" },
      error: { type: "string" },
    },
  },
  sideEffects: true,
};
