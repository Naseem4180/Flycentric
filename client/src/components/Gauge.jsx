export default function Gauge({ value, passThreshold = 70, size = 108 }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const offset = circumference - (pct / 100) * circumference;
  const cls = value >= passThreshold ? 'pass' : 'fail';
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 108 108" width={size} height={size}>
        <circle className="gauge-track" cx="54" cy="54" r={radius} />
        <circle
          className={`gauge-fill ${cls}`}
          cx="54" cy="54" r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="gauge-label">
        <span className="gauge-value">{value != null ? `${value}%` : '—'}</span>
        <span className="gauge-unit">score</span>
      </div>
    </div>
  );
}
