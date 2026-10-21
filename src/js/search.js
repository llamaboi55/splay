// Finding apps as you type. Prefix matches beat word starts, which beat initials
// ("vsc" for Visual Studio Code), which beat anywhere-in-the-name.

const norm = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** How well `q` matches `name`: higher is better, 0 means no match. */
export function score(q, name, keywords = []) {
  q = norm(q.trim());
  if (!q) return 0;
  const n = norm(name);
  if (n === q) return 100;
  if (n.startsWith(q)) return 90;
  const words = n.split(/[\s\-_.]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 70;
  const initials = words.map((w) => w[0]).join('');
  if (initials.startsWith(q) && q.length > 1) return 65;
  if (n.includes(q)) return 50;
  if (keywords.some((k) => norm(k).startsWith(q))) return 40;
  // Letters in order: "chrm" for Chrome.
  let i = 0;
  for (const c of n) if (c === q[i]) i++;
  if (i === q.length && q.length > 2) return 20;
  return 0;
}

/** Apps matching `q`, best first; ties keep the more used one first, then A to Z. */
export function search(apps, q, uses = {}) {
  return apps
    .map((a) => ({ a, s: score(q, a.name, a.keywords) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || (uses[y.a.id] || 0) - (uses[x.a.id] || 0) || x.a.name.localeCompare(y.a.name))
    .map((x) => x.a);
}
