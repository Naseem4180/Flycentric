import { forwardRef } from 'react';
import { Link } from 'react-router-dom';

/**
 * The one button in the app. Handles every variant, size, icon placement and
 * — importantly — the async loading state, which disables the control so an
 * import/save/delete can never be fired twice by an impatient double click.
 */
const Button = forwardRef(function Button({
  variant = 'outline',
  size = 'sm',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  loadingLabel,
  disabled = false,
  block = false,
  to,
  href,
  className = '',
  children,
  ...rest
}, ref) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    !children ? 'btn-icon' : '',
    className,
  ].filter(Boolean).join(' ');

  const inner = (
    <>
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : (Icon ? <Icon size={size === 'lg' ? 17 : 14} /> : null)}
      {loading && loadingLabel ? loadingLabel : children}
      {!loading && IconRight ? <IconRight size={size === 'lg' ? 17 : 14} /> : null}
    </>
  );

  if (to && !disabled && !loading) {
    return <Link ref={ref} to={to} className={classes} {...rest}>{inner}</Link>;
  }
  if (href && !disabled && !loading) {
    return <a ref={ref} href={href} className={classes} {...rest}>{inner}</a>;
  }

  return (
    <button
      ref={ref}
      type={rest.type || 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {inner}
    </button>
  );
});

export default Button;
