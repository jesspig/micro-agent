/**
 * 自定义文件 Sink 实现
 */

import type { LogRecord, Sink } from "@logtape/logtape";
import { mkdirSync, appendFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getOriginalConsole } from "./config.js";

let currentLogFile: string | null = null;
let currentLogFileCreatedAt: number = 0;

interface Granularity {
  minutes: number;
  unit: "D" | "H" | "M";
}

export function createRollingFileSink(
  logDir: string,
  gran: Granularity,
  maxSizeBytes: number,
  _sanitize: boolean = true
): Sink {
  try {
    mkdirSync(logDir, { recursive: true });
  } catch {
    // ignore
  }

  return (record: LogRecord) => {
    const filePath = getLogFilePath(logDir, gran, maxSizeBytes);
    const formatted = jsonFormatter(record);

    try {
      appendFileSync(filePath, formatted, "utf-8");
    } catch {
      // ignore
    }
  };
}

export function createConsoleSink(minLevel: string = "info"): Sink {
  const MIN_LEVEL = { debug: 0, info: 1, warning: 2, error: 3 }[minLevel] ?? 1;

  const COLORS = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    white: "\x1b[37m",
  };

  const LEVEL_BG_COLORS: Record<string, string> = {
    debug: "\x1b[100m",
    info: "\x1b[44m",
    warning: "\x1b[43m",
    error: "\x1b[41m",
  };

  return (record: LogRecord) => {
    const levelMap: Record<string, number> = { trace: -1, debug: 0, info: 1, warning: 2, error: 3, fatal: 4 };
    const recordLevel = levelMap[record.level] ?? 1;
    if (recordLevel < MIN_LEVEL) return;

    const timestamp = new Date(record.timestamp).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const level = record.level.toUpperCase().padEnd(7);
    const category = record.category.slice(1).join(".");
    let message: string;
    if (typeof record.message === "string") {
      message = record.message;
    } else if (Array.isArray(record.message) && record.message.length > 0) {
      const first = record.message[0];
      message = typeof first === "string" ? first : JSON.stringify(first);
    } else {
      message = JSON.stringify(record.message);
    }

    const bgLevel = LEVEL_BG_COLORS[record.level] ?? "";
    const coloredLevel = `${bgLevel}${COLORS.bold}${COLORS.white} ${level.trim()} ${COLORS.reset}`;
    const coloredTimestamp = `${COLORS.dim}${timestamp}${COLORS.reset}`;
    const coloredCategory = `\x1b[36m${category}\x1b[0m`;
    const coloredContext = `${COLORS.dim}`;

    let output = `${coloredTimestamp} ${coloredLevel} [${coloredCategory}] ${message}`;
    
    if (record.properties && Object.keys(record.properties).length > 0) {
      const ctxParts: string[] = [];
      const props = record.properties as Record<string, unknown>;
      for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null) continue;
        if (typeof value === "object") {
          ctxParts.push(`${key}={${Object.keys(value).join(", ")}}`);
        } else if (typeof value === "string" && value.length > 100) {
          ctxParts.push(`${key}="${value.slice(0, 50)}..."`);
        } else {
          ctxParts.push(`${key}=${value}`);
        }
      }
      if (ctxParts.length > 0) {
        output += ` ${coloredContext}{${ctxParts.join(", ")}}${COLORS.reset}`;
      }
    }

    const original = getOriginalConsole();
    if (original) {
      original.log(output);
    } else {
      console.log(output);
    }
  };
}

function getLogFilePath(
  logDir: string,
  gran: Granularity,
  maxSizeBytes: number
): string {
  const now = Date.now();

  if (currentLogFile && currentLogFileCreatedAt > 0) {
    const elapsedMinutes = (now - currentLogFileCreatedAt) / (1000 * 60);

    if (elapsedMinutes >= gran.minutes) {
      currentLogFile = null;
      currentLogFileCreatedAt = 0;
    }
  }

  if (!currentLogFile) {
    const nowDate = new Date(now);
    let iterator = 0;
    let filePath = join(logDir, generateLogFileName(nowDate, gran, iterator));

    while (existsSync(filePath)) {
      try {
        const stats = statSync(filePath);
        if (stats.size < maxSizeBytes) {
          break;
        }
      } catch {
        break;
      }
      iterator++;
      filePath = join(logDir, generateLogFileName(nowDate, gran, iterator));
    }

    currentLogFile = filePath;
    currentLogFileCreatedAt = now;

    if (!existsSync(filePath)) {
      writeFileSync(filePath, "");
    }
  }

  return currentLogFile;
}

function generateLogFileName(
  date: Date,
  gran: Granularity,
  iterator?: number
): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  let baseName = `${year}-${month}-${day}`;

  switch (gran.unit) {
    case "D":
      break;
    case "H":
      const hour = String(date.getHours()).padStart(2, "0");
      baseName += `-${hour}`;
      break;
    case "M":
      const hourM = String(date.getHours()).padStart(2, "0");
      const minute = String(date.getMinutes()).padStart(2, "0");
      baseName += `-${hourM}-${minute}`;
      break;
  }

  if (iterator !== undefined && iterator > 0) {
    baseName += `-${iterator}`;
  }

  return `${baseName}.jsonl`;
}

function jsonFormatter(record: LogRecord): string {
  return JSON.stringify({
    timestamp: new Date(record.timestamp).toISOString(),
    level: record.level,
    category: record.category,
    message: record.message,
    properties: record.properties,
  }) + "\n";
}
