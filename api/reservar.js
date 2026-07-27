"use strict";

const {
  validName, validPhone, validFreeText, escapeHTML,
  dayOf, daysAhead, freeSlot, VALID_HOURS, VALID_PERSONAS, rateLimit, clientKey
} = require("./_lib/validate");

/**
 * POST /api/reservar — validates a table-reservation request and returns
 * a confirmation code. No database, no file, no third-party call: the
 * request body is read, checked, answered, and discarded. Nothing about
 * the requester is logged beyond the generic outcome.
 */
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  }

  if (!rateLimit("reservar:" + clientKey(req))) {
    return res.status(429).json({ ok: false, error: "Demasiadas solicitudes. Esperá un minuto e intentá de nuevo." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body && typeof body === "object" ? body : {};

  // Honeypot: bots that fill hidden fields get a generic rejection with
  // no hint about which check failed.
  if (typeof body.empresa === "string" && body.empresa.trim() !== "") {
    return res.status(400).json({ ok: false, error: "No pudimos procesar tu reserva. Intentá de nuevo." });
  }

  const { personas, fecha, hora, nombre, tel, nota, costillar } = body;

  if (!VALID_PERSONAS.has(String(personas))) {
    return res.status(400).json({ ok: false, error: "Elegí una cantidad de personas válida." });
  }
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ ok: false, error: "Elegí el día de la reserva." });
  }
  if (daysAhead(fecha) < 0) {
    return res.status(400).json({ ok: false, error: "La fecha elegida ya pasó." });
  }
  if (dayOf(fecha) === 1) {
    return res.status(400).json({ ok: false, error: "Los lunes cerramos. Probá otro día." });
  }
  if (!VALID_HOURS.has(hora)) {
    return res.status(400).json({ ok: false, error: "Falta el horario: elegí uno de los turnos con lugar." });
  }
  if (!freeSlot(fecha, hora)) {
    return res.status(409).json({ ok: false, error: "Ese turno ya se completó. Elegí otro horario." });
  }
  if (!validName(nombre)) {
    return res.status(400).json({ ok: false, error: "Escribí tu nombre real para anotar la mesa (sólo letras, 3 a 60 caracteres)." });
  }
  if (!validPhone(tel)) {
    return res.status(400).json({ ok: false, error: "Necesitamos un teléfono válido para confirmarte." });
  }
  if (nota && !validFreeText(nota, { min: 0, max: 140 })) {
    return res.status(400).json({ ok: false, error: "Revisá el campo de notas: evitá lenguaje inapropiado o texto sin sentido." });
  }
  const wantsCostillar = Boolean(costillar);
  if (wantsCostillar && daysAhead(fecha) < 1) {
    return res.status(400).json({ ok: false, error: "El costillar requiere 24 horas de anticipación." });
  }

  const cleanNombre = String(nombre).trim();
  const codigo = "FL-" + fecha.slice(8) + hora.replace(":", "") + "-" + cleanNombre.slice(0, 2).toUpperCase();
  const gente = personas === "8" ? "ocho o más" : String(personas);
  const suf = personas === "1" ? " persona" : " personas";
  const resumen = "Mesa para " + gente + suf + ", el " + fecha.split("-").reverse().join("/") +
    " a las " + hora + " h, a nombre de " + escapeHTML(cleanNombre) + "." +
    (wantsCostillar ? " Costillar a la cruz encargado." : "");

  return res.status(200).json({ ok: true, codigo, resumen });
};
