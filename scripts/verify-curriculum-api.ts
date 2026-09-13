import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base=process.env.VERIFY_BASE_URL??'http://127.0.0.1:3100';
async function main(){
 const checks:object[]=[];
 async function get(url:string){const start=Date.now();const response=await fetch(base+url);assert.equal(response.status,200,url);const body=await response.json();checks.push({url,status:response.status,milliseconds:Date.now()-start});return body;}
 const all=await get('/api/curriculum?year=2026');assert.equal(all.total,576786);assert.equal(all.departments,16020);assert.equal(all.enrolled,1873028);assert.equal(all.unlinked,2196);assert.equal(all.rows.length,30);console.log('2026 전체 집계 일치');
 const sample=await get('/api/curriculum?year=2026&q=인공지능&school=0000063');assert.equal(sample.total,18);assert.equal(sample.departments,14);assert.equal(sample.enrolled,2295);
 const empty=await get('/api/curriculum?year=2026&q=ZZZ없는교육과정987654321');assert.equal(empty.total,0);assert.equal(empty.enrolled,null);console.log('표본·검색 결과 없음 통과');
 const junior=await get('/api/curriculum?year=2026&category=전문대학&school=0000579&q=반도체&description=true');assert.equal(junior.total,2);assert.equal(junior.enrolled,116);
 const dept=sample.rows[0].departmentCode;const filtered=await get('/api/curriculum?year=2026&school=0000063&department='+dept+'&division='+encodeURIComponent(sample.rows[0].division));assert(filtered.rows.every((r:{departmentCode:string;division:string})=>r.departmentCode===dept&&r.division===sample.rows[0].division));
 const invalid=await fetch(base+'/api/curriculum?year=2022');assert.equal(invalid.status,400);
 const wrong=await fetch(base+'/api/curriculum?mode=compare&from=2026&to=2025');assert.equal(wrong.status,400);
 for(const api of ['dashboard','market-analysis','department-trends'])await get('/api/'+api+'?startYear=2019&endYear=2026');
 const evidence=await fetch(base+'/api/curriculum/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:sample.version,items:[{year:2026,id:sample.rows[0].id}]})});assert.equal(evidence.status,200);assert.deepEqual((await evidence.json())[0],sample.rows[0]);
 await writeFile('output/data-refresh/api-verification.json',JSON.stringify({valid:true,checks},null,2));console.log('PASS: 필터·미연결 처리·잘못된 연도·원본 근거·기존 API');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
