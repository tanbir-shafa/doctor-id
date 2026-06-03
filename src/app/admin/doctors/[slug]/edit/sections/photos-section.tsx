"use client";

import { PhotoUploader } from "@/app/(dashboard)/dashboard/photos/photo-uploader";
import { adminUploadDoctorPhotoAction } from "@/server/actions/admin-doctor";

export function AdminPhotosSection({
  doctorId,
  profileUrl,
  coverUrl,
}: {
  doctorId: string;
  profileUrl: string | null;
  coverUrl: string | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-slate-700">Profile photo</h3>
        <p className="mb-2 text-xs text-slate-500">
          Square preferred. Shown on profile + OG share card.
        </p>
        <PhotoUploader
          kind="profile"
          currentUrl={profileUrl}
          uploadAction={(fd) => adminUploadDoctorPhotoAction(doctorId, fd)}
        />
      </div>
      <div>
        <h3 className="text-sm font-medium text-slate-700">Cover photo</h3>
        <p className="mb-2 text-xs text-slate-500">Wide banner shown at the top of the profile.</p>
        <PhotoUploader
          kind="cover"
          currentUrl={coverUrl}
          uploadAction={(fd) => adminUploadDoctorPhotoAction(doctorId, fd)}
        />
      </div>
    </div>
  );
}
