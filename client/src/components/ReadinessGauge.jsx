// Predictive Readiness Gauge — a large circular progress ring that glows
// green at >=80% (strong), yellow/amber at 41-79% (mid), and red at <=40%
// (weak). Same thresholds as Topic Mastery (server/src/utils/mastery.js) so
// the color language is identical everywhere in the app.
const BAND_COLOR = {
  strong: '#00d27a',
  mid: '#f5803e',
  weak: '#e63757',
  not_attempted: '#8a94a6',
};
const BAND_LABEL = {
  strong: 'Exam ready',
  mid: 'Building readiness',
  weak: 'Needs focused study',
  not_attempted: 'Not enough data yet',
};

export default function ReadinessGauge({ score, band, size = 176, sub }) {
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const offset = circumference - (pct / 100) * circumference;
  const color = BAND_COLOR[band] || BAND_COLOR.not_attempted;
  const glowId = 'readiness-glow';

  return (
    <div className="readiness-gauge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 176 176" width={size} height={size}>
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle className="readiness-track" cx="88" cy="88" r={radius} />
        <circle
          cx="88" cy="88" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={score == null ? circumference : offset}
          transform="rotate(-90 88 88)"
          filter={score != null ? `url(#${glowId})` : undefined}
          style={{ transition: 'stroke-dashoffset .6s ease, stroke .4s ease' }}
        />
      </svg>
      <div className="readiness-gauge-label">
        <strong style={{ color }}>{score != null ? score : '—'}<small>{score != null ? '%' : ''}</small></strong>
        <span>{sub || BAND_LABEL[band] || 'Readiness'}</span>
      </div>
    </div>
  );
}
