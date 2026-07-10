export type SplitType = 'EQUAL' | 'SHARES' | 'EXACT';
export type MemberRole = 'OWNER' | 'MEMBER';
export type FundTxnType = 'CONTRIBUTION' | 'PAYOUT' | 'ADJUSTMENT';

export interface Member {
  id: string;
  tripId: string;
  userId: string | null;
  displayName: string;
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
  amount: number;
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

export interface Balances {
  members: MemberBalance[];
  transfers: Transfer[];
  fund: { balance: number };
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
  payload: any;
  createdAt: string;
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
