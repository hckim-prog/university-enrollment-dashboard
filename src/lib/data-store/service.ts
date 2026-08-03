import { randomUUID } from "node:crypto";
import path from "node:path";
import thresholds from "../../config/data-quality-thresholds.json";
import { classifyDepartment } from "../department-groups";
import {
  PARSER_VERSION,
  type AdminDataVersion,
  type AdminDataOverview,
  type DataAuditEntry,
  type DataPublicationStatus,
  type DatasetDifference,
  type DatasetSummary,
  type DataStoreMetadata,
  type DataVersion,
  type PublishedDataset,
  type QualityMessage,
  type StoredValidationResult,
} from "../data-management-types";
import type { EnrollmentRecord } from "../types";
import {
  convertEnrollmentWorkbook,
  enrollmentObservationKey,
  type WorkbookConversionResult,
} from "../xlsx-converter";
import { LocalDataVersionRepository } from "./local-repository";
import type { DataVersionRepository } from "./repository";

const LOCAL_ONLY_WARNING =
  "현재 데이터 관리 기능은 로컬 MVP 전용입니다. 인터넷에 배포하기 전에 관리자 로그인과 서버 저장소를 반드시 연결해야 합니다.";

export class DataManagementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly existingVersionId?: string,
  ) {
    super(message);
  }
}

export function toAdminDataVersion(version: DataVersion): AdminDataVersion {
  return {
    id: version.id,
    year: version.year,
    originalFileName: version.originalFileName,
    sha256: version.sha256,
    fileSize: version.fileSize,
    uploadedAt: version.uploadedAt,
    publishedAt: version.publishedAt,
    status: version.status,
    rowCount: version.rowCount,
    columnCount: version.columnCount,
    parserVersion: version.parserVersion,
    validation: version.validation,
    warningCount: version.warningCount,
    errorCount: version.errorCount,
    difference: version.difference,
    isCurrent: version.isCurrent,
    replacesVersionId: version.replacesVersionId,
  };
}

function now() {
  return new Date().toISOString();
}

function ratio(change: number, baseline: number) {
  return baseline === 0 ? null : change / baseline;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ko-KR"),
  );
}

export function summarizeDataset(
  records: EnrollmentRecord[],
  year: number,
  columnCount: number,
): DatasetSummary {
  let enrolled = 0;
  let leave = 0;
  let deferment = 0;
  let total = 0;
  let classifiedValue = 0;
  const observationKeys = new Set<string>();
  for (const record of records) {
    enrolled += record.enrolled;
    leave += record.leave;
    deferment += record.deferment;
    total += record.total;
    observationKeys.add(enrollmentObservationKey(record));
    if (classifyDepartment(record.department).id !== "other") {
      classifiedValue += record.total;
    }
  }
  return {
    year,
    rowCount: records.length,
    columnCount,
    schoolCount: new Set(records.map((record) => record.school)).size,
    departmentObservationCount: observationKeys.size,
    enrolled,
    leave,
    deferment,
    total,
    regions: unique(records.map((record) => record.region)),
    schools: unique(records.map((record) => record.school)),
    establishments: unique(records.map((record) => record.establishment)),
    fields: unique(records.map((record) => record.field)),
    departmentStatuses: unique(
      records.map((record) => record.departmentStatus),
    ),
    classifiedValueRate: total === 0 ? 0 : classifiedValue / total,
    unclassifiedValueShare: total === 0 ? 0 : (total - classifiedValue) / total,
  };
}

function added(current: string[], previous: string[]) {
  const previousSet = new Set(previous);
  return current.filter((value) => !previousSet.has(value));
}

function difference(
  current: DatasetSummary,
  currentRecords: EnrollmentRecord[],
  previousVersion: DataVersion | null,
  previousSummary: DatasetSummary | null,
  previousRecords: EnrollmentRecord[],
): DatasetDifference {
  const currentKeys = new Set(currentRecords.map(enrollmentObservationKey));
  const previousKeys = new Set(previousRecords.map(enrollmentObservationKey));
  const rowCountChange = previousSummary
    ? current.rowCount - previousSummary.rowCount
    : null;
  const totalChange = previousSummary ? current.total - previousSummary.total : null;
  return {
    comparisonVersionId: previousVersion?.id ?? null,
    comparisonLabel: previousVersion
      ? previousVersion.year === current.year
        ? `${current.year}년 현재 게시 버전`
        : `${previousVersion.year}년 게시 버전`
      : "비교할 게시 버전 없음",
    rowCount: current.rowCount,
    rowCountChange,
    totalChange,
    totalChangeRate:
      totalChange === null || !previousSummary
        ? null
        : ratio(totalChange, previousSummary.total),
    schoolCountChange: previousSummary
      ? current.schoolCount - previousSummary.schoolCount
      : null,
    addedSchools: previousSummary
      ? added(current.schools, previousSummary.schools)
      : current.schools,
    removedSchools: previousSummary
      ? added(previousSummary.schools, current.schools)
      : [],
    addedRegions: previousSummary
      ? added(current.regions, previousSummary.regions)
      : current.regions,
    removedRegions: previousSummary
      ? added(previousSummary.regions, current.regions)
      : [],
    addedEstablishments: previousSummary
      ? added(current.establishments, previousSummary.establishments)
      : current.establishments,
    removedEstablishments: previousSummary
      ? added(previousSummary.establishments, current.establishments)
      : [],
    addedFields: previousSummary
      ? added(current.fields, previousSummary.fields)
      : current.fields,
    removedFields: previousSummary
      ? added(previousSummary.fields, current.fields)
      : [],
    addedDepartmentStatuses: previousSummary
      ? added(current.departmentStatuses, previousSummary.departmentStatuses)
      : current.departmentStatuses,
    removedDepartmentStatuses: previousSummary
      ? added(previousSummary.departmentStatuses, current.departmentStatuses)
      : [],
    newObservationCount: [...currentKeys].filter((key) => !previousKeys.has(key))
      .length,
    exitedObservationCount: [...previousKeys].filter(
      (key) => !currentKeys.has(key),
    ).length,
  };
}

function buildWarnings(
  summary: DatasetSummary,
  diff: DatasetDifference,
  previousVersion: DataVersion | null,
  previousSummary: DatasetSummary | null,
) {
  const warnings: QualityMessage[] = [];
  const add = (code: string, message: string) =>
    warnings.push({ code, message, severity: "warning" });
  if (previousVersion?.year === summary.year) {
    add(
      "existing_year_revision",
      `${summary.year}년의 현재 게시 버전이 있어 새 버전으로 등록합니다.`,
    );
  }
  if (previousSummary && diff.rowCountChange !== null) {
    const changeRate = ratio(diff.rowCountChange, previousSummary.rowCount);
    if (changeRate !== null && Math.abs(changeRate) >= thresholds.rowCountChangeRate) {
      add(
        "row_count_change",
        `행 수가 비교 버전보다 ${(changeRate * 100).toFixed(1)}% 변했습니다.`,
      );
    }
  }
  if (
    diff.totalChangeRate !== null &&
    Math.abs(diff.totalChangeRate) >= thresholds.totalStudentChangeRate
  ) {
    add(
      "total_student_change",
      `전체 재적학생이 비교 버전보다 ${(diff.totalChangeRate * 100).toFixed(1)}% 변했습니다.`,
    );
  }
  if (previousSummary && diff.schoolCountChange !== null) {
    const schoolRate = ratio(diff.schoolCountChange, previousSummary.schoolCount);
    if (schoolRate !== null && Math.abs(schoolRate) >= thresholds.schoolCountChangeRate) {
      add(
        "school_count_change",
        `학교 수가 비교 버전보다 ${(schoolRate * 100).toFixed(1)}% 변했습니다.`,
      );
    }
    if (
      previousSummary.classifiedValueRate - summary.classifiedValueRate >=
      thresholds.classificationRateDrop
    ) {
      add(
        "classification_rate_drop",
        `학과군 분류율이 ${(
          (previousSummary.classifiedValueRate - summary.classifiedValueRate) *
          100
        ).toFixed(1)}%p 낮아졌습니다.`,
      );
    }
    if (
      summary.unclassifiedValueShare - previousSummary.unclassifiedValueShare >=
      thresholds.unclassifiedShareIncrease
    ) {
      add(
        "unclassified_share_increase",
        `기타·미분류 비중이 ${(
          (summary.unclassifiedValueShare - previousSummary.unclassifiedValueShare) *
          100
        ).toFixed(1)}%p 높아졌습니다.`,
      );
    }
    const lifecycleDifference =
      diff.newObservationCount + diff.exitedObservationCount;
    const previousObservationCount = Math.max(
      previousSummary.departmentObservationCount,
      1,
    );
    if (
      lifecycleDifference >= thresholds.minimumLifecycleObservationDifference &&
      lifecycleDifference / previousObservationCount >=
        thresholds.lifecycleObservationChangeRate
    ) {
      add(
        "lifecycle_observation_change",
        `비교상 신규·이탈 관측이 ${lifecycleDifference.toLocaleString("ko-KR")}건입니다.`,
      );
    }
  }
  const categoryWarnings: Array<[string, string[]]> = [
    ["지역", diff.addedRegions],
    ["설립구분", diff.addedEstablishments],
    ["계열", diff.addedFields],
    ["학과상태", diff.addedDepartmentStatuses],
  ];
  for (const [label, values] of previousSummary ? categoryWarnings : []) {
    if (values.length) {
      add(
        `new_${label}`,
        `새로운 ${label}: ${values.slice(0, 8).join(", ")}${
          values.length > 8 ? ` 외 ${values.length - 8}개` : ""
        }`,
      );
    }
  }
  return warnings;
}

function statusFromMetadata(metadata: DataStoreMetadata): DataPublicationStatus {
  const activeVersions = Object.entries(metadata.activeByYear)
    .map(([year, versionId]) => {
      const version = metadata.versions.find((item) => item.id === versionId);
      return version
        ? {
            year: Number(year),
            versionId,
            originalFileName: version.originalFileName,
            publishedAt: version.publishedAt,
            rowCount: version.rowCount,
            status: version.status,
          }
        : null;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .toSorted((a, b) => a.year - b.year);
  const activeYears = activeVersions.map((version) => version.year);
  const totalRows = activeVersions.reduce(
    (sum, version) => sum + version.rowCount,
    0,
  );
  const publishedDates = activeVersions
    .map((version) => version.publishedAt)
    .filter((value): value is string => Boolean(value))
    .toSorted();
  return {
    initialized: activeVersions.length > 0 && Boolean(metadata.activeSnapshotId),
    activeYears,
    activeVersions,
    latestPublishedAt: publishedDates.at(-1) ?? null,
    totalRows,
    dataYearRange:
      activeYears.length === 0
        ? "게시 데이터 없음"
        : activeYears.length === 1
          ? `${activeYears[0]}년`
          : `${activeYears[0]}–${activeYears.at(-1)}년`,
    validationValid: activeVersions.every((version) => {
      const item = metadata.versions.find((candidate) => candidate.id === version.versionId);
      return item?.validation.valid === true;
    }),
    validationIssueCount: activeVersions.reduce((sum, version) => {
      const item = metadata.versions.find((candidate) => candidate.id === version.versionId);
      return sum + (item?.errorCount ?? 0);
    }, 0),
    revision: metadata.activeSnapshotId ?? "processed-fallback",
  };
}

function audit(
  action: DataAuditEntry["action"],
  versionId: string,
  previousVersionId: string | null,
  message: string,
): DataAuditEntry {
  return {
    id: `audit_${randomUUID()}`,
    action,
    occurredAt: now(),
    versionId,
    previousVersionId,
    message,
  };
}

export class DataManagementService {
  private mutationQueue: Promise<unknown> = Promise.resolve();
  private cachedSnapshotId: string | null = null;
  private cachedDataset: PublishedDataset | null = null;

  constructor(private readonly repository: DataVersionRepository) {}

  private serialize<T>(operation: () => Promise<T>) {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async finalizeValidation(
    versionId: string,
    conversion: WorkbookConversionResult,
    preservePublication?: Pick<
      DataVersion,
      "status" | "isCurrent" | "publishedAt" | "replacesVersionId"
    >,
  ) {
    const metadata = await this.repository.readMetadata();
    const version = metadata.versions.find((item) => item.id === versionId);
    if (!version) throw new Error("version_not_found_during_validation");
    const year = conversion.detectedYear ?? conversion.fileNameYear;
    let previousVersion: DataVersion | null = null;
    let previousSummary: DatasetSummary | null = null;
    let previousRecords: EnrollmentRecord[] = [];
    if (year !== null) {
      const sameYearId = metadata.activeByYear[String(year)];
      previousVersion = sameYearId
        ? metadata.versions.find(
            (item) => item.id === sameYearId && item.id !== versionId,
          ) ?? null
        : null;
      if (!previousVersion) {
        const priorYears = Object.keys(metadata.activeByYear)
          .map(Number)
          .filter((candidate) => candidate < year)
          .toSorted((a, b) => b - a);
        const previousId = priorYears.length
          ? metadata.activeByYear[String(priorYears[0])]
          : null;
        previousVersion = previousId
          ? metadata.versions.find((item) => item.id === previousId) ?? null
          : null;
      }
    }
    if (previousVersion?.normalizedPath) {
      previousRecords = await this.repository.readNormalized(
        previousVersion.normalizedPath,
      );
      previousSummary = previousVersion.validation.summary;
    }
    const summary =
      conversion.detectedYear === null
        ? null
        : summarizeDataset(
            conversion.records,
            conversion.detectedYear,
            conversion.columnCount,
          );
    const diff = summary
      ? difference(
          summary,
          conversion.records,
          previousVersion,
          previousSummary,
          previousRecords,
        )
      : null;
    const warnings = [
      ...conversion.warnings,
      ...(summary && diff
        ? buildWarnings(summary, diff, previousVersion, previousSummary)
        : []),
    ];
    const validation: StoredValidationResult = {
      valid: conversion.errors.length === 0,
      canPublish: conversion.errors.length === 0 && summary !== null,
      detectedYear: conversion.detectedYear,
      fileNameYear: conversion.fileNameYear,
      errorCount: conversion.errors.length,
      warningCount: warnings.length,
      errors: conversion.errors.slice(0, 100),
      warnings: warnings.slice(0, 100),
      issueSample: conversion.issueSample,
      summary,
    };
    const normalizedPath = conversion.records.length
      ? await this.repository.writeNormalized(versionId, conversion.records)
      : null;
    const reportPath = await this.repository.writeReport(versionId, validation);
    Object.assign(version, {
      year,
      normalizedPath,
      reportPath,
      parserVersion: PARSER_VERSION,
      status: validation.canPublish ? "review_pending" : "validation_failed",
      rowCount: summary?.rowCount ?? conversion.records.length,
      columnCount: conversion.columnCount,
      validation,
      warningCount: validation.warningCount,
      errorCount: validation.errorCount,
      difference: diff,
    } satisfies Partial<DataVersion>);
    if (preservePublication) Object.assign(version, preservePublication);
    if (!validation.canPublish) {
      metadata.audit.push(
        audit(
          "validation_failed",
          versionId,
          null,
          `검증 오류 ${validation.errorCount}건으로 게시가 차단되었습니다.`,
        ),
      );
    }
    metadata.updatedAt = now();
    await this.repository.writeMetadata(metadata);
    return version;
  }

  async getOverview(): Promise<AdminDataOverview> {
    const metadata = await this.repository.readMetadata();
    return {
      publication: statusFromMetadata(metadata),
      versions: metadata.versions
        .toSorted((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        .map(toAdminDataVersion),
      audit: metadata.audit.toSorted((a, b) =>
        b.occurredAt.localeCompare(a.occurredAt),
      ),
      parserVersion: PARSER_VERSION,
      maxUploadBytes: thresholds.maxUploadBytes,
      localOnlyWarning: LOCAL_ONLY_WARNING,
    };
  }

  async upload(input: { fileName: string; bytes: Uint8Array }) {
    if (!input.fileName.toLocaleLowerCase().endsWith(".xlsx")) {
      throw new DataManagementError(
        "invalid_extension",
        "XLSX 파일만 업로드할 수 있습니다.",
      );
    }
    if (input.bytes.byteLength === 0) {
      throw new DataManagementError("empty_file", "빈 파일은 업로드할 수 없습니다.");
    }
    if (input.bytes.byteLength > thresholds.maxUploadBytes) {
      throw new DataManagementError(
        "file_too_large",
        "파일 크기는 20MB를 넘을 수 없습니다.",
        413,
      );
    }
    if (input.bytes[0] !== 0x50 || input.bytes[1] !== 0x4b) {
      throw new DataManagementError(
        "invalid_xlsx_signature",
        "XLSX 형식의 파일이 아닙니다.",
      );
    }

    return this.serialize(async () => {
      const metadata = await this.repository.readMetadata();
      const conversion = await convertEnrollmentWorkbook(
        input.bytes,
        path.basename(input.fileName),
      );
      const duplicate = metadata.versions.find(
        (version) => version.sha256 === conversion.sha256,
      );
      if (duplicate) {
        throw new DataManagementError(
          "duplicate_file",
          "동일한 파일이 이미 등록되어 있습니다.",
          409,
          duplicate.id,
        );
      }

      const year = conversion.detectedYear ?? conversion.fileNameYear;
      const versionId = `v_${year ?? "unknown"}_${Date.now()}_${conversion.sha256.slice(0, 10)}`;
      const internalFileName = `${versionId}.xlsx`;
      const storagePath = await this.repository.writeOriginal(
        internalFileName,
        input.bytes,
      );
      const placeholder: StoredValidationResult = {
        valid: false,
        canPublish: false,
        detectedYear: conversion.detectedYear,
        fileNameYear: conversion.fileNameYear,
        errorCount: 0,
        warningCount: 0,
        errors: [],
        warnings: [],
        issueSample: [],
        summary: null,
      };
      const placeholderReportPath = await this.repository.writeReport(
        versionId,
        placeholder,
      );
      const uploadedAt = now();
      const initialVersion: DataVersion = {
        id: versionId,
        year,
        originalFileName: path.basename(input.fileName),
        internalFileName,
        storagePath,
        normalizedPath: null,
        reportPath: placeholderReportPath,
        sha256: conversion.sha256,
        fileSize: conversion.fileSize,
        uploadedAt,
        publishedAt: null,
        status: "validating",
        rowCount: conversion.records.length,
        columnCount: conversion.columnCount,
        parserVersion: PARSER_VERSION,
        validation: placeholder,
        warningCount: 0,
        errorCount: 0,
        difference: null,
        isCurrent: false,
        replacesVersionId: null,
      };
      metadata.versions.unshift(initialVersion);
      metadata.audit.push(
        audit("upload", versionId, null, "업로드 파일을 비공개 영역에 등록했습니다."),
      );
      metadata.updatedAt = uploadedAt;
      await this.repository.writeMetadata(metadata);
      return this.finalizeValidation(versionId, conversion);
    });
  }

  async revalidate(versionId: string) {
    return this.serialize(async () => {
      const metadata = await this.repository.readMetadata();
      const version = metadata.versions.find((item) => item.id === versionId);
      if (!version) {
        throw new DataManagementError(
          "version_not_revalidatable",
          "다시 검증할 수 있는 버전을 찾지 못했습니다.",
          404,
        );
      }
      const preservePublication = version.isCurrent
        ? {
            status: version.status,
            isCurrent: true,
            publishedAt: version.publishedAt,
            replacesVersionId: version.replacesVersionId,
          }
        : undefined;
      version.status = "validating";
      metadata.audit.push(
        audit(
          "revalidate",
          version.id,
          null,
          `${PARSER_VERSION} 변환기로 다시 검증했습니다.`,
        ),
      );
      metadata.updatedAt = now();
      await this.repository.writeMetadata(metadata);
      const bytes = await this.repository.readOriginal(version.storagePath);
      const conversion = await convertEnrollmentWorkbook(
        bytes,
        version.originalFileName,
      );
      return this.finalizeValidation(
        version.id,
        conversion,
        preservePublication,
      );
    });
  }

  async publish(
    versionId: string,
    options: { acknowledgeWarnings: boolean; restore?: boolean },
  ) {
    return this.serialize(async () => {
      const metadata = await this.repository.readMetadata();
      const target = metadata.versions.find((version) => version.id === versionId);
      if (!target || target.year === null || !target.normalizedPath) {
        throw new DataManagementError(
          "version_not_publishable",
          "게시할 수 있는 버전을 찾지 못했습니다.",
          404,
        );
      }
      if (!target.validation.canPublish || target.errorCount > 0) {
        throw new DataManagementError(
          "validation_blocked",
          "검증 오류가 있는 버전은 게시할 수 없습니다.",
        );
      }
      if (target.warningCount > 0 && !options.acknowledgeWarnings) {
        throw new DataManagementError(
          "warnings_not_acknowledged",
          "검증 경고를 확인한 뒤 다시 게시해 주세요.",
        );
      }
      const yearKey = String(target.year);
      const previousVersionId = metadata.activeByYear[yearKey] ?? null;
      if (previousVersionId === target.id) {
        throw new DataManagementError(
          "already_current",
          "이미 현재 게시 버전입니다.",
        );
      }
      const nextActiveByYear = {
        ...metadata.activeByYear,
        [yearKey]: target.id,
      };
      const activeVersions = Object.entries(nextActiveByYear)
        .map(([year, id]) => ({
          year: Number(year),
          version: metadata.versions.find((item) => item.id === id),
        }))
        .filter(
          (item): item is { year: number; version: DataVersion } =>
            Boolean(item.version?.normalizedPath),
        )
        .toSorted((a, b) => a.year - b.year);
      const recordGroups = await Promise.all(
        activeVersions.map(({ version }) =>
          this.repository.readNormalized(version.normalizedPath!),
        ),
      );
      const records = recordGroups.flat().toSorted(
        (a, b) => a.year - b.year || a.sourceRow - b.sourceRow,
      );
      const aggregateErrors = records.filter(
        (record) =>
          record.total !== record.enrolled + record.leave + record.deferment,
      );
      if (aggregateErrors.length) {
        throw new DataManagementError(
          "snapshot_validation_failed",
          "전체 연도 재구성 검산에 실패해 기존 게시 데이터를 유지했습니다.",
          500,
        );
      }
      const publishedAt = now();
      for (const version of metadata.versions) {
        if (version.year !== target.year) continue;
        if (version.id === target.id) {
          version.status = options.restore ? "restored" : "published";
          version.isCurrent = true;
          version.publishedAt = publishedAt;
          version.replacesVersionId = previousVersionId;
        } else if (version.isCurrent || version.id === previousVersionId) {
          version.status = "superseded";
          version.isCurrent = false;
        }
      }
      metadata.activeByYear = nextActiveByYear;
      const snapshotId = `snapshot_${Date.now()}_${randomUUID().slice(0, 8)}`;
      metadata.activeSnapshotId = snapshotId;
      metadata.audit.push(
        audit(
          options.restore ? "restore" : "publish",
          target.id,
          previousVersionId,
          options.restore
            ? `${target.year}년 이전 버전을 복구했습니다.`
            : `${target.year}년 검증 버전을 게시했습니다.`,
        ),
      );
      metadata.updatedAt = publishedAt;
      const publication = statusFromMetadata(metadata);
      const snapshot: PublishedDataset = {
        revision: snapshotId,
        records,
        validation: {
          valid: true,
          totalRows: records.length,
          issueCount: 0,
          generatedAt: publishedAt,
        },
        publication: { ...publication, revision: snapshotId },
      };
      await this.repository.writeSnapshot(snapshotId, snapshot);
      await this.repository.writeMetadata(metadata);
      this.cachedSnapshotId = snapshotId;
      this.cachedDataset = snapshot;
      return { target, previousVersionId, publication: snapshot.publication };
    });
  }

  async restore(versionId: string, acknowledgeWarnings: boolean) {
    return this.publish(versionId, {
      acknowledgeWarnings,
      restore: true,
    });
  }

  async getPublishedDataset() {
    const metadata = await this.repository.readMetadata();
    if (!metadata.activeSnapshotId) return null;
    if (
      this.cachedSnapshotId === metadata.activeSnapshotId &&
      this.cachedDataset
    ) {
      return this.cachedDataset;
    }
    const dataset = await this.repository.readSnapshot(metadata.activeSnapshotId);
    this.cachedSnapshotId = metadata.activeSnapshotId;
    this.cachedDataset = dataset;
    return dataset;
  }

  async recordMigration(versionId: string) {
    return this.serialize(async () => {
      const metadata = await this.repository.readMetadata();
      metadata.audit.push(
        audit(
          "migrate",
          versionId,
          null,
          "기존 검증 데이터를 최초 게시 버전으로 이관했습니다.",
        ),
      );
      metadata.updatedAt = now();
      await this.repository.writeMetadata(metadata);
    });
  }
}

let defaultService: DataManagementService | undefined;

export function getDataManagementService() {
  defaultService ??= new DataManagementService(
    new LocalDataVersionRepository(),
  );
  return defaultService;
}

export { LOCAL_ONLY_WARNING, statusFromMetadata };
