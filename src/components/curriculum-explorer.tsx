"use client";
import { useEffect, useRef, useState } from 'react';
import type { CurriculumFilters, CurriculumManifest, CurriculumResult, CurriculumRow, ComparisonResult, ComparisonRow, TrendResult } from '@/lib/curriculum-types';
import { curriculumCsv, summarizeDepartments } from '@/lib/curriculum';
import { TrendPanel } from './curriculum-trend';
import styles from './curriculum-explorer.module.css';

const defaults:CurriculumFilters={year:2026,q:'',description:false,category:'',school:'',department:'',division:'',page:1};
const number=(n:number|null)=>n===null?'자료 없음':n.toLocaleString('ko-KR');
function Evidence({row}:{row:CurriculumRow}) {
  return <details><summary>해설·원본 근거 확인</summary><p className={styles.description}>{row.description||'교과목해설 미기재'}</p>
    <dl><dt>연결 기준</dt><dd>{row.year} · {row.schoolCode} · {row.campus} · {row.departmentCode} · {row.dayNight} · {row.departmentFeature}</dd>
    <dt>교육과정 원본</dt><dd>{row.sourceFile} / {row.sourceSheet} / {row.sourceRow}행 / {row.round}차</dd>
    <dt>원본 버전 SHA256</dt><dd>{row.sourceVersion}</dd><dt>학생 원본</dt><dd>{row.studentSource?`${row.studentSource.file} / ${row.studentSource.sheet} / ${row.studentSource.row}행`:'동일 연도·복합키로 연결되는 학생 자료 없음'}</dd>
    {row.studentSource&&<><dt>학생 원본 버전 SHA256</dt><dd>{row.studentSource.version}</dd></>}</dl></details>;
}
export function CurriculumExplorer() {
  const [meta,setMeta]=useState<CurriculumManifest|null>(null);const [draft,setDraft]=useState(defaults);
  const [result,setResult]=useState<CurriculumResult|null>(null);const [comparison,setComparison]=useState<ComparisonResult|null>(null);
  const [mode,setMode]=useState<'trend'|'search'|'compare'>('trend');const [from,setFrom]=useState(2025);const [to,setTo]=useState(2026);
  const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [selected,setSelected]=useState<Record<string,CurriculumRow>>({});
  const [trend,setTrend]=useState<TrendResult|null>(null);
  const [optionResult,setOptionResult]=useState<{key:string;options:CurriculumResult['options']}|null>(null);
  const [groupSort,setGroupSort]=useState('enrolled');
  const [basketReady,setBasketReady]=useState(false);
  const [selectionContext,setSelectionContext]=useState<Record<string,{filters:CurriculumFilters;version:string}>>({});
  const [evidence,setEvidence]=useState<CurriculumRow[]>([]);const requestId=useRef(0);
  useEffect(()=>{const controller=new AbortController();fetch('/api/curriculum?mode=meta',{signal:controller.signal}).then(async r=>{const m=await r.json();if(!r.ok)throw new Error(m.error);return m as CurriculumManifest;}).then(m=>{setMeta(m);setDraft({...defaults,year:m.years.at(-1)!});setFrom(m.years.includes(2025)?2025:m.years.at(-2)!);setTo(m.years.includes(2026)?2026:m.years.at(-1)!);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[]);
  useEffect(()=>{
    try { const saved=JSON.parse(localStorage.getItem('curriculum-basket-v1')||'null');
      // External browser-storage hydration intentionally updates the initial server-rendered state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if(saved?.schema===1 && saved.rows && saved.context){setSelected(saved.rows);setSelectionContext(saved.context);}
    }catch{setError('저장된 후보를 불러오지 못했습니다.');}
    setBasketReady(true);
  },[]);
  useEffect(()=>{if(!basketReady)return;try{localStorage.setItem('curriculum-basket-v1',JSON.stringify({schema:1,rows:selected,context:selectionContext}));}catch{
    // Report an external storage failure; this does not participate in the effect dependencies.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError('브라우저 저장 공간이 부족합니다. 후보 CSV를 내려받아 보관하세요.');}},[selected,selectionContext,basketReady]);
  const optionYears=mode==='search'?String(draft.year):mode==='compare'?[from,to].join(','):meta?.years.join(',')??'';
  const optionKey=[optionYears,draft.year,draft.category,draft.school,draft.department].join('|');
  const options=optionResult?.key===optionKey?optionResult.options:null;
  const optionsLoading=Boolean(meta&&!options);
  useEffect(()=>{
    if(!meta)return;
    const controller=new AbortController();
    const p=new URLSearchParams({mode:'options',year:String(draft.year),years:optionYears,category:draft.category,school:draft.school,department:draft.department});
    fetch('/api/curriculum?'+p,{signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}).then(options=>setOptionResult({key:optionKey,options})).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return()=>controller.abort();
  },[meta,optionKey,optionYears,draft.year,draft.category,draft.school,draft.department]);
  function update<K extends keyof CurriculumFilters>(key:K,value:CurriculumFilters[K]) {
    setDraft(f=>({...f,[key]:value,...(['year','category'].includes(key)?{school:'',department:'',division:''}:key==='school'?{department:'',division:''}:key==='department'?{division:''}:{})}));
  }
  async function search(page=1, applied?:CurriculumFilters) {
    const token=++requestId.current;setLoading(true);setError('');setEvidence([]);
    const f={...(applied??draft),page};const p=new URLSearchParams(Object.entries(f).map(([k,v])=>[k,String(v)]));
    if(mode==='trend')p.set('mode','trend');
    if(mode==='compare'){p.set('mode','compare');p.set('from',String(applied&&comparison?comparison.from:from));p.set('to',String(applied&&comparison?comparison.to:to));}
    try {const response=await fetch('/api/curriculum?'+p);const data=await response.json();if(!response.ok)throw new Error(data.error);
      if(token===requestId.current){if(mode==='search')setResult(data);else if(mode==='trend')setTrend(data);else setComparison(data);}
    }catch(e){if(token===requestId.current)setError(e instanceof Error?e.message:'조회 실패');}
    finally{if(token===requestId.current)setLoading(false);}
  }
  async function showComparison(row:ComparisonRow) {
    setError('');setEvidence([]);setLoading(true);
    try {const response=await fetch('/api/curriculum/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:comparison?.version,items:[row.before,row.after].filter(Boolean).map(r=>({year:r!.year,id:r!.id}))})});const data=await response.json();if(!response.ok)throw new Error(data.error);setEvidence(data);}
    catch(e){setError(e instanceof Error?e.message:'근거 조회 실패');}finally{setLoading(false);}
  }
  function download() {
    const lines=Object.values(selected).map((row,index)=>{
      const context=selectionContext[row.id];
      const csv=curriculumCsv([row],context?.filters??defaults,context?.version??'보관 후보: 버전 확인 필요');
      return index===0?csv:csv.slice(csv.indexOf('\r\n')+2);
    });
    const blob=new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='교육과정_후보.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const active=mode==='search'?result:mode==='compare'?comparison:null;
  const chosen=Object.values(selected);
  const groups=[...(result?.groups??[])].sort((a,b)=>groupSort==='enrolled'?(b.enrolled??-1)-(a.enrolled??-1):groupSort==='total'?b.total-a.total:a.school.localeCompare(b.school,'ko'));
  return <section className={styles.explorer}>
    <div className={styles.intro}><span>교육과정 × 학과 학생 규모</span><h2>과목별 시장 흐름과 목표 학과 찾기</h2><p>시장 흐름 확인 → 학교·학과 후보 탐색 → 교육과정 변화 확인 → 후보 저장</p></div>
    <div className={styles.notice}>교육과정 등록 건수는 실제 개설 강좌 수가 아닙니다. 학과 재학생은 수강인원이나 예상 판매부수가 아닙니다. 같은 학과의 관련 과목이 여러 개여도 재학생 합계에는 한 번만 포함합니다.</div>
    {meta&&<details className={styles.coverage}><summary>자료 범위 · 조사차수 · 연결 기준 확인</summary><p>교육과정 {meta.years.join(', ')}년 / 학생 현황 {meta.studentYears[0]}~{meta.studentYears.at(-1)}년 · 변환 {meta.generatedAt.slice(0,10)}</p>
      <ul>{meta.sources.map(s=><li key={s.file}>{s.file}: {s.ranges.map(r=>`${r.year}년 ${r.category} ${r.round}차 · ${number(r.rows)}건`).join(', ')} / 연결 {number(s.linkedDepartments)}학과, 미연결 {number(s.unlinkedDepartments)}학과</li>)}</ul>
      <p>{meta.joinRule}</p>{meta.warnings.map(w=><p key={w}>{w}</p>)}<p>자료가 없는 연도는 선택할 수 없습니다. 2025년 대학 2차와 2026년 1차 비교에는 조사차수 차이가 포함됩니다.</p><small>데이터 버전: {meta.version}</small></details>}
    <div className={styles.tabs}><button type="button" aria-pressed={mode==='trend'} onClick={()=>{requestId.current++;setLoading(false);setMode('trend');setEvidence([]);}}>시장 흐름</button><button type="button" aria-pressed={mode==='search'} onClick={()=>{requestId.current++;setLoading(false);setMode('search');setEvidence([]);}}>과목 검색</button><button type="button" aria-pressed={mode==='compare'} onClick={()=>{requestId.current++;setLoading(false);setMode('compare');setEvidence([]);}}>연도별 교육과정 비교</button></div>
    <form className={styles.filters} onSubmit={e=>{e.preventDefault();void search();}}>
      {mode==='trend'?<p>교육과정 확보 전체 기간: {meta?.years.join(' · ')}년</p>:mode==='search'?<label>교육과정·학생 기준연도<select value={draft.year} onChange={e=>update('year',Number(e.target.value))}>{meta?.years.map(y=><option key={y}>{y}</option>)}</select></label>:<><label>이전연도<select value={from} onChange={e=>setFrom(Number(e.target.value))}>{meta?.years.map(y=><option key={y}>{y}</option>)}</select></label><label>비교연도<select value={to} onChange={e=>setTo(Number(e.target.value))}>{meta?.years.map(y=><option key={y}>{y}</option>)}</select></label></>}
      <label className={styles.query}>과목명·주제<input value={draft.q} onChange={e=>update('q',e.target.value)} placeholder="예: 인공지능, AI (쉼표로 여러 검색어)" /></label>
      <label className={styles.checkbox}><input type="checkbox" checked={draft.description} onChange={e=>update('description',e.target.checked)} />교과목해설 포함 검색</label>
      <label>대학구분<select value={draft.category} onChange={e=>update('category',e.target.value)}><option value="">전체</option><option>대학</option><option>전문대학</option></select></label>
      <label>학교<select disabled={optionsLoading} value={draft.school} onChange={e=>update('school',e.target.value)}><option value="">전체</option>{options?.schools.map(s=><option value={s.code} key={s.code}>{s.name} ({s.code})</option>)}</select></label>
      <label>학과<select disabled={!draft.school||optionsLoading} value={draft.department} onChange={e=>update('department',e.target.value)}><option value="">{draft.school?'전체':'학교를 먼저 선택하세요'}</option>{options?.departments.map(d=><option value={d.code} key={d.code}>{d.name} ({d.code})</option>)}</select></label>
      <label>이수구분<select disabled={optionsLoading} value={draft.division} onChange={e=>update('division',e.target.value)}><option value="">전체</option>{options?.divisions.map(d=><option key={d}>{d}</option>)}</select></label>
      {mode==='compare'&&<label>변화 유형<select value={draft.status??''} onChange={e=>update('status',e.target.value)}>{['','처음 관측','비교연도 미관측','변경','해설 변경','이수구분 변경','검토 필요','동일'].map(v=><option key={v} value={v}>{v||'변화 전체 (동일 제외)'}</option>)}</select></label>}
      <button className={styles.primary} disabled={!meta||loading} type="submit">{loading?'조회 중…':'검색 적용'}</button><p className={styles.hint}>쉼표로 나눈 검색어 중 하나라도 포함하면 검색합니다. 학교·학과 목록은 조건 변경 시 자동 갱신됩니다. 후보는 검색을 바꿔도 이 브라우저에 유지됩니다.</p>
    </form>
    {mode==='trend'&&trend&&<TrendPanel data={trend}/>}
    <details className={styles.coverage}><summary>저장한 후보 {chosen.length}건</summary><p>검색·연도가 달라도 유지됩니다. 학생 합계는 연도별로 분리합니다.</p>
      {[...new Set(chosen.map(r=>r.year))].sort().map(y=>{const summary=summarizeDepartments(chosen.filter(r=>r.year===y));return <p key={y}>{y}년 · {summary.departments}학과 · 연결 재학생 {number(summary.enrolled)} · 미연결 {summary.unlinked}학과</p>;})}
      {chosen.some(r=>selectionContext[r.id]?.version!==meta?.version)&&<p>이전 데이터 버전의 후보가 포함되어 있습니다. 현재 자료에서 다시 확인하세요.</p>}
      <button type="button" disabled={!chosen.length} onClick={download}>선택 후보 CSV 내려받기</button> <button type="button" onClick={()=>{setSelected({});setSelectionContext({});}}>후보 전체 비우기</button>
      {chosen.map(r=><p key={r.id}>{r.year} · {r.school} · {r.department} · {r.course} <button type="button" onClick={()=>setSelected(s=>{const n={...s};delete n[r.id];return n;})}>제거</button></p>)}
    </details>
    {optionsLoading&&<p role="status">학교·학과 선택 목록을 준비하고 있습니다…</p>}
    {error&&<p role="alert" className={styles.notice}>{error}</p>}{loading&&<p role="status">압축 자료를 검색하고 있습니다…</p>}
    {active&&<div className={styles.applied}>적용 조건: {mode==='compare'&&comparison?`${comparison.from} → ${comparison.to}년`:active.filters.year+'년'} · {active.filters.q||'모든 과목'} · {active.filters.description?'해설 포함':'과목명만'} · {active.filters.category||'대학·전문대학'} · 학교 {active.filters.school||'전체'} · 학과 {active.filters.department||'전체'} · {active.filters.division||'모든 이수구분'} · {mode==='compare'?(active.filters.status||'변화 전체'):''}<small>버전 {active.version.slice(0,16)} · 아래 결과는 위 적용 조건 기준입니다.</small></div>}
    {mode==='search'&&result&&<><div className={styles.kpis}>{[['관련 학교',number(result.schools)],['관련 학과',number(result.departments)],['교육과정 등록',number(result.total)+'건'],['연결 학과 재학생',number(result.enrolled)],['미연결 학과',number(result.unlinked)]].map(([title,value])=><div key={title}><span>{title}</span><strong>{value}</strong></div>)}</div>
      <details className={styles.coverage}><summary>목표 학교·학과 목록 ({number(groups.length)}학과)</summary>
        <label>학과 정렬 <select value={groupSort} onChange={e=>setGroupSort(e.target.value)}><option value="enrolled">재학생 많은 순</option><option value="total">관련 등록 많은 순</option><option value="school">학교명 순</option></select></label>
        <p>상위 30학과 표시 · 학생 규모는 영업 검토 참고이며 수강인원이 아닙니다.</p>
        {groups.slice(0,30).map(g=><p key={g.departmentKey}>{g.school} · {g.department} · 관련 {g.total}건 · 재학생 {number(g.enrolled)} <button type="button" onClick={()=>{const f={...result.filters,school:g.schoolCode,department:g.departmentCode,page:1};setDraft(f);void search(1,f);}}>교육과정 보기</button></p>)}
      </details>
      <div className={styles.results}>{result.rows.map(row=><article key={row.id}><label className={styles.course}><input type="checkbox" aria-label={`${row.school} ${row.course} 후보 선택`} checked={Boolean(selected[row.id])} onChange={e=>{if(e.target.checked)setSelectionContext(c=>({...c,[row.id]:{filters:result.filters,version:result.version}}));setSelected(s=>{const next={...s};if(e.target.checked)next[row.id]=row;else delete next[row.id];return next;});}}/><strong>{row.course}</strong></label><p>{row.school} · {row.department} · {row.campus} · {row.dayNight} · {row.departmentFeature}</p><div className={styles.badges}><span>{row.division}</span><span>{row.credits??'미기재'} 학점</span><span>학과 재학생 {number(row.enrolled)}{row.enrolled!==null?'명':''}</span><span>{row.linkStatus}</span></div><Evidence row={row}/></article>)}{!result.total&&<p>검색 결과가 없습니다. 검색어 또는 조건을 조정하세요.</p>}</div></>}
    {mode==='compare'&&comparison&&<><p className={styles.notice}>‘처음 관측’은 실제 신규 개설, ‘미관측’은 폐강을 뜻하지 않습니다. 연결이 불명확한 항목에는 관측 결과와 별도로 ‘연결 검토 필요’를 표시합니다. 복수 등록의 해설·이수구분 변경은 확정하지 않습니다. 과목명이 바뀐 항목은 자동 대응하지 않으며 처음 관측·미관측 목록에서 함께 검토해야 합니다.</p><div className={styles.kpis}>{Object.entries(comparison.counts).map(([key,value])=><div key={key}><span>{key}</span><strong>{number(value)}</strong></div>)}</div><div className={styles.results}>{comparison.rows.map((r,i)=><article key={i}><strong>{r.status} · {(r.after??r.before)?.course}</strong><p>{(r.after??r.before)?.school} · {(r.after??r.before)?.department}</p><p>{r.reviewReason&&<span>연결 검토 필요 · {r.reviewReason}</span>}</p><p>{r.before?.division??'관측 없음'} → {r.after?.division??'관측 없음'} {r.descriptionChanged?'· 해설 변경':''}</p><button type="button" disabled={loading} onClick={()=>void showComparison(r)}>이전·비교연도 해설과 원본 보기</button></article>)}</div></>}
    {evidence.length>0&&<section className={styles.evidence}><h3>연도별 원본 대조</h3>{evidence.map(r=><article key={r.id}><h4>{r.year}년 · {r.course}</h4><p className={styles.description}>{r.description||'교과목해설 미기재'}</p><Evidence row={r}/></article>)}</section>}
    {active&&<div className={styles.pagination}><button type="button" disabled={loading||active.filters.page<=1} onClick={()=>void search(active.filters.page-1,active.filters)}>이전</button><span>{active.filters.page} / {Math.max(1,Math.ceil(active.total/30))}쪽 · {number(active.total)}건</span><button type="button" disabled={loading||active.filters.page*30>=active.total} onClick={()=>void search(active.filters.page+1,active.filters)}>다음</button></div>}
  </section>;
}
