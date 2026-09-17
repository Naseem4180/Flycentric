import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, Link2, List } from 'lucide-react';

// Rich Text Support for Subject Descriptions: a small, dependency-free
// WYSIWYG built on contentEditable + execCommand. It's intentionally basic
// (bold/italic/underline/link/bulleted list) — enough for a subject blurb,
// not a full document editor — and the HTML it produces is re-sanitized
// server-side before storage (see utils/sanitizeHtml.js), so this component
// doesn't need to defend itself against malicious paste content.
export default function RichTextEditor({ value, onChange, placeholder }) {
  const ref = useRef(null);
  const lastValue = useRef(value);

  useEffect(() => {
    if (ref.current && value !== lastValue.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || '';
      lastValue.current = value;
    }
  }, [value]);

  function exec(command, arg) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    handleInput();
  }

  function handleInput() {
    const html = ref.current?.innerHTML || '';
    lastValue.current = html;
    onChange(html);
  }

  function insertLink() {
    const url = window.prompt('Link URL (opens in a new tab for students):', 'https://');
    if (!url) return;
    exec('createLink', url);
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button type="button" onClick={() => exec('bold')} title="Bold"><Bold size={14} /></button>
        <button type="button" onClick={() => exec('italic')} title="Italic"><Italic size={14} /></button>
        <button type="button" onClick={() => exec('underline')} title="Underline"><Underline size={14} /></button>
        <button type="button" onClick={() => exec('insertUnorderedList')} title="Bulleted list"><List size={14} /></button>
        <button type="button" onClick={insertLink} title="Insert link"><Link2 size={14} /></button>
      </div>
      <div
        ref={ref}
        className="rte-body"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder}
      />
    </div>
  );
}
