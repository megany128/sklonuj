// The resources section is static marketing/reference content with no
// per-request or per-user data, so prerender it to plain HTML. Prerendered
// pages are served as static assets from Cloudflare's CDN and never invoke the
// Pages Function — so crawler sweeps over these pages cost nothing against the
// daily request budget. Covers /resources and every child (cases, paradigms,
// pronouns, adjectives, tips).
export const prerender = true;
