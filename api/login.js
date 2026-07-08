import { authorizeUrl } from "./_lib/bungie.js";
import crypto from "node:crypto";

export default function handler(req, res) {
  const state = crypto.randomBytes(16).toString("hex");
  res.setHeader(
    "Set-Cookie",
    `bng_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );
  res.redirect(302, authorizeUrl(state));
}
