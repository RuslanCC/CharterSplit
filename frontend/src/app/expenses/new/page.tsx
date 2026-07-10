'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTrip } from '../../providers';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/page';
import { ExpenseForm } from '@/components/expense-form';

function NewExpenseForm() {
  const { trip } = useTrip();
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div>
      <PageHeader title="Новый расход" />
      <ExpenseForm
        initialDescription={
          searchParams.get('desc') ?? searchParams.get('cat') ?? ''
        }
        initialCategory={searchParams.get('cat') ?? undefined}
        onSubmit={async (payload) => {
          await api.post(`/trips/${trip.id}/expenses`, payload);
          router.push('/expenses');
        }}
      />
    </div>
  );
}

export default function NewExpensePage() {
  return (
    <React.Suspense>
      <NewExpenseForm />
    </React.Suspense>
  );
}
