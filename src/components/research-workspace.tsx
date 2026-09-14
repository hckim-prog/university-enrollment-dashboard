"use client";

import { Download, FileDown, Plus, Printer, Trash2, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CurriculumRow, TrendResult } from "@/lib/curriculum-types";
import {
  buildResearchReportHtml,
  CANDIDATE_STATUSES,
  CandidateMetadata,
  CURRICULUM_BASKET_KEY,
  parseCurriculumBasket,
  parseResearchProject,
  RESEARCH_SCHEMA_VERSION,
  ReportCandidate,
  ReportTopic,
  researchCsv,
  summarizeTopicTrend,
  trendSearchParams,
} from "@/lib/research-workspace";
import styles from "./research-workspace.module.css";

const PROJECT_KEY = "market-research-workspace-v1";
const emptyMetadata: CandidateMetadata = { status: "검토중", owner: "", note: "" };
type TopicState = { topic: string; result?: TrendResult; error?: string };

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function changeText(value: { first: number | null; last: number | null; change: number | null }) {
  if (value.first === null || value.last === null) return "자료 없음";
  const sign = value.change !== null && value.change > 0 ? "+" : "";
  return `${value.first.toLocaleString("ko-KR")} → ${value.last.toLocaleString("ko-KR")} (${sign}${value.change?.toLocaleString("ko-KR")})`;
}

export function ResearchWorkspace() {
  const [title, setTitle] = useState("새 시장조사 프로젝트");
  const [topics, setTopics] = useState([""]);
  const [executedTopics, setExecutedTopics] = useState<string[]>([]);
  const [topicStates, setTopicStates] = useState<TopicState[]>([]);
  const [basket, setBasket] = useState<Record<string, CurriculumRow>>({});
  const [metadata, setMetadata] = useState<Record<string, CandidateMetadata>>({});
  const [generatedAt, setGeneratedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = parseResearchProject(localStorage.getItem(PROJECT_KEY) ?? "");
    if (saved.ok) {
      // Browser storage is an external source hydrated after the server render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(saved.project.title);
      setTopics(saved.project.topics.length ? saved.project.topics : [""]);
      setMetadata(saved.project.candidateMetadata);
      setGeneratedAt(saved.project.generatedAt ?? "");
    }
    const syncBasket = () => {
      const parsed = parseCurriculumBasket(localStorage.getItem(CURRICULUM_BASKET_KEY));
      if (parsed) setBasket(parsed.rows);
      else setMessage("저장된 교육과정 후보 형식을 읽을 수 없습니다.");
    };
    syncBasket();
    const onStorage = (event: StorageEvent) => {
      if (event.key === CURRICULUM_BASKET_KEY) syncBasket();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", syncBasket);
    setReady(true);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("focus", syncBasket); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const project = { schemaVersion: RESEARCH_SCHEMA_VERSION, title, topics: topics.map((item) => item.trim()).filter(Boolean), candidateMetadata: metadata, generatedAt: generatedAt || undefined, exportedAt: new Date().toISOString() };
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
  }, [title, topics, metadata, generatedAt, ready]);

  const reportTopics = useMemo<ReportTopic[]>(() => topicStates.flatMap((state) => {
    const summary = state.result && summarizeTopicTrend(state.result);
    return summary ? [{ name: state.topic, summary, version: state.result!.version, filters: "과목명·교과목해설 포함 · 대학·전문대학 전체" }] : [];
  }), [topicStates]);
  const candidates = useMemo<ReportCandidate[]>(() => Object.values(basket).map((row) => ({
    id: row.id, school: row.school, department: row.department, course: row.course,
    year: row.year, enrolled: row.enrolled, ...(metadata[row.id] ?? emptyMetadata),
  })), [basket, metadata]);
  const report = { title: title.trim() || "시장조사 보고서", generatedAt: generatedAt || new Date().toISOString(), topics: reportTopics, candidates };
  const dirty = executedTopics.length > 0 && JSON.stringify(executedTopics) !== JSON.stringify(topics.map((item) => item.trim()).filter(Boolean));

  async function compare() {
    const requested = topics.map((item) => item.trim()).filter(Boolean);
    if (!requested.length) { setMessage("비교할 주제를 하나 이상 입력하세요."); return; }
    setLoading(true); setMessage(""); setExecutedTopics(requested);
    const settled = await Promise.allSettled(requested.map(async (topic) => {
      const query = trendSearchParams(topic);
      const response = await fetch(`/api/curriculum?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "조회 실패");
      return data as TrendResult;
    }));
    setTopicStates(settled.map((item, index) => item.status === "fulfilled" ? { topic: requested[index], result: item.value } : { topic: requested[index], error: item.reason instanceof Error ? item.reason.message : "조회 실패" }));
    setGeneratedAt(new Date().toISOString()); setLoading(false);
  }

  function updateMetadata(id: string, patch: Partial<CandidateMetadata>) {
    setMetadata((current) => ({ ...current, [id]: { ...(current[id] ?? emptyMetadata), ...patch } }));
  }
  function exportJson() {
    downloadFile("시장조사_프로젝트.json", JSON.stringify({ schemaVersion: RESEARCH_SCHEMA_VERSION, title, topics: topics.map((item) => item.trim()).filter(Boolean), candidateMetadata: metadata, generatedAt: generatedAt || undefined, exportedAt: new Date().toISOString() }, null, 2), "application/json;charset=utf-8");
  }
  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const parsed = parseResearchProject(await file.text());
    if (!parsed.ok) { setMessage(`${parsed.error} 현재 프로젝트는 변경하지 않았습니다.`); return; }
    setTitle(parsed.project.title); setTopics(parsed.project.topics.length ? parsed.project.topics : [""]); setMetadata(parsed.project.candidateMetadata); setGeneratedAt(parsed.project.generatedAt ?? ""); setTopicStates([]); setExecutedTopics([]); setMessage("프로젝트를 가져왔습니다. 비교 결과는 다시 실행해 주세요.");
  }
  function exportComparisonCsv() {
    const rows: unknown[][] = [["주제", "기간", "관련 학교 변화", "관련 학과 변화", "교육과정 등록 변화", "연결 재학생 변화", "확보 학교 변화", "데이터 버전"]];
    reportTopics.forEach((topic) => rows.push([topic.name, `${topic.summary.firstYear}–${topic.summary.lastYear}`, topic.summary.schools.change, topic.summary.departments.change, topic.summary.registrations.change, topic.summary.enrolled.change, topic.summary.coverage.change, topic.version]));
    downloadFile("시장조사_주제비교.csv", researchCsv(rows), "text/csv;charset=utf-8");
  }
  function exportCandidateCsv() {
    const rows: unknown[][] = [["학교", "학과", "과목", "연도", "연결 재학생", "상태", "담당자", "메모"]];
    candidates.forEach((item) => rows.push([item.school, item.department, item.course, item.year, item.enrolled, item.status, item.owner, item.note]));
    downloadFile("시장조사_후보.csv", researchCsv(rows), "text/csv;charset=utf-8");
  }

  return <section className={`${styles.workspace} researchPrintScope`}>
    <div className={`${styles.controls} noPrint`}>
      <div className={styles.titleRow}><label>프로젝트 제목<input maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className={styles.actions}><button type="button" onClick={() => window.print()}><Printer size={16}/> 인쇄/PDF</button><button type="button" onClick={() => downloadFile("시장조사_보고서.html", buildResearchReportHtml(report), "text/html;charset=utf-8")}><FileDown size={16}/> HTML</button><button type="button" disabled={!reportTopics.length} onClick={exportComparisonCsv}><Download size={16}/> 비교 CSV</button><button type="button" disabled={!candidates.length} onClick={exportCandidateCsv}><Download size={16}/> 후보 CSV</button><button type="button" onClick={exportJson}><Download size={16}/> JSON</button><button type="button" onClick={() => fileRef.current?.click()}><Upload size={16}/> JSON 가져오기</button><input ref={fileRef} className={styles.fileInput} type="file" accept="application/json,.json" onChange={importJson}/></div></div>
      <fieldset><legend>비교 주제 (최대 4개)</legend>{topics.map((topic, index) => <div className={styles.topic} key={index}><label><span className={styles.srOnly}>주제 {index + 1}</span><input maxLength={100} value={topic} placeholder={index === 0 ? "예: 인공지능" : "비교 주제"} onChange={(event) => setTopics((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/></label>{topics.length > 1 && <button type="button" aria-label={`주제 ${index + 1} 제거`} onClick={() => setTopics((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16}/></button>}</div>)}<div className={styles.topicActions}><button type="button" disabled={topics.length >= 4} onClick={() => setTopics((current) => [...current, ""])}><Plus size={16}/> 주제 추가</button><button className={styles.primary} type="button" disabled={loading} onClick={() => void compare()}>{loading ? "비교 중…" : "주제 비교 실행"}</button></div></fieldset>
      <p className={styles.guide}>입력만으로 조회하지 않습니다. 주제를 확정한 뒤 비교 실행을 누르세요. 교육과정 등록은 실제 강좌 수가 아니며 재학생은 수강인원이나 판매 수요가 아닙니다.</p>
      {message && <p role="alert" className={styles.message}>{message}</p>}{dirty && <p role="status" className={styles.stale}>주제가 변경되었습니다. 아래 결과는 이전 실행 기준입니다.</p>}
      {loading && <p role="status">주제별 교육과정 추세를 조회하고 있습니다…</p>}
    </div>

    <section className={styles.report} aria-label="시장조사 보고서 미리보기">
      <header><span>시장조사 워크스페이스 보고서</span><h2>{report.title}</h2><p>생성 시각 {generatedAt ? new Date(generatedAt).toLocaleString("ko-KR") : "비교 실행 전"}</p></header>
      <h3>주제 비교</h3>
      <div className={styles.tableWrap}><table><thead><tr><th>주제</th><th>관련 학교</th><th>관련 학과</th><th>교육과정 등록</th><th>연결 재학생</th><th>확보 학교</th></tr></thead><tbody>{topicStates.length === 0 ? <tr><td colSpan={6}>비교할 주제를 입력하고 ‘주제 비교 실행’을 누르세요.</td></tr> : topicStates.map((state) => { const summary = state.result && summarizeTopicTrend(state.result); const empty = state.result?.all.every((point) => point.total === 0); return <tr key={state.topic}><th>{state.topic}</th>{state.error ? <td colSpan={5} className={styles.error}>이 주제만 조회하지 못했습니다: {state.error}</td> : !summary || empty ? <td colSpan={5}>검색 결과가 없습니다. 주제 범위를 조정해 다시 실행하세요.</td> : <><td>{changeText(summary.schools)}</td><td>{changeText(summary.departments)}</td><td>{changeText(summary.registrations)}</td><td>{changeText(summary.enrolled)}</td><td>{changeText(summary.coverage)}</td></>}</tr>; })}</tbody></table></div>
      <h3>연구 후보</h3><p className={styles.caption}>과목별 시장 탐색의 저장 후보를 읽습니다. 이 화면에서는 후보를 제거하지 않으며, 프로젝트 JSON에도 교육과정 행을 넣지 않습니다.</p>
      <div className={styles.tableWrap}><table><thead><tr><th>학교</th><th>학과</th><th>과목</th><th>연도</th><th>재학생</th><th>상태</th><th>담당자</th><th>메모</th></tr></thead><tbody>{candidates.length === 0 ? <tr><td colSpan={8}>저장된 교육과정 후보가 없습니다.</td></tr> : candidates.map((item) => <tr key={item.id}><td>{item.school}</td><td>{item.department}</td><td>{item.course}</td><td>{item.year}</td><td>{item.enrolled?.toLocaleString("ko-KR") ?? "자료 없음"}</td><td><select className="noPrint" aria-label={`${item.course} 상태`} value={item.status} onChange={(event) => updateMetadata(item.id, { status: event.target.value as CandidateMetadata["status"] })}>{CANDIDATE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><span className={styles.printOnly}>{item.status}</span></td><td><input className="noPrint" maxLength={80} aria-label={`${item.course} 담당자`} value={item.owner} onChange={(event) => updateMetadata(item.id, { owner: event.target.value })}/><span className={styles.printOnly}>{item.owner || "—"}</span></td><td><textarea className="noPrint" maxLength={500} aria-label={`${item.course} 메모`} value={item.note} onChange={(event) => updateMetadata(item.id, { note: event.target.value })}/><span className={styles.printOnly}>{item.note || "—"}</span></td></tr>)}</tbody></table></div>
      <h3>출처·버전·필터</h3><p>교육과정 원본 및 대학알리미 학과별 학생 현황 연결 자료</p>{reportTopics.length ? <ul>{reportTopics.map((topic) => <li key={topic.name}>{topic.name} · 데이터 버전 {topic.version} · 필터 {topic.filters}</li>)}</ul> : <p>비교 결과를 실행하면 데이터 버전과 필터가 기록됩니다.</p>}
      <aside className={styles.caveat}><strong>해석 유의사항</strong><p>교육과정 등록은 실제 개설 강좌 수가 아니며, 학과 재학생은 수강인원·예상 판매부수·실제 판매 수요가 아닙니다. 연도별 자료 범위와 조사차수 차이, 미연결 학과를 함께 확인하세요.</p></aside>
    </section>
  </section>;
}
