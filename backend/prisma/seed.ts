import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Federal Nigerian public holidays only (per the plan — state-specific
 * holidays are explicitly out of scope). Fixed-date holidays are listed
 * for the given year; Eid al-Fitr and Eid al-Adha are moon-sighting-based,
 * so their dates below are estimates and MUST be confirmed/adjusted by an
 * admin closer to the date once the government announces them.
 */
const HOLIDAYS_2026 = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-05-01', name: "Workers' Day" },
  { date: '2026-05-20', name: 'Eid al-Fitr (estimated — confirm date)' },
  { date: '2026-06-12', name: 'Democracy Day' },
  { date: '2026-07-27', name: 'Eid al-Adha (estimated — confirm date)' },
  { date: '2026-10-01', name: 'Independence Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: 'Boxing Day' },
];

async function main() {
  for (const h of HOLIDAYS_2026) {
    const date = new Date(h.date);
    await prisma.publicHoliday.upsert({
      where: { date_name: { date, name: h.name } },
      update: {},
      create: { date, name: h.name, year: date.getFullYear() },
    });
  }
  console.log(`Seeded ${HOLIDAYS_2026.length} holidays for 2026.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
