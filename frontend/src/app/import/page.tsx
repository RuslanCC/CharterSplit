'use client';

import * as React from 'react';
import Link from 'next/link';
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTrip } from '../providers';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { ImportResult, Member } from '@/lib/types';
import {
  parseSplitwiseCsv,
  suggestMemberId,
  type SplitwiseFile,
} from '@/lib/splitwise';
import { Button } from '@/components/ui/button';
import { Card, CardRow, SectionTitle } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/page';

const GUEST = '__guest__';

export default function ImportPage() {
  const { trip, reloadTrip } = useTrip();
  const [members, setMembers] = React.useState<Member[]>([]);
  const [file, setFile] = React.useState<SplitwiseFile | null>(null);
  const [fileName, setFileName] = React.useState('');
  // csvName → memberId | GUEST
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  React.useEffect(() => {
    api
      .get<Member[]>(`/trips/${trip.id}/members`)
      .then(setMembers)
      .catch(() => setMembers(trip.members));
  }, [trip.id, trip.members]);

  const activeMembers = members.filter((m) => m.isActive);
  const memberById = React.useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const parsed = parseSplitwiseCsv(await f.text());
      setFile(parsed);
      setFileName(f.name);
      setMapping(
        Object.fromEntries(
          parsed.participants.map((name) => [
            name,
            suggestMemberId(name, activeMembers) ?? GUEST,
          ]),
        ),
      );
    } catch (err) {
      setFile(null);
      setError((err as Error).message);
    } finally {
      e.target.value = '';
    }
  }

  const duplicates = React.useMemo(() => {
    const chosen = Object.values(mapping).filter((v) => v !== GUEST);
    return new Set(chosen.filter((v, i) => chosen.indexOf(v) !== i));
  }, [mapping]);

  const totalCost = file?.rows.reduce((s, r) => s + r.cost, 0) ?? 0;
  const paymentsCount = file?.rows.filter((r) => r.isPayment).length ?? 0;

  /** Имя покрывающего, если у выбранного участника задана семейная связь. */
  function coverageHint(memberId: string): string | null {
    let cursor = memberById.get(memberId);
    const seen = new Set<string>();
    while (cursor?.coveredByMemberId && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      cursor = memberById.get(cursor.coveredByMemberId) ?? undefined;
    }
    return cursor && cursor.id !== memberId ? cursor.displayName : null;
  }

  async function runImport() {
    if (!file) return;
    setError(null);
    if (duplicates.size > 0) {
      setError('Один участник поездки выбран для нескольких имён из файла');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<ImportResult>(
        `/trips/${trip.id}/import/splitwise`,
        {
          mappings: file.participants.map((csvName) =>
            mapping[csvName] === GUEST
              ? { csvName, guestName: csvName }
              : { csvName, memberId: mapping[csvName] },
          ),
          rows: file.rows.map((r) => ({
            date: r.date,
            description: r.description,
            category: r.category,
            cost: r.cost,
            currency: r.currency,
            nets: r.nets,
          })),
        },
      );
      setResult(res);
      setFile(null);
      await reloadTrip();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div>
        <PageHeader title="Импорт из Splitwise" />
        <div className="space-y-4 px-4 pb-8">
          <Card className="p-4 text-center">
            <CheckCircle2 size={36} className="mx-auto text-positive" />
            <div className="mt-2 text-lg font-semibold">
              Импортировано расходов: {result.imported}
            </div>
            {result.createdGuests.length > 0 && (
              <div className="mt-1 text-sm text-hint">
                Созданы гости:{' '}
                {result.createdGuests.map((g) => g.displayName).join(', ')}
              </div>
            )}
          </Card>

          {result.warnings.length > 0 && (
            <Card className="p-4">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                <AlertTriangle size={16} className="text-hint" /> Примечания
              </div>
              {result.warnings.map((w, i) => (
                <div key={i} className="text-sm text-hint">
                  {w}
                </div>
              ))}
            </Card>
          )}

          {result.skipped.length > 0 && (
            <div>
              <SectionTitle>Пропущено ({result.skipped.length})</SectionTitle>
              <Card>
                {result.skipped.map((s, i) => (
                  <CardRow key={i}>
                    <div>
                      <div className="font-medium">{s.description}</div>
                      <div className="text-xs text-hint">
                        {s.date} · {s.reason}
                      </div>
                    </div>
                  </CardRow>
                ))}
              </Card>
            </div>
          )}

          <Link
            href="/expenses"
            className="block rounded-xl bg-primary py-3 text-center font-medium text-primary-foreground"
          >
            Перейти к расходам
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Импорт из Splitwise" />
      <div className="space-y-4 px-4 pb-8">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-card px-4 py-3.5 active:opacity-70">
          <Upload size={20} className="shrink-0 text-link" />
          <div className="min-w-0">
            <div className="font-medium text-link">
              {file ? fileName : 'Выбрать CSV-файл'}
            </div>
            <div className="text-xs text-hint">
              Экспорт группы из Splitwise (Export as spreadsheet)
            </div>
          </div>
          {/* без accept: Android фильтрует по MIME и «гасит» csv-файлы
              (text/comma-separated-values, application/octet-stream и т.п.);
              валидность проверяет парсер */}
          <input type="file" className="hidden" onChange={onFile} />
        </label>

        {file && (
          <>
            <Card className="p-4">
              <div className="text-sm">
                Найдено <b>{file.rows.length}</b> записей
                {paymentsCount > 0 ? ` (из них платежей: ${paymentsCount})` : ''} на{' '}
                <b>{formatMoney(totalCost, file.rows[0]?.currency ?? trip.currency)}</b>
              </div>
              {file.rows[0] && file.rows[0].currency !== trip.currency && (
                <div className="mt-1 text-xs text-hint">
                  Валюта файла ({file.rows[0].currency}) отличается от валюты поездки (
                  {trip.currency}) — суммы будут импортированы без конвертации
                </div>
              )}
            </Card>

            <div>
              <SectionTitle>Сопоставление участников</SectionTitle>
              <div className="space-y-3">
                {file.participants.map((csvName) => {
                  const value = mapping[csvName] ?? GUEST;
                  const dup = value !== GUEST && duplicates.has(value);
                  const coverer = value !== GUEST ? coverageHint(value) : null;
                  return (
                    <div key={csvName}>
                      <Label>{csvName}</Label>
                      <Select
                        value={value}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [csvName]: e.target.value }))
                        }
                        className={dup ? 'border-destructive' : undefined}
                      >
                        {activeMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName}
                            {m.user?.username ? ` (@${m.user.username})` : ''}
                            {m.userId ? '' : ' · гость'}
                          </option>
                        ))}
                        <option value={GUEST}>➕ Создать гостя «{csvName}»</option>
                      </Select>
                      {dup && (
                        <div className="mt-1 text-xs text-destructive">
                          Этот участник уже выбран для другого имени
                        </div>
                      )}
                      {coverer && (
                        <div className="mt-1 text-xs text-hint">
                          Семейная связь: доли и платежи будут записаны на {coverer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}

            <Button block onClick={runImport} disabled={busy || duplicates.size > 0}>
              {busy ? 'Импорт…' : `Импортировать ${file.rows.length} записей`}
            </Button>
          </>
        )}

        {!file && error && <div className="text-sm text-destructive">{error}</div>}
      </div>
    </div>
  );
}
