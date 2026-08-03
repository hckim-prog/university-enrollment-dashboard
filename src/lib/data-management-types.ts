import type { EnrollmentRecord, ValidationIssue } from "./types";

export const PARSER_VERSION = "university-alert-sax-v2.1";

export type DataVersionStatus =
  | "uploaded"
  | "validating"
  | "validation_failed"
  | "review_pending"
  | "published"
  | "superseded"
  | "restored";

export type QualityMessage = {
  code: string;
  message: string;
  severity: "error" | "warning";
  sourceRow?: number;
};

export type DatasetSummary = {
  year: number;
  rowCount: number;
  columnCount: number;
  schoolCount: number;
  departmentObservationCount: number;
  enrolled: number;
  leave: number;
  deferment: number;
  total: number;
  regions: string[];
  schools: string[];
  establishments: string[];
  fields: string[];
  departmentStatuses: string[];
  classifiedValueRate: number;
  unclassifiedValueShare: number;
};

export type DatasetDifference = {
  comparisonVersionId: string | null;
  comparisonLabel: string;
  rowCount: number;
  rowCountChange: number | null;
  totalChange: number | null;
  totalChangeRate: number | null;
  schoolCountChange: number | null;
  addedSchools: string[];
  removedSchools: string[];
  addedRegions: string[];
  removedRegions: string[];
  addedEstablishments: string[];
  removedEstablishments: string[];
  addedFields: string[];
  removedFields: string[];
  addedDepartmentStatuses: string[];
  removedDepartmentStatuses: string[];
  newObservationCount: number;
  exitedObservationCount: number;
};

export type StoredValidationResult = {
  valid: boolean;
  canPublish: boolean;
  detectedYear: number | null;
  fileNameYear: number | null;
  errorCount: number;
  warningCount: number;
  errors: QualityMessage[];
  warnings: QualityMessage[];
  issueSample: ValidationIssue[];
  summary: DatasetSummary | null;
};

export type DataVersion = {
  id: string;
  year: number | null;
  originalFileName: string;
  internalFileName: string;
  storagePath: string;
  normalizedPath: string | null;
  reportPath: string;
  sha256: string;
  fileSize: number;
  uploadedAt: string;
  publishedAt: string | null;
  status: DataVersionStatus;
  rowCount: number;
  columnCount: number;
  parserVersion: string;
  validation: StoredValidationResult;
  warningCount: number;
  errorCount: number;
  difference: DatasetDifference | null;
  isCurrent: boolean;
  replacesVersionId: string | null;
};

export type AdminDataVersion = Omit<
  DataVersion,
  "internalFileName" | "storagePath" | "normalizedPath" | "reportPath"
>;

export type DataAuditEntry = {
  id: string;
  action:
    | "migrate"
    | "upload"
    | "revalidate"
    | "validation_failed"
    | "publish"
    | "restore";
  occurredAt: string;
  versionId: string;
  previousVersionId: string | null;
  message: string;
};

export type DataStoreMetadata = {
  schemaVersion: 1;
  activeSnapshotId: string | null;
  activeByYear: Record<string, string>;
  versions: DataVersion[];
  audit: DataAuditEntry[];
  updatedAt: string;
};

export type PublishedDataset = {
  revision: string;
  records: EnrollmentRecord[];
  validation: {
    valid: boolean;
    totalRows: number;
    issueCount: number;
    generatedAt: string;
  };
  publication: DataPublicationStatus;
};

export type DataPublicationStatus = {
  initialized: boolean;
  activeYears: number[];
  activeVersions: Array<{
    year: number;
    versionId: string;
    originalFileName: string;
    publishedAt: string | null;
    rowCount: number;
    status: DataVersionStatus;
  }>;
  latestPublishedAt: string | null;
  totalRows: number;
  dataYearRange: string;
  validationValid: boolean;
  validationIssueCount: number;
  revision: string;
};

export type AdminDataOverview = {
  publication: DataPublicationStatus;
  versions: AdminDataVersion[];
  audit: DataAuditEntry[];
  parserVersion: string;
  maxUploadBytes: number;
  localOnlyWarning: string;
};
