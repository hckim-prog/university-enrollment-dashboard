"use client";

import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  HardDrive,
  History,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Send,
  ShieldAlert,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AdminDataOverview,
  AdminDataVersion,
  DataVersionStatus,
  QualityMessage,
} from "@/lib/data-management-types";
import styles from "./data-management.module.css";

const number = new Intl.NumberFormat("ko-KR");
const percent = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const statusLabels: Record<DataVersionStatus, string> = {
  uploaded: "업로드됨",
  validating: "검증 중",
  validation_failed: "검증 실패",
  review_pending: "검토 대기",
  published: "게시됨",
  superseded: "이전 버전",
  restored: "복구됨",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / 1024 / 1024).toFixed(2)}MB`;
}

function MessageList({
  title,
  messages,
  tone,
}: {
  title: string;
  messages: QualityMessage[];
  tone: "error" | "warning";
}) {
  const Icon = tone === "error" ? XCircle : AlertTriangle;
  return (
    <section className={`${styles.messageBox} ${styles[tone]}`}>
      <div>
        <Icon size={17} />
        <strong>{title}</strong>
        <span>{number.format(messages.length)}건</span>
      </div>
      {messages.length === 0 ? (
        <p>해당 항목이 없습니다.</p>
      ) : (
        <ul>
          {messages.slice(0, 12).map((message, index) => (
            <li key={`${message.code}-${message.sourceRow ?? 0}-${index}`}>
              {message.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DifferencePreview({ version }: { version: AdminDataVersion }) {
  const diff = version.difference;
  if (!diff) return <p className={styles.muted}>비교 가능한 게시 버전이 없습니다.</p>;
  const changeItems = [
    ["새 학교", diff.addedSchools],
    ["사라진 학교", diff.removedSchools],
    ["새 지역", diff.addedRegions],
    ["새 설립구분", diff.addedEstablishments],
    ["새 계열", diff.addedFields],
    ["사라진 계열", diff.removedFields],
    ["새 학과상태", diff.addedDepartmentStatuses],
    ["사라진 학과상태", diff.removedDepartmentStatuses],
  ] as const;
  return (
    <div className={styles.diffBlock}>
      <div className={styles.diffNumbers}>
        <div><span>비교 기준</span><strong>{diff.comparisonLabel}</strong></div>
        <div><span>행 수 차이</span><strong>{diff.rowCountChange === null ? "—" : `${diff.rowCountChange >= 0 ? "+" : ""}${number.format(diff.rowCountChange)}`}</strong></div>
        <div><span>재적학생 차이</span><strong>{diff.totalChange === null ? "—" : `${diff.totalChange >= 0 ? "+" : ""}${number.format(diff.totalChange)}명`}</strong></div>
        <div><span>비교상 신규·이탈</span><strong>{number.format(diff.newObservationCount)} / {number.format(diff.exitedObservationCount)}</strong></div>
      </div>
      <div className={styles.changeTags}>
        {changeItems.map(([label, values]) => (
          <div key={label}>
            <span>{label}</span>
            <p>{values.length ? `${values.slice(0, 5).join(", ")}${values.length > 5 ? ` 외 ${values.length - 5}개` : ""}` : "없음"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValidationReport({ version }: { version: AdminDataVersion }) {
  const summary = version.validation.summary;
  return (
    <div className={styles.report}>
      {summary && (
        <div className={styles.previewMetrics}>
          <div><span>감지 연도</span><strong>{summary.year}년</strong></div>
          <div><span>행 × 열</span><strong>{number.format(summary.rowCount)} × {summary.columnCount}</strong></div>
          <div><span>학교</span><strong>{number.format(summary.schoolCount)}개교</strong></div>
          <div><span>학과 관측</span><strong>{number.format(summary.departmentObservationCount)}개</strong></div>
          <div><span>재학생</span><strong>{number.format(summary.enrolled)}명</strong></div>
          <div><span>휴학생</span><strong>{number.format(summary.leave)}명</strong></div>
          <div><span>재적학생</span><strong>{number.format(summary.total)}명</strong></div>
          <div><span>학과군 분류율</span><strong>{percent.format(summary.classifiedValueRate)}</strong></div>
        </div>
      )}
      <DifferencePreview version={version} />
      <div className={styles.messageColumns}>
        <MessageList title="게시 차단 오류" messages={version.validation.errors} tone="error" />
        <MessageList title="확인 필요 경고" messages={version.validation.warnings} tone="warning" />
      </div>
    </div>
  );
}

export function DataManagement({ onPublished }: { onPublished: () => void }) {
  const [overview, setOverview] = useState<AdminDataOverview | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState("all");
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "validating" | "publishing">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try {
      const response = await fetch("/api/admin/data", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("overview_failed");
      setOverview((await response.json()) as AdminDataOverview);
    } catch (loadError) {
      if ((loadError as Error).name === "AbortError") return;
      setError("데이터 관리 정보를 불러올 수 없습니다. 개발 서버 상태를 확인해 주세요.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const chooseFile = (file: File | null) => {
    setError("");
    setNotice("");
    setPreviewId(null);
    if (!file) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
      setError("XLSX 파일만 선택할 수 있습니다.");
      return;
    }
    if (file.size > (overview?.maxUploadBytes ?? 20 * 1024 * 1024)) {
      setError("파일 크기는 20MB를 넘을 수 없습니다.");
      return;
    }
    setSelectedFile(file);
  };

  const validateUpload = async () => {
    if (!selectedFile) {
      setError("검증할 XLSX 파일을 선택해 주세요.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setNotice("");
    setPhase("uploading");
    setProgress(20);
    const form = new FormData();
    form.set("file", selectedFile);
    try {
      const request = fetch("/api/admin/data/upload", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      setPhase("validating");
      setProgress(62);
      const response = await request;
      const payload = (await response.json()) as {
        version?: AdminDataVersion;
        error?: string;
        code?: string;
        existingVersionId?: string;
      };
      if (!response.ok) {
        if (payload.existingVersionId) {
          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          setExpandedId(payload.existingVersionId);
          setPreviewId(payload.existingVersionId);
          setNotice("동일한 파일이 이미 등록되어 기존 버전을 표시했습니다.");
          await load();
          window.setTimeout(
            () => document.getElementById(`version-${payload.existingVersionId}`)?.scrollIntoView({ behavior: "smooth" }),
            80,
          );
          return;
        }
        throw new Error(payload.error ?? "파일 검증에 실패했습니다.");
      }
      if (payload.version) {
        setPreviewId(payload.version.id);
        setExpandedId(payload.version.id);
        setNotice(
          payload.version.validation.canPublish
            ? "검증이 끝났습니다. 결과와 경고를 확인한 뒤 게시할 수 있습니다."
            : "검증 오류가 있어 게시가 차단되었습니다.",
        );
      }
      setProgress(100);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (uploadError) {
      if ((uploadError as Error).name !== "AbortError") {
        setError(
          (uploadError as Error).message ||
            "파일 처리 중 오류가 발생했습니다. 기존 게시 데이터는 유지됩니다.",
        );
      }
    } finally {
      setPhase("idle");
      window.setTimeout(() => setProgress(0), 500);
    }
  };

  const activate = async (version: AdminDataVersion, restore: boolean) => {
    const warnings = version.warningCount;
    const confirmed = window.confirm(
      restore
        ? `${version.year}년 '${version.originalFileName}' 버전으로 복구하시겠습니까? 현재 활성 버전은 이력으로 보존됩니다.`
        : `${version.year}년 '${version.originalFileName}' 버전을 게시하시겠습니까?${warnings ? ` 경고 ${warnings}건을 확인한 것으로 처리합니다.` : ""}`,
    );
    if (!confirmed) return;
    setPhase("publishing");
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        restore ? "/api/admin/data/restore" : "/api/admin/data/publish",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            versionId: version.id,
            acknowledgeWarnings: true,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "처리에 실패했습니다.");
      setNotice(
        restore
          ? `${version.year}년 이전 버전을 복구했습니다. 전체 분석이 다시 계산되었습니다.`
          : `${version.year}년 버전을 게시했습니다. 전체 분석이 다시 계산되었습니다.`,
      );
      await load();
      onPublished();
    } catch (activateError) {
      setError((activateError as Error).message);
    } finally {
      setPhase("idle");
    }
  };

  const years = useMemo(
    () =>
      [...new Set(overview?.versions.map((version) => version.year).filter((year): year is number => year !== null) ?? [])].toSorted((a, b) => b - a),
    [overview],
  );
  const versions = useMemo(
    () =>
      (overview?.versions ?? []).filter(
        (version) => yearFilter === "all" || String(version.year) === yearFilter,
      ),
    [overview, yearFilter],
  );
  const preview = overview?.versions.find((version) => version.id === previewId);

  if (!overview) {
    return (
      <div className={styles.loadingState}>
        <LoaderCircle className={styles.spin} size={24} />
        <strong>로컬 버전 저장소를 확인하고 있습니다.</strong>
        {error && <button type="button" onClick={() => void load()}>다시 시도</button>}
      </div>
    );
  }

  return (
    <section className={styles.shell}>
      <div className={styles.securityNotice}>
        <ShieldAlert size={21} />
        <div><strong>로그인 보호가 없는 로컬 MVP</strong><p>{overview.localOnlyWarning}</p></div>
      </div>

      {(error || notice) && (
        <div className={`${styles.toast} ${error ? styles.toastError : styles.toastSuccess}`} role="status">
          {error ? <XCircle size={17} /> : <CheckCircle2 size={17} />}
          <span>{error || notice}</span>
          <button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="안내 닫기"><X size={15} /></button>
        </div>
      )}

      <article className={styles.panel}>
        <header className={styles.panelHeading}>
          <div><span>ACTIVE DATA</span><h2>현재 게시 현황</h2></div>
          <button type="button" className={styles.iconButton} onClick={() => void load()} aria-label="게시 현황 새로고침"><RefreshCw size={16} /></button>
        </header>
        <div className={styles.currentGrid}>
          <div><HardDrive size={18} /><span>사용 연도</span><strong>{overview.publication.dataYearRange}</strong></div>
          <div><PackageCheck size={18} /><span>전체 행 수</span><strong>{number.format(overview.publication.totalRows)}행</strong></div>
          <div><CheckCircle2 size={18} /><span>검산 상태</span><strong>{overview.publication.validationValid ? "검산 완료" : "확인 필요"}</strong></div>
          <div><History size={18} /><span>최신 게시</span><strong>{formatDate(overview.publication.latestPublishedAt)}</strong></div>
        </div>
        <div className={styles.activeVersions}>
          {overview.publication.activeVersions.map((version) => (
            <div key={version.versionId}>
              <b>{version.year}</b>
              <span title={version.originalFileName}>{version.originalFileName}</span>
              <strong>{number.format(version.rowCount)}행</strong>
              <small>{statusLabels[version.status]}</small>
            </div>
          ))}
        </div>
      </article>

      <article className={styles.panel}>
        <header className={styles.panelHeading}>
          <div><span>UPLOAD & VALIDATE</span><h2>파일 업로드</h2></div>
          <small>한 번에 XLSX 한 개 · 최대 20MB</small>
        </header>
        <label
          className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            chooseFile(event.dataTransfer.files[0] ?? null);
          }}
        >
          <UploadCloud size={29} />
          <strong>대학알리미 XLSX를 놓거나 파일을 선택하세요.</strong>
          <span>원본은 public 폴더가 아닌 서버 전용 비공개 영역에 저장됩니다.</span>
          <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={phase !== "idle"} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
        </label>
        {selectedFile && (
          <div className={styles.selectedFile}>
            <FileSpreadsheet size={22} />
            <div><strong>{selectedFile.name}</strong><span>{formatBytes(selectedFile.size)}</span></div>
            <button type="button" onClick={() => chooseFile(null)} disabled={phase !== "idle"}><X size={16} /> 선택 취소</button>
          </div>
        )}
        {progress > 0 && (
          <div className={styles.progress}>
            <div><span>{phase === "uploading" ? "비공개 영역으로 전송 중" : phase === "validating" ? "변환·검산·차이 비교 중" : "처리 완료"}</span><strong>{progress}%</strong></div>
            <i><b style={{ width: `${progress}%` }} /></i>
          </div>
        )}
        <div className={styles.uploadActions}>
          {phase !== "idle" ? (
            <button type="button" className={styles.secondaryButton} onClick={() => abortRef.current?.abort()}><X size={16} /> 업로드 취소</button>
          ) : (
            <button type="button" className={styles.primaryButton} disabled={!selectedFile} onClick={() => void validateUpload()}><CheckCircle2 size={16} /> 검증 시작</button>
          )}
        </div>
      </article>

      {preview && (
        <article className={`${styles.panel} ${styles.previewPanel}`}>
          <header className={styles.panelHeading}>
            <div><span>VALIDATION PREVIEW</span><h2>검증 결과 미리보기</h2></div>
            <span className={`${styles.status} ${styles[preview.status]}`}>{statusLabels[preview.status]}</span>
          </header>
          <ValidationReport version={preview} />
          <div className={styles.previewActions}>
            <span>{preview.validation.canPublish ? `게시 가능 · 경고 ${preview.warningCount}건` : `게시 차단 · 오류 ${preview.errorCount}건`}</span>
            {preview.validation.canPublish && !preview.isCurrent && (
              <button type="button" className={styles.primaryButton} disabled={phase !== "idle"} onClick={() => void activate(preview, false)}><Send size={16} /> 이 버전 게시</button>
            )}
          </div>
        </article>
      )}

      <article className={styles.panel}>
        <header className={styles.panelHeading}>
          <div><span>VERSION HISTORY</span><h2>버전 이력</h2></div>
          <select aria-label="버전 연도 필터" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}><option value="all">전체 연도</option>{years.map((year) => <option key={year} value={year}>{year}년</option>)}</select>
        </header>
        <div className={styles.historyList}>
          {versions.map((version) => (
            <article id={`version-${version.id}`} key={version.id} className={`${styles.versionCard} ${version.isCurrent ? styles.currentVersion : ""}`}>
              <div className={styles.versionMain}>
                <div className={styles.yearBadge}>{version.year ?? "?"}<small>YEAR</small></div>
                <div className={styles.versionInfo}>
                  <div><strong title={version.originalFileName}>{version.originalFileName}</strong>{version.isCurrent && <span className={styles.currentBadge}>현재 게시</span>}</div>
                  <p>업로드 {formatDate(version.uploadedAt)} · 게시 {formatDate(version.publishedAt)}</p>
                  <small>SHA-256 {version.sha256.slice(0, 12)}… · {formatBytes(version.fileSize)} · {number.format(version.rowCount)}행 · {version.columnCount}열</small>
                </div>
                <span className={`${styles.status} ${styles[version.status]}`}>{statusLabels[version.status]}</span>
              </div>
              <div className={styles.versionActions}>
                <span className={version.errorCount ? styles.errorCount : ""}>오류 {version.errorCount}</span>
                <span className={version.warningCount ? styles.warningCount : ""}>경고 {version.warningCount}</span>
                <button type="button" onClick={() => setExpandedId((current) => current === version.id ? null : version.id)}><Eye size={15} /> 검증 보고서</button>
                {version.status === "review_pending" && version.validation.canPublish && <button type="button" onClick={() => void activate(version, false)} disabled={phase !== "idle"}><Send size={15} /> 게시</button>}
                {!version.isCurrent && version.validation.canPublish && ["superseded", "restored", "published"].includes(version.status) && <button type="button" onClick={() => void activate(version, true)} disabled={phase !== "idle"}><ArchiveRestore size={15} /> 복구</button>}
              </div>
              {expandedId === version.id && <ValidationReport version={version} />}
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}
