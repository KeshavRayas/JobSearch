-- Editable drafts replace the semantic-validation gate; cover letters leave scope.
CREATE TYPE "TailorStatus" AS ENUM ('DRAFT', 'APPROVED');

ALTER TABLE "TailoredResume"
  ADD COLUMN "status" "TailorStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "TailoredResume" SET "status" = 'APPROVED' WHERE "validationStatus" = 'SEMANTIC_VALID';

ALTER TABLE "TailoredResume"
  DROP COLUMN "validationStatus",
  DROP COLUMN "validationResult",
  DROP COLUMN "validatedAt";

DROP TYPE "TailorValidationStatus";
DROP TABLE "CoverLetter";
