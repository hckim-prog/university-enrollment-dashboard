import { filterRecords } from "./analytics";
import {
  classifyDepartment,
  DEPARTMENT_GROUPS,
  normalizeDepartmentText,
} from "./department-groups";
import type { EnrollmentRecord, FilterState } from "./types";

export type TrendMetric = "enrolled" | "total";
export type ComparisonPeriod = "recent" | "since2023";
export type TrendType =
  | "persistent_up"
  | "recent_up"
  | "persistent_down"
  | "recent_down"
  | "rebound"
  | "turn_up"
  | "turn_down"
  | "stable"
  | "new_unavailable"
  | "closed_caution";

export type TrendCriteria = {
  minimumPrevious: number;
  minimumChange: number;
  minimumRate: number;
  metric: TrendMetric;
  period: ComparisonPeriod;
  includeClosed: boolean;
};

type Observation = {
  key: string;
  year: number;
  groupId: string;
  groupName: string;
  school: string;
  college: string;
  department: string;
  dayNight: string;
  departmentFeature: string;
  departmentStatus: string;
  region: string;
  establishment: string;
  field: string;
  enrolled: number;
  leave: number;
  deferment: number;
  total: number;
  sourceRow: number;
};

export type GroupTrend = {
  id: string;
  name: string;
  description: string;
  enrolled: number;
  total: number;
  leave: number;
  selectedValue: number;
  change: number | null;
  changeRate: number | null;
  changeFrom2023: number | null;
  changeRateFrom2023: number | null;
  schoolCount: number;
  schoolChange: number | null;
  observationCount: number;
  observationChange: number | null;
  averagePerObservation: number;
  increaseSchoolRate: number | null;
  riseContribution: number | null;
  fallContribution: number | null;
  disclosedNewCount: number;
  annual: Array<{
    year: number;
    value: number;
    schoolCount: number;
    observationCount: number;
  }>;
  components: {
    comparableIncrease: number;
    comparableDecrease: number;
    observedNew: number;
    observedExit: number;
    disclosedNew: number;
    disclosedClosed: number;
  };
  quadrant:
    | "확산 성장"
    | "기존 학과 집중 성장"
    | "공급 확산·규모 확인 필요"
    | "축소 관측"
    | "혼합·정체";
};

export type IndividualTrend = {
  key: string;
  groupId: string;
  groupName: string;
  school: string;
  college: string;
  department: string;
  region: string;
  establishment: string;
  field: string;
  dayNight: string;
  departmentFeature: string;
  departmentStatus: string;
  values: Record<number, number | null>;
  enrolled: number;
  leave: number;
  total: number;
  recentChange: number | null;
  recentRate: number | null;
  changeFrom2023: number | null;
  rateFrom2023: number | null;
  displayChange: number | null;
  displayRate: number | null;
  trendType: TrendType;
  trendLabel: string;
  comparisonStatus:
    | "정확 비교"
    | "공시 신설"
    | "공시 폐과"
    | "비교상 신규 관측"
    | "비교상 이탈 관측"
    | "명칭 변경 가능성";
  possibleMatch: string | null;
};

export type LifecycleEventType =
  | "disclosed_new"
  | "disclosed_closed"
  | "restructured"
  | "observed_new"
  | "observed_exit";

export type LifecycleEvent = {
  type: LifecycleEventType;
  label: string;
  school: string;
  department: string;
  region: string;
  establishment: string;
  field: string;
  groupId: string;
  groupName: string;
  departmentStatus: string;
  studentValue: number;
};

export type DepartmentTrendResponse = {
  meta: {
    selectedYear: number;
    previousYear: number | null;
    years: number[];
    metricLabel: string;
    comparisonLabel: string;
    groups: Array<{ id: string; name: string }>;
    trendTypes: Array<{ id: TrendType; label: string; count: number }>;
    methodologyNote: string;
  };
  criteria: TrendCriteria;
  totals: {
    enrolled: number;
    total: number;
    leave: number;
    selectedValue: number;
    change: number | null;
  };
  coverage: {
    classifiedRows: number;
    totalRows: number;
    classifiedValue: number;
    totalValue: number;
    rowRate: number;
    valueRate: number;
    unclassifiedTop: Array<{
      department: string;
      observations: number;
      value: number;
    }>;
  };
  summaries: {
    topIncrease: GroupTrend | null;
    topDecrease: GroupTrend | null;
    topSchoolExpansion: GroupTrend | null;
    topDisclosedNew: GroupTrend | null;
  };
  groups: GroupTrend[];
  individuals: IndividualTrend[];
  individualPagination: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
  lifecycle: {
    counts: Record<LifecycleEventType, number>;
    events: LifecycleEvent[];
    breakdowns: Record<
      "region" | "establishment" | "field" | "group",
      Array<{
        name: string;
        disclosedNew: number;
        disclosedClosed: number;
        restructured: number;
        observedNew: number;
        observedExit: number;
        studentValue: number;
      }>
    >;
  };
  drilldown: {
    groupId: string | null;
    groupName: string | null;
    topIncreaseSchools: Array<{ name: string; change: number; value: number }>;
    topDecreaseSchools: Array<{ name: string; change: number; value: number }>;
    newSchools: string[];
    exitedSchools: string[];
    topDepartments: IndividualTrend[];
    comparableAverageChange: number | null;
  };
  validation: {
    groupTotalMatches: boolean;
    contributionMatches: boolean;
    futureYearExcluded: boolean;
    lifecycleOverlapCount: number;
    invalidRateCount: number;
    assignedRows: number;
    sourceRows: number;
  };
};

export const DEFAULT_TREND_CRITERIA: TrendCriteria = {
  minimumPrevious: 30,
  minimumChange: 20,
  minimumRate: 0.1,
  metric: "total",
  period: "recent",
  includeClosed: false,
};

const TREND_LABELS: Record<TrendType, string> = {
  persistent_up: "지속 상승",
  recent_up: "최근 급상승",
  persistent_down: "지속 하락",
  recent_down: "최근 급감",
  rebound: "반등",
  turn_up: "증가세 전환",
  turn_down: "감소세 전환",
  stable: "안정",
  new_unavailable: "신규·비교 불가",
  closed_caution: "폐과·비교 주의",
};

function observationKey(row: EnrollmentRecord) {
  return [
    row.school,
    row.college,
    normalizeDepartmentText(row.department),
    normalizeDepartmentText(row.dayNight),
    normalizeDepartmentText(row.departmentFeature),
  ].join("\u001f");
}

function possibleMatchKey(observation: Observation) {
  return [
    observation.school,
    observation.college,
    normalizeDepartmentText(observation.dayNight),
    normalizeDepartmentText(observation.departmentFeature),
  ].join("\u001f");
}

function metricValue(
  value: Pick<Observation, "enrolled" | "total">,
  metric: TrendMetric,
) {
  return value[metric];
}

function change(current: number, previous: number | null) {
  if (previous === null) return { value: null, rate: null };
  const value = current - previous;
  return {
    value,
    rate: previous === 0 ? null : value / previous,
  };
}

function aggregateObservations(
  observations: Observation[],
  metric: TrendMetric,
) {
  let enrolled = 0;
  let total = 0;
  let leave = 0;
  let selectedValue = 0;
  const schools = new Set<string>();
  for (const observation of observations) {
    enrolled += observation.enrolled;
    total += observation.total;
    leave += observation.leave;
    selectedValue += metricValue(observation, metric);
    schools.add(observation.school);
  }
  return {
    enrolled,
    total,
    leave,
    selectedValue,
    schoolCount: schools.size,
    observationCount: observations.length,
  };
}

function buildObservations(rows: EnrollmentRecord[]) {
  const index = new Map<string, Observation>();
  for (const row of rows) {
    const group = classifyDepartment(row.department);
    const key = observationKey(row);
    const indexKey = `${row.year}\u001e${key}`;
    const current = index.get(indexKey);
    if (current) {
      current.enrolled += row.enrolled;
      current.leave += row.leave;
      current.deferment += row.deferment;
      current.total += row.total;
      continue;
    }
    index.set(indexKey, {
      key,
      year: row.year,
      groupId: group.id,
      groupName: group.name,
      school: row.school,
      college: row.college,
      department: row.department,
      dayNight: row.dayNight,
      departmentFeature: row.departmentFeature,
      departmentStatus: row.departmentStatus,
      region: row.region,
      establishment: row.establishment,
      field: row.field,
      enrolled: row.enrolled,
      leave: row.leave,
      deferment: row.deferment,
      total: row.total,
      sourceRow: row.sourceRow,
    });
  }
  return [...index.values()];
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function possibleNameMatch(
  observation: Observation,
  candidates: Observation[] | undefined,
) {
  if (!candidates?.length) return null;
  const name = normalizeDepartmentText(observation.department);
  if (name.length < 4) return null;
  let best: { name: string; ratio: number } | null = null;
  for (const candidate of candidates) {
    const candidateName = normalizeDepartmentText(candidate.department);
    const ratio =
      levenshtein(name, candidateName) / Math.max(name.length, candidateName.length, 1);
    if (
      ratio <= 0.25 &&
      (!best || ratio < best.ratio) &&
      candidateName !== name
    ) {
      best = { name: candidate.department, ratio };
    }
  }
  return best?.name ?? null;
}

function classifyTrend(
  values: Record<number, number | null>,
  selectedYear: number,
  current: Observation | undefined,
  previous: Observation | undefined,
  criteria: TrendCriteria,
): TrendType {
  if (!current || current.departmentStatus.includes("폐")) return "closed_caution";
  if (!previous || current.departmentStatus.includes("신설")) return "new_unavailable";
  const currentValue = values[selectedYear] ?? 0;
  const previousValue = values[selectedYear - 1];
  if (previousValue === null || previousValue === 0) return "new_unavailable";
  const recentChange = currentValue - previousValue;
  const recentRate = recentChange / previousValue;
  const strongRecent =
    Math.abs(recentChange) >= criteria.minimumChange &&
    Math.abs(recentRate) >= criteria.minimumRate;
  const earlierValue = values[selectedYear - 2];
  const middleValue = values[selectedYear - 1];
  const latestValue = values[selectedYear];
  if (
    earlierValue !== undefined &&
    earlierValue !== null &&
    middleValue !== undefined &&
    middleValue !== null &&
    latestValue !== undefined &&
    latestValue !== null
  ) {
    const cumulative = latestValue - earlierValue;
    const cumulativeRate = earlierValue === 0 ? null : cumulative / earlierValue;
    const strongCumulative =
      Math.abs(cumulative) >= criteria.minimumChange &&
      cumulativeRate !== null &&
      Math.abs(cumulativeRate) >= criteria.minimumRate;
    if (earlierValue < middleValue && middleValue < latestValue && strongCumulative) {
      return "persistent_up";
    }
    if (earlierValue > middleValue && middleValue > latestValue && strongCumulative) {
      return "persistent_down";
    }
    if (earlierValue > middleValue && latestValue > middleValue && strongRecent) {
      return "rebound";
    }
    if (earlierValue < middleValue && latestValue < middleValue && strongRecent) {
      return "turn_down";
    }
    const firstChange = middleValue - earlierValue;
    const firstRate = earlierValue === 0 ? null : firstChange / earlierValue;
    const firstWasSmall =
      Math.abs(firstChange) < criteria.minimumChange ||
      firstRate === null ||
      Math.abs(firstRate) < criteria.minimumRate;
    if (firstWasSmall && recentChange > 0 && strongRecent) return "turn_up";
  }
  if (strongRecent && recentChange > 0) return "recent_up";
  if (strongRecent && recentChange < 0) return "recent_down";
  return "stable";
}

function quadrant(changeValue: number, rate: number | null, schoolChange: number) {
  if (changeValue > 0 && schoolChange > 0) return "확산 성장" as const;
  if (changeValue > 0 && schoolChange <= 0) {
    return "기존 학과 집중 성장" as const;
  }
  if (schoolChange > 0 && (rate ?? 0) <= 0) {
    return "공급 확산·규모 확인 필요" as const;
  }
  if (changeValue < 0 && schoolChange < 0) return "축소 관측" as const;
  return "혼합·정체" as const;
}

function lifecycleLabel(type: LifecycleEventType) {
  return {
    disclosed_new: "공시 신설",
    disclosed_closed: "공시 폐과",
    restructured: "변경·통합·분리",
    observed_new: "비교상 신규 관측",
    observed_exit: "비교상 이탈 관측",
  }[type];
}

export function createDepartmentTrends(
  records: EnrollmentRecord[],
  filters: FilterState,
  criteria: TrendCriteria = DEFAULT_TREND_CRITERIA,
  options: {
    groupId?: string;
    focusGroupId?: string;
    trendType?: TrendType;
    page?: number;
    pageSize?: number;
  } = {},
): DepartmentTrendResponse {
  const allYears = [...new Set(records.map((row) => row.year))].toSorted();
  const selectedYear = filters.years.length
    ? Math.max(...filters.years)
    : Math.max(...allYears);
  const previousYear = allYears.includes(selectedYear - 1) ? selectedYear - 1 : null;
  const relevantYears = allYears.filter((year) => year <= selectedYear);
  const contextRows = filterRecords(records, filters, false).filter(
    (row) => row.year <= selectedYear,
  );
  const observations = buildObservations(contextRows);
  const byYear = new Map<number, Observation[]>();
  const indexByYear = new Map<number, Map<string, Observation>>();
  for (const year of relevantYears) {
    const yearObservations = observations.filter((row) => row.year === year);
    byYear.set(year, yearObservations);
    indexByYear.set(
      year,
      new Map(yearObservations.map((row) => [row.key, row])),
    );
  }
  const current = byYear.get(selectedYear) ?? [];
  const previous = previousYear === null ? [] : (byYear.get(previousYear) ?? []);
  const baseline = byYear.get(2023) ?? [];
  const currentIndex = indexByYear.get(selectedYear) ?? new Map();
  const previousIndex =
    previousYear === null ? new Map<string, Observation>() : (indexByYear.get(previousYear) ?? new Map());

  const groupTrends: GroupTrend[] = [];
  for (const group of DEPARTMENT_GROUPS) {
    const currentGroup = current.filter((row) => row.groupId === group.id);
    const previousGroup = previous.filter((row) => row.groupId === group.id);
    const baselineGroup = baseline.filter((row) => row.groupId === group.id);
    const hasAny = relevantYears.some((year) =>
      (byYear.get(year) ?? []).some((row) => row.groupId === group.id),
    );
    if (!hasAny) continue;
    const now = aggregateObservations(currentGroup, criteria.metric);
    const prior = previousYear === null
      ? null
      : aggregateObservations(previousGroup, criteria.metric);
    const first = relevantYears.includes(2023)
      ? aggregateObservations(baselineGroup, criteria.metric)
      : null;
    const recent = change(now.selectedValue, prior?.selectedValue ?? null);
    const cumulative = change(now.selectedValue, first?.selectedValue ?? null);
    const currentSchools = new Map<string, number>();
    const previousSchools = new Map<string, number>();
    for (const row of currentGroup) {
      currentSchools.set(
        row.school,
        (currentSchools.get(row.school) ?? 0) + metricValue(row, criteria.metric),
      );
    }
    for (const row of previousGroup) {
      previousSchools.set(
        row.school,
        (previousSchools.get(row.school) ?? 0) + metricValue(row, criteria.metric),
      );
    }
    let comparableSchools = 0;
    let increasedSchools = 0;
    for (const [school, value] of currentSchools) {
      const priorValue = previousSchools.get(school);
      if (priorValue === undefined) continue;
      comparableSchools += 1;
      if (value > priorValue) increasedSchools += 1;
    }
    const components = {
      comparableIncrease: 0,
      comparableDecrease: 0,
      observedNew: 0,
      observedExit: 0,
      disclosedNew: 0,
      disclosedClosed: 0,
    };
    const keys = new Set([
      ...currentGroup.map((row) => row.key),
      ...previousGroup.map((row) => row.key),
    ]);
    for (const key of keys) {
      const currentObservation = currentIndex.get(key);
      const previousObservation = previousIndex.get(key);
      if (currentObservation?.groupId !== group.id && previousObservation?.groupId !== group.id) {
        continue;
      }
      if (currentObservation && previousObservation) {
        const difference =
          metricValue(currentObservation, criteria.metric) -
          metricValue(previousObservation, criteria.metric);
        if (difference >= 0) components.comparableIncrease += difference;
        else components.comparableDecrease += difference;
      } else if (currentObservation) {
        const value = metricValue(currentObservation, criteria.metric);
        if (currentObservation.departmentStatus.includes("신설")) {
          components.disclosedNew += value;
        } else {
          components.observedNew += value;
        }
      } else if (previousObservation) {
        const value = -metricValue(previousObservation, criteria.metric);
        if (previousObservation.departmentStatus.includes("폐")) {
          components.disclosedClosed += value;
        } else {
          components.observedExit += value;
        }
      }
    }
    const schoolChange = prior === null ? null : now.schoolCount - prior.schoolCount;
    groupTrends.push({
      id: group.id,
      name: group.name,
      description: group.description,
      enrolled: now.enrolled,
      total: now.total,
      leave: now.leave,
      selectedValue: now.selectedValue,
      change: recent.value,
      changeRate: recent.rate,
      changeFrom2023: cumulative.value,
      changeRateFrom2023: cumulative.rate,
      schoolCount: now.schoolCount,
      schoolChange,
      observationCount: now.observationCount,
      observationChange:
        prior === null ? null : now.observationCount - prior.observationCount,
      averagePerObservation:
        now.observationCount === 0 ? 0 : now.selectedValue / now.observationCount,
      increaseSchoolRate:
        comparableSchools === 0 ? null : increasedSchools / comparableSchools,
      riseContribution: null,
      fallContribution: null,
      disclosedNewCount: currentGroup.filter(
        (row) => row.departmentStatus.includes("신설") && !previousIndex.has(row.key),
      ).length,
      annual: relevantYears.map((year) => {
        const value = aggregateObservations(
          (byYear.get(year) ?? []).filter((row) => row.groupId === group.id),
          criteria.metric,
        );
        return {
          year,
          value: value.selectedValue,
          schoolCount: value.schoolCount,
          observationCount: value.observationCount,
        };
      }),
      components,
      quadrant: quadrant(recent.value ?? 0, recent.rate, schoolChange ?? 0),
    });
  }

  const positiveGroupChange = groupTrends.reduce(
    (sum, group) => sum + Math.max(group.change ?? 0, 0),
    0,
  );
  const negativeGroupChange = groupTrends.reduce(
    (sum, group) => sum + Math.abs(Math.min(group.change ?? 0, 0)),
    0,
  );
  for (const group of groupTrends) {
    group.riseContribution =
      (group.change ?? 0) > 0 && positiveGroupChange > 0
        ? (group.change ?? 0) / positiveGroupChange
        : null;
    group.fallContribution =
      (group.change ?? 0) < 0 && negativeGroupChange > 0
        ? Math.abs(group.change ?? 0) / negativeGroupChange
        : null;
  }
  groupTrends.sort((a, b) => b.selectedValue - a.selectedValue);

  const unmatchedPreviousByBase = new Map<string, Observation[]>();
  for (const observation of previous) {
    if (currentIndex.has(observation.key)) continue;
    const baseKey = possibleMatchKey(observation);
    const list = unmatchedPreviousByBase.get(baseKey);
    if (list) list.push(observation);
    else unmatchedPreviousByBase.set(baseKey, [observation]);
  }
  const individualKeys = new Set([...currentIndex.keys(), ...previousIndex.keys()]);
  const allIndividuals: IndividualTrend[] = [];
  for (const key of individualKeys) {
    const currentObservation = currentIndex.get(key);
    const previousObservation = previousIndex.get(key);
    const representative = currentObservation ?? previousObservation;
    if (!representative) continue;
    const values: Record<number, number | null> = {};
    for (const year of relevantYears) {
      const observation = indexByYear.get(year)?.get(key);
      values[year] = observation ? metricValue(observation, criteria.metric) : null;
    }
    const currentValue = values[selectedYear] ?? 0;
    const previousValue = previousYear === null ? null : (values[previousYear] ?? null);
    const baselineValue = values[2023] ?? null;
    const recent = change(currentValue, previousValue);
    const cumulative = change(currentValue, baselineValue);
    let comparisonStatus: IndividualTrend["comparisonStatus"] = "정확 비교";
    let possibleMatch: string | null = null;
    if (!currentObservation) {
      comparisonStatus = representative.departmentStatus.includes("폐")
        ? "공시 폐과"
        : "비교상 이탈 관측";
    } else if (!previousObservation) {
      comparisonStatus = currentObservation.departmentStatus.includes("신설")
        ? "공시 신설"
        : "비교상 신규 관측";
      possibleMatch = possibleNameMatch(
        currentObservation,
        unmatchedPreviousByBase.get(possibleMatchKey(currentObservation)),
      );
      if (possibleMatch && comparisonStatus === "비교상 신규 관측") {
        comparisonStatus = "명칭 변경 가능성";
      }
    } else if (currentObservation.departmentStatus.includes("신설")) {
      comparisonStatus = "공시 신설";
    } else if (currentObservation.departmentStatus.includes("폐")) {
      comparisonStatus = "공시 폐과";
    }
    const trendType = classifyTrend(
      values,
      selectedYear,
      currentObservation,
      previousObservation,
      criteria,
    );
    const display = criteria.period === "recent" ? recent : cumulative;
    allIndividuals.push({
      key,
      groupId: representative.groupId,
      groupName: representative.groupName,
      school: representative.school,
      college: representative.college,
      department: representative.department,
      region: representative.region,
      establishment: representative.establishment,
      field: representative.field,
      dayNight: representative.dayNight,
      departmentFeature: representative.departmentFeature,
      departmentStatus: representative.departmentStatus,
      values,
      enrolled: currentObservation?.enrolled ?? 0,
      leave: currentObservation?.leave ?? 0,
      total: currentObservation?.total ?? 0,
      recentChange: recent.value,
      recentRate: recent.rate,
      changeFrom2023: cumulative.value,
      rateFrom2023: cumulative.rate,
      displayChange: display.value,
      displayRate: display.rate,
      trendType,
      trendLabel: TREND_LABELS[trendType],
      comparisonStatus,
      possibleMatch,
    });
  }

  const trendCountSource = options.groupId
    ? allIndividuals.filter((row) => row.groupId === options.groupId)
    : allIndividuals;
  const trendCounts = new Map<TrendType, number>();
  for (const row of trendCountSource) {
    trendCounts.set(row.trendType, (trendCounts.get(row.trendType) ?? 0) + 1);
  }
  let filteredIndividuals = allIndividuals.filter((row) => {
    if (options.groupId && row.groupId !== options.groupId) return false;
    if (options.trendType && row.trendType !== options.trendType) return false;
    if (!criteria.includeClosed && row.trendType === "closed_caution") return false;
    if (
      row.trendType !== "new_unavailable" &&
      row.trendType !== "closed_caution"
    ) {
      const prior = previousYear === null ? null : row.values[previousYear];
      if ((prior ?? 0) < criteria.minimumPrevious) return false;
      if (Math.abs(row.displayChange ?? 0) < 10) return false;
    }
    return true;
  });
  filteredIndividuals = filteredIndividuals.toSorted(
    (a, b) =>
      Math.abs(b.displayChange ?? 0) - Math.abs(a.displayChange ?? 0) ||
      b.total - a.total,
  );
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 10), 50);
  const pages = Math.max(1, Math.ceil(filteredIndividuals.length / pageSize));
  const page = Math.min(Math.max(options.page ?? 1, 1), pages);
  const individuals = filteredIndividuals.slice((page - 1) * pageSize, page * pageSize);

  const lifecycleEvents: LifecycleEvent[] = [];
  const eventKeys = new Set<string>();
  const pushLifecycle = (
    type: LifecycleEventType,
    observation: Observation,
    value: number,
  ) => {
    const eventKey = `${type}\u001e${observation.key}`;
    if (eventKeys.has(eventKey)) return;
    eventKeys.add(eventKey);
    lifecycleEvents.push({
      type,
      label: lifecycleLabel(type),
      school: observation.school,
      department: observation.department,
      region: observation.region,
      establishment: observation.establishment,
      field: observation.field,
      groupId: observation.groupId,
      groupName: observation.groupName,
      departmentStatus: observation.departmentStatus,
      studentValue: value,
    });
  };
  for (const observation of current) {
    const value = metricValue(observation, criteria.metric);
    if (observation.departmentStatus.includes("신설")) {
      pushLifecycle("disclosed_new", observation, value);
    } else if (observation.departmentStatus.includes("폐")) {
      pushLifecycle("disclosed_closed", observation, value);
    } else if (/변경|통합|분리/.test(observation.departmentStatus)) {
      pushLifecycle("restructured", observation, value);
    } else if (!previousIndex.has(observation.key)) {
      pushLifecycle("observed_new", observation, value);
    }
  }
  for (const observation of previous) {
    if (currentIndex.has(observation.key)) continue;
    const value = metricValue(observation, criteria.metric);
    pushLifecycle("observed_exit", observation, value);
  }
  lifecycleEvents.sort((a, b) => b.studentValue - a.studentValue);
  const visibleLifecycleEvents = options.groupId
    ? lifecycleEvents.filter((event) => event.groupId === options.groupId)
    : lifecycleEvents;
  const lifecycleCounts = {
    disclosed_new: 0,
    disclosed_closed: 0,
    restructured: 0,
    observed_new: 0,
    observed_exit: 0,
  } satisfies Record<LifecycleEventType, number>;
  for (const event of visibleLifecycleEvents) lifecycleCounts[event.type] += 1;

  const buildBreakdown = (
    selector: (event: LifecycleEvent) => string,
  ) => {
    const result = new Map<
      string,
      {
        name: string;
        disclosedNew: number;
        disclosedClosed: number;
        restructured: number;
        observedNew: number;
        observedExit: number;
        studentValue: number;
      }
    >();
    for (const event of visibleLifecycleEvents) {
      const name = selector(event) || "미상";
      const row = result.get(name) ?? {
        name,
        disclosedNew: 0,
        disclosedClosed: 0,
        restructured: 0,
        observedNew: 0,
        observedExit: 0,
        studentValue: 0,
      };
      if (event.type === "disclosed_new") row.disclosedNew += 1;
      if (event.type === "disclosed_closed") row.disclosedClosed += 1;
      if (event.type === "restructured") row.restructured += 1;
      if (event.type === "observed_new") row.observedNew += 1;
      if (event.type === "observed_exit") row.observedExit += 1;
      row.studentValue += event.studentValue;
      result.set(name, row);
    }
    return [...result.values()]
      .toSorted(
        (a, b) =>
          b.disclosedNew +
            b.disclosedClosed +
            b.restructured +
            b.observedNew +
            b.observedExit -
          (a.disclosedNew +
            a.disclosedClosed +
            a.restructured +
            a.observedNew +
            a.observedExit),
      )
      .slice(0, 20);
  };

  const focusGroupId =
    options.focusGroupId ??
    options.groupId ??
    groupTrends.toSorted((a, b) => (b.change ?? 0) - (a.change ?? 0))[0]?.id ??
    null;
  const focusGroup = groupTrends.find((group) => group.id === focusGroupId) ?? null;
  const focusIndividuals = allIndividuals.filter(
    (row) => row.groupId === focusGroupId && row.recentChange !== null,
  );
  const currentGroupSchools = new Map<string, number>();
  const previousGroupSchools = new Map<string, number>();
  for (const row of current.filter((value) => value.groupId === focusGroupId)) {
    currentGroupSchools.set(
      row.school,
      (currentGroupSchools.get(row.school) ?? 0) + metricValue(row, criteria.metric),
    );
  }
  for (const row of previous.filter((value) => value.groupId === focusGroupId)) {
    previousGroupSchools.set(
      row.school,
      (previousGroupSchools.get(row.school) ?? 0) + metricValue(row, criteria.metric),
    );
  }
  const schoolChanges = [...new Set([
    ...currentGroupSchools.keys(),
    ...previousGroupSchools.keys(),
  ])].map((name) => ({
    name,
    value: currentGroupSchools.get(name) ?? 0,
    change:
      (currentGroupSchools.get(name) ?? 0) - (previousGroupSchools.get(name) ?? 0),
  }));
  const comparableFocus = focusIndividuals.filter(
    (row) => row.comparisonStatus === "정확 비교",
  );

  const currentTotals = aggregateObservations(current, criteria.metric);
  const previousTotals =
    previousYear === null ? null : aggregateObservations(previous, criteria.metric);
  const totalsChange = change(
    currentTotals.selectedValue,
    previousTotals?.selectedValue ?? null,
  );
  const classifiedCurrent = current.filter((row) => row.groupId !== "other");
  const unclassified = new Map<string, { observations: number; value: number }>();
  for (const row of current.filter((value) => value.groupId === "other")) {
    const item = unclassified.get(row.department) ?? { observations: 0, value: 0 };
    item.observations += 1;
    item.value += metricValue(row, criteria.metric);
    unclassified.set(row.department, item);
  }
  const classifiedValue = classifiedCurrent.reduce(
    (sum, row) => sum + metricValue(row, criteria.metric),
    0,
  );
  const groupTotal = groupTrends.reduce((sum, group) => sum + group.selectedValue, 0);
  const groupChangeTotal = groupTrends.reduce(
    (sum, group) => sum + (group.change ?? 0),
    0,
  );
  const invalidRateCount = allIndividuals.filter(
    (row) =>
      row.recentRate !== null &&
      previousYear !== null &&
      (row.values[previousYear] ?? 0) === 0,
  ).length;

  const topIncrease =
    groupTrends.toSorted((a, b) => (b.change ?? 0) - (a.change ?? 0))[0] ?? null;
  const topDecrease =
    groupTrends.toSorted((a, b) => (a.change ?? 0) - (b.change ?? 0))[0] ?? null;
  const topSchoolExpansion =
    groupTrends.toSorted(
      (a, b) => (b.schoolChange ?? -Infinity) - (a.schoolChange ?? -Infinity),
    )[0] ?? null;
  const topDisclosedNew =
    groupTrends.toSorted((a, b) => b.disclosedNewCount - a.disclosedNewCount)[0] ?? null;

  return {
    meta: {
      selectedYear,
      previousYear,
      years: relevantYears,
      metricLabel: criteria.metric === "total" ? "재적학생" : "재학생",
      comparisonLabel:
        criteria.period === "recent"
          ? `${previousYear ?? "비교 연도"}→${selectedYear}년`
          : `2023→${selectedYear}년`,
      groups: DEPARTMENT_GROUPS.map(({ id, name }) => ({ id, name })),
      trendTypes: (Object.entries(TREND_LABELS) as Array<[TrendType, string]>).map(
        ([id, label]) => ({ id, label, count: trendCounts.get(id) ?? 0 }),
      ),
      methodologyNote:
        "대학알리미 재적학생 자료에서 관측된 학생 규모 변화이며, 인과관계·취업 전망·미래 유망성을 뜻하지 않습니다.",
    },
    criteria,
    totals: {
      enrolled: currentTotals.enrolled,
      total: currentTotals.total,
      leave: currentTotals.leave,
      selectedValue: currentTotals.selectedValue,
      change: totalsChange.value,
    },
    coverage: {
      classifiedRows: classifiedCurrent.length,
      totalRows: current.length,
      classifiedValue,
      totalValue: currentTotals.selectedValue,
      rowRate: current.length === 0 ? 0 : classifiedCurrent.length / current.length,
      valueRate:
        currentTotals.selectedValue === 0
          ? 0
          : classifiedValue / currentTotals.selectedValue,
      unclassifiedTop: [...unclassified]
        .map(([department, value]) => ({ department, ...value }))
        .toSorted((a, b) => b.value - a.value)
        .slice(0, 20),
    },
    summaries: {
      topIncrease,
      topDecrease,
      topSchoolExpansion,
      topDisclosedNew,
    },
    groups: groupTrends,
    individuals,
    individualPagination: {
      page,
      pageSize,
      total: filteredIndividuals.length,
      pages,
    },
    lifecycle: {
      counts: lifecycleCounts,
      events: visibleLifecycleEvents.slice(0, 60),
      breakdowns: {
        region: buildBreakdown((event) => event.region),
        establishment: buildBreakdown((event) => event.establishment),
        field: buildBreakdown((event) => event.field),
        group: buildBreakdown((event) => event.groupName),
      },
    },
    drilldown: {
      groupId: focusGroup?.id ?? null,
      groupName: focusGroup?.name ?? null,
      topIncreaseSchools: schoolChanges
        .filter((row) => row.change > 0)
        .toSorted((a, b) => b.change - a.change)
        .slice(0, 8),
      topDecreaseSchools: schoolChanges
        .filter((row) => row.change < 0)
        .toSorted((a, b) => a.change - b.change)
        .slice(0, 8),
      newSchools: [...currentGroupSchools.keys()]
        .filter((school) => !previousGroupSchools.has(school))
        .slice(0, 12),
      exitedSchools: [...previousGroupSchools.keys()]
        .filter((school) => !currentGroupSchools.has(school))
        .slice(0, 12),
      topDepartments: focusIndividuals
        .toSorted(
          (a, b) => Math.abs(b.recentChange ?? 0) - Math.abs(a.recentChange ?? 0),
        )
        .slice(0, 10),
      comparableAverageChange:
        comparableFocus.length === 0
          ? null
          : comparableFocus.reduce((sum, row) => sum + (row.recentChange ?? 0), 0) /
            comparableFocus.length,
    },
    validation: {
      groupTotalMatches: groupTotal === currentTotals.selectedValue,
      contributionMatches:
        previousYear === null || groupChangeTotal === (totalsChange.value ?? 0),
      futureYearExcluded: observations.every((row) => row.year <= selectedYear),
      lifecycleOverlapCount: lifecycleEvents.length - eventKeys.size,
      invalidRateCount,
      assignedRows: contextRows.filter((row) => row.year === selectedYear).length,
      sourceRows: contextRows.filter((row) => row.year === selectedYear).length,
    },
  };
}
