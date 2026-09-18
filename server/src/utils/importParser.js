const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

// Aliases for common header variants across Excel/CSV exports
const HEADER_ALIASES = {
  subject: 'subject_title',
  subject_name: 'subject_title',
  subjects: 'subject_title',
  chapter: 'chapter_title',
  chapter_name: 'chapter_title',
  chapters: 'chapter_title',
  subchapter: 'subchapter',
  sub_chapter: 'subchapter',
  subchapter_name: 'subchapter',
  subchapter_title: 'subchapter',
  sub_chapter_title: 'subchapter',
  topic: 'topic',
  topic_name: 'topic',
  topic_title: 'topic',
  subtopic: 'subtopic',
  sub_topic: 'subtopic',
  subtopic_title: 'subtopic',
  sub_topic_title: 'subtopic',
  question: 'question_text',
  question_title: 'question_text',
  question_stem: 'question_text',
  stem: 'question_text',
  questiontext: 'question_text',
  type: 'question_type',
  questiontype: 'question_type',
  solution: 'explanation',
  rationale: 'explanation',
  description: 'explanation',
  desc: 'explanation',
  explanations: 'explanation',
  level: 'difficulty',
  correct_answer: 'correct_option',
  answer: 'correct_option',
  correct: 'correct_option',
  correctoption: 'correct_option',
  opt_a: 'option_a',
  'opt-a': 'option_a',
  optiona: 'option_a',
  opt_b: 'option_b',
  'opt-b': 'option_b',
  optionb: 'option_b',
  opt_c: 'option_c',
  'opt-c': 'option_c',
  optionc: 'option_c',
  opt_d: 'option_d',
  'opt-d': 'option_d',
  optiond: 'option_d',
  appearance: 'appearances',
  years: 'appearances',
  year: 'appearances',
  exam_year: 'appearances',
  tag: 'tags',
  subtopics: 'tags',
};

// Columns that, when all blank, mean the row carries no data at all (a
// trailing newline, a spacer row, a row of stray commas from Excel export).
const MEANINGFUL_COLUMNS = [
  'question_text', 'question', 'question_type', 'type', 'option_a', 'option_b', 'option_c', 'option_d',
  'correct_option', 'correct_answer', 'answer', 'explanation', 'solution', 'difficulty', 'level',
  'subject_title', 'subject', 'subject_name', 'chapter_title', 'chapter', 'chapter_name',
  'subject_id', 'chapter_id', 'subchapter', 'sub_chapter', 'topic', 'subtopic', 'tags', 'appearances', 'year', 'years',
];

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

// Normalize header names so "Question Text", "question text" and
// "question_text" all resolve to the same key. Excel exports in particular
// love to hand back capitalised, space-separated headers.
function normalizeKey(key) {
  return String(key || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeRecord(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    const rawK = normalizeKey(key);
    if (!rawK) continue;
    const strVal = value == null ? '' : String(value).trim();
    // Coerce once here
    out[rawK] = strVal;
    const aliased = HEADER_ALIASES[rawK];
    if (aliased && aliased !== rawK) {
      out[aliased] = strVal;
    }
  }
  return out;
}

function looksLikeExcel(filename, buffer) {
  if (/\.(xlsx|xlsm|xls)$/i.test(filename || '')) return true;
  // XLSX is a zip ("PK"), legacy XLS starts with the OLE2 magic number.
  if (!buffer || buffer.length < 8) return false;
  const b = buffer;
  if (b[0] === 0x50 && b[1] === 0x4b) return true;
  return b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
}

/**
 * Parses an uploaded CSV or Excel file into normalized records and separates
 * out rows that carry no usable question at all.
 *
 * The key behaviour: a row whose question_text is null, empty or
 * whitespace-only is NOT an error the admin has to go and fix — it's noise
 * (a trailing line, a spacer, a half-deleted row). Those rows are stripped
 * here, counted separately as `blankRowsRemoved`, and never reach duplicate
 * detection or validation. Everything downstream therefore reports against
 * the sanitized dataset, so the numbers add up.
 *
 * Returns { records, totalRows, blankRowsRemoved, sheetName }
 *   records         — sanitized rows, each with a __row (1-based file line)
 *   totalRows       — raw data rows found in the file, before sanitizing
 *   blankRowsRemoved— rows dropped for having no question text
 */
function parseQuestionUpload(buffer, filename) {
  let rawRecords = [];
  let sheetName = null;

  if (looksLikeExcel(filename, buffer)) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      const err = new Error('The workbook has no sheets.');
      err.userFacing = true;
      throw err;
    }
    // defval:'' keeps every declared column present on every row, so a row
    // with a missing trailing cell doesn't silently shift columns.
    rawRecords = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
  } else {
    rawRecords = parse(buffer.toString('utf8'), {
      columns: (header) => header.map(normalizeKey),
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
      trim: true,
    });
  }

  const records = [];
  let blankRowsRemoved = 0;

  rawRecords.forEach((raw, index) => {
    const row = normalizeRecord(raw);
    const fileLine = index + 2; // +1 for the header, +1 for 1-based counting

    const hasAnyData = MEANINGFUL_COLUMNS.some((c) => !isBlank(row[c]));
    // Strip both fully-empty rows and rows that have some stray data but no
    // actual question — neither can ever become a question, so neither is
    // worth reporting to the admin as something to fix.
    if (!hasAnyData || isBlank(row.question_text)) {
      blankRowsRemoved += 1;
      return;
    }

    row.question_text = String(row.question_text).trim();
    row.__row = fileLine;
    records.push(row);
  });

  return {
    records,
    totalRows: rawRecords.length,
    blankRowsRemoved,
    sheetName,
  };
}

module.exports = { parseQuestionUpload, normalizeKey, isBlank };
