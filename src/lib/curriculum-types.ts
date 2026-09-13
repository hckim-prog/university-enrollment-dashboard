export type CurriculumRow = {
  id: string; year: number; round: string; schoolCode: string; school: string;
  campus: string; universityCategory: string; departmentCode: string; department: string;
  dayNight: string; departmentFeature: string; departmentStatus: string; departmentKey: string;
  course: string; division: string; credits: string | null; description: string; descriptionHash: string;
  enrolled: number | null; linkStatus: string; sourceFile: string; sourceSheet: string;
  sourceRow: number; sourceVersion: string;
  studentSource: { file: string; sheet: string; row: number; version: string } | null;
};
export type CurriculumSource = {
  file: string; sha256: string; sheet: string;
  ranges: { year: number; category: string; round: string; rows: number }[];
  departments: number; linkedDepartments: number; unlinkedDepartments: number;
  exactDuplicateRegistrations: number;
};
export type CurriculumManifest = {
  version: string; enrollmentVersion: string; generatedAt: string; years: number[];
  studentYears: number[]; warnings: string[]; joinRule: string; sources: CurriculumSource[];
};
export type CurriculumFilters = {
  year: number; q: string; description: boolean; category: string; school: string;
  department: string; division: string; page: number; status?: string; sort?: string;
};
export type CurriculumResult = {
  groups: {departmentKey:string;schoolCode:string;school:string;departmentCode:string;department:string;total:number;enrolled:number|null}[];
  filters: CurriculumFilters; version: string; rows: CurriculumRow[]; total: number;
  schools: number; departments: number; enrolled: number | null; unlinked: number;
  options: { schools: { code: string; name: string }[]; departments: { code: string; name: string }[]; divisions: string[] };
};
export type ComparisonReference = Pick<CurriculumRow, 'id'|'year'|'school'|'department'|'departmentKey'|'course'|'division'|'descriptionHash'>;
export type ComparisonRow = {
  status: string; before: ComparisonReference | null;
  after: ComparisonReference | null; descriptionChanged: boolean; divisionChanged: boolean; reviewReason?: string;
};
export type TrendPoint = { year:number; total:number; schools:number; departments:number; enrolled:number|null; unlinked:number; coverage:number };
export type TrendResult = { filters:CurriculumFilters; version:string; years:number[]; commonSchools:number; all:TrendPoint[]; common:TrendPoint[] };
export type ComparisonResult = {
  from: number; to: number; filters: CurriculumFilters; version: string;
  total: number; counts: Record<string, number>; rows: ComparisonRow[];
};
