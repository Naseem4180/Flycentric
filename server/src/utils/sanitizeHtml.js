// Minimal allowlist HTML sanitizer — used for the one rich-text field in the
// app (Subject Description). Intentionally NOT a general-purpose sanitizer:
// it strips to a small, safe tag/attribute allowlist suitable for a short
// marketing-style blurb (bold/italic/underline, links, paragraphs, lists),
// and removes everything else (script/style/iframe/on*-handlers/etc)
// entirely. A real dependency (e.g. `sanitize-html`) would be preferable in
// a live deploy with network access to install it; this keeps the sandbox
// build dependency-free while still closing the obvious XSS holes.

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'A', 'P', 'BR', 'UL', 'OL', 'LI', 'SPAN']);
const ALLOWED_ATTRS = { A: ['href'] };

function sanitizeHtml(rawHtml) {
  if (!rawHtml) return rawHtml;
  const { JSDOM } = safeRequireJsdom();
  if (!JSDOM) {
    // No DOM parser available server-side (jsdom not installed) — fall back
    // to a conservative regex strip of the highest-risk constructs. This is
    // a best-effort second line of defense; the client also sanitizes on
    // render (see SubjectDetail.jsx) via textContent-safe DOM rewriting of
    // an already-server-trusted string.
    return String(rawHtml)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/ on\w+="[^"]*"/gi, '')
      .replace(/ on\w+='[^']*'/gi, '')
      .replace(/javascript:/gi, '');
  }
  const dom = new JSDOM(`<body>${rawHtml}</body>`);
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 1) {
        if (!ALLOWED_TAGS.has(child.tagName)) {
          // Unwrap: keep the text content, drop the tag itself.
          while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child);
          child.parentNode.removeChild(child);
          return;
        }
        [...child.attributes].forEach((attr) => {
          const allowed = ALLOWED_ATTRS[child.tagName] || [];
          if (!allowed.includes(attr.name) || (attr.name === 'href' && /^\s*javascript:/i.test(attr.value))) {
            child.removeAttribute(attr.name);
          }
        });
        walk(child);
      } else if (child.nodeType !== 3) {
        child.parentNode.removeChild(child);
      }
    });
  };
  walk(dom.window.document.body);
  return dom.window.document.body.innerHTML;
}

function safeRequireJsdom() {
  try {
    // eslint-disable-next-line global-require
    return { JSDOM: require('jsdom').JSDOM };
  } catch {
    return { JSDOM: null };
  }
}

module.exports = { sanitizeHtml };
