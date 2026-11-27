const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function toDateStr(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getDayInfo(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dayIndex = dt.getDay();
  return {
    dateStr,
    dayName: DAY_NAMES[dayIndex],
    isSunday: dayIndex === 0,
    isWeekend: dayIndex === 0 || dayIndex === 6,
  };
}

export function isProcessOperating(rule, dateStr, holidaySet) {
  const { isSunday } = getDayInfo(dateStr);
  const isHoliday = holidaySet.has(dateStr);

  if (rule.operating_mode === '365_DAYS') return true;
  if (rule.operating_mode === 'NO_HOLIDAYS') return !isHoliday;
  if (rule.operating_mode === 'NO_SUNDAYS_OR_HOLIDAYS') return !isSunday && !isHoliday;
  return true;
}

export function validateRoster({
  year,
  month,
  employees,
  brands,
  processes,
  rules,
  allocations,
  holidays,
  unavailability,
  rosterEntries,
}) {
  const conflicts = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const holidaySet = new Set(holidays.map((h) => h.holiday_date));

  const empMap = new Map(employees.map((e) => [e.id, e]));
  const brandMap = new Map(brands.map((b) => [b.id, b]));
  const procMap = new Map(processes.map((p) => [p.id, p]));

  const rosterMap = new Map();
  rosterEntries.forEach((entry) => {
    rosterMap.set(`${entry.employee_id}_${entry.roster_date}`, entry);
  });

  const unavailMap = new Map();
  unavailability
    .filter((u) => u.status === 'APPROVED')
    .forEach((u) => {
      unavailMap.set(`${u.employee_id}_${u.unavail_date}`, u);
    });

  const weeklyOffCounts = new Map();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = toDateStr(year, month, day);
    const { dayName, isWeekend } = getDayInfo(dateStr);
    const weekIdx = Math.floor((day - 1) / 7);

    employees.forEach((emp) => {
      const entry = rosterMap.get(`${emp.id}_${dateStr}`);
      const approvedLeave = unavailMap.get(`${emp.id}_${dateStr}`);

      if (!entry) return;

      if (entry.status === 'WEEKLY_OFF') {
        const key = `${emp.id}_w${weekIdx}`;
        weeklyOffCounts.set(key, (weeklyOffCounts.get(key) || 0) + 1);
      }

      if (entry.status === 'WORKING' && approvedLeave) {
        const empAllocs = allocations.filter((a) => a.employee_id === emp.id);
        const affectedBrands = [...new Set(empAllocs.map((a) => brandMap.get(a.brand_id)?.name).filter(Boolean))];

        conflicts.push({
          id: `unavail_${emp.id}_${dateStr}`,
          severity: 'HARD',
          type: 'UNAVAILABLE_SCHEDULED',
          date: dateStr,
          employeeId: emp.id,
          employeeName: `${emp.emp_code} - ${emp.name}`,
          brandName: affectedBrands.join(', ') || 'Unassigned',
          processName: 'All Assigned Processes',
          message: `${emp.name} (${emp.emp_code}) is marked WORKING on ${dateStr} despite approved ${approvedLeave.type.replace('_', ' ')}.`,
          suggestion: `Change status to ${approvedLeave.type} and assign a Pod backup.`,
          backupCandidates: [],
        });
      }

      if (entry.status === 'WORKING' && emp.preferred_off_day === dayName && !entry.is_manual_override) {
        conflicts.push({
          id: `pref_${emp.id}_${dateStr}`,
          severity: 'SOFT',
          type: 'PREFERENCE_VIOLATED',
          date: dateStr,
          employeeId: emp.id,
          employeeName: `${emp.emp_code} - ${emp.name}`,
          brandName: 'Client Coverage Priority',
          processName: '-',
          message: `${emp.name} scheduled on preferred weekly off (${dayName}, ${dateStr}) to maintain mandatory brand coverage.`,
          suggestion: 'Optional: Swap off day with a cross-trained Pod teammate.',
          backupCandidates: [],
        });
      }
    });

    rules.forEach((rule) => {
      const brand = brandMap.get(rule.brand_id);
      const proc = procMap.get(rule.process_id);
      if (!brand || !proc) return;

      if (!isProcessOperating(rule, dateStr, holidaySet)) return;

      const requiredStaff = isWeekend ? rule.min_staff_weekend : rule.min_staff_weekday;
      const assignedAllocs = allocations.filter(
        (a) => a.brand_id === rule.brand_id && a.process_id === rule.process_id
      );

      const workingEmployees = [];
      const absentEmployees = [];

      assignedAllocs.forEach((alloc) => {
        const emp = empMap.get(alloc.employee_id);
        if (!emp) return;
        const entry = rosterMap.get(`${emp.id}_${dateStr}`);
        if (entry && entry.status === 'WORKING') {
          workingEmployees.push(emp);
        } else {
          absentEmployees.push({ emp, reason: entry ? entry.status : 'UNSCHEDULED' });
        }
      });

      if (workingEmployees.length < requiredStaff) {
        const isSingleResource = assignedAllocs.length === 1;
        const absentSummary = absentEmployees
          .map((a) => `${a.emp.name} (${a.reason.replace('_', ' ')})`)
          .join(', ');

        const sameProcessEmpIds = new Set(
          allocations.filter((a) => a.process_id === rule.process_id).map((a) => a.employee_id)
        );
        const backupCandidates = employees
          .filter((candidate) => {
            if (assignedAllocs.some((a) => a.employee_id === candidate.id)) return false;
            if (unavailMap.has(`${candidate.id}_${dateStr}`)) return false;
            const candEntry = rosterMap.get(`${candidate.id}_${dateStr}`);
            const isFreeOrLight = !candEntry || candEntry.status === 'WEEKLY_OFF' || candEntry.status === 'HOLIDAY';
            return isFreeOrLight && (candidate.pod_id === brand.pod_id || sameProcessEmpIds.has(candidate.id));
          })
          .slice(0, 3);

        conflicts.push({
          id: `gap_${rule.brand_id}_${rule.process_id}_${dateStr}`,
          severity: 'HARD',
          type: workingEmployees.length === 0 ? 'COVERAGE_GAP' : 'INSUFFICIENT_STAFF',
          date: dateStr,
          brandId: brand.id,
          brandName: brand.name,
          processId: proc.id,
          processName: `${proc.code} (${proc.name})`,
          requiredStaff,
          availableStaff: workingEmployees.length,
          isSingleResource,
          message: `${brand.name} — ${proc.code} requires ${requiredStaff} staff on ${dateStr} (${dayName}), but only ${workingEmployees.length} available.${absentSummary ? ` Unavailable: ${absentSummary}.` : ''}`,
          suggestion:
            backupCandidates.length > 0
              ? `Available backups: ${backupCandidates.map((b) => `${b.emp_code} ${b.name}`).join(', ')}`
              : 'No free backup in Pod — consider overriding a weekly off or assigning cross-pod support.',
          backupCandidates,
        });
      }
    });
  }

  const fullWeeks = Math.floor(daysInMonth / 7);
  employees.forEach((emp) => {
    for (let w = 0; w < fullWeeks; w++) {
      const offs = weeklyOffCounts.get(`${emp.id}_w${w}`) || 0;
      if (offs < emp.weekly_off_quota) {
        conflicts.push({
          id: `wo_quota_${emp.id}_w${w}`,
          severity: 'SOFT',
          type: 'WEEKLY_OFF_SHORTFALL',
          date: `Week ${w + 1} (Days ${w * 7 + 1}-${(w + 1) * 7})`,
          employeeId: emp.id,
          employeeName: `${emp.emp_code} - ${emp.name}`,
          brandName: 'All Assigned Brands',
          processName: '-',
          message: `${emp.name} received ${offs}/${emp.weekly_off_quota} weekly offs in Week ${w + 1} due to mandatory client coverage.`,
          suggestion: 'Grant a Comp-Off day in the following week.',
          backupCandidates: [],
        });
      }
    }
  });

  return conflicts;
}