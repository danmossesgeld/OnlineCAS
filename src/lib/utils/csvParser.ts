/**
 * Proper CSV parser that handles quoted fields containing commas
 * This fixes the "?" character issue when importing CSV files with quoted fields
 */

export interface CSVParseResult {
  headers: string[];
  rows: string[][];
}

/**
 * Parse CSV text with proper handling of quoted fields
 * @param csvText The raw CSV text content
 * @returns Parsed headers and rows
 */
export function parseCSV(csvText: string): CSVParseResult {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headerLine, ...dataLines] = lines;
  const headers = parseCSVLine(headerLine).map(h => h.trim().toLowerCase());
  const rows = dataLines.map(line => parseCSVLine(line));

  return { headers, rows };
}

/**
 * Parse a single CSV line handling quoted fields properly
 * @param line The CSV line to parse
 * @returns Array of field values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote within quoted field
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator outside quotes
      result.push(current.trim());
      current = '';
      i++;
    } else {
      // Regular character
      current += char;
      i++;
    }
  }

  // Add the last field
  result.push(current.trim());

  return result;
}

/**
 * Convert parsed CSV to object records
 * @param headers Array of header names
 * @param rows Array of row data
 * @returns Array of record objects
 */
export function csvToRecords(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map(row => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (row[index] ?? '').trim();
    });
    return record;
  });
}

/**
 * Complete CSV parsing with records conversion
 * @param csvText The raw CSV text content
 * @returns Array of record objects
 */
export function parseCSVToRecords(csvText: string): Record<string, string>[] {
  // Debug: Log the input to see what's being processed
  console.log('CSV Parser Input:', csvText);
  
  const { headers, rows } = parseCSV(csvText);
  
  // Debug: Log the parsed headers and rows
  console.log('CSV Parser Headers:', headers);
  console.log('CSV Parser Rows:', rows);
  
  const result = csvToRecords(headers, rows);
  
  // Debug: Log the final result
  console.log('CSV Parser Result:', result);
  
  return result;
}
