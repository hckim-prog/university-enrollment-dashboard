"use client";
import { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { TrendResult } from '@/lib/curriculum-types';
import { csvCell } from '@/lib/curriculum';
import styles from './curriculum-explorer.module.css';
const metrics={total:'교육과정 등록 건수',schools:'관련 학교 수',departments:'관련 학과 수',enrolled:'연결 학과 재학생'};
const n=(v:number|null)=>v===null?'자료 없음':v.toLocaleString('ko-KR');
export function TrendPanel({data}:{data:TrendResult}) {
  const [cohort,setCohort]=useState<'all'|'common'>('common');
  const [metric,setMetric]=useState<keyof typeof metrics>('schools');
  const rows=data[cohort];const first=rows[0][metric],last=rows.at(-1)![metric];
  const change=first===null||last===null?null:last-first;
  function download(){
    const records=[['연도','학교 범위','확보 학교','관련 학교','관련 학과','교육과정 등록','연결 학과 재학생','미연결 학과','검색 조건','버전'],...rows.map(r=>[r.year,cohort,r.coverage,r.schools,r.departments,r.total,r.enrolled,r.unlinked,JSON.stringify(data.filters),data.version])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+records.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='과목별_연도추세.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className={styles.coverage}>
    <h3>주제의 확산과 규모 변화</h3>
    <p>적용 조건: {data.years.join(' · ')}년 · {data.filters.q||'모든 과목'} · {data.filters.description?'해설 포함':'과목명만'} · {data.filters.category||'대학·전문대학'} · 학교 {data.filters.school||'전체'} · 학과 {data.filters.department||'전체'} · {data.filters.division||'모든 이수구분'}</p>
    <div className={styles.selection}><label>비교 학교 범위 <select value={cohort} onChange={e=>setCohort(e.target.value as 'all'|'common')}><option value="common">매년 공통 확보 학교 ({data.commonSchools}개)</option><option value="all">각 연도 전체 확보 학교</option></select></label><label>추세 지표 <select value={metric} onChange={e=>setMetric(e.target.value as keyof typeof metrics)}>{Object.entries(metrics).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button type="button" onClick={download}>추세 CSV 내려받기</button></label></div>
    <p><strong>{rows[0].year} → {rows.at(-1)!.year}년 {metrics[metric]}: {n(first)} → {n(last)}</strong> · {change===null?'증감 계산 불가':`${change>0?'+':''}${n(change)}`} {first!==null&&first>0&&change!==null?`(${(change/first*100).toFixed(1)}%)`:''}</p>
    <div className={styles.chart} role="img" aria-label={`${metrics[metric]} 연도별 추세. 아래 표에서 정확한 수치를 확인할 수 있습니다.`}><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{left:20,right:20,top:20,bottom:10}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="year"/><YAxis width={85}/><Tooltip/><Line type="linear" dataKey={metric} name={metrics[metric]} stroke="#087e83" strokeWidth={3} connectNulls={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
    <div className={styles.tableScroll}><table><caption>연도별 근거 수치 · {cohort==='common'?'공통 확보 학교':'전체 확보 학교'}</caption><thead><tr>{['연도','확보 학교','관련 학교','관련 학과','교육과정 등록','연결 재학생','미연결 학과','학과 연결률'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.year}><th>{r.year}</th><td>{n(r.coverage)}</td><td>{n(r.schools)}</td><td>{n(r.departments)}</td><td>{n(r.total)}</td><td>{n(r.enrolled)}</td><td>{n(r.unlinked)}</td><td>{r.departments?((r.departments-r.unlinked)/r.departments*100).toFixed(1)+'%':'해당 없음'}</td></tr>)}</tbody></table></div>
    <p>공통 학교는 검색 주제와 무관하게 모든 선택 연도에 교육과정 자료가 있는 학교입니다. 학교 범위를 고정해도 학과 개편·자료 수록 범위·조사차수 차이는 남습니다. 학생 합계는 매년 학과별 한 번만 계산하며, 연도 간 합산하지 않습니다. 교육과정 등록 증가를 실제 강좌 증가나 판매 수요 증가로 해석하지 마세요.</p><small>데이터 버전 {data.version}</small>
  </section>;
}
