import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createGunzip, gunzipSync } from 'node:zlib';
import path from 'node:path';
import type { CurriculumFilters, CurriculumManifest, CurriculumRow, CurriculumResult, ComparisonResult, ComparisonRow, TrendResult } from './curriculum-types';
import { matchesCourse, matchesDimensions, summarizeDepartments, courseIdentity, departmentIdentity, comparePair } from './curriculum';

const directory = path.join(process.cwd(), 'data/processed');
export async function curriculumManifest(): Promise<CurriculumManifest> {
  const [text,validationText,enrollment]=await Promise.all([readFile(path.join(directory, 'curriculum-manifest.json'), 'utf8'),readFile(path.join(directory,'curriculum-validation.json'),'utf8'),readFile(path.join(directory,'enrollment.json.gz'))]);
  const manifest=JSON.parse(text) as CurriculumManifest;
  const validation=JSON.parse(validationText) as {valid:boolean;version:string};
  if(!validation.valid||validation.version!==manifest.version) throw new Error('교육과정 검산 결과가 현재 데이터 버전과 다릅니다. 재검산하세요.');
  if(createHash('sha256').update(enrollment).digest('hex')!==manifest.enrollmentVersion) throw new Error('학생 자료가 갱신되었습니다. 교육과정 연결을 다시 변환·검산하세요.');
  return manifest;
}
export async function* curriculumRows(year: number): AsyncGenerator<CurriculumRow> {
  if (!Number.isInteger(year)) throw new Error('유효하지 않은 연도');
  const input = createReadStream(path.join(directory, `curriculum-${year}.jsonl.gz`));
  const unzip = createGunzip();
  input.on('error', error => unzip.destroy(error));
  input.pipe(unzip);
  const decoder=new TextDecoder('utf-8');let pending='';
  // JSONL is delimited only by ASCII LF; explanations may contain Unicode line separators.
  try {
    for await(const chunk of unzip) {
      pending+=decoder.decode(chunk,{stream:true});let end:number;
      while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(line)yield JSON.parse(line);}
    }
    pending+=decoder.decode();if(pending.trim())yield JSON.parse(pending);
  } finally { input.destroy(); unzip.destroy(); }
}
export function parseCurriculumFilters(p: URLSearchParams, years: number[]): CurriculumFilters {
  const year = p.has('year') ? Number(p.get('year')) : years.at(-1)!;
  if (!years.includes(year)) throw new Error(`교육과정 확보 연도: ${years.join(', ')}`);
  return { status:p.get('status')??'', sort:p.get('sort')??'', year, q: (p.get('q') ?? '').slice(0,300), description: p.get('description') === 'true', category: p.get('category') ?? '', school: p.get('school') ?? '', department: p.get('department') ?? '', division: p.get('division') ?? '', page: Math.max(1, Math.min(100000, Math.floor(Number(p.get('page')) || 1))) };
}
const cache = new Map<string, Promise<CurriculumResult>>();
export function searchCurriculum(f: CurriculumFilters, version: string) {
  const key = version + JSON.stringify(f);
  if (cache.has(key)) return cache.get(key)!;
  const result = (async () => {
    const departments = new Map<string, { departmentKey: string; enrolled: number | null }>();
    const groups=new Map<string,CurriculumResult['groups'][number]>();
    const schools = new Set<string>(); const optionsSchools = new Map<string,string>();
    const optionsDepartments = new Map<string,string>(); const divisions = new Set<string>();
    const rows: CurriculumRow[] = []; let total = 0;
    for await (const row of curriculumRows(f.year)) {
      if (!f.category || row.universityCategory === f.category) {
        optionsSchools.set(row.schoolCode, row.school);
        if (!f.school || row.schoolCode === f.school) {
          if(f.school) optionsDepartments.set(row.departmentCode,row.department);
          if (!f.department || row.departmentCode === f.department) divisions.add(row.division);
        }
      }
      if (!matchesDimensions(row,f) || !matchesCourse(row,f)) continue;
      departments.set(row.departmentKey,{departmentKey:row.departmentKey,enrolled:row.enrolled}); schools.add(row.schoolCode);
      const group=groups.get(row.departmentKey);
      if(group)group.total++;else groups.set(row.departmentKey,{departmentKey:row.departmentKey,schoolCode:row.schoolCode,school:row.school,departmentCode:row.departmentCode,department:row.department,total:1,enrolled:row.enrolled});
      if (total >= (f.page-1)*30 && rows.length < 30) rows.push(row);
      total++;
    }
    const options = { schools: [...optionsSchools].map(([code,name])=>({code,name})).sort((a,b)=>a.name.localeCompare(b.name,'ko')),
      departments: [...optionsDepartments].map(([code,name])=>({code,name})).sort((a,b)=>a.name.localeCompare(b.name,'ko')), divisions: [...divisions].sort() };
    return { filters:f,version,rows,total,schools:schools.size,...summarizeDepartments(departments.values()),options,groups:[...groups.values()] };
  })();
  cache.set(key,result); result.catch(()=>cache.delete(key));
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return result;
}
type CatalogRow=Pick<CurriculumRow,'schoolCode'|'school'|'departmentCode'|'department'|'universityCategory'|'division'>;
const catalogs=new Map<string,Promise<CatalogRow[]>>();
export async function curriculumOptions(f:CurriculumFilters,years:number[],version:string) {
  const key=version+years.join(',');
  if(!catalogs.has(key)) catalogs.set(key,(async()=>{
    try {
      const saved=JSON.parse(gunzipSync(await readFile(path.join(directory,'curriculum-catalog.json.gz'))).toString()) as {version:string;years:Record<number,CatalogRow[]>};
      if(saved.version===version&&years.every(y=>saved.years[y]))return years.flatMap(y=>saved.years[y]);
    }catch{/* Rebuild from normalized rows when the optional catalog is absent. */}
    const unique=new Map<string,CatalogRow>();
    for(const year of years) for await(const r of curriculumRows(year)) {
      const {schoolCode,school,departmentCode,department,universityCategory,division}=r;
      unique.set(JSON.stringify([universityCategory,schoolCode,departmentCode,division]),{schoolCode,school,departmentCode,department,universityCategory,division});
    }
    return [...unique.values()];
  })());
  const schools=new Map<string,string>(), departments=new Map<string,string>(), divisions=new Set<string>();
  try { for(const r of await catalogs.get(key)!) {
    if(f.category&&r.universityCategory!==f.category)continue;
    schools.set(r.schoolCode,r.school);
    if(f.school&&r.schoolCode!==f.school)continue;
    if(f.school)departments.set(r.departmentCode,r.department);
    if(f.department&&r.departmentCode!==f.department)continue;
    divisions.add(r.division);
  }} catch(e){catalogs.delete(key);throw e;}
  if(catalogs.size>5)catalogs.delete(catalogs.keys().next().value!);
  const list=(m:Map<string,string>)=>[...m].map(([code,name])=>({code,name})).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  return {schools:list(schools),departments:list(departments),divisions:[...divisions].sort()};
}
const trends=new Map<string,Promise<TrendResult>>();
export function trendCurriculum(f:CurriculumFilters,years:number[],version:string):Promise<TrendResult> {
  const key=version+JSON.stringify({...f,page:1})+years.join(',');
  if(trends.has(key))return trends.get(key)!;
  const task=(async()=>{
    const annual:Array<{year:number;coverage:Set<string>;schools:Map<string,{total:number;departments:Map<string,{departmentKey:string;enrolled:number|null}>}>}>=[];
    for(const year of years){
      const coverage=new Set<string>();
      const schools=new Map<string,{total:number;departments:Map<string,{departmentKey:string;enrolled:number|null}>}>();
      for await(const r of curriculumRows(year)){
        if(f.category&&r.universityCategory!==f.category || f.school&&r.schoolCode!==f.school)continue;
        const school=JSON.stringify([r.universityCategory,r.schoolCode]);coverage.add(school);
        if(!matchesDimensions(r,f)||!matchesCourse(r,f))continue;
        if(!schools.has(school))schools.set(school,{total:0,departments:new Map()});
        const v=schools.get(school)!;v.total++;v.departments.set(r.departmentKey,{departmentKey:r.departmentKey,enrolled:r.enrolled});
      }
      annual.push({year,coverage,schools});
    }
    const common=new Set([...annual[0].coverage].filter(s=>annual.every(a=>a.coverage.has(s))));
    function points(commonOnly:boolean){return annual.map(a=>{
      const selected=[...a.schools].filter(([s])=>!commonOnly||common.has(s));
      return {year:a.year,coverage:commonOnly?common.size:a.coverage.size,schools:selected.length,total:selected.reduce((n,[,v])=>n+v.total,0),...summarizeDepartments(selected.flatMap(([,v])=>[...v.departments.values()]))};
    });}
    return {filters:f,version,years,commonSchools:common.size,all:points(false),common:points(true)};
  })();
  trends.set(key,task);task.catch(()=>trends.delete(key));if(trends.size>6)trends.delete(trends.keys().next().value!);
  return task;
}
type Compact = NonNullable<ComparisonRow['before']> & { matches: boolean; count: number };
function compact(row: CurriculumRow, f: CurriculumFilters): Compact {
  const {id,year,school,department,departmentKey,course,division,descriptionHash}=row;
  return {id,year,school,department,departmentKey,course,division,descriptionHash,matches:matchesCourse(row,f) && (!f.division || row.division === f.division),count:1};
}
async function buildComparison(f: CurriculumFilters, from: number, to: number, version: string): Promise<ComparisonResult> {
  const previous = new Map<string,Compact>(); const next = new Map<string,Compact>();
  // Keep hashes and provenance, not large explanation text, while comparing full identities.
  for (const [year,map] of [[from,previous],[to,next]] as const) {
    for await (const row of curriculumRows(year)) {
      if (!matchesDimensions(row,f,false)) continue;
      const k=courseIdentity(row); const existing=map.get(k);
      if (existing) {existing.count++; existing.matches ||= compact(row,f).matches;}
      else map.set(k,compact(row,f));
    }
  }
  const oldDepts=new Set([...previous.values()].map(departmentIdentity));
  const newDepts=new Set([...next.values()].map(departmentIdentity));
  const removedDepts=new Set([...previous].filter(([k])=>!next.has(k)).map(([,r])=>departmentIdentity(r)));
  const addedDepts=new Set([...next].filter(([k])=>!previous.has(k)).map(([,r])=>departmentIdentity(r)));
  const counts:Record<string,number>={'처음 관측':0,'비교연도 미관측':0,'변경':0,'검토 대상':0,'동일':0,'해설 변경':0,'이수구분 변경':0,'연결 검토 필요':0};
  const rows:ComparisonRow[]=[];let total=0;
  for (const k of new Set([...previous.keys(),...next.keys()])) {
    const a=previous.get(k); const b=next.get(k);
    if (!a?.matches && !b?.matches) continue;
    const ambiguous=Boolean((a && a.count>1)||(b && b.count>1)||(a && !b && (!newDepts.has(departmentIdentity(a))||addedDepts.has(departmentIdentity(a))))||(b && !a && (!oldDepts.has(departmentIdentity(b))||removedDepts.has(departmentIdentity(b)))));
    const result=comparePair(a??null,b??null,Boolean(a&&b&&ambiguous));
    if(ambiguous || (a&&b&&a.department!==b.department)) result.reviewReason='학과·과목명 변경 가능성 또는 복수 등록: 원본 검토 필요';
    counts[result.status]++;
    if(result.reviewReason)counts['연결 검토 필요']++;
    if(result.status==='변경'){if(result.descriptionChanged) counts['해설 변경']++;if(result.divisionChanged) counts['이수구분 변경']++;}
    rows.push(result);
    total++;
  }
  return {from,to,filters:f,version,total,counts,rows};
}

const comparisons=new Map<string,Promise<ComparisonResult>>();
export async function compareCurriculum(f:CurriculumFilters,from:number,to:number,version:string):Promise<ComparisonResult>{
  const key=version+JSON.stringify({...f,page:1,status:'',sort:''})+from+':'+to;
  if(!comparisons.has(key)) {
    const task=buildComparison(f,from,to,version);comparisons.set(key,task);task.catch(()=>comparisons.delete(key));
    if(comparisons.size>2)comparisons.delete(comparisons.keys().next().value!);
  }
  const data=await comparisons.get(key)!;
  const rows=data.rows.filter(r=>f.status==='검토 필요'?Boolean(r.reviewReason):f.status==='해설 변경'?r.status==='변경'&&r.descriptionChanged:f.status==='이수구분 변경'?r.status==='변경'&&r.divisionChanged:f.status?r.status===f.status:r.status!=='동일');
  return {...data,filters:f,total:rows.length,rows:rows.slice((f.page-1)*30,f.page*30)};
}
