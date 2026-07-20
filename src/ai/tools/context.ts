import { USER_ID_KEY } from '../runtime-context.js';

interface ToolContext {
  requestContext?: { get(key: string): unknown };
}

// Every tool resolves the caller from the request context, never from model
// input, so the LLM cannot act on behalf of another user.
export const requireUserId = (context: ToolContext): string => {
  const userId = context.requestContext?.get(USER_ID_KEY);
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('Missing authenticated user in request context');
  }
  return userId;
};
