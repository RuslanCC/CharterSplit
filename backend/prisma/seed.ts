// Демо-данные для локальной разработки и скриншотов: поездка на яхте с
// участниками, расходами всеми способами деления, кассой и взаиморасчётом.
//
//   SEED_DEMO=1 npm run seed --workspace backend   (или npm run seed:demo)
//
// Поездка привязана к чату DEMO_CHAT_ID, владелец — DEMO_USER_ID: те же значения
// по умолчанию использует scripts/dev-init-data.mjs, чтобы открыть её в браузере.
// Повторный запуск пересоздаёт демо-поездку. В production не запускается.
import {
  FundTxnType,
  MemberRole,
  PrismaClient,
  SplitType,
  type User,
} from '@prisma/client';
import { computeShares, type ShareInput } from '../src/common/money';

export const DEMO_CHAT_ID = -1001234567890n;
export const DEMO_USER_ID = 100001n;

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
/** Момент `daysAgo` дней назад в заданное локальное время. */
function at(daysAgo: number, hours: number, minutes = 0): Date {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function main() {
  if (process.env.SEED_DEMO !== '1') {
    console.log('seed: nothing to do (SEED_DEMO=1 создаёт демо-поездку)');
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed: демо-данные не создаются при NODE_ENV=production');
  }

  await prisma.trip.deleteMany({ where: { telegramChatId: DEMO_CHAT_ID } });

  const people = [
    { tg: DEMO_USER_ID, first: 'Алексей', last: 'Морской', username: 'captain_alex' },
    { tg: 100002n, first: 'Мария', last: 'Ветрова', username: 'maria_v' },
    { tg: 100003n, first: 'Дмитрий', last: 'Штурман', username: 'dima_nav' },
    { tg: 100004n, first: 'Ольга', last: 'Парусова', username: 'olga_sails' },
  ];
  const users: User[] = [];
  for (const p of people) {
    users.push(
      await prisma.user.upsert({
        where: { telegramUserId: p.tg },
        create: {
          telegramUserId: p.tg,
          firstName: p.first,
          lastName: p.last,
          username: p.username,
        },
        update: { firstName: p.first, lastName: p.last, username: p.username },
      }),
    );
  }

  const trip = await prisma.trip.create({
    data: {
      telegramChatId: DEMO_CHAT_ID,
      startParam: `c${DEMO_CHAT_ID}`,
      title: 'Хорватия · Sun Odyssey 519',
      currency: 'EUR',
      createdAt: at(5, 10),
      settings: { create: {} },
    },
  });

  const member = (
    displayName: string,
    userIdx?: number,
    role: MemberRole = MemberRole.MEMBER,
  ) =>
    prisma.tripMember.create({
      data: {
        tripId: trip.id,
        displayName,
        role,
        userId: userIdx !== undefined ? users[userIdx].id : null,
        joinedAt: at(5, 10),
      },
    });
  const alex = await member('Алексей Морской', 0, MemberRole.OWNER);
  const maria = await member('Мария Ветрова', 1);
  const dima = await member('Дмитрий Штурман', 2);
  const olga = await member('Ольга Парусова', 3);
  const sergey = await member('Сергей (гость)');
  const misha = await member('Миша');
  // Семейная связь: расходы Миши покрывает Ольга.
  await prisma.tripMember.update({
    where: { id: misha.id },
    data: { coveredByMemberId: olga.id },
  });

  const everyone = [alex, maria, dima, olga, sergey, misha];
  const adults = [alex, maria, dima, olga, sergey];
  const actorOf = new Map([
    [alex.id, users[0].id],
    [maria.id, users[1].id],
    [dima.id, users[2].id],
    [olga.id, users[3].id],
  ]);

  const history = (
    action: string,
    entityType: string,
    entityId: string,
    createdAt: Date,
    payload: object,
    actorMemberId = alex.id,
  ) =>
    prisma.operationHistory.create({
      data: {
        tripId: trip.id,
        actorUserId: actorOf.get(actorMemberId) ?? users[0].id,
        action,
        entityType,
        entityId,
        payload,
        createdAt,
      },
    });

  // Судовая касса: взносы в первый день.
  for (const [m, amount] of [
    [alex, 30_000],
    [maria, 30_000],
    [dima, 30_000],
    [olga, 30_000],
  ] as const) {
    const txn = await prisma.fundTransaction.create({
      data: {
        tripId: trip.id,
        memberId: m.id,
        userId: actorOf.get(m.id),
        type: FundTxnType.CONTRIBUTION,
        amount,
        createdAt: at(4, 9, 30),
      },
    });
    await history(
      'FUND_CONTRIBUTED',
      'FundTransaction',
      txn.id,
      txn.createdAt,
      {
        amount,
        memberId: m.id,
      },
      m.id,
    );
  }

  type Demo = {
    description: string;
    category: string;
    amount: number;
    tip?: number;
    payer: typeof alex;
    when: Date;
    split?: SplitType;
    participants?: ShareInput[];
    fromFund?: boolean;
  };
  const equal = (ms: (typeof alex)[]) => ms.map((m) => ({ memberId: m.id }));

  const demo: Demo[] = [
    {
      description: 'Марина Сплит, стоянка',
      category: 'Марина',
      amount: 32_000,
      payer: alex,
      when: at(4, 11),
    },
    {
      description: 'Закупка в Konzum на неделю',
      category: 'Продукты',
      amount: 18_650,
      payer: maria,
      when: at(4, 13, 20),
    },
    {
      description: 'Трансфер из аэропорта',
      category: 'Такси',
      amount: 6_000,
      payer: dima,
      when: at(4, 15),
      participants: equal([dima, olga, misha]),
    },
    {
      description: 'Дизель, заправка в Сплите',
      category: 'Топливо',
      amount: 9_500,
      payer: alex,
      when: at(3, 9),
      fromFund: true,
    },
    {
      description: 'Ужин в Konoba Fetivi',
      category: 'Ресторан',
      amount: 24_800,
      tip: 2_500,
      payer: olga,
      when: at(3, 20, 30),
      split: SplitType.SHARES,
      participants: [
        { memberId: alex.id, shareUnits: 2 },
        { memberId: maria.id, shareUnits: 2 },
        { memberId: dima.id, shareUnits: 2 },
        { memberId: olga.id, shareUnits: 2 },
        { memberId: sergey.id, shareUnits: 2 },
        { memberId: misha.id, shareUnits: 1 },
      ],
    },
    {
      description: 'Буй в бухте Стари-Град',
      category: 'Марина',
      amount: 4_500,
      payer: dima,
      when: at(2, 18),
      fromFund: true,
    },
    {
      description: 'Марина Хвар',
      category: 'Марина',
      amount: 41_000,
      payer: alex,
      when: at(2, 12),
    },
    {
      description: 'Рынок: фрукты и рыба',
      category: 'Продукты',
      amount: 7_340,
      payer: sergey,
      when: at(2, 10, 15),
      split: SplitType.EXACT,
      participants: [
        { memberId: sergey.id, amount: 2_340 },
        { memberId: maria.id, amount: 2_500 },
        { memberId: olga.id, amount: 2_500 },
      ],
    },
    {
      description: 'Дизель, Вис',
      category: 'Топливо',
      amount: 11_200,
      payer: maria,
      when: at(1, 9, 40),
      fromFund: true,
    },
    {
      description: 'Пицца на набережной',
      category: 'Ресторан',
      amount: 9_800,
      tip: 1_000,
      payer: dima,
      when: at(1, 21),
      participants: equal(everyone),
    },
    {
      description: 'Такси до пещеры',
      category: 'Такси',
      amount: 3_500,
      payer: maria,
      when: at(1, 14),
      participants: equal([maria, dima, sergey]),
    },
    {
      description: 'Вода и лёд',
      category: 'Продукты',
      amount: 2_420,
      payer: olga,
      when: at(0, 9, 10),
    },
    {
      description: 'Марина Вис',
      category: 'Марина',
      amount: 28_000,
      payer: alex,
      when: at(0, 11, 30),
      participants: equal(adults),
    },
  ];

  for (const d of demo) {
    const split = d.split ?? SplitType.EQUAL;
    const shares = d.fromFund
      ? []
      : computeShares(split, d.amount, d.participants ?? equal(everyone));
    const tip = d.fromFund ? 0 : (d.tip ?? 0);
    const expense = await prisma.expense.create({
      data: {
        tripId: trip.id,
        description: d.description,
        category: d.category,
        amount: d.amount + tip,
        tipAmount: tip,
        spentAt: d.when,
        createdAt: d.when,
        paidByMemberId: d.payer.id,
        fromFund: !!d.fromFund,
        splitType: split,
        shares: { create: shares },
      },
    });
    await history(
      'EXPENSE_CREATED',
      'Expense',
      expense.id,
      d.when,
      {
        description: d.description,
        amount: d.amount + tip,
      },
      d.payer.id,
    );
  }

  const settlement = await prisma.settlement.create({
    data: {
      tripId: trip.id,
      fromMemberId: dima.id,
      toMemberId: alex.id,
      amount: 15_000,
      createdAt: at(0, 12),
    },
  });
  await history(
    'SETTLEMENT_RECORDED',
    'Settlement',
    settlement.id,
    settlement.createdAt,
    {
      amount: 15_000,
      fromMemberId: dima.id,
      toMemberId: alex.id,
    },
    dima.id,
  );

  console.log(`seed: демо-поездка «${trip.title}» создана (chat ${DEMO_CHAT_ID})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
