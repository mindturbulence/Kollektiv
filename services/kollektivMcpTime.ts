/**
 * Time and timezone MCP sub-server for Kollektiv MCP.
 * Provides get_current_time and convert_time tools.
 * Pure JavaScript — no external dependencies needed.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface TimeResult {
  timezone: string;
  datetime: string;
  day_of_week: string;
  is_dst: boolean;
}

function getCurrentTime(timezoneName: string): TimeResult {
  const tz = isValidTimezone(timezoneName) ? timezoneName : "UTC";
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";

  // Build ISO-like datetime string
  const month = get("month");
  const day = get("day");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  const tzOffset = get("timeZoneName");
  const datetime = `${year}-${month}-${day}T${hour}:${minute}:${second}${tzOffset || ""}`;

  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(now);

  // Detect DST by checking if the UTC offset contains a non-standard value
  const janOffset = -new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
  const julOffset = -new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
  const currentOffset = -now.getTimezoneOffset();
  // DST is active if current offset differs from standard time (winter) offset
  const isDst = currentOffset !== Math.min(janOffset, julOffset);

  return {
    timezone: tz,
    datetime,
    day_of_week: dayOfWeek,
    is_dst: isDst,
  };
}

interface TimeConversionResult {
  source: TimeResult;
  target: TimeResult;
  time_difference: string;
}

function convertTime(
  sourceTz: string,
  timeStr: string,
  targetTz: string,
): TimeConversionResult {
  // Validate time string format (HH:MM)
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) {
    throw new Error("Invalid time format. Expected HH:MM (24-hour format)");
  }

  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Invalid time values. Hours 0-23, minutes 0-59.");
  }

  // Validate timezones
  if (!isValidTimezone(sourceTz)) throw new Error(`Invalid source timezone: ${sourceTz}`);
  if (!isValidTimezone(targetTz)) throw new Error(`Invalid target timezone: ${targetTz}`);

  // Get current date in source timezone to construct a reference date
  const now = new Date();
  const sourceFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: sourceTz,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const sourceParts = sourceFormatter.formatToParts(now);
  const sYear = sourceParts.find(p => p.type === "year")?.value || "2024";
  const sMonth = sourceParts.find(p => p.type === "month")?.value || "01";
  const sDay = sourceParts.find(p => p.type === "day")?.value || "01";

  // Build a date string in the source timezone at the given time
  const sourceDateStr = `${sYear}-${sMonth}-${sDay}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;

  // Create a Date object — the string is interpreted as UTC, then we adjust
  // by the source timezone offset to get the correct instant.
  // We need to find the UTC offset of the source timezone at that date.
  const sourceOffsetMs = getTzOffsetMs(sourceTz, new Date(`${sYear}-${sMonth}-${sDay}T12:00:00Z`));
  const sourceInstant = new Date(new Date(sourceDateStr + "Z").getTime() + sourceOffsetMs);

  // Get the target timezone's UTC offset at that same instant
  const targetOffsetMs = getTzOffsetMs(targetTz, sourceInstant);

  // Format the source instant in both timezones
  const sourceResult = formatTimeInTz(sourceInstant, sourceTz);
  const targetResult = formatTimeInTz(sourceInstant, targetTz);

  // Calculate time difference
  const diffHours = (targetOffsetMs - sourceOffsetMs) / 3600000;
  const timeDiffStr = diffHours >= 0
    ? `+${diffHours.toFixed(diffHours % 1 === 0 ? 1 : 2).replace(/\.?0+$/, "")}h`
    : `${diffHours.toFixed(diffHours % 1 === 0 ? 1 : 2).replace(/\.?0+$/, "")}h`;

  return {
    source: sourceResult,
    target: targetResult,
    time_difference: timeDiffStr,
  };
}

function getTzOffsetMs(tz: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(date);
  const offsetStr = parts.find(p => p.type === "timeZoneName")?.value || "";
  // Parse offset like "GMT+5" or "GMT-5:30" or "UTC"
  const match = offsetStr.match(/([+-])(\d{1,2})(?::(\d{2}))?/);
  if (match) {
    const sign = match[1] === "+" ? 1 : -1;
    const h = parseInt(match[2], 10);
    const m = match[3] ? parseInt(match[3], 10) : 0;
    return sign * (h * 3600000 + m * 60000);
  }
  return 0; // UTC / GMT without offset
}

function formatTimeInTz(date: Date, tz: string): TimeResult {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";

  const datetime = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${get("timeZoneName") || ""}`;
  const dayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(date);

  // DST detection
  const yr = parseInt(get("year") || "2024", 10);
  const jan = new Date(yr, 0, 1);
  const jul = new Date(yr, 6, 1);
  const janOff = -jan.getTimezoneOffset();
  const julOff = -jul.getTimezoneOffset();
  const nowOff = -date.getTimezoneOffset();
  const isDst = nowOff !== Math.min(janOff, julOff);

  return { timezone: tz, datetime, day_of_week: dayOfWeek, is_dst: isDst };
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

export function createTimeMcpServer(): Server {
  const server = new Server(
    { name: "kollektiv-time", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  const localTz = getLocalTimezone();

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_current_time",
        description: `Get current time in a specific timezone. Uses '${localTz}' as the local timezone hint.`,
        inputSchema: {
          type: "object",
          properties: {
            timezone: {
              type: "string",
              description: `IANA timezone name (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo'). Default: '${localTz}'`,
            },
          },
          required: [],
        },
      },
      {
        name: "convert_time",
        description: "Convert time between timezones. Returns the time in the target timezone.",
        inputSchema: {
          type: "object",
          properties: {
            source_timezone: {
              type: "string",
              description: `Source IANA timezone name (e.g., 'America/New_York', 'Europe/London').`,
            },
            time: {
              type: "string",
              description: "Time to convert in 24-hour format (HH:MM)",
            },
            target_timezone: {
              type: "string",
              description: `Target IANA timezone name (e.g., 'Asia/Tokyo', 'America/New_York').`,
            },
          },
          required: ["source_timezone", "time", "target_timezone"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;

    try {
      if (toolName === "get_current_time") {
        const timezone = args?.timezone ? String(args.timezone) : localTz;
        if (!isValidTimezone(timezone)) {
          return {
            content: [{ type: "text", text: `Error: Invalid timezone "${timezone}". Use IANA timezone names like 'America/New_York'.` }],
            isError: true,
          };
        }
        const result = getCurrentTime(timezone);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (toolName === "convert_time") {
        const sourceTz = args?.source_timezone ? String(args.source_timezone) : "";
        const time = args?.time ? String(args.time) : "";
        const targetTz = args?.target_timezone ? String(args.target_timezone) : "";

        if (!sourceTz || !time || !targetTz) {
          return {
            content: [{ type: "text", text: "Error: source_timezone, time, and target_timezone are required." }],
            isError: true,
          };
        }

        if (!isValidTimezone(sourceTz)) {
          return { content: [{ type: "text", text: `Error: Invalid source timezone "${sourceTz}".` }], isError: true };
        }
        if (!isValidTimezone(targetTz)) {
          return { content: [{ type: "text", text: `Error: Invalid target timezone "${targetTz}".` }], isError: true };
        }

        const result = convertTime(sourceTz, time, targetTz);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}
