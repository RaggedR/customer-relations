-- AlterTable
ALTER TABLE "User" ALTER COLUMN "active" SET DEFAULT true;

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
CREATE INDEX "NurseSpecialty_nurseId_idx" ON "NurseSpecialty"("nurseId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_medicare_number_key" ON "Patient"("medicare_number");

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