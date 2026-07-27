"use strict";

const { validName, validPhone, validFreeText, escapeHTML, rateLimit, clientKey } = require("./_lib/validate");

const VALID_PAGO = new Set(["efectivo", "transferencia"]);

/**
 * POST /api/pedido — validates a delivery order and returns a
 * confirmation code. No database, no file, no third-party call: the
 * request body is read, checked, answered, and discarded.
 */
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  }

  if (!rateLimit("pedido:" + clientKey(req))) {
    return res.status(429).json({ ok: false, error: "Demasiadas solicitudes. Esperá un minuto e intentá de nuevo." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body && typeof body === "object" ? body : {};

  if (typeof body.empresa === "string" && body.empresa.trim() !== "") {
    return res.status(400).json({ ok: false, error: "No pudimos procesar tu pedido. Intentá de nuevo." });
  }

  const { nombre, tel, direccion, detalle, pago } = body;

  if (!validName(nombre)) {
    return res.status(400).json({ ok: false, error: "Escribí tu nombre real para el pedido (sólo letras, 3 a 60 caracteres)." });
  }
  if (!validPhone(tel)) {
    return res.status(400).json({ ok: false, error: "Necesitamos un teléfono válido." });
  }
  if (!validFreeText(direccion, { min: 6, max: 120 })) {
    return res.status(400).json({ ok: false, error: "Ingresá una dirección de entrega válida." });
  }
  if (!validFreeText(detalle, { min: 3, max: 240 })) {
    return res.status(400).json({ ok: false, error: "Contanos qué querés pedir, sin lenguaje inapropiado ni texto sin sentido." });
  }
  if (!VALID_PAGO.has(pago)) {
    return res.status(400).json({ ok: false, error: "Elegí una forma de pago válida." });
  }

  const codigo = "FL-DEL-" + Date.now().toString().slice(-4);
  const pagoTxt = pago === "efectivo" ? "en efectivo" : "por transferencia";
  const resumen = "Pedido de " + escapeHTML(String(nombre).trim()) + " a " + escapeHTML(String(direccion).trim()) + ". Pago " + pagoTxt + ".";

  return res.status(200).json({ ok: true, codigo, resumen });
};
