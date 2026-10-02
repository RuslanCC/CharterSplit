'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTrip } from '../../../providers';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import type { Expense } from '@/lib/types';
import { PageHeader, Loading, ErrorState } from '@/components/page';
import { ExpenseForm } from '@/components/expense-form';

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { trip } = useTrip();
  const router = useRouter();
  const { data, loading, error } = useAsync<Expense>(
    () => api.get(`/trips/${trip.id}/expenses/${id}`),
    [trip.id, id],
  );

  return (
    <div>
      <PageHeader title="Редактировать расход" />
      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {data && (
        <ExpenseForm
          initial={data}
          onSubmit={async (payload) => {
            await api.patch(`/trips/${trip.id}/expenses/${id}`, payload);
            router.push('/expenses');
          }}
        />
      )}
    </div>
  );
}
