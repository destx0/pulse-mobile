// Reading a Strong export. Strong writes one row per set — the date and the workout's name on every row, the workout's
// own length in "Duration (sec)", the set's time in "Seconds" — and puts a note or a rest-timer marker in the set-order
// column of its own row. This reads that file into the gym log's shapes and nothing else: no database, no clock.
//
// The parsing is deliberately forgiving in the two places a real export bites: the delimiter (Strong's newer files are
// semicolon-separated, older ones comma) and the note rows, which carry no weight, reps or time and would otherwise be
// dropped along with the text they exist to hold.
import { fromWall, localDay } from "@/lib/time";
import type { GymSet, GymSession, SetType } from "./types";

/** Bumped when the mapping changes enough that an old import should be redone. */
export const IMPORT_VERSION = 1;

/** The longest a session is believed to be. A timer left running wrote 47-hour workouts in the real export. */
export const MAX_SESSION_SEC = 6 * 3600;
/** The shortest: a workout with one set and a timer stopped at once still took a minute. */
export const MIN_SESSION_SEC = 60;

export type ImportedSet = Pick<GymSet, "setNo" | "weightKg" | "reps" | "seconds" | "distanceM" | "rpe" | "type" | "note"> & {
  /** The name as the file writes it: the caller maps it to a catalogue id or makes it a custom exercise. */
  exercise: string;
};

export type ImportedSession = {
  day: string;
  startTs: number;
  endTs: number;
  name: string;
  notes: string | null;
  sets: ImportedSet[];
};

export type ImportSummary = {
  sessions: number;
  sets: number;
  rows: number;
  skipped: number;
  notes: number;
  /** Distinct exercise names, with how many sets each carried, most first. */
  names: { name: string; sets: number }[];
  from: string | null;
  to: string | null;
  /** Sessions put in by the caps above: the screen warns that a timer was left running. */
  cappedDuration: number;
};

export type ImportResult = { sessions: ImportedSession[]; summary: ImportSummary };

/**
 * A real CSV reader: quoted fields, embedded separators and newlines, doubled quotes, a BOM and CRLF. The delimiter is
 * decided once from the header, because Strong's own export is semicolon-separated in some locales and comma in others,
 * and a split on commas would shift every row by one column without ever failing.
 */
export function parseCsvRows(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const head = s.slice(0, s.search(/[\r\n]/) < 0 ? s.length : s.search(/[\r\n]/));
  const sep = (head.split(";").length - 1) > (head.split(",").length - 1) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const num = (v: string | undefined): number => {
  const n = parseFloat(String(v ?? "").replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** "1h 5m", "52m", "1:05:00" or "3720" as seconds. */
function durationSeconds(v: string): number {
  const s = v.trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const clock = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0);
  let total = 0;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/gi)) {
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    total += u.startsWith("h") ? n * 3600 : u.startsWith("m") ? n * 60 : n;
  }
  return total;
}

/** "2021-08-30 17:56:13" (and the ISO form) as an instant in `tz`, and its local day. */
function whenOf(raw: string, tz: string): { ts: number; day: string } | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const civil = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}`;
  const ts = fromWall(civil, tz);
  return Number.isFinite(ts) ? { ts, day: localDay(ts, tz) } : null;
}

/** True when a header row looks like a Strong export, so the import screen can say what it found. */
export function looksLikeStrong(header: string[]): boolean {
  const h = header.map(norm);
  return h.includes("exercise name") && h.includes("set order");
}

export type ImportOptions = { timeZone: string };

/**
 * Reads the whole file. Sessions are keyed by start time and name, so two sessions in one day stay two, and a row with a
 * note instead of a set hangs its text on the exercise it follows in the same session.
 */
export function importStrongCsv(text: string, opts: ImportOptions): ImportResult {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return { sessions: [], summary: emptySummary() };
  const header = rows[0].map(norm);
  const at = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const col = {
    date: at("date", "workout date"),
    name: at("workout name", "workout"),
    duration: at("duration sec", "duration secs", "duration"),
    exercise: at("exercise name", "exercise"),
    setOrder: at("set order", "set"),
    weight: at("weight kg", "weight lbs", "weight lb", "weight"),
    reps: at("reps", "repetitions"),
    rpe: at("rpe"),
    distance: at("distance meters", "distance m", "distance"),
    seconds: at("seconds"),
    note: at("notes", "note", "comment"),
    sessionNote: at("workout notes", "workout note"),
  };
  if (col.exercise < 0 || col.date < 0) return { sessions: [], summary: emptySummary() };
  // A "Weight (lbs)" header means every weight is in pounds; "(kg)" or bare "Weight" is taken as kilograms, which is what
  // a metric Strong account writes and what the import screen says it assumes.
  const pounds = header.includes("weight lbs") || header.includes("weight lb");

  const byKey = new Map<string, ImportedSession & { ordered: ImportedSet[] }>();
  const names = new Map<string, number>();
  let skipped = 0;
  let notes = 0;
  let capped = 0;
  let kept = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const when = whenOf(r[col.date] ?? "", opts.timeZone);
    const exercise = (r[col.exercise] ?? "").trim();
    if (!when || !exercise) {
      skipped++;
      continue;
    }
    const rawOrder = (r[col.setOrder] ?? "").trim();
    const setOrder = /^\d+$/.test(rawOrder) ? Number(rawOrder) : null;
    const note = (r[col.note] ?? "").trim();
    const sessionName = (r[col.name] ?? "").trim() || exercise;
    const key = `${when.ts}|${sessionName}`;
    let session = byKey.get(key);
    if (!session) {
      const raw = durationSeconds(r[col.duration] ?? "");
      const cappedTo = Math.max(MIN_SESSION_SEC, Math.min(MAX_SESSION_SEC, raw || MIN_SESSION_SEC));
      if (raw > MAX_SESSION_SEC) capped++;
      session = {
        day: when.day,
        startTs: when.ts,
        endTs: when.ts + cappedTo,
        name: sessionName,
        notes: (r[col.sessionNote] ?? "").trim() || null,
        sets: [],
        ordered: [],
      };
      byKey.set(key, session);
    }

    // A note or a rest-timer marker is its own row. Its text belongs to the exercise it follows, not to a set that does
    // not exist: the real export has 125 notes and every one of them is on such a row.
    if (setOrder == null) {
      if (!note) {
        skipped++;
        continue;
      }
      notes++;
      let target: ImportedSet | undefined;
      for (let j = session.ordered.length - 1; j >= 0; j--) {
        if (session.ordered[j].exercise === exercise) {
          target = session.ordered[j];
          break;
        }
      }
      if (target) target.note = target.note ? `${target.note}\n${note}` : note;
      else session.notes = session.notes ? `${session.notes}\n${note}` : note;
      continue;
    }

    const weight = Math.abs(num(r[col.weight])) * (pounds ? 0.45359237 : 1);
    const reps = Math.max(0, Math.round(num(r[col.reps])));
    const seconds = Math.max(0, num(r[col.seconds]));
    const distanceM = Math.max(0, num(r[col.distance]));
    const rpeRaw = num(r[col.rpe]);
    const rpe = rpeRaw >= 1 && rpeRaw <= 10 ? rpeRaw : null;
    // A row with nothing measured is not a set: Strong leaves the placeholder behind when a set was added and never
    // filled in.
    if (!weight && !reps && !seconds && !distanceM) {
      skipped++;
      continue;
    }
    const type: SetType = "normal";
    const set: ImportedSet = {
      exercise,
      setNo: setOrder,
      weightKg: Math.round(weight * 1000) / 1000,
      reps,
      seconds: seconds > 0 ? seconds : null,
      distanceM: distanceM > 0 ? Math.round(distanceM * 10) / 10 : null,
      rpe,
      type,
      note: note || null,
    };
    session.sets.push(set);
    session.ordered.push(set);
    kept++;
    names.set(exercise, (names.get(exercise) ?? 0) + 1);
  }

  const sessions: ImportedSession[] = [];
  for (const s of byKey.values()) {
    if (!s.sets.length) continue;
    sessions.push({ day: s.day, startTs: s.startTs, endTs: s.endTs, name: s.name, notes: s.notes, sets: s.sets });
  }
  sessions.sort((a, b) => a.startTs - b.startTs);

  return {
    sessions,
    summary: {
      sessions: sessions.length,
      sets: kept,
      rows: rows.length - 1,
      skipped,
      notes,
      names: [...names.entries()].sort((a, b) => b[1] - a[1]).map(([name, sets]) => ({ name, sets })),
      from: sessions[0]?.day ?? null,
      to: sessions[sessions.length - 1]?.day ?? null,
      cappedDuration: capped,
    },
  };
}

function emptySummary(): ImportSummary {
  return { sessions: 0, sets: 0, rows: 0, skipped: 0, notes: 0, names: [], from: null, to: null, cappedDuration: 0 };
}

/** A session's wall-clock length, for the summary's "48 min" when it is not imported. */
export const sessionLength = (s: Pick<GymSession, "startTs" | "endTs">) => Math.max(0, (s.endTs ?? 0) - s.startTs);
