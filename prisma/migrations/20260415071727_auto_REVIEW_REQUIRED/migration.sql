-- DropForeignKey
ALTER TABLE "CalendarConnection" DROP CONSTRAINT "CalendarConnection_nurseId_fkey";

-- DropForeignKey
ALTER TABLE "ClaimItem" DROP CONSTRAINT "ClaimItem_patientId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalNote" DROP CONSTRAINT "ClinicalNote_patientId_fkey";

-- DropForeignKey
ALTER TABLE "HearingAid" DROP CONSTRAINT "HearingAid_patientId_fkey";

-- DropForeignKey
ALTER TABLE "NurseSpecialty" DROP CONSTRAINT "NurseSpecialty_nurseId_fkey";

-- DropForeignKey
ALTER TABLE "PersonalNote" DROP CONSTRAINT "PersonalNote_patientId_fkey";

-- DropForeignKey
ALTER TABLE "Referral" DROP CONSTRAINT "Referral_patientId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "caldav_etag" TEXT;

-- AlterTable
ALTER TABLE "ClaimItem" ALTER COLUMN "patientId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ClinicalNote" ALTER COLUMN "patientId" SET NOT NULL;

-- AlterTable
ALTER TABLE "HearingAid" ALTER COLUMN "patientId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Nurse" ADD COLUMN     "aup_acknowledged_at" TIMESTAMP(3),
ADD COLUMN     "feed_token" TEXT,
ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "PersonalNote" ALTER COLUMN "patientId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Referral" ALTER COLUMN "patientId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "active" SET DEFAULT true;

-- CreateTable
CREATE TABLE "ClaimToken" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimToken_token_hash_key" ON "ClaimToken"("token_hash");

-- CreateIndex
CREATE INDEX "Appointment_date_idx" ON "Appointment"("date");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_nurseId_date_idx" ON "Appointment"("nurseId", "date");

-- CreateIndex
CREATE INDEX "Attachment_patientId_idx" ON "Attachment"("patientId");

-- CreateIndex
CREATE INDEX "Attachment_clinical_noteId_idx" ON "Attachment"("clinical_noteId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entity_id_idx" ON "AuditLog"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "CalendarConnection_nurseId_idx" ON "CalendarConnection"("nurseId");

-- CreateIndex
CREATE INDEX "ClaimItem_patientId_idx" ON "ClaimItem"("patientId");

-- CreateIndex
CREATE INDEX "ClinicalNote_patientId_idx" ON "ClinicalNote"("patientId");

-- CreateIndex
CREATE INDEX "HearingAid_patientId_idx" ON "HearingAid"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Nurse_email_key" ON "Nurse"("email");

-- CreateIndex
CREATE INDEX "Nurse_userId_idx" ON "Nurse"("userId");

-- CreateIndex
CREATE INDEX "NurseSpecialty_nurseId_idx" ON "NurseSpecialty"("nurseId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_medicare_number_key" ON "Patient"("medicare_number");

-- CreateIndex
CREATE INDEX "Patient_userId_idx" ON "Patient"("userId");

-- CreateIndex
CREATE INDEX "PersonalNote_patientId_idx" ON "PersonalNote"("patientId");

-- CreateIndex
CREATE INDEX "Referral_patientId_idx" ON "Referral"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalNote" ADD CONSTRAINT "PersonalNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingAid" ADD CONSTRAINT "HearingAid_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimItem" ADD CONSTRAINT "ClaimItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nurse" ADD CONSTRAINT "Nurse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NurseSpecialty" ADD CONSTRAINT "NurseSpecialty_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "Nurse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "Nurse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;