import { NextRequest, NextResponse } from 'next/server';
import { curriculumManifest, parseCurriculumFilters, searchCurriculum, compareCurriculum, curriculumOptions, trendCurriculum } from '@/lib/curriculum-data';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:NextRequest) {
  try {
    const manifest=await curriculumManifest(); const p=request.nextUrl.searchParams;
    if(p.get('mode')==='meta') return NextResponse.json(manifest);
    const filters=parseCurriculumFilters(p,manifest.years);
    if(p.get('mode')==='options') {
      const years=p.get('years')?.split(',').map(Number)??[filters.year];
      if(!years.length||years.some(y=>!manifest.years.includes(y)))throw new Error('확보된 연도를 선택하세요.');
      return NextResponse.json(await curriculumOptions(filters,[...new Set(years)],manifest.version));
    }
    if(p.get('mode')==='trend')return NextResponse.json(await trendCurriculum(filters,manifest.years,manifest.version));
    if(p.get('mode')==='compare') {
      const from=Number(p.get('from') ?? (manifest.years.includes(2025)?2025:manifest.years.at(-2)));
      const to=Number(p.get('to') ?? (manifest.years.includes(2026)?2026:manifest.years.at(-1)));
      if(!manifest.years.includes(from)||!manifest.years.includes(to)||from>=to) return NextResponse.json({error:'확보된 연도에서 이전연도 < 비교연도로 선택하세요.'},{status:400});
      return NextResponse.json(await compareCurriculum(filters,from,to,manifest.version));
    }
    return NextResponse.json(await searchCurriculum(filters,manifest.version));
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'자료 조회 실패'},{status:400}); }
}
