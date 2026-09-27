import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialExamState,
  handleOptionSelect,
  handleConfirm,
  handleClearAnswer,
  handleRevealAnswer,
  handleMarkReviewAndNext,
  paletteStatus,
  getAvailableActions,
} from '../client/src/utils/examBehavior.js';

test('1. Practice mode: selecting an option stores selection without revealing until Reveal Answer or Auto Reveal', () => {
  let state = createInitialExamState({
    questions: [{ id: 101 }, { id: 102 }],
    quizType: 'practice',
  });

  // Select option 'B' with autoReveal = false
  state = handleOptionSelect(state, {
    questionId: 101,
    key: 'B',
    isExam: false,
    autoReveal: false,
  });

  assert.equal(state.answers[101], 'B');
  assert.equal(state.revealedMap[101], undefined, 'Should not be revealed yet');

  // Click Reveal Answer
  state = handleRevealAnswer(state, { questionId: 101 });
  assert.equal(state.revealedMap[101], true, 'Should now be revealed');

  // With autoReveal = true on question 102
  state = handleOptionSelect(state, {
    questionId: 102,
    key: 'C',
    isExam: false,
    autoReveal: true,
  });
  assert.equal(state.answers[102], 'C');
  assert.equal(state.revealedMap[102], true, 'Should be automatically revealed');
});

test('2. No Clear Answer action in practice mode bottom actions', () => {
  const practiceActions = getAvailableActions(false);
  assert.deepEqual(practiceActions, ['previous', 'reveal_answer', 'auto_reveal', 'next']);
  assert.ok(!practiceActions.includes('clear_answer'), 'Practice mode must not have clear_answer action');

  // Calling handleClearAnswer in practice mode has no effect
  let state = createInitialExamState({
    questions: [{ id: 201 }],
    quizType: 'practice',
    existingAnswers: { 201: 'A' },
  });
  state = handleClearAnswer(state, { questionId: 201, isExam: false });
  assert.equal(state.answers[201], 'A', 'Clear Answer must be ignored in practice mode');
});

test('3. Exam mode: Confirm saves/locks answer and automatically navigates to next question', () => {
  let state = createInitialExamState({
    questions: [{ id: 301 }, { id: 302 }, { id: 303 }],
    quizType: 'exam',
  });

  assert.equal(state.current, 0);

  // Student selects 'A' on question 301
  state = handleOptionSelect(state, {
    questionId: 301,
    key: 'A',
    isExam: true,
    autoReveal: false,
  });
  assert.equal(state.answers[301], 'A');
  assert.equal(state.confirmedMap[301], undefined, 'Not confirmed yet');

  // Click Confirm
  state = handleConfirm(state, { questionId: 301, totalQuestions: 3 });
  assert.equal(state.confirmedMap[301], true, 'Answer must be confirmed/locked');
  assert.equal(state.current, 1, 'Must auto-navigate to next question (index 1)');
});

test('4. Exam mode: Confirmed answers are locked and trigger warning toast when clicking other options', () => {
  let state = createInitialExamState({
    questions: [{ id: 401 }, { id: 402 }],
    quizType: 'exam',
  });

  // Select and confirm option 'B'
  state = handleOptionSelect(state, { questionId: 401, key: 'B', isExam: true });
  state = handleConfirm(state, { questionId: 401, totalQuestions: 2 });
  assert.equal(state.confirmedMap[401], true);

  // Navigate back to question 401
  state = { ...state, current: 0 };

  // Attempt to select 'C' without clearing first
  state = handleOptionSelect(state, { questionId: 401, key: 'C', isExam: true });

  assert.equal(state.answers[401], 'B', 'Answer must remain locked at B');
  assert.equal(state.lockedNotice, true, 'Warning notice must be triggered');
});

test('5. Exam mode: Clear Answer unlocks question and allows selecting a new response', () => {
  let state = createInitialExamState({
    questions: [{ id: 501 }],
    quizType: 'exam',
    existingAnswers: { 501: 'B' },
  });
  assert.equal(state.confirmedMap[501], true, 'Existing answer starts confirmed in exam');

  // Click Clear Answer
  state = handleClearAnswer(state, { questionId: 501, isExam: true });
  assert.equal(state.answers[501], undefined, 'Answer must be cleared');
  assert.equal(state.confirmedMap[501], undefined, 'Confirmed status must be cleared');

  // Now select option 'D'
  state = handleOptionSelect(state, { questionId: 501, key: 'D', isExam: true });
  assert.equal(state.answers[501], 'D', 'New option D should be stored');

  // Confirm new option
  state = handleConfirm(state, { questionId: 501, totalQuestions: 1 });
  assert.equal(state.confirmedMap[501], true, 'Question re-confirmed with new option');
});

test('6. Exam mode: Mark review & Next preserves selection and navigates to next question', () => {
  let state = createInitialExamState({
    questions: [{ id: 601 }, { id: 602 }],
    quizType: 'exam',
  });

  // Select option 'A' on question 601
  state = handleOptionSelect(state, { questionId: 601, key: 'A', isExam: true });

  // Click Mark review & Next
  state = handleMarkReviewAndNext(state, { questionId: 601, totalQuestions: 2 });

  assert.ok(state.marked.has(601), 'Question 601 must be added to marked set');
  assert.equal(state.answers[601], 'A', 'Existing answer must be preserved');
  assert.equal(state.current, 1, 'Must auto-navigate to question index 1');

  // Check palette status
  const status = paletteStatus(601, state.visited, state.answers, state.marked, state.confirmedMap, false);
  assert.equal(status, 'flagged', 'Palette status must reflect flagged for review');
});

test('7. State persistence across question navigation', () => {
  let state = createInitialExamState({
    questions: [{ id: 701 }, { id: 702 }, { id: 703 }],
    quizType: 'exam',
  });

  // Question 701: Answered & Confirmed
  state = handleOptionSelect(state, { questionId: 701, key: 'B', isExam: true });
  state = handleConfirm(state, { questionId: 701, totalQuestions: 3 });
  assert.equal(state.current, 1);

  // Question 702: Marked for review without answer
  state = handleMarkReviewAndNext(state, { questionId: 702, totalQuestions: 3 });
  assert.equal(state.current, 2);

  // Navigate back to 701
  state = { ...state, current: 0 };
  assert.equal(state.answers[701], 'B', '701 answer preserved');
  assert.equal(state.confirmedMap[701], true, '701 confirmation preserved');

  // Navigate back to 702
  state = { ...state, current: 1 };
  assert.ok(state.marked.has(702), '702 review flag preserved');
});
