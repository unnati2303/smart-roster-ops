import { getDayInfo, isProcessOperating, toDateStr, validateRoster } from './validator';

export function generateMonthlyRoster({
  year,
  month,
  employees,
  brands,
  processes,
  rules,
  allocations,
  holidays,
  unavailability,
  existingEntries = [],
}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const holidaySet = new Set(holidays.map((h) => h.holiday_date));

  const manualOverrideMap = new Map();
  existingEntries
    .filter((e) => e.is_manual_override)
    .forEach((e) => manualOverrideMap.set(`${e.employee_id}_${e.roster_date}`, e));

  const unavailMap = new Map();
  unavailability
    .filter((u) => u.status === 'APPROVED')
    .forEach((u) => unavailMap.set(`${u.employee_id}_${u.unavail_date}`, u));

  const generatedEntries = [];
  const offCountByEmpWeek = new Map();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = toDateStr(year, month, day);
    const { dayName, isWeekend } = getDayInfo(dateStr);
    const isHoliday = holidaySet.has(dateStr);
    const weekIdx = Math.floor((day - 1) / 7);

    const remainingNeed = new Map();
    rules.forEach((rule) => {
      if (isProcessOperating(rule, dateStr, holidaySet)) {
        const req = isWeekend ? rule.min_staff_weekend : rule.min_staff_weekday;
        remainingNeed.set(`${rule.brand_id}_${rule.process_id}`, req);
      }
    });

    const sortedEmployees = [...employees].sort((a, b) => {
      const aPrefs = a.preferred_off_day === dayName ? 1 : 0;
      const bPrefs = b.preferred_off_day === dayName ? 1 : 0;
      return aPrefs - bPrefs;
    });

    const undecidedEmployees = [];

    sortedEmployees.forEach((emp) => {
      const manual = manualOverrideMap.get(`${emp.id}_${dateStr}`);
      if (manual) {
        generatedEntries.push({ ...manual });
        if (manual.status === 'WORKING') deductCoverage(emp.id, allocations, remainingNeed);
        if (manual.status === 'WEEKLY_OFF') incrementOff(emp.id, weekIdx, offCountByEmpWeek);
        return;
      }

      const leave = unavailMap.get(`${emp.id}_${dateStr}`);
      if (leave) {
        const status = leave.type === 'COMP_OFF' ? 'COMP_OFF' : 'PLANNED_LEAVE';
        generatedEntries.push({
          roster_date: dateStr,
          employee_id: emp.id,
          status,
          is_manual_override: false,
          override_note: leave.notes || null,
        });
        return;
      }

      const empAllocs = allocations.filter((a) => a.employee_id === emp.id);
      const hasOperatingWorkToday = empAllocs.some((alloc) => {
        const rule = rules.find(
          (r) => r.brand_id === alloc.brand_id && r.process_id === alloc.process_id
        );
        return rule ? isProcessOperating(rule, dateStr, holidaySet) : false;
      });

      if (!hasOperatingWorkToday && empAllocs.length > 0) {
        const status = isHoliday ? 'HOLIDAY' : 'WEEKLY_OFF';
        generatedEntries.push({
          roster_date: dateStr,
          employee_id: emp.id,
          status,
          is_manual_override: false,
          override_note: null,
        });
        if (status === 'WEEKLY_OFF') incrementOff(emp.id, weekIdx, offCountByEmpWeek);
        return;
      }

      undecidedEmployees.push(emp);
    });

    undecidedEmployees.forEach((emp) => {
      const empAllocs = allocations.filter((a) => a.employee_id === emp.id);
      const offsTakenThisWeek = offCountByEmpWeek.get(`${emp.id}_w${weekIdx}`) || 0;
      const needsWeeklyOff = offsTakenThisWeek < emp.weekly_off_quota;
      const isPreferredOffDay = emp.preferred_off_day === dayName;
      const isLastDayOfWeek = day % 7 === 0 || day === daysInMonth;

      const isCriticalForCoverage = empAllocs.some((alloc) => {
        const key = `${alloc.brand_id}_${alloc.process_id}`;
        const needed = remainingNeed.get(key) || 0;
        if (needed <= 0) return false;

        const backupPoolCount = undecidedEmployees.filter(
          (other) =>
            other.id !== emp.id &&
            allocations.some(
              (oa) =>
                oa.employee_id === other.id &&
                oa.brand_id === alloc.brand_id &&
                oa.process_id === alloc.process_id
            )
        ).length;

        return backupPoolCount < needed;
      });

      let status = 'WORKING';
      if (needsWeeklyOff && !isCriticalForCoverage && (isPreferredOffDay || isLastDayOfWeek)) {
        status = 'WEEKLY_OFF';
        incrementOff(emp.id, weekIdx, offCountByEmpWeek);
      } else {
        deductCoverage(emp.id, allocations, remainingNeed);
      }

      generatedEntries.push({
        roster_date: dateStr,
        employee_id: emp.id,
        status,
        is_manual_override: false,
        override_note: null,
      });
    });
  }

  const conflicts = validateRoster({
    year,
    month,
    employees,
    brands,
    processes,
    rules,
    allocations,
    holidays,
    unavailability,
    rosterEntries: generatedEntries,
  });

  return { entries: generatedEntries, conflicts };
}

function deductCoverage(empId, allocations, remainingNeed) {
  allocations
    .filter((a) => a.employee_id === empId)
    .forEach((alloc) => {
      const key = `${alloc.brand_id}_${alloc.process_id}`;
      if (remainingNeed.has(key)) {
        remainingNeed.set(key, Math.max(0, remainingNeed.get(key) - 1));
      }
    });
}

function incrementOff(empId, weekIdx, offCountByEmpWeek) {
  const key = `${empId}_w${weekIdx}`;
  offCountByEmpWeek.set(key, (offCountByEmpWeek.get(key) || 0) + 1);
}