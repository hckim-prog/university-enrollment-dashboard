import type { CurriculumRow, CurriculumFilters, ComparisonRow } from './curriculum-types';

export function matchesCourse(row: Pick<CurriculumRow, 'course' | 'description'>, filters: CurriculumFilters) {
  const terms = filters.q.split(/[,，]/).map(q=>q.trim().toLocaleLowerCase()).filter(Boolean);
  return !terms.length || terms.some(q=>row.course.toLocaleLowerCase().includes(q) ||
    (filters.description && row.description.toLocaleLowerCase().includes(q)));
}
export function matchesDimensions(row: CurriculumRow, f: CurriculumFilters, includeDivision = true) {
  return (!f.category || row.universityCategory === f.category) && (!f.school || row.schoolCode === f.school) &&
    (!f.department || row.departmentCode === f.department) && (!includeDivision || !f.division || row.division === f.division);
}
export function courseIdentity(row: Pick<CurriculumRow, 'departmentKey' | 'course'>) {
  return JSON.stringify([row.departmentKey.split('|').slice(1), row.course]);
}
export function departmentIdentity(row: Pick<CurriculumRow, 'departmentKey'>) {
  return row.departmentKey.split('|').slice(1).join('|');
}
export function summarizeDepartments(rows: Iterable<Pick<CurriculumRow, 'departmentKey' | 'enrolled'>>) {
  const departments = new Map<string, number | null>();
  for (const row of rows) departments.set(row.departmentKey, row.enrolled);
  const values = [...departments.values()].filter((n): n is number => n !== null);
  return { departments: departments.size, enrolled: values.length ? values.reduce((a, b) => a + b, 0) : null,
    unlinked: departments.size - values.length };
}
export function comparePair(before: ComparisonRow['before'], after: ComparisonRow['after'], ambiguous = false): ComparisonRow {
  const renamed = before && after && before.department !== after.department;
  const descriptionChanged = Boolean(before && after && before.descriptionHash !== after.descriptionHash);
  const divisionChanged = Boolean(before && after && before.division !== after.division);
  const status = ambiguous || renamed ? '검토 대상' : !before ? '처음 관측' : !after ? '비교연도 미관측' :
    descriptionChanged || divisionChanged ? '변경' : '동일';
  return { before, after, status, descriptionChanged, divisionChanged };
}
export function csvCell(value: unknown) {
  const text = String(value ?? '');
  // Neutralize spreadsheet formulas without introducing formula-based code formatting.
  return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
}
export function curriculumCsv(rows: CurriculumRow[], filters: CurriculumFilters, version: string) {
  const header = ['조사년도','차수','학교구분','학교코드(문자열)','학교명','본분교','학과코드(문자열)','학과명','주야','학과특성','과목명','교과목해설','학점','이수구분','학과 재학생(수강인원 아님)','연결상태','교육과정 원본','시트','행','원본 SHA256','학생 원본','학생 시트','학생 행','학생 SHA256','검색조건','데이터버전'];
  const lines = rows.map(r => [r.year,r.round,r.universityCategory,"'"+r.schoolCode,r.school,r.campus,"'"+r.departmentCode,r.department,r.dayNight,r.departmentFeature,r.course,r.description,r.credits,r.division,r.enrolled,r.linkStatus,r.sourceFile,r.sourceSheet,r.sourceRow,r.sourceVersion,r.studentSource?.file,r.studentSource?.sheet,r.studentSource?.row,r.studentSource?.version,JSON.stringify(filters),version]);
  return '\uFEFF' + [header,...lines].map(line => line.map(csvCell).join(',')).join('\r\n');
}
