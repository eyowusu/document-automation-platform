import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSession, hashPassword, pruneExpiredSessions, verifyPassword } from '@/lib/auth';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Failed-attempt throttle. In-process only, which is enough for a single
 * server; move to the database or a cache if this is ever run behind more
 * than one instance.
 */
const attempts = new Map<string, { count: number; firstAt: number }>();

function tooManyAttempts(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const key = email.trim().toLowerCase();
    if (tooManyAttempts(key)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Try again in 15 minutes.' },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email: key } });

    // Hash even when the user is unknown, so response time does not reveal
    // which email addresses exist.
    const valid = user
      ? await verifyPassword(password, user.password)
      : (await hashPassword(password), false);

    if (!user || !valid) {
      recordFailure(key);
      return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
    }

    attempts.delete(key);
    await pruneExpiredSessions();
    await createSession(user.id);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json({ error: 'Could not sign in' }, { status: 500 });
  }
}
