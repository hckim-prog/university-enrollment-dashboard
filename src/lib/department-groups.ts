import rawRules from "../config/department-groups.json";

export type DepartmentGroupRule = {
  id: string;
  name: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  priority: number;
  manualIncludes: string[];
  manualExcludes: string[];
  description: string;
};

export type DepartmentGroup = Pick<
  DepartmentGroupRule,
  "id" | "name" | "description"
>;

export const OTHER_DEPARTMENT_GROUP: DepartmentGroup = {
  id: "other",
  name: "기타·미분류",
  description:
    "키워드만으로 근거 있게 분류하기 어려워 자동 분류하지 않은 학과",
};

export function normalizeDepartmentText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\r\n\t·ㆍ・･,./()[\]{}_'"-]+/g, "");
}

const rules = (rawRules as DepartmentGroupRule[])
  .toSorted((a, b) => b.priority - a.priority)
  .map((rule) => ({
    ...rule,
    normalizedIncludes: rule.includeKeywords.map(normalizeDepartmentText),
    normalizedExcludes: rule.excludeKeywords.map(normalizeDepartmentText),
    normalizedManualIncludes: new Set(
      rule.manualIncludes.map(normalizeDepartmentText),
    ),
    normalizedManualExcludes: new Set(
      rule.manualExcludes.map(normalizeDepartmentText),
    ),
  }));

export const DEPARTMENT_GROUPS: DepartmentGroup[] = [
  ...rules.map(({ id, name, description }) => ({ id, name, description })),
  OTHER_DEPARTMENT_GROUP,
];

export function classifyDepartment(department: string): DepartmentGroup {
  const normalized = normalizeDepartmentText(department);
  for (const rule of rules) {
    if (rule.normalizedManualExcludes.has(normalized)) continue;
    if (rule.normalizedManualIncludes.has(normalized)) return rule;
    if (
      rule.normalizedExcludes.some(
        (keyword) => keyword && normalized.includes(keyword),
      )
    ) {
      continue;
    }
    if (
      rule.normalizedIncludes.some(
        (keyword) => keyword && normalized.includes(keyword),
      )
    ) {
      return rule;
    }
  }
  return OTHER_DEPARTMENT_GROUP;
}

export function getDepartmentGroupRule(groupId: string) {
  return rules.find((rule) => rule.id === groupId) ?? null;
}
