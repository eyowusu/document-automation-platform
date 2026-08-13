// Creates or updates a sign-in account.
// Usage: node scripts/create-user.mjs <email> <password> [name] [role]
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

const [email, password, name, role = 'officer'] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: node scripts/create-user.mjs <email> <password> [name] [role]');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Password must be at least 12 characters.');
  process.exit(1);
}
if (!['officer', 'admin'].includes(role)) {
  console.error('Role must be "officer" or "admin".');
  process.exit(1);
}

const prisma = new PrismaClient();
const hash = await bcrypt.hash(password, 12);
const key = email.trim().toLowerCase();

const user = await prisma.user.upsert({
  where: { email: key },
  update: { password: hash, name: name ?? undefined, role },
  create: { email: key, password: hash, name: name ?? null, role },
});

console.log(`Account ready: ${user.email} (${user.role})`);
await prisma.$disconnect();
