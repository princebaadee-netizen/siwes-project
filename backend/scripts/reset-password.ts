import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Dev-only helper for setting a known password on an account.
 *   npm run reset:password -- <email> <newPassword>
 *
 * Not a substitute for a real password reset flow — it bypasses email
 * verification entirely, so it must never be wired into a user-facing route.
 */
async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: npm run reset:password -- <email> <newPassword>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const normalised = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalised } });

  if (!user) {
    console.error(`No account found for "${normalised}".`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  console.log(`Password updated for ${user.email} (${user.fullName}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
