// @vitest-environment node
/**
 * Pure-function coverage for the ported S3 service + bucket routing.
 * (getUserMedia/canvas/STS/network aren't unit-testable here — manual QA.)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { computeSha256, shortFileName, buildS3Key } from "@/lib/s3/s3-service";
import {
  BUCKET_TYPE,
  UPLOAD_PURPOSE,
  visibilityFor,
  securityClassFor,
} from "@/lib/s3/buckets";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("computeSha256", () => {
  it("matches the known SHA-256 vector for 'abc'", () => {
    expect(computeSha256(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("shortFileName", () => {
  it("produces {timestamp}-{8 hex}{lowercased ext}", () => {
    expect(shortFileName("Photo.JPG")).toMatch(/^\d+-[0-9a-f]{8}\.jpg$/);
  });
  it("falls back to .bin when there's no extension", () => {
    expect(shortFileName("noext")).toMatch(/^\d+-[0-9a-f]{8}\.bin$/);
  });
});

describe("buildS3Key", () => {
  it("prefixes dev/ outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(buildS3Key("doctor/profile-picture/u1", "a.jpg")).toMatch(
      /^dev\/doctor\/profile-picture\/u1\/\d+-[0-9a-f]{8}\.jpg$/,
    );
  });
  it("omits dev/ in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(buildS3Key("doctor/profile-picture/u1", "a.jpg")).toMatch(
      /^doctor\/profile-picture\/u1\/\d+-[0-9a-f]{8}\.jpg$/,
    );
  });
});

describe("upload purpose → bucket routing", () => {
  it("routes profile/cover photos to the public bucket", () => {
    expect(UPLOAD_PURPOSE.doctor_profile_photo.bucketType).toBe(BUCKET_TYPE.PUBLIC);
    expect(UPLOAD_PURPOSE.doctor_cover_photo.bucketType).toBe(BUCKET_TYPE.PUBLIC);
    expect(visibilityFor(BUCKET_TYPE.PUBLIC)).toBe("public");
    expect(securityClassFor(BUCKET_TYPE.PUBLIC)).toBe("public_asset");
  });
  it("routes selfie + verification docs to the private bucket", () => {
    expect(UPLOAD_PURPOSE.doctor_selfie.bucketType).toBe(BUCKET_TYPE.PRIVATE);
    expect(UPLOAD_PURPOSE.doctor_verification.bucketType).toBe(BUCKET_TYPE.PRIVATE);
    expect(visibilityFor(BUCKET_TYPE.PRIVATE)).toBe("private");
    expect(securityClassFor(BUCKET_TYPE.PRIVATE)).toBe("restricted");
  });
});
