// Key under which the authenticated user id is placed into Mastra's request
// context. Tools read it from there so the user identifier never travels
// through the LLM (SPEC.md → Security Model).
export const USER_ID_KEY = 'userId';
