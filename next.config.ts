import type { NextConfig } from "next";

// AWS S3 bucket name from env so Next/image accepts uploaded photos.
// Falls back to a placeholder so dev boots before the bucket is configured.
const s3Bucket = process.env.S3_BUCKET ?? "doctor-id-uploads";
const awsRegion = process.env.AWS_REGION ?? "ap-south-1";

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker image small for ECS Fargate.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    remotePatterns: [
      { protocol: "https", hostname: `${s3Bucket}.s3.${awsRegion}.amazonaws.com` },
      { protocol: "https", hostname: `${s3Bucket}.s3.amazonaws.com` },
      // Seeded placeholder portraits — only used by the seed script in dev/staging.
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "images.unsplash.com" },
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
  ],
};

export default nextConfig;
