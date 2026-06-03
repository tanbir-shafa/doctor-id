import { describe, it, expect } from "vitest";
import {
  File,
  FILE_LINKED_ENTITY_TYPE,
  FILE_VISIBILITY,
  FILE_SECURITY_CLASS,
} from "@/lib/db/models/files";

describe("File model", () => {
  it("registers under the PascalCase name 'File'", () => {
    expect(File.modelName).toBe("File");
  });

  it("uses the 'files' collection", () => {
    expect(File.collection.name).toBe("files");
  });

  it("includes USER, ADMIN, and DOCTOR in linked-entity enum", () => {
    expect(FILE_LINKED_ENTITY_TYPE.USER).toBe("user");
    expect(FILE_LINKED_ENTITY_TYPE.ADMIN).toBe("admin");
    expect(FILE_LINKED_ENTITY_TYPE.DOCTOR).toBe("doctor");
  });

  it("exposes public/private/protected visibility values", () => {
    expect(FILE_VISIBILITY.PUBLIC).toBe("public");
    expect(FILE_VISIBILITY.PRIVATE).toBe("private");
    expect(FILE_VISIBILITY.PROTECTED).toBe("protected");
  });

  it("exposes the three security-class values", () => {
    expect(FILE_SECURITY_CLASS.PUBLIC_ASSET).toBe("public_asset");
    expect(FILE_SECURITY_CLASS.RESTRICTED).toBe("restricted");
    expect(FILE_SECURITY_CLASS.INTERNAL).toBe("internal");
  });
});
