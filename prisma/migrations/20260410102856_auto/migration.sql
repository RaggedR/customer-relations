-- CreateTable
CREATE TABLE "Nurse" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "registration_number" TEXT,
    "notes" TEXT,

    CONSTRAINT "Nurse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NurseSpecialty" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "specialty" TEXT NOT NULL,
    "notes" TEXT,
    "nurseId" INTEGER,

    CONSTRAINT "NurseSpecialty_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NurseSpecialty" ADD CONSTRAINT "NurseSpecialty_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "Nurse"("id") ON DELETE SET NULL ON UPDATE CASCADE;