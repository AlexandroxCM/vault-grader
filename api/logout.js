export default function handler(req, res) {
  res.setHeader("Set-Cookie", [
    "bng_access=; Path=/; Max-Age=0",
    "bng_refresh=; Path=/; Max-Age=0",
  ]);
  res.redirect(302, "/");
}
