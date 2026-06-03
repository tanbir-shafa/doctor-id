/**
 * Phone normalization for the ingest pipeline.
 *
 * Thin re-export of the canonical BD phone normalizer in src/lib/utils/phone.ts.
 * Kept as a separate module so the ingest CLI's import graph stays inside
 * scripts/ and any future ingest-specific quirks (e.g. extracting the first
 * number from a comma-joined string) have a clear home.
 */
export {normalizeBdPhone} from "../../../src/lib/utils/phone";
