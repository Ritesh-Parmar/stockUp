/**
 * CSV helpers.
 *
 * The mStock SDK parses the scriptmaster with a plain line.split(','), which
 * corrupts every row whose name contains a comma ("LIFE INSURANCE CORP OF
 * INDIA, THE"). Everything here honours RFC 4180 quoting instead.
 */

/** Split one CSV line, honouring "quoted, fields" and "" escapes. */
export const parseCsvLine = (line) => {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char !== '"') value += char;
      else if (line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ',') { values.push(value); value = ''; }
    else value += char;
  }
  values.push(value);
  return values;
};

/** Parse a whole CSV document into an array of plain objects keyed by header. */
export const parseCsv = (text) => {
  const lines = String(text ?? '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));
  });
};

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** Serialise objects back to CSV. Column order follows `headers`, or the first row. */
export const toCsv = (items, headers) => {
  const columns = headers ?? Object.keys(items[0] ?? {});
  return [
    columns.join(','),
    ...items.map((item) => columns.map((column) => csvCell(item[column])).join(',')),
  ].join('\r\n');
};
