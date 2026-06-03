import type { NextConfig } from "next";

// AWS S3 bucket name from env so Next/image accepts uploaded photos.
// Falls back to a placeholder so dev boots before the bucket is configured.
const s3Bucket = process.env.S3_BUCKET ?? "doctor-id-uploads";
const awsRegion = process.env.AWS_REGION ?? "ap-south-1";
// Public/private buckets (shafa-style multi-bucket). Public defaults to the
// legacy single bucket so existing setups keep working. next/image only needs
// the PUBLIC bucket host (profile/cover photos); the private bucket is read via
// presigned GET + a plain <img>, but we whitelist it too for completeness.
const publicBucket = process.env.AWS_PUBLIC_BUCKET_NAME ?? s3Bucket;
const privateBucket = process.env.AWS_PRIVATE_BUCKET_NAME;
const s3Buckets = Array.from(
  new Set([s3Bucket, publicBucket, privateBucket].filter(Boolean) as string[]),
);
const s3RemotePatterns = s3Buckets.flatMap((b) => [
  { protocol: "https" as const, hostname: `${b}.s3.${awsRegion}.amazonaws.com` },
  { protocol: "https" as const, hostname: `${b}.s3.amazonaws.com` },
]);

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker image small for ECS Fargate.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    remotePatterns: [
      ...s3RemotePatterns,
      // Seeded placeholder portraits — only used by the seed script in dev/staging.
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "images.unsplash.com" },
      // Popular Diagnostic ingestion fallback — used when S3 isn't configured,
      // we point Doctor.photo.url at Popular's CDN instead of re-uploading.
      { protocol: "https", hostname: "old.populardiagnostic.com" },
      { protocol: "https", hostname: "populardiagnostic.com" },
      { protocol: "https", hostname: "www.populardiagnostic.com" },
    ],
  },

  // Mongo/AWS SDKs ship native or large optional deps; keep them external to
  // the server bundle so Next doesn't try to trace + bundle them.
  serverExternalPackages: [
    "mongoose",
    "bcryptjs",
    "@aws-sdk/client-s3",
    "@aws-sdk/client-sesv2",
    "@aws-sdk/s3-request-presigner",
    "@aws-sdk/credential-providers",
  ],

  // Server Actions now receive file uploads (server-side S3 upload), so raise
  // the default 1 MB body limit to fit photos up to MAX_FILE_SIZE_MB.
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },

  // Permanent slug redirects from the specialty-catalog reshuffle:
  //   - Obstetrics (394585009) was renamed to Obstetrics & Gynaecology because
  //     its SNOMED code is actually the COMBINED entry.
  //   - Forensic Medicine was dropped (had no SNOMED match in either SIL Thailand
  //     or HL7 c80-practice-codes value sets; 1 source occurrence).
  // See .claude/plans/act-like-a-data-sparkling-orbit.md.
  async redirects() {
    return [
      {source: "/obstetrics", destination: "/obstetrics-gynecology", permanent: true},
      {source: "/forensic-medicine", destination: "/", permanent: true},
    ];
  },
};

export default nextConfig;
