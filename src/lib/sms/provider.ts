/**
 * Provider selector. Reads `SMS_PROVIDER` (zod default "ssl") and returns the
 * active provider. `mdl` is the legacy fallback for a one-env-var rollback.
 */

import { env } from "@/lib/env";
import type { SmsProvider } from "./types";
import { sslProvider } from "./providers/ssl";
import { mdlProvider } from "./providers/mdl";

export function getSmsProvider(): SmsProvider {
  return env().SMS_PROVIDER === "mdl" ? mdlProvider : sslProvider;
}
