/**
 * Pure state transition functions and helpers for Exam and Practice modes.
 * Shared between TakeExam.jsx and the automated test suite.
 */

export function createInitialExamState({ questions = [], quizType = 'exam', existingAnswers = {}, existingVisited = [] } = {}) {
  const isPractice = quizType === 'practice';
  const initialConfirmed = {};
  if (!isPractice && existingAnswers) {
    Object.entries(existingAnswers).forEach(([qid, val]) => {
      if (val != null && String(val).trim() !== '') {
        initialConfirmed[qid] = true;
      }
    });
  }

  const visitedSet = new Set(existingVisited);
  if (questions.length > 0 && !visitedSet.has(questions[0].id)) {
    visitedSet.add(questions[0].id);
  }

  return {
    isPractice,
    current: 0,
    answers: { ...existingAnswers },
    confirmedMap: initialConfirmed,
    revealedMap: {},
    marked: new Set(),
    visited: visitedSet,
    lockedNotice: false,
  };
}

export function createSerializedSaveQueue() {
  let pending = Promise.resolve();
  return {
    enqueue(save) {
      const result = pending.then(save);
      pending = result.then(() => undefined, () => undefined);
      return result;
    },
    flush() {
      return pending;
    },
  };
}

export function handleOptionSelect(state, { questionId, key, isExam }) {
  if (isExam && state.confirmedMap[questionId]) {
    // Locked confirmed answer in exam mode
    if (state.answers[questionId] !== key) {
      return {
        ...state,
        lockedNotice: true,
      };
    }
    return state;
  }

  const nextAnswers = { ...state.answers, [questionId]: key };
  const nextVisited = new Set(state.visited).add(questionId);

  return {
    ...state,
    answers: nextAnswers,
    visited: nextVisited,
    lockedNotice: false,
  };
}

export function handleConfirm(state, { questionId, totalQuestions }) {
  const hasAnswer = state.answers[questionId] != null && String(state.answers[questionId]).trim() !== '';
  const nextConfirmed = { ...state.confirmedMap };
  const nextMarked = new Set(state.marked);
  if (hasAnswer) {
    nextConfirmed[questionId] = true;
    nextMarked.delete(questionId);
  }

  const nextCurrent = state.current < totalQuestions - 1 ? state.current + 1 : state.current;
  const nextVisited = new Set(state.visited);
  // Visited next question
  return {
    ...state,
    confirmedMap: nextConfirmed,
    marked: nextMarked,
    current: nextCurrent,
    visited: nextVisited,
    lockedNotice: false,
  };
}

export function handleClearAnswer(state, { questionId, isExam }) {
  if (!isExam) {
    // Clear Answer is not allowed / available in practice mode
    return state;
  }

  const nextAnswers = { ...state.answers };
  delete nextAnswers[questionId];

  const nextConfirmed = { ...state.confirmedMap };
  delete nextConfirmed[questionId];

  return {
    ...state,
    answers: nextAnswers,
    confirmedMap: nextConfirmed,
    lockedNotice: false,
  };
}

export function handleRevealAnswer(state, { questionId }) {
  return {
    ...state,
    revealedMap: {
      ...state.revealedMap,
      [questionId]: true,
    },
  };
}

export function handleMarkReviewAndNext(state, { questionId, totalQuestions }) {
  const nextMarked = new Set(state.marked).add(questionId);
  const nextCurrent = state.current < totalQuestions - 1 ? state.current + 1 : state.current;

  return {
    ...state,
    marked: nextMarked,
    current: nextCurrent,
  };
}

export function paletteStatus(qId, visited, answers, marked, confirmedMap, isPractice) {
  const hasAnswer = isPractice
    ? (answers[qId] != null && String(answers[qId]).trim() !== '')
    : Boolean(confirmedMap[qId] && answers[qId] != null && String(answers[qId]).trim() !== '');

  if (hasAnswer && (isPractice || confirmedMap[qId])) return 'answered';
  if (marked && marked.has(qId)) return 'flagged';
  if (hasAnswer) return 'answered';
  if (visited && visited.has(qId)) return 'skipped';
  return 'not-seen';
}

export function getAvailableActions(isExam) {
  if (isExam) {
    return ['previous', 'clear_answer', 'confirm', 'mark_review_and_next'];
  }
  return ['previous', 'reveal_answer', 'next'];
}

export function getAttemptProgress(questions, answers, textDraft = {}) {
  const attemptedCount = questions.reduce((count, question) => {
    const answer = textDraft[question.id] ?? answers[question.id];
    return answer != null && String(answer).trim() !== '' ? count + 1 : count;
  }, 0);

  return {
    attemptedCount,
    percentage: questions.length ? Math.round((attemptedCount / questions.length) * 100) : 0,
  };
}
