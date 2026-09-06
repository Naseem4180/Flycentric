const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

// Columns that, when all blank, mean the row carries no data at all (a
// trailing newline, a spacer row, a row of stray commas from Excel export).
const MEANINGFUL_COLUMNS = [
  'question_text', 'question_type', 'option_a', 'option_b', 'option_c', 'option_d',
  'correct_option', 'explanation', 'difficulty', 'subject_title', 'chapter_title',
  'subject_id', 'chapter_id', 'tags', 'appearances',
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
    .replace(/\s+/g, '_');
}

function normalizeRecord(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    const k = normalizeKey(key);
    if (!k) continue;
    // Excel gives numbers/dates as native types; everything downstream expects
    // strings, so coerce once here rather than in twelve call sites.
    out[k] = value == null ? '' : String(value).trim();
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
