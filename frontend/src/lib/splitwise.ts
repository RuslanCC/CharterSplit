// Парсер экспорта Splitwise (CSV): Date,Description,Category,Cost,Currency,<участники...>
// Значение в колонке участника — чистый эффект строки: (заплатил − его доля), со знаком.
// Все суммы конвертируются в минорные единицы (центы) без плавающей точки.

export interface SplitwiseRow {
  date: string; // YYYY-MM-DD
  description: string;
  category?: string;
  cost: number; // минорные единицы
  currency: string;
  nets: { csvName: string; amount: number }[]; // минорные единицы, со знаком
  isPayment: boolean;
}

export interface SplitwiseFile {
  participants: string[];
  rows: SplitwiseRow[];
  skippedLines: number; // строки без даты/суммы (итоги, пустые)
}

/** RFC4180-подобный разбор CSV: кавычки, экранированные кавычки, запятые в полях. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** '551.62' | '-16,25' → минорные единицы (целое, со знаком); null — не число. */
export function parseSignedMinor(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const whole = parseInt(m[2], 10);
  const frac = m[3] ? parseInt(m[3].padEnd(2, '0'), 10) : 0;
  return sign * (whole * 100 + frac);
}

export function parseSplitwiseCsv(text: string): SplitwiseFile {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (table.length === 0) throw new Error('Файл пуст');

  const header = table[0].map((c) => c.trim());
  const expected = ['date', 'description', 'category', 'cost', 'currency'];
  const headerLower = header.slice(0, 5).map((c) => c.toLowerCase());
  if (expected.some((e, i) => headerLower[i] !== e)) {
    throw new Error(
      'Не похоже на экспорт Splitwise: ожидается заголовок Date,Description,Category,Cost,Currency,…',
    );
  }
  const participants = header.slice(5).filter((c) => c !== '');
  if (participants.length === 0) {
    throw new Error('В файле нет колонок участников');
  }

  const rows: SplitwiseRow[] = [];
  let skippedLines = 0;
  for (const cells of table.slice(1)) {
    const [date, description, category, costRaw, currency] = cells.map((c) =>
      (c ?? '').trim(),
    );
    const cost = costRaw ? parseSignedMinor(costRaw) : null;
    // итоговые строки («Total balance») и мусор — без даты либо без корректной суммы
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      cost === null ||
      cost <= 0 ||
      description.toLowerCase() === 'total balance'
    ) {
      skippedLines++;
      continue;
    }
    const nets: SplitwiseRow['nets'] = [];
    for (let i = 0; i < participants.length; i++) {
      const amount = parseSignedMinor(cells[5 + i] ?? '');
      if (amount !== null && amount !== 0) {
        nets.push({ csvName: participants[i], amount });
      }
    }
    rows.push({
      date,
      description: description || 'Без описания',
      category: category || undefined,
      cost,
      currency: (currency || 'RUB').toUpperCase(),
      nets,
      isPayment: category.toLowerCase() === 'payment',
    });
  }
  if (rows.length === 0) throw new Error('В файле не найдено ни одного расхода');
  return { participants, rows, skippedLines };
}

/** Автоподбор участника поездки по имени из CSV (точное имя → первое слово → username). */
export function suggestMemberId(
  csvName: string,
  members: { id: string; displayName: string; user?: { username: string | null } | null }[],
): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const target = norm(csvName);
  if (!target) return null;

  const exact = members.find((m) => norm(m.displayName) === target);
  if (exact) return exact.id;

  const byUsername = members.find(
    (m) => m.user?.username && norm(m.user.username) === target,
  );
  if (byUsername) return byUsername.id;

  // «Liubov U.» ↔ «Liubov Udalova»: совпадение первых слов + общий префикс остатка
  const targetTokens = target.split(' ');
  const candidates = members.filter((m) => {
    const tokens = norm(m.displayName).split(' ');
    if (tokens[0] !== targetTokens[0]) return false;
    const t2 = targetTokens[1];
    const m2 = tokens[1];
    return !t2 || !m2 || m2.startsWith(t2) || t2.startsWith(m2);
  });
  return candidates.length === 1 ? candidates[0].id : null;
}
