import { filterRecords } from "./analytics";
import {
  analysisYears,
  indexedValue,
  resolveAnalysisWindow,
  type AnalysisWindow,
} from "./analysis-window";
import type { EnrollmentRecord, FilterState } from "./types";

export type MarketMetric = "total" | "enrolled";

export type MarketValue = {
  value: number;
  change: number | null;
  changeRate: number | null;
  startValue: number | null;
  changeFromStart: number | null;
  changeRateFromStart: number | null;
  cagr: number | null;
};

export type MarketSegment = MarketValue & {
  name: string;
  share: number;
  previousShare: number | null;
  shareChange: number | null;
  rank: number;
};

export type MarketAnalysisResponse = {
  meta: {
    selectedYear: number;
    endYear: number;
    previousYear: number | null;
    startYear: number;
    years: number[];
    metric: MarketMetric;
    metricLabel: string;
    capacityStartYear: number;
    schoolMinimumStartValue: number;
  };
  kpis: {
    marketSize: MarketValue;
    enrolled: MarketValue;
    leave: MarketValue;
    leaveRate: MarketValue;
    capacityRatio: MarketValue & { available: boolean };
    top10Share: MarketValue;
    hhi: MarketValue;
    schoolCount: MarketValue;
  };
  annual: Array<{
    year: number;
    value: number;
    enrolled: number;
    total: number;
    leave: number;
    deferment: number;
    capacity: number | null;
    leaveRate: number;
    capacityRatio: number | null;
    schoolCount: number;
    departmentCount: number;
    top10Share: number;
    hhi: number;
  }>;
  universityCategories: MarketSegment[];
  universityCategoryAnnual: Array<{
    name: string;
    annual: Array<{ year: number; value: number; index: number | null }>;
  }>;
  fields: MarketSegment[];
  fieldMiddles: MarketSegment[];
  fieldSmalls: MarketSegment[];
  regions: MarketSegment[];
  contribution: Array<{
    name: string;
    change: number;
    contributionRate: number | null;
    currentValue: number;
  }>;
  portfolio: Array<{
    name: string;
    parent: string;
    value: number;
    share: number;
    change: number | null;
    changeRate: number | null;
    signal: "성장" | "축소" | "정체" | "신규";
  }>;
  schoolMovers: {
    increases: MarketSegment[];
    decreases: MarketSegment[];
  };
  insights: Array<{
    id: string;
    tone: "positive" | "negative" | "neutral" | "caution";
    title: string;
    body: string;
    value: string;
  }>;
  notes: string[];
  validation: {
    fieldTotalMatches: boolean;
    universityCategoryTotalMatches: boolean;
    enrollmentEquationMatches: boolean;
    futureYearExcluded: boolean;
    currentRows: number;
  };
};

type Aggregate = {
  enrolled: number;
  leave: number;
  deferment: number;
  total: number;
  capacity: number;
  capacityRows: number;
};

const EMPTY: Aggregate = {
  enrolled: 0,
  leave: 0,
  deferment: 0,
  total: 0,
  capacity: 0,
  capacityRows: 0,
};

function aggregate(rows: EnrollmentRecord[]): Aggregate {
  const result = { ...EMPTY };
  for (const row of rows) {
    result.enrolled += row.enrolled;
    result.leave += row.leave;
    result.deferment += row.deferment;
    result.total += row.total;
    if (row.capacity !== null) {
      result.capacity += row.capacity;
      result.capacityRows += 1;
    }
  }
  return result;
}

function safeRate(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function change(current: number, previous: number | null) {
  if (previous === null) return { change: null, changeRate: null };
  return {
    change: current - previous,
    changeRate: safeRate(current - previous, previous),
  };
}

function marketValue(
  current: number,
  previous: number | null,
  start: number | null,
  yearSpan: number,
): MarketValue {
  const recent = change(current, previous);
  const longTerm = change(current, start);
  return {
    value: current,
    ...recent,
    startValue: start,
    changeFromStart: longTerm.change,
    changeRateFromStart: longTerm.changeRate,
    cagr:
      start !== null && start > 0 && yearSpan > 0
        ? (current / start) ** (1 / yearSpan) - 1
        : null,
  };
}

function groupRows(
  rows: EnrollmentRecord[],
  selector: (row: EnrollmentRecord) => string,
) {
  const groups = new Map<string, EnrollmentRecord[]>();
  for (const row of rows) {
    const name = selector(row) || "미분류";
    const group = groups.get(name);
    if (group) group.push(row);
    else groups.set(name, [row]);
  }
  return groups;
}

function segmentRows(
  currentRows: EnrollmentRecord[],
  previousRows: EnrollmentRecord[],
  startRows: EnrollmentRecord[],
  selector: (row: EnrollmentRecord) => string,
  metric: MarketMetric,
  yearSpan: number,
) {
  const current = groupRows(currentRows, selector);
  const previous = groupRows(previousRows, selector);
  const start = groupRows(startRows, selector);
  const currentTotal = aggregate(currentRows)[metric];
  const previousTotal = aggregate(previousRows)[metric];
  return [...current]
    .map(([name, rows]) => {
      const value = aggregate(rows)[metric];
      const previousValue = previous.has(name)
        ? aggregate(previous.get(name)!)[metric]
        : null;
      const startValue = start.has(name) ? aggregate(start.get(name)!)[metric] : null;
      const result = marketValue(value, previousValue, startValue, yearSpan);
      const share = safeRate(value, currentTotal) ?? 0;
      const previousShare =
        previousValue === null ? null : safeRate(previousValue, previousTotal);
      return {
        name,
        ...result,
        share,
        previousShare,
        shareChange: previousShare === null ? null : share - previousShare,
        rank: 0,
      };
    })
    .filter((row) => row.value > 0)
    .toSorted((left, right) => right.value - left.value)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function schoolKey(row: EnrollmentRecord) {
  return `${row.schoolCode}\u001f${row.campus}`;
}

function concentration(rows: EnrollmentRecord[], metric: MarketMetric) {
  const groups = groupRows(rows, schoolKey);
  const values = [...groups.values()]
    .map((group) => aggregate(group)[metric])
    .filter((value) => value > 0)
    .toSorted((left, right) => right - left);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return { top10Share: 0, hhi: 0 };
  return {
    top10Share: values.slice(0, 10).reduce((sum, value) => sum + value, 0) / total,
    hhi: values.reduce((sum, value) => sum + (value / total) ** 2, 0) * 10_000,
  };
}

function activeCounts(rows: EnrollmentRecord[]) {
  const active = rows.filter((row) => row.total > 0);
  return {
    schools: new Set(active.map(schoolKey)).size,
    departments: new Set(
      active.map((row) =>
        [
          row.schoolCode,
          row.campus,
          row.departmentCode,
          row.dayNight,
          row.departmentFeature,
        ].join("\u001f"),
      ),
    ).size,
  };
}

function formatPercent(value: number | null) {
  if (value === null) return "비교 불가";
  return Math.abs(value) < 0.0005 ? "보합" : `${(value * 100).toFixed(1)}%`;
}

function createInsights(
  response: Omit<MarketAnalysisResponse, "insights" | "notes" | "validation">,
) {
  const insights: MarketAnalysisResponse["insights"] = [];
  const market = response.kpis.marketSize;
  insights.push({
    id: "long-term-market",
    tone:
      (market.changeRateFromStart ?? 0) < 0
        ? "negative"
        : (market.changeRateFromStart ?? 0) > 0
          ? "positive"
          : "neutral",
    title: `${response.meta.startYear}년 이후 시장 규모`,
    body: `${response.meta.metricLabel} 기준 장기 변화와 연평균 변화율입니다.`,
    value: `${formatPercent(market.changeRateFromStart)} · CAGR ${formatPercent(market.cagr)}`,
  });

  const categoryGap = response.universityCategories.toSorted(
    (left, right) => (right.changeRate ?? -Infinity) - (left.changeRate ?? -Infinity),
  );
  if (categoryGap.length >= 2) {
    insights.push({
      id: "university-category-gap",
      tone: "caution",
      title: `${categoryGap[0].name}과 ${categoryGap.at(-1)!.name}의 흐름 차이`,
      body: "같은 전체 시장 안에서도 학교 유형별 감소·반등 속도가 다릅니다.",
      value: `${categoryGap[0].name} ${formatPercent(categoryGap[0].changeRate)} / ${categoryGap.at(-1)!.name} ${formatPercent(categoryGap.at(-1)!.changeRate)}`,
    });
  }

  const comparableFields = response.fieldMiddles.filter(
    (row) => row.startValue !== null && row.startValue >= 5_000,
  );
  const fastest = comparableFields.toSorted(
    (left, right) => (right.cagr ?? -Infinity) - (left.cagr ?? -Infinity),
  )[0];
  const weakest = comparableFields.toSorted(
    (left, right) => (left.cagr ?? Infinity) - (right.cagr ?? Infinity),
  )[0];
  if (fastest) {
    insights.push({
      id: "field-growth",
      tone: (fastest.cagr ?? 0) >= 0 ? "positive" : "neutral",
      title: `장기 상대 강세 중계열: ${fastest.name}`,
      body: "초기 규모 5천 명 이상 중계열 중 장기 연평균 변화율이 가장 높습니다.",
      value: `CAGR ${formatPercent(fastest.cagr)} · 점유율 ${formatPercent(fastest.share)}`,
    });
  }
  if (weakest && weakest.name !== fastest?.name) {
    insights.push({
      id: "field-decline",
      tone: "negative",
      title: `장기 축소 중계열: ${weakest.name}`,
      body: "규모만이 아니라 장기 속도와 현재 점유율을 함께 봐야 합니다.",
      value: `CAGR ${formatPercent(weakest.cagr)} · ${response.meta.startYear}년 대비 ${formatPercent(weakest.changeRateFromStart)}`,
    });
  }

  insights.push({
    id: "concentration",
    tone: response.kpis.hhi.value >= 1_000 ? "caution" : "neutral",
    title: "학교 시장 집중도",
    body: "HHI는 학교별 학생 점유율 제곱합이며, 낮을수록 시장이 여러 학교에 분산된 구조입니다.",
    value: `HHI ${response.kpis.hhi.value.toFixed(0)} · 상위 10개교 ${formatPercent(response.kpis.top10Share.value)}`,
  });

  return insights;
}

export function createMarketAnalysis(
  records: EnrollmentRecord[],
  filters: FilterState,
  metric: MarketMetric = "total",
  requestedWindow?: AnalysisWindow,
): MarketAnalysisResponse {
  const contextRows = filterRecords(records, filters, false);
  const allYears = [...new Set(records.map((row) => row.year))].sort();
  const window = requestedWindow ?? resolveAnalysisWindow(allYears, {
    endYear: filters.years.length ? Math.max(...filters.years) : undefined,
  });
  const selectedYear = window.endYear;
  const relevantYears = analysisYears(allYears, window);
  const startYear = window.startYear;
  const previousYear = allYears.includes(selectedYear - 1)
    ? selectedYear - 1
    : null;
  const currentRows = contextRows.filter((row) => row.year === selectedYear);
  const previousRows =
    previousYear === null
      ? []
      : contextRows.filter((row) => row.year === previousYear);
  const startRows = contextRows.filter((row) => row.year === startYear);
  const yearSpan = selectedYear - startYear;
  const current = aggregate(currentRows);
  const previous = previousYear === null ? null : aggregate(previousRows);
  const start = aggregate(startRows);

  const annual = relevantYears.map((year) => {
    const rows = contextRows.filter((row) => row.year === year);
    const values = aggregate(rows);
    const counts = activeCounts(rows);
    const marketConcentration = concentration(rows, metric);
    return {
      year,
      value: values[metric],
      enrolled: values.enrolled,
      total: values.total,
      leave: values.leave,
      deferment: values.deferment,
      capacity: values.capacityRows > 0 ? values.capacity : null,
      leaveRate: safeRate(values.leave, values.total) ?? 0,
      capacityRatio:
        values.capacityRows > 0
          ? safeRate(values.enrolled, values.capacity)
          : null,
      schoolCount: counts.schools,
      departmentCount: counts.departments,
      ...marketConcentration,
    };
  });
  const currentAnnual = annual.at(-1);
  const previousAnnual = annual.find((row) => row.year === previousYear) ?? null;
  const startAnnual = annual[0] ?? null;
  const metricValue = (values: Aggregate | null) => values?.[metric] ?? null;
  const kpis = {
    marketSize: marketValue(
      current[metric],
      metricValue(previous),
      start[metric],
      yearSpan,
    ),
    enrolled: marketValue(
      current.enrolled,
      previous?.enrolled ?? null,
      start.enrolled,
      yearSpan,
    ),
    leave: marketValue(
      current.leave,
      previous?.leave ?? null,
      start.leave,
      yearSpan,
    ),
    leaveRate: marketValue(
      safeRate(current.leave, current.total) ?? 0,
      previous ? safeRate(previous.leave, previous.total) : null,
      safeRate(start.leave, start.total),
      yearSpan,
    ),
    capacityRatio: {
      ...marketValue(
        current.capacityRows > 0
          ? (safeRate(current.enrolled, current.capacity) ?? 0)
          : 0,
        previous && previous.capacityRows > 0
          ? safeRate(previous.enrolled, previous.capacity)
          : null,
        null,
        yearSpan,
      ),
      available: current.capacityRows > 0,
    },
    top10Share: marketValue(
      currentAnnual?.top10Share ?? 0,
      previousAnnual?.top10Share ?? null,
      startAnnual?.top10Share ?? null,
      yearSpan,
    ),
    hhi: marketValue(
      currentAnnual?.hhi ?? 0,
      previousAnnual?.hhi ?? null,
      startAnnual?.hhi ?? null,
      yearSpan,
    ),
    schoolCount: marketValue(
      currentAnnual?.schoolCount ?? 0,
      previousAnnual?.schoolCount ?? null,
      startAnnual?.schoolCount ?? null,
      yearSpan,
    ),
  };

  const universityCategories = segmentRows(
    currentRows,
    previousRows,
    startRows,
    (row) => row.universityCategory,
    metric,
    yearSpan,
  );
  const universityCategoryAnnual = ["대학", "전문대학"]
    .map((name) => {
      const startRowsForCategory = startRows.filter(
        (row) => row.universityCategory === name,
      );
      const startValue = aggregate(startRowsForCategory)[metric];
      return {
        name,
        annual: relevantYears.map((year) => {
          const value = aggregate(
            contextRows.filter(
              (row) => row.year === year && row.universityCategory === name,
            ),
          )[metric];
          return { year, value, index: indexedValue(value, startValue) };
        }),
      };
    })
    .filter((series) => series.annual.some((point) => point.value > 0));
  const fields = segmentRows(
    currentRows,
    previousRows,
    startRows,
    (row) => row.field,
    metric,
    yearSpan,
  );
  const fieldMiddles = segmentRows(
    currentRows,
    previousRows,
    startRows,
    (row) => row.fieldMiddle,
    metric,
    yearSpan,
  );
  const fieldSmalls = segmentRows(
    currentRows,
    previousRows,
    startRows,
    (row) => row.fieldSmall,
    metric,
    yearSpan,
  );
  const regions = segmentRows(
    currentRows,
    previousRows,
    startRows,
    (row) => row.region,
    metric,
    yearSpan,
  );
  const schools = segmentRows(
    currentRows,
    previousRows,
    startRows,
    (row) => `${schoolKey(row)}\u001e${row.school}`,
    metric,
    yearSpan,
  ).map((row) => {
    const [key, school] = row.name.split("\u001e");
    const campus = key.split("\u001f")[1];
    return {
      ...row,
      name: campus && campus !== "본교" ? `${school} (${campus})` : school,
    };
  });
  const grossFieldChange = fields.reduce(
    (sum, row) => sum + Math.abs(row.change ?? 0),
    0,
  );
  const contribution = fields
    .filter((row) => row.change !== null)
    .map((row) => ({
      name: row.name,
      change: row.change ?? 0,
      contributionRate:
        grossFieldChange === 0
          ? null
          : Math.abs(row.change ?? 0) / grossFieldChange,
      currentValue: row.value,
    }))
    .toSorted((left, right) => Math.abs(right.change) - Math.abs(left.change));
  const middleParent = new Map<string, string>();
  for (const row of currentRows) {
    if (!middleParent.has(row.fieldMiddle)) middleParent.set(row.fieldMiddle, row.field);
  }
  const portfolio = fieldMiddles.slice(0, 28).map((row) => ({
    name: row.name,
    parent: middleParent.get(row.name) ?? "미분류",
    value: row.value,
    share: row.share,
    change: row.change,
    changeRate: row.changeRate,
    signal:
      row.previousShare === null
        ? ("신규" as const)
        : Math.abs(row.changeRate ?? 0) < 0.01
          ? ("정체" as const)
          : (row.changeRate ?? 0) > 0
            ? ("성장" as const)
            : ("축소" as const),
  }));

  const base = {
    meta: {
      selectedYear,
      endYear: selectedYear,
      previousYear,
      startYear,
      years: relevantYears,
      metric,
      metricLabel: metric === "total" ? "재적학생" : "재학생",
      capacityStartYear: 2023,
      schoolMinimumStartValue: 500,
    },
    kpis,
    annual,
    universityCategories,
    universityCategoryAnnual,
    fields,
    fieldMiddles,
    fieldSmalls,
    regions,
    contribution,
    portfolio,
    schoolMovers: {
      increases: schools
        .filter(
          (row) =>
            (row.startValue ?? 0) >= 500 && (row.changeFromStart ?? 0) > 0,
        )
        .toSorted(
          (left, right) =>
            (right.changeFromStart ?? 0) - (left.changeFromStart ?? 0),
        )
        .slice(0, 12)
        .map((row, index) => ({ ...row, rank: index + 1 })),
      decreases: schools
        .filter(
          (row) =>
            (row.startValue ?? 0) >= 500 && (row.changeFromStart ?? 0) < 0,
        )
        .toSorted(
          (left, right) =>
            (left.changeFromStart ?? 0) - (right.changeFromStart ?? 0),
        )
        .slice(0, 12)
        .map((row, index) => ({ ...row, rank: index + 1 })),
    },
  } satisfies Omit<MarketAnalysisResponse, "insights" | "notes" | "validation">;

  return {
    ...base,
    insights: createInsights(base),
    notes: [
      "2019~2022와 2023~2025는 원본 학과 행 구성 방식이 달라 행 수 자체는 장기 시장 지표로 비교하지 않습니다.",
      "학생정원은 2023년부터 제공됩니다. 재학생에는 정원외 학생이 포함되므로 정원 대비 재학생 비율은 공식 충원율과 다릅니다.",
      "2025년부터 광역계열이 관측되어 일부 계열 점유율 변화에는 분류 변경 효과가 포함될 수 있습니다.",
      "학생 수 변화는 수요·취업전망의 인과 증거가 아니라 대학알리미 공시에서 관측된 시장 규모 변화입니다.",
    ],
    validation: {
      fieldTotalMatches:
        fields.reduce((sum, row) => sum + row.value, 0) === current[metric],
      universityCategoryTotalMatches:
        universityCategories.reduce((sum, row) => sum + row.value, 0) ===
        current[metric],
      enrollmentEquationMatches: currentRows.every(
        (row) => row.total === row.enrolled + row.leave + row.deferment,
      ),
      futureYearExcluded: contextRows.every(
        (row) => row.year <= selectedYear || !relevantYears.includes(row.year),
      ),
      currentRows: currentRows.length,
    },
  };
}
