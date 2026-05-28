import { handlers } from "./config";

// Split into its own file so the route file (which Next type-checks against
// route segment expectations) stays minimal: just `export { GET, POST }`.
export const { GET, POST } = handlers;
