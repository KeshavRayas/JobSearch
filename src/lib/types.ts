import type {
  JobSource,
  CompanyType,
  ExperienceLevel,
  JobType,
  WorkMode,
} from "@/generated/prisma/enums";

export type RawJob = {
  externalId: string;
  title: string;
  description: string;
  companyName: string;
  companyType?: CompanyType;
  location?: string;
  remote?: boolean;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurr?: string;
  jobType?: JobType;
  experience?: ExperienceLevel;
  postedAt?: Date;
  applyUrl: string;
  sourceUrl?: string;
};

export type ClassificationResult = {
  accepted: boolean;
  reason?: string;
  confidence: number;
};

export type EntryLevelResult = {
  accepted: boolean;
  reason?: string;
  experienceLevel?: ExperienceLevel;
};

export type JobFilters = {
  query?: string;
  location?: string;
  workMode?: WorkMode;
  companyTypes?: CompanyType[];
  skills?: string[];
  jobType?: JobType;
  experience?: ExperienceLevel;
  daysOld?: number;
  sources?: JobSource[];
  page?: number;
  pageSize?: number;
};

export type JobSearchResult = {
  id: string;
  title: string;
  description: string;
  applyUrl: string;
  workMode: WorkMode;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurr?: string;
  jobType?: JobType;
  experience?: ExperienceLevel;
  source: JobSource;
  postedAt: Date | null;
  daysOld: number;
  skills: string[];
  decisionStatus: "SAVED" | "QUEUED" | "OPENED" | "APPLIED" | "SKIPPED" | null;
  company: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    companyType: CompanyType;
  };
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
