import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base=process.env.VERIFY_BASE_URL??'http://127.0.0.1:3100';
async function get(params:Record<string,string>){const r=await fetch(base+'/api/curriculum?'+new URLSearchParams(params));assert.equal(r.status,200);return r.json();}
async function main(){
 const trend=await get({mode:'trend',q:'인공지능'});
 assert.deepEqual(trend.all.map((r:{total:number})=>r.total),[2145,2390,2684,2992]);
 assert.deepEqual(trend.all.map((r:{enrolled:number})=>r.enrolled),[202611,212474,228667,247648]);
 assert(trend.common.every((r:{coverage:number;total:number},i:number)=>r.coverage===trend.commonSchools&&r.total<=trend.all[i].total));
 console.log('PASS annual reference counts and common cohort');
 const options=await get({mode:'options',years:'2025,2026',school:'0000063'});
 assert(options.schools.some((r:{code:string})=>r.code==='0000063'));assert(options.departments.length>0);
 const sample=await get({year:'2026',q:'인공지능',school:'0000063'});
 assert.equal(sample.total,18);assert.equal(sample.enrolled,2295);
 assert.equal(sample.groups.reduce((n:number,r:{total:number})=>n+r.total,0),sample.total);
 const alternatives=await get({year:'2026',q:'인공지능,AI',school:'0000063'});assert(alternatives.total>=sample.total);
 const comparison=await get({mode:'compare',from:'2025',to:'2026',q:'인공지능',status:'해설 변경'});
 assert(comparison.total>0);assert(comparison.rows.every((r:{status:string;descriptionChanged:boolean})=>r.status==='변경'&&r.descriptionChanged));
 const review=await get({mode:'compare',from:'2025',to:'2026',q:'인공지능',status:'검토 필요'});
 assert(review.total>0);assert(review.rows.every((r:{reviewReason:string})=>Boolean(r.reviewReason)));
 await writeFile('output/data-refresh/improvements-verification.json',JSON.stringify({valid:true,trend,sample:{total:sample.total,enrolled:sample.enrolled},comparison:comparison.counts,review:review.total},null,2));
 console.log('PASS dependent options, group totals, OR search, comparison filters');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
