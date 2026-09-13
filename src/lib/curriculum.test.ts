import { describe, expect, it } from 'vitest';
import { comparePair, courseIdentity, curriculumCsv, matchesCourse, summarizeDepartments } from './curriculum';
import type { CurriculumRow, CurriculumFilters } from './curriculum-types';
const filters:CurriculumFilters={year:2026,q:'인공지능',description:false,category:'',school:'',department:'',division:'',page:1};
const row:CurriculumRow={id:'source:10',year:2026,round:'01',schoolCode:'0000001',school:'학교',campus:'본교',universityCategory:'대학',departmentCode:'0012345',department:'컴퓨터학과',dayNight:'주간',departmentFeature:'일반과정',departmentStatus:'기존',departmentKey:'2026|대학|0000001|본교|0012345|주간|일반과정',course:'인공지능',division:'미기재',credits:null,description:'기계학습',descriptionHash:'a',enrolled:100,linkStatus:'연결',sourceFile:'원본.xlsx',sourceSheet:'교육과정',sourceRow:10,sourceVersion:'abc',studentSource:null};
describe('curriculum market semantics',()=>{
  it('counts the same department only once across many subjects and keeps missing separate from zero',()=>{
    expect(summarizeDepartments([row,{...row,course:'다른 과목'},{...row,departmentKey:'unmatched',enrolled:null},{...row,departmentKey:'real-zero',enrolled:0}])).toEqual({departments:3,enrolled:100,unlinked:1});
    expect(summarizeDepartments([{...row,enrolled:null}]).enrolled).toBeNull();
    expect(summarizeDepartments([{...row,enrolled:0}]).enrolled).toBe(0);
  });
  it('searches descriptions only when requested',()=>{
    const r={...row,course:'데이터',description:'인공지능 실습'};
    expect(matchesCourse(r,filters)).toBe(false);expect(matchesCourse(r,{...filters,description:true})).toBe(true);
  });
  it('matches comma-separated alternatives without merging identities',()=>{
    expect(matchesCourse(row,{...filters,q:'데이터, 인공지능'})).toBe(true);
    expect(matchesCourse(row,{...filters,q:'데이터 인공지능'})).toBe(false);
    expect(matchesCourse({...row,course:'AI 실습'},{...filters,q:'인공지능, ai'})).toBe(true);
  });
  it('does not sum the same department across years as a single yearly value',()=>{
    const old={...row,departmentKey:row.departmentKey.replace('2026','2025'),enrolled:80};
    expect(summarizeDepartments([row,row,old]).enrolled).toBe(180);
    expect(summarizeDepartments([row,row]).enrolled).toBe(100);
  });
  it('keeps leading zero and campus/day/night identities distinct; only removes year',()=>{
    expect(courseIdentity(row)).toBe(courseIdentity({...row,departmentKey:row.departmentKey.replace('2026','2025')}));
    expect(courseIdentity(row)).not.toBe(courseIdentity({...row,departmentKey:row.departmentKey.replace('주간','야간')}));
    expect(courseIdentity(row)).not.toBe(courseIdentity({...row,course:'인공 지능'}));
    expect(courseIdentity(row)).toContain('0012345');
  });
  it('separates observed changes and ambiguous pairs',()=>{
    expect(comparePair(null,row).status).toBe('처음 관측');
    expect(comparePair(row,null).status).toBe('비교연도 미관측');
    expect(comparePair(row,{...row,descriptionHash:'b',division:'필수'})).toMatchObject({status:'변경',descriptionChanged:true,divisionChanged:true});
    expect(comparePair(row,{...row,department:'변경 학과'}).status).toBe('검토 대상');
    expect(comparePair(row,row,true).status).toBe('검토 대상');
  });
  it('exports evidence, blank missing student values and neutralizes formulas',()=>{
    const csv=curriculumCsv([{...row,course:'=1+2',enrolled:null,description:'인공지능,"실습"\n해설'}],filters,'version1');
    expect(csv.startsWith('\uFEFF')).toBe(true);expect(csv).toContain('"\'=1+2"');expect(csv).toContain("'0000001");
    expect(csv).toContain('"인공지능,""실습""\n해설"');expect(csv).toContain('"원본.xlsx"');expect(csv).toContain('version1');
  });
});
