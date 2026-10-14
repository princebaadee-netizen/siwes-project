import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Dev-only helper that wipes everything a student has done so the account looks
 * brand new, while keeping the login itself (email + password intact).
 *   npm run reset:data -- <email>
 *
 * Removes logbook entries, placement + calendar, bulk-fillup requests, projects,
 * chapters, references, purchases, generation logs and password-reset tokens,
 * and clears the profile fields (school, department, module choice).
 */
async function main() {
  const [email] = process.argv.slice(2);

  if (!email) {
    console.error('Usage: npm run reset:data -- <email>');
    process.exit(1);
  }

  const normalised = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalised } });

  if (!user) {
    console.error(`No account found for "${normalised}".`);
    process.exit(1);
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const generationLogs = await tx.generationLog.deleteMany({ where: { userId: user.id } });
    const purchases = await tx.purchase.deleteMany({ where: { userId: user.id } });
    const resetTokens = await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const projects = await tx.project.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    const references = await tx.projectReference.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    const chapters = await tx.projectChapter.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    const projectRows = await tx.project.deleteMany({ where: { userId: user.id } });

    const placements = await tx.iTPlacement.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const placementIds = placements.map((p) => p.id);
    const entries = await tx.logbookEntry.deleteMany({
      where: { calendarDay: { placementId: { in: placementIds } } },
    });
    const days = await tx.attendanceCalendarDay.deleteMany({
      where: { placementId: { in: placementIds } },
    });
    const bulkRequests = await tx.bulkFillupRequest.deleteMany({
      where: { placementId: { in: placementIds } },
    });
    const placementRows = await tx.iTPlacement.deleteMany({ where: { userId: user.id } });

    await tx.user.update({
      where: { id: user.id },
      data: { school: null, department: null, moduleChoice: null },
    });

    return {
      generationLogs: generationLogs.count,
      purchases: purchases.count,
      resetTokens: resetTokens.count,
      projects: projectRows.count,
      chapters: chapters.count,
      references: references.count,
      placements: placementRows.count,
      logbookEntries: entries.count,
      calendarDays: days.count,
      bulkRequests: bulkRequests.count,
    };
  });

  console.log(`Reset ${user.email} (${user.fullName}).`);
  for (const [label, count] of Object.entries(deleted)) {
    console.log(`  ${label}: ${count}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
