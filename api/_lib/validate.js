"use strict";

/**
 * Shared server-side validation & security helpers for the Fuego Lento
 * API routes. Mirrors the client-side checks in script.js — the client
 * copy exists only for instant UX feedback; this is the copy that is
 * actually trusted. Nothing here reads from or writes to any storage:
 * every request is validated, answered, and forgotten.
 */

const BAD_WORDS = [
  "puta", "puto", "mierda", "boludo", "pelotudo", "forro", "cornudo", "pendejo",
  "concha", "carajo", "gil", "imbecil", "idiota", "estupido", "estúpido",
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "dick", "whore",
  "sudaca"
];

function norm(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function hasBadWords(text) {
  const n = norm(text);
  const words = n.split(/[^a-z]+/).filter(Boolean);
  return BAD_WORDS.some((w) => words.includes(w) || n.includes(w));
}

function isSpammy(text) {
  if (/(.)\1{4,}/.test(text)) return true;
  if (/^[0-9\s.,!?-]+$/.test(text) && text.trim().length > 0) return true;
  const letters = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  return text.trim().length > 4 && letters / text.length < 0.35;
}

const NAME_RE = /^[A-Za-zÀ-ÿ'’.-][A-Za-zÀ-ÿ'’ .-]{1,58}[A-Za-zÀ-ÿ'’.-]$/;

function validName(v) {
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t.length >= 3 && t.length <= 60 && NAME_RE.test(t) && !hasBadWords(t) && !isSpammy(t);
}

function validPhone(v) {
  if (typeof v !== "string") return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function validFreeText(v, { min = 1, max = 240 } = {}) {
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (t.length < min || t.length > max) return false;
  if (hasBadWords(t)) return false;
  if (isSpammy(t)) return false;
  return true;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function dayOf(s) {
  if (!s || typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return -1;
  const p = s.split("-");
  const d = new Date(+p[0], +p[1] - 1, +p[2], 12);
  if (Number.isNaN(d.getTime())) return -1;
  return d.getDay();
}

function daysAhead(s) {
  if (!s || typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return -1;
  const p = s.split("-");
  const d = new Date(+p[0], +p[1] - 1, +p[2], 12);
  if (Number.isNaN(d.getTime())) return -1;
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

const VALID_HOURS = new Set(["12:30", "13:30", "14:30", "20:30", "21:00", "21:30", "22:30"]);
const VALID_PERSONAS = new Set(["1", "2", "3", "4", "6", "8"]);

function freeSlot(fecha, h) {
  if (!fecha) return true;
  const s = fecha + h;
  let n = 7;
  for (let i = 0; i < s.length; i++) n = (n * 33 + s.charCodeAt(i)) >>> 0;
  return n % 6 !== 0;
}

/* ---------------------------------------------------------------------
 * Best-effort in-memory rate limiter. Serverless instances are ephemeral
 * and this resets on cold start, so it is defense-in-depth rather than a
 * hard guarantee — real deployments would back this with an edge/KV
 * store. It still stops the common case: a single client hammering the
 * endpoint inside one warm instance.
 * ------------------------------------------------------------------- */
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_HITS = 8;

function rateLimit(key) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) { // guard against unbounded memory growth
    const oldestAllowed = now - WINDOW_MS;
    for (const [k, v] of hits) if (!v.some((t) => t > oldestAllowed)) hits.delete(k);
  }
  return list.length <= MAX_HITS;
}

function clientKey(req) {
  const fwd = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim();
  return ip || req.socket?.remoteAddress || "unknown";
}

module.exports = {
  hasBadWords, isSpammy, validName, validPhone, validFreeText, escapeHTML,
  dayOf, daysAhead, freeSlot, VALID_HOURS, VALID_PERSONAS, rateLimit, clientKey
};
