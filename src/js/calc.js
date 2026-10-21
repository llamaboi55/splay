// A small, safe calculator for the search box: numbers, + - * / ^, %, brackets and a
// few functions. No eval.

const FUNCS = {
  sqrt: Math.sqrt,
  sin: (x) => Math.sin((x * Math.PI) / 180),
  cos: (x) => Math.cos((x * Math.PI) / 180),
  tan: (x) => Math.tan((x * Math.PI) / 180),
  log: Math.log10,
  ln: Math.log,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
};
const CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const s = src
    .toLowerCase()
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '')
    .replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*/g, '($1/100)*');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') {
      i++;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
    if (num) {
      out.push({ t: 'n', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const word = /^[a-z]+/.exec(s.slice(i));
    if (word) {
      const w = word[0];
      if (w in FUNCS) out.push({ t: 'f', v: w });
      else if (w in CONSTS) out.push({ t: 'n', v: CONSTS[w] });
      else if (w === 'x') out.push({ t: 'o', v: '*' });
      else throw new Error(`unknown ${w}`);
      i += w.length;
      continue;
    }
    if ('+-*/^%()'.includes(c)) {
      out.push({ t: 'o', v: c });
      i++;
      continue;
    }
    throw new Error(`unexpected ${c}`);
  }
  return out;
}

/** Evaluates an expression, or throws. */
export function evaluate(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (v) => {
    if (peek()?.v === v) {
      p++;
      return true;
    }
    return false;
  };
  // expr := term (('+'|'-') term)*
  // "200 + 15%" means 15% of 200, like on a pocket calculator.
  function percentOf(v) {
    const [n, pct, after] = [toks[p], toks[p + 1], toks[p + 2]];
    if (n?.t === 'n' && pct?.v === '%' && (!after || ['+', '-', ')'].includes(after.v))) {
      p += 2;
      return (v * n.v) / 100;
    }
    return null;
  }
  function expr() {
    let v = term();
    for (;;) {
      if (eat('+')) v += percentOf(v) ?? term();
      else if (eat('-')) v -= percentOf(v) ?? term();
      else return v;
    }
  }
  // term := unary (('*'|'/') unary | implicit multiplication)*
  function term() {
    let v = unary();
    for (;;) {
      if (eat('*')) v *= unary();
      else if (eat('/')) v /= unary();
      else if (peek() && (peek().t === 'n' || peek().t === 'f' || peek().v === '(')) v *= unary();
      else return v;
    }
  }
  function unary() {
    if (eat('-')) return -unary();
    if (eat('+')) return unary();
    return power();
  }
  // power := postfix ('^' unary)?
  function power() {
    const b = postfix();
    if (eat('^')) return b ** unary();
    return b;
  }
  function postfix() {
    let v = atom();
    while (eat('%')) v /= 100;
    return v;
  }
  function atom() {
    const t = toks[p++];
    if (!t) throw new Error('incomplete');
    if (t.t === 'n') return t.v;
    if (t.t === 'f') {
      if (!eat('(')) throw new Error('( expected');
      const v = expr();
      if (!eat(')')) throw new Error(') expected');
      return FUNCS[t.v](v);
    }
    if (t.v === '(') {
      const v = expr();
      if (!eat(')')) throw new Error(') expected');
      return v;
    }
    throw new Error(`unexpected ${t.v}`);
  }
  const v = expr();
  if (p !== toks.length) throw new Error('unexpected input');
  return v;
}

/** The answer if the query looks like a sum, else null. "2+2" yes, "2" or "word" no. */
export function calc(query) {
  const q = String(query).trim();
  if (!q || !/\d|pi/.test(q)) return null;
  if (!/[+\-*/^%×÷(]|\d\s*x\s*[\d(]|\dpi|sqrt|sin|cos|tan|log|ln|abs|round|floor|ceil|\bof\b/i.test(q.replace(/^-/, ''))) return null;
  try {
    const v = evaluate(q);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** 12 significant digits, no float noise: 0.1+0.2 -> "0.3". */
export function format(v) {
  const r = Number.parseFloat(v.toPrecision(12));
  return Math.abs(r) >= 1e15 || (r !== 0 && Math.abs(r) < 1e-9) ? r.toExponential(6) : r.toLocaleString('en-US', { maximumFractionDigits: 10, useGrouping: Math.abs(r) >= 10000 });
}
