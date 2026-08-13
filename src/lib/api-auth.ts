import 'server-only';
import { NextResponse } from 'next/server';
import { requireUser, SessionUser, UnauthorizedError } from './auth';

type Handler<Context> = (
  request: Request,
  context: Context & { user: SessionUser }
) => Promise<Response> | Response;

/**
 * Wraps a route handler so it only runs for a signed-in user, and turns an
 * unexpected failure into a generic 500 rather than leaking internals.
 */
export function withAuth<Context = unknown>(handler: Handler<Context>) {
  return async (request: Request, context: Context): Promise<Response> => {
    let user: SessionUser;
    try {
      user = await requireUser();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 });
      }
      throw error;
    }
    return handler(request, { ...(context as object), user } as Context & { user: SessionUser });
  };
}
