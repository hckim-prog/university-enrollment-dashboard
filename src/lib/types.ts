export type EnrollmentRecord = {
  year: number;
  schoolType: string;
  establishment: string;
  region: string;
  schoolStatus: string;
  school: string;
  college: string;
  department: string;
  dayNight: string;
  departmentFeature: string;
  departmentStatus: string;
  field: string;
  capacity: number;
  enrolled: number;
  leave: number;
  deferment: number;
  total: number;
  sourceRow: number;
};

export type ValidationIssue = {
  year: number;
  sourceRow: number;
  type: "duplicate" | "negative" | "subtotal" | "enrollment_equation" | "missing_dimension";
  message: string;
};

export type YearValidation = {
  year: number;
  sourceFile: string;
  sha256: string;
  sourceRows: number;
  normalizedRows: number;
  sourceColumnCount: number;
  expectedColumnCount: number;
  nonStandardDimensionRef: string;
  restoredMergedCells: Record<string, number>;
  duplicateRows: number;
  negativeValues: number;
  subtotalErrors: number;
  enrollmentEquationErrors: number;
  missingDimensions: number;
};

export type ValidationReport = {
  generatedAt: string;
  valid: boolean;
  totalRows: number;
  issueCount: number;
  issueSample: ValidationIssue[];
  years: YearValidation[];
};

export type FilterState = {
  years: number[];
  regions: string[];
  schools: string[];
  establishments: string[];
  fields: string[];
  departmentStatuses: string[];
  departmentQuery: string;
};

export type MetricKey = "enrolled" | "total" | "leave";

export type AnnualPoint = {
  year: number;
  enrolled: number;
  total: number;
  leave: number;
  deferment: number;
};

export type RankedPoint = {
  name: string;
  enrolled: number;
  total: number;
  leave: number;
  change: number | null;
  changeRate: number | null;
};
