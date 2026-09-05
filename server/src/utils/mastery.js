// Shared Topic Mastery formula & classification — single source of truth so
// the /analytics/mastery endpoint, the weak-topics summary on /analytics/me,
// and the future recommendation engine can never drift out of sync.
//
// Authoritative formula:
//   Mastery% = (SUM(correct_count) / SUM(attempt_count)) * 100
//
// Zero-attempt handling: a group with zero attempts has an UNDEFINED
// mastery, not a 0% (weak) one — treating "never attempted" as "poor
// performance" would misrepresent students who simply haven't studied a
// topic yet. Callers should filter attempt_count > 0 in SQL before this ever
// runs, but computeMastery() still returns null defensively either way.
//
// Classification thresholds (subtopic level is the primary use case):
//   Weak   : mastery <= 40
//   Mid    : 41-79 (no explicit product classification — informational only)
//   Strong : mastery >= 80

const WEAK_MAX = 40;
const STRONG_MIN = 80;

function computeMastery(correctCount, attemptCount) {
  const attempts = Number(attemptCount) || 0;
  if (attempts <= 0) return null; // undefined — "not attempted", not "weak"
  const correct = Number(correctCount) || 0;
  return Math.round((correct / attempts) * 10000) / 100; // 2 decimal places
}

function classifyMastery(masteryPct) {
  if (masteryPct === null || masteryPct === undefined) return 'not_attempted';
  if (masteryPct <= WEAK_MAX) return 'weak';
  if (masteryPct >= STRONG_MIN) return 'strong';
  return 'mid';
}

module.exports = { computeMastery, classifyMastery, WEAK_MAX, STRONG_MIN };
