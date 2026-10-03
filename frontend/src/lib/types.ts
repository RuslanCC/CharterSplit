export type SplitType = 'EQUAL' | 'SHARES' | 'EXACT';
export type MemberRole = 'OWNER' | 'MEMBER';
export type FundTxnType = 'CONTRIBUTION' | 'PAYOUT' | 'ADJUSTMENT';

export interface Member {
  id: string;
  tripId: string;
  userId: string | null;
  displayName: string;
  /** Ник Telegram (без @), если участника добавили по @username. */
  telegramUsername?: string | null;
  role: MemberRole;
  isActive: boolean;
  joinedAt: string;
  /** Семейная связь: участник, который покрывает расходы этого участника. */
  coveredByMemberId?: string | null;
  user?: {
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export interface TripSettings {
  id: string;
  tripId: string;
  defaultSplit: SplitType;
  roundingMode: string;
  locale: string;
  allowGuestMembers: boolean;
  notifyChat: boolean;
}

export interface Trip {
  id: string;
  telegramChatId: string | null;
  chatInstance: string | null;
  startParam: string | null;
  title: string;
  currency: string;
  members: Member[];
  settings: TripSettings | null;
}

export interface ExpenseShare {
  id: string;
  memberId: string;
  shareUnits: number;
  amount: number;
}

export interface Expense {
  id: string;
  tripId: string;
  description: string;
  /** Итоговая сумма расхода (включая чаевые), минорные единицы. */
  amount: number;
  /** Чаевые (минорные единицы), делятся поровну между участниками. */
  tipAmount: number;
  category: string | null;
  spentAt: string;
  paidByMemberId: string;
  paidByMember?: Member;
  fromFund: boolean;
  splitType: SplitType;
  shares: ExpenseShare[];
}

export interface MemberBalance {
  memberId: string;
  displayName: string;
  isActive: boolean;
  paid: number;
  owed: number;
  balance: number;
  /** Прямая семейная связь: кто покрывает расходы этого участника. */
  coveredByMemberId: string | null;
  /** Конечный покрывающий (сам участник, если не покрыт). */
  effectiveMemberId: string;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  fromName: string;
  toName: string;
}

export interface Settlement {
  id: string;
  tripId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  note: string | null;
  createdAt: string;
  fromMember?: Member;
  toMember?: Member;
}

export interface Balances {
  members: MemberBalance[];
  transfers: Transfer[];
  settlements: (Settlement & { fromName: string; toName: string })[];
  fund: { balance: number };
  totalSpent: number;
}

export interface TripSummary {
  totalSpent: number;
  spentFromFund: number;
  spentPersonal: number;
  expenseCount: number;
  firstExpenseAt: string | null;
  lastExpenseAt: string | null;
  days: number;
  avgPerDay: number;
  perMember: { memberId: string; displayName: string; paid: number }[];
}

export interface FundTransaction {
  id: string;
  memberId: string | null;
  member?: Member | null;
  type: FundTxnType;
  amount: number;
  note: string | null;
  createdAt: string;
}

export interface FundState {
  balance: number;
  totals: { contributions: number; payouts: number; spentFromFund: number };
  transactions: FundTransaction[];
  fundExpenses: { id: string; description: string; amount: number; spentAt: string }[];
}

export interface HistoryItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: { description?: string; amount?: number; [key: string]: unknown } | null;
  createdAt: string;
  /** Имя автора в этой поездке (может быть переименовано); null — автор не участник. */
  actorName?: string | null;
  actor?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
  } | null;
}

export interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
}

export interface ImportResult {
  imported: number;
  createdGuests: { id: string; displayName: string }[];
  skipped: { description: string; date: string; reason: string }[];
  warnings: string[];
}

export interface SessionContext {
  telegramChatId: number | null;
  chatInstance: string | null;
  chatType: string | null;
  startParam: string | null;
}

export interface Session {
  user: {
    id: string;
    telegramUserId: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
  };
  context: SessionContext;
}

// ── Админ-раздел (владелец бота) ──────────────────────────────

export interface AdminNewCounts {
  d1: number;
  d7: number;
  d30: number;
}

export interface AdminDailyPoint {
  /** День в UTC, YYYY-MM-DD. */
  day: string;
  operations: number;
  activeTrips: number;
  newExpenses: number;
}

export interface AdminStats {
  totals: { users: number; trips: number; memberships: number; expenses: number };
  new: { users: AdminNewCounts; trips: AdminNewCounts; expenses: AdminNewCounts };
  spentByCurrency: { currency: string; total: number; expenses: number; trips: number }[];
  active: {
    d7: { trips: number; users: number };
    d30: { trips: number; users: number };
  };
  daily: AdminDailyPoint[];
  generatedAt: string;
}

export type AdminTripSort = 'activity' | 'created' | 'spent';

export interface AdminTripRow {
  id: string;
  title: string;
  currency: string;
  telegramChatId: string | null;
  createdAt: string;
  lastActivityAt: string;
  owner: { displayName: string; username: string | null } | null;
  /** Активные участники (включая гостей). */
  members: number;
  /** Активные участники с аккаунтом Telegram. */
  users: number;
  expenseCount: number;
  totalSpent: number;
}

export interface AdminTripsPage {
  items: AdminTripRow[];
  total: number;
}

export interface AdminTripReport {
  trip: {
    id: string;
    title: string;
    currency: string;
    telegramChatId: string | null;
    createdAt: string;
  };
  members: {
    id: string;
    displayName: string;
    username: string | null;
    telegramUserId: string | null;
    role: MemberRole;
    isActive: boolean;
    joinedAt: string;
    balance: number;
  }[];
  summary: TripSummary;
  transfers: Transfer[];
  fund: { balance: number };
  expenses: {
    id: string;
    description: string;
    amount: number;
    category: string | null;
    spentAt: string;
    fromFund: boolean;
    paidBy: string;
  }[];
  history: {
    id: string;
    action: string;
    payload: { description?: string; amount?: number; [key: string]: unknown } | null;
    createdAt: string;
    actor: {
      firstName: string | null;
      lastName: string | null;
      username: string | null;
    } | null;
  }[];
}
