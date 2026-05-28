import "@testing-library/jest-dom/vitest";

// Tests should run with predictable env vars even when .env.local exists.
process.env.MONGO_URI ??= "mongodb://localhost:27017/doctor-id-test";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-test-secret";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
