// Bungie API helpers: OAuth token exchange, refresh, and profile fetching.
const BASE = "https://www.bungie.net";

const need = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} — set it in Vercel project settings`);
  return v;
};

export const authorizeUrl = (state) =>
  `${BASE}/en/OAuth/Authorize?client_id=${need("BUNGIE_CLIENT_ID")}&response_type=code&state=${state}`;

async function tokenRequest(body) {
  const auth = Buffer.from(
    `${need("BUNGIE_CLIENT_ID")}:${need("BUNGIE_CLIENT_SECRET")}`
  ).toString("base64");
  const r = await fetch(`${BASE}/Platform/App/OAuth/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams(body),
  });
  if (!r.ok) throw new Error(`Token request failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export const exchangeCode = (code) =>
  tokenRequest({ grant_type: "authorization_code", code });

export const refreshTokens = (refreshToken) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

// --- cookies ---------------------------------------------------------------

export function tokenCookies(tokens) {
  const opts = "Path=/; HttpOnly; Secure; SameSite=Lax";
  return [
    `bng_access=${tokens.access_token}; ${opts}; Max-Age=${tokens.expires_in}`,
    `bng_refresh=${tokens.refresh_token}; ${opts}; Max-Age=${tokens.refresh_expires_in}`,
  ];
}

export function readCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// --- authenticated API calls ------------------------------------------------

export async function bungieGet(path, accessToken) {
  const r = await fetch(`${BASE}/Platform${path}`, {
    headers: {
      "X-API-Key": need("BUNGIE_API_KEY"),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = await r.json();
  if (json.ErrorCode !== 1) {
    const err = new Error(`Bungie API error: ${json.ErrorStatus} — ${json.Message}`);
    err.status = r.status;
    throw err;
  }
  return json.Response;
}

export async function getPrimaryMembership(accessToken) {
  const resp = await bungieGet("/User/GetMembershipsForCurrentUser/", accessToken);
  const memberships = resp.destinyMemberships || [];
  if (memberships.length === 0) throw new Error("No Destiny accounts linked to this Bungie profile.");
  const primary =
    memberships.find((m) => m.membershipId === resp.primaryMembershipId) || memberships[0];
  return { membershipType: primary.membershipType, membershipId: primary.membershipId };
}

// Components: 102 profile inventory (vault), 201 character inventories,
// 205 character equipment, 305 item sockets (the perks on each copy).
export function getProfile(accessToken, membershipType, membershipId) {
  return bungieGet(
    `/Destiny2/${membershipType}/Profile/${membershipId}/?components=102,201,205,305`,
    accessToken
  );
}
