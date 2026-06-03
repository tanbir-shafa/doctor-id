/**
 * File collection — generic file/asset metadata.
 *
 * A File doc is the source of truth for any uploaded asset (doctor profile
 * photos, claim ID documents, cover images, future Rx-pad renders, etc.).
 * The S3 object itself is content-addressed by `sha256` and located at
 * `s3Bucket/s3Key`. Linked-entity fields (`linkedEntityType`, `linkedEntityId`)
 * carry the polymorphic owning relationship.
 *
 * Denormalization note: subdocuments like Doctor.photo cache `s3Bucket`,
 * `s3Key`, and `visibility` for read-path speed. The File doc remains the
 * authoritative record — when a photo is replaced, both the File doc and the
 * cached PhotoSchema fields must be updated atomically.
 */

import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

export const FILE_LINKED_ENTITY_TYPE = Object.freeze({
  USER: "user",
  ADMIN: "admin",
  DOCTOR: "doctor",
});

export const FILE_VISIBILITY = Object.freeze({
  PUBLIC: "public",
  PRIVATE: "private",
  PROTECTED: "protected",
});

export const FILE_SECURITY_CLASS = Object.freeze({
  PUBLIC_ASSET: "public_asset",
  RESTRICTED: "restricted",
  INTERNAL: "internal",
});

export type FileLinkedEntityType =
  (typeof FILE_LINKED_ENTITY_TYPE)[keyof typeof FILE_LINKED_ENTITY_TYPE];
export type FileVisibility = (typeof FILE_VISIBILITY)[keyof typeof FILE_VISIBILITY];
export type FileSecurityClass =
  (typeof FILE_SECURITY_CLASS)[keyof typeof FILE_SECURITY_CLASS];

const FileSchema = new Schema(
  {
    linkedEntityType: {
      type: String,
      enum: Object.values(FILE_LINKED_ENTITY_TYPE),
      required: true,
      index: true,
    },
    linkedEntityId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    title: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: null },
    category: { type: String, default: "other", index: true },

    visibility: {
      type: String,
      enum: Object.values(FILE_VISIBILITY),
      required: true,
      index: true,
    },
    securityClass: {
      type: String,
      enum: Object.values(FILE_SECURITY_CLASS),
      required: true,
      index: true,
    },

    originalFileName: { type: String, required: true, trim: true },
    finalFileName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, index: true },
    ext: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    sha256: { type: String, required: true, index: true },

    s3Bucket: { type: String, required: true },
    s3Key: { type: String, required: true, unique: true },
    s3VersionId: { type: String, default: null },

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    deletedAt: { type: Date, default: null },
    metadata: { type: Map, of: String, default: {} },
  },
  { timestamps: true, collection: "files" },
);

FileSchema.index({ linkedEntityType: 1, linkedEntityId: 1, createdAt: -1 });
FileSchema.index({ category: 1, visibility: 1 });

export type FileDoc = InferSchemaType<typeof FileSchema> & { _id: string };

export const File: Model<FileDoc> =
  (models.File as Model<FileDoc>) ?? model<FileDoc>("File", FileSchema);
