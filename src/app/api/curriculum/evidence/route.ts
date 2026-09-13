import { NextRequest, NextResponse } from 'next/server';
import { curriculumManifest, curriculumRows } from '@/lib/curriculum-data';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest) {
  try {
    const body=await request.json();const manifest=await curriculumManifest();
    if(body.version!==manifest.version) return NextResponse.json({error:'데이터 버전이 변경되었습니다. 다시 검색하세요.'},{status:409});
    if(!Array.isArray(body.items)||body.items.length>10) throw new Error('원본 확인은 한 번에 10개 이하입니다.');
    const items=body.items as {year:number;id:string}[];
    if(items.some(i=>!manifest.years.includes(i.year)||typeof i.id!=='string')) throw new Error('잘못된 원본 요청');
    const result=[];
    for(const year of new Set(items.map(i=>i.year))) {
      const ids=new Set(items.filter(i=>i.year===year).map(i=>i.id));
      for await(const row of curriculumRows(year)) {if(ids.delete(row.id))result.push(row);if(!ids.size)break;}
    }
    return NextResponse.json(result);
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'원본 조회 실패'},{status:400});}
}
