import { exchangeCode, tokenCookies, readCookies } from "./_lib/bungie.js";

export default async function handler(req, res) {
  const { code, state } = req.query;
  const cookies = readCookies(req);

  if (!code) return res.redirect(302, "/?error=denied");
  if (!state || state !== cookies.bng_state) return res.redirect(302, "/?error=state");

  try {
    const tokens = await exchangeCode(code);
    res.setHeader("Set-Cookie", [
      ...tokenCookies(tokens),
      "bng_state=; Path=/; Max-Age=0",
    ]);
    res.redirect(302, "/");
  } catch (e) {
    console.error(e);
    res.redirect(302, "/?error=token");
  }
}
