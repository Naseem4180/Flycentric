import { Link } from 'react-router-dom';
import Logo from './Logo';

/**
 * Single source of truth for the FlyCentric brand mark. Every persona
 * (admin, instructor, student), every auth screen, and every sidebar
 * renders through this component so the logo and "FlyCentric" name can
 * never drift out of sync again.
 *
 * - `word`   controls whether the text wordmark is shown next to the mark
 *   (hidden when a sidebar is collapsed to icon-only width).
 * - `theme`  "light" for light backgrounds (top bar, auth pages — dark
 *   ink text) or "dark" for the indigo sidebar (white text, lavender accent).
 * - `to`     where the mark links to; pass `null` to render a non-link span
 *   (used on auth screens that shouldn't navigate away mid-flow).
 */
export default function BrandLogo({ size = 28, word = true, theme = 'light', to = '/', className = '' }) {
  const content = (
    <>
      <Logo size={size} />
      {word && (
        <span className={`fc-brand-word fc-brand-word--${theme}`}>
          Fly<em>Centric</em>
        </span>
      )}
    </>
  );

  const cls = `fc-brand-logo ${className}`.trim();

  if (!to) {
    return <span className={cls} aria-label="FlyCentric">{content}</span>;
  }

  return (
    <Link to={to} className={cls} aria-label="FlyCentric home">
      {content}
    </Link>
  );
}
