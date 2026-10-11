import React, { useMemo } from 'react';

/**
 * Detects if a string contains HTML tags or encoded entities.
 * Returns false for standard plain text questions.
 */
export function hasHtml(text) {
  if (!text || typeof text !== 'string') return false;
  return /<[a-z][\s\S]*>/i.test(text) || /&(?:nbsp|amp|lt|gt|quot|#39|#\d+|deg|plusmn|le|ge|mu);/i.test(text);
}

/**
 * Normalizes HTML in question text, fixing unclosed <li> tags, loose lists,
 * and separating trailing conclusion statements (e.g., "The combination of correct statements is:").
 */
export function normalizeQuestionHtml(input) {
  if (!input || typeof input !== 'string') return input || '';
  let str = input.trim();
  if (!hasHtml(str)) return str;

  // Clean corrupt unicode characters (e.g., replacement char \uFFFD)
  str = str
    .replace(/(\w)[\uFFFD](s|t|re|ve|ll|d|m)\b/gi, "$1'$2")
    .replace(/(\d+)\s*[\uFFFD]\s*(\d+)/g, '$1 - $2')
    .replace(/\uFFFD/g, "'");

  // Case 1: Unclosed <li> tags (common in aviation question banks, e.g.
  // "Scenario:<li>1) First<li>2) Second<li>The combination of correct statements is:")
  if (/<li/i.test(str) && !/<\/li>/i.test(str)) {
    const parts = str.split(/<li[^>]*>/i);
    const prefix = parts[0].trim();
    const items = parts.slice(1).map((p) => p.trim()).filter(Boolean);

    const listItems = [];
    const suffixItems = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isLast = i === items.length - 1;
      const looksLikeConclusion = /^(the\s+combination|which\s+of|select\s+the|choose\s+the|find\s+the|statements?|mark\s+the)/i.test(item);
      const isNumbered = /^([0-9]+[.)\-]|[a-z][.)\-]|\([0-9a-z]+\))/i.test(item);

      if (isLast && looksLikeConclusion && !isNumbered) {
        suffixItems.push(item);
      } else {
        listItems.push(item);
      }
    }

    let html = '';
    if (prefix) html += `<p>${prefix}</p>`;
    if (listItems.length > 0) {
      html += '<ul class="cbt-question-list">';
      for (const li of listItems) {
        html += `<li>${li}</li>`;
      }
      html += '</ul>';
    }
    if (suffixItems.length > 0) {
      html += `<p class="cbt-question-conclusion">${suffixItems.join(' ')}</p>`;
    }
    return html;
  }

  // Case 2: Has <li>...</li> but no wrapping <ul> or <ol>
  if (/<li[^>]*>[\s\S]*?<\/li>/i.test(str) && !/<(?:ul|ol)[^>]*>/i.test(str)) {
    str = str.replace(/(?:<li[^>]*>[\s\S]*?<\/li>\s*)+/gi, (match) => {
      return `<ul class="cbt-question-list">${match}</ul>`;
    });
  }

  return str;
}

/**
 * Strips HTML tags into clean, human-readable plain text for single-line
 * table clips, search indexing, and tooltips.
 */
export function stripHtmlToPlainText(input) {
  if (!input || typeof input !== 'string') return input || '';
  if (!hasHtml(input)) return input.trim();

  let s = input;
  // Convert <li> to ' • '
  s = s.replace(/<li[^>]*>/gi, ' \n• ');
  // Convert paragraphs and line breaks to spacing
  s = s.replace(/<(?:p|div)[^>]*>/gi, '\n');
  s = s.replace(/<(?:br\s*\/?|\/p|\/div)>/gi, '\n');
  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&deg;/gi, '°')
    .replace(/&plusmn;/gi, '±');

  return s.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

const ALLOWED_TAGS = new Set([
  'p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's',
  'span', 'sub', 'sup', 'code', 'pre', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'div', 'small',
]);

/**
 * Sanitizes HTML string safely using DOMParser (browser built-in).
 * Strips scripts, events, styles, iframes, and disallows dangerous URLs.
 */
function sanitizeHtmlSafe(rawHtml) {
  if (typeof window === 'undefined' || !window.DOMParser) return rawHtml;
  try {
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    function cleanNode(node) {
      const toRemove = [];
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toLowerCase();
          if (!ALLOWED_TAGS.has(tag)) {
            // Replace disallowed tag with its text children
            const textNode = doc.createTextNode(child.textContent || '');
            node.replaceChild(textNode, child);
          } else {
            // Remove dangerous attributes
            for (const attr of Array.from(child.attributes)) {
              const name = attr.name.toLowerCase();
              if (name.startsWith('on') || name === 'src' || name === 'href' || name.startsWith('data-')) {
                child.removeAttribute(attr.name);
              }
            }
            cleanNode(child);
          }
        } else if (child.nodeType === Node.COMMENT_NODE) {
          toRemove.push(child);
        }
      }
      for (const rem of toRemove) node.removeChild(rem);
    }

    cleanNode(doc.body);
    return doc.body.innerHTML;
  } catch {
    return rawHtml;
  }
}

/**
 * Rich Formatter Component:
 * - If text has NO HTML tags -> renders plain text as-is.
 * - If text contains HTML tags -> normalizes, sanitizes, and renders formatted HTML.
 */
export default function FormattedQuestionText({
  text,
  className = '',
  style = {},
  inline = false,
  as: Component = 'div',
}) {
  const content = text ?? '';

  const isHtml = useMemo(() => hasHtml(content), [content]);

  const sanitized = useMemo(() => {
    if (!isHtml) return content;
    const normalized = normalizeQuestionHtml(content);
    return sanitizeHtmlSafe(normalized);
  }, [content, isHtml]);

  if (!isHtml) {
    if (inline) {
      return (
        <span className={className} style={style}>
          {content}
        </span>
      );
    }
    return (
      <Component
        className={className}
        style={{ whiteSpace: 'pre-wrap', ...style }}
      >
        {content}
      </Component>
    );
  }

  const combinedClass = `formatted-question-content ${className}`.trim();

  if (inline) {
    return (
      <span
        className={combinedClass}
        style={style}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  return (
    <Component
      className={combinedClass}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
