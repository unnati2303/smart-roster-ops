import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  Layers,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { generateMonthlyRoster } from './engine/generator';
import { getDayInfo, isProcessOperating, toDateStr, validateRoster } from './engine/validator';

const STATUS_META = {
  WORKING: { code: 'W', label: 'Working', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  WEEKLY_OFF: { code: 'WO', label: 'Weekly Off', bg: 'bg-slate-200 text-slate-700 border-slate-300' },
  HOLIDAY: { code: 'PH', label: 'Public Holiday', bg: 'bg-sky-100 text-sky-800 border-sky-300' },
  PLANNED_LEAVE: { code: 'L', label: 'Planned Leave', bg: 'bg-amber-100 text-amber-800 border-amber-300' },
  COMP_OFF: { code: 'CO', label: 'Comp-Off', bg: 'bg-purple-100 text-purple-800 border-purple-300' },
};

const STATUS_CYCLE = ['WORKING', 'WEEKLY_OFF', 'HOLIDAY', 'PLANNED_LEAVE', 'COMP_OFF'];

export default function App() {
  const [activeTab, setActiveTab] = useState('roster');
  const [rosterView, setRosterView] = useState('company');

  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(12);

  const [pods, setPods] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [brands, setBrands] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [rules, setRules] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [unavailability, setUnavailability] = useState([]);
  const [rosterEntries, setRosterEntries] = useState([]);

  const [selectedPodId, setSelectedPodId] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedProcessId, setSelectedProcessId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const [leaveForm, setLeaveForm] = useState({
    employee_id: '',
    unavail_date: '2026-12-12',
    type: 'PLANNED_LEAVE',
    notes: 'Sudden leave request',
  });

  const [newEmpForm, setNewEmpForm] = useState({
    emp_code: '',
    name: '',
    pod_id: '',
    role: 'Executive',
    preferred_off_day: 'Sunday',
  });

  const [newBrandForm, setNewBrandForm] = useState({
    name: '',
    pod_id: '',
    tier: 'Standard',
  });

  const [newAllocForm, setNewAllocForm] = useState({
    employee_id: '',
    brand_id: '',
    process_id: '',
  });

  const [newRuleForm, setNewRuleForm] = useState({
    brand_id: '',
    process_id: '',
    operating_mode: '365_DAYS',
    min_staff_weekday: 1,
    min_staff_weekend: 1,
  });

  const notify = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const loadAllData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const startDate = toDateStr(year, month, 1);
      const endDate = toDateStr(year, month, new Date(year, month, 0).getDate());

      const [
        podsRes,
        empRes,
        brandRes,
        procRes,
        rulesRes,
        allocRes,
        holRes,
        unavailRes,
        rosterRes,
      ] = await Promise.all([
        supabase.from('pods').select('*').order('name'),
        supabase.from('employees').select('*').eq('is_active', true).order('emp_code'),
        supabase.from('brands').select('*').order('name'),
        supabase.from('processes').select('*').order('code'),
        supabase.from('brand_process_rules').select('*'),
        supabase.from('allocations').select('*'),
        supabase.from('public_holidays').select('*').order('holiday_date'),
        supabase.from('employee_unavailability').select('*').order('unavail_date'),
        supabase
          .from('roster_entries')
          .select('*')
          .gte('roster_date', startDate)
          .lte('roster_date', endDate),
      ]);

      const firstError = [
        podsRes.error,
        empRes.error,
        brandRes.error,
        procRes.error,
        rulesRes.error,
        allocRes.error,
        holRes.error,
        unavailRes.error,
        rosterRes.error,
      ].find(Boolean);

      if (firstError) throw firstError;

      setPods(podsRes.data || []);
      setEmployees(empRes.data || []);
      setBrands(brandRes.data || []);
      setProcesses(procRes.data || []);
      setRules(rulesRes.data || []);
      setAllocations(allocRes.data || []);
      setHolidays(holRes.data || []);
      setUnavailability(unavailRes.data || []);
      setRosterEntries(rosterRes.data || []);

      if (podsRes.data?.length && !selectedPodId) setSelectedPodId(podsRes.data[0].id);
      if (brandRes.data?.length && !selectedBrandId) setSelectedBrandId(brandRes.data[0].id);
      if (procRes.data?.length && !selectedProcessId) setSelectedProcessId(procRes.data[0].id);
      if (empRes.data?.length && !selectedEmployeeId) setSelectedEmployeeId(empRes.data[0].id);
      if (empRes.data?.length && !leaveForm.employee_id) {
        setLeaveForm((f) => ({ ...f, employee_id: empRes.data[1]?.id || empRes.data[0].id }));
      }
    } catch (err) {
      setErrorMsg(
        `Database connection error: ${err.message}. Check your .env file (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [year, month]);

  const conflicts = useMemo(() => {
    if (!employees.length || !rosterEntries.length) return [];
    return validateRoster({
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
    });
  }, [year, month, employees, brands, processes, rules, allocations, holidays, unavailability, rosterEntries]);

  const hardConflicts = useMemo(() => conflicts.filter((c) => c.severity === 'HARD'), [conflicts]);
  const softConflicts = useMemo(() => conflicts.filter((c) => c.severity === 'SOFT'), [conflicts]);

  const daysArray = useMemo(() => {
    const count = new Date(year, month, 0).getDate();
    return Array.from({ length: count }, (_, idx) => {
      const day = idx + 1;
      const dateStr = toDateStr(year, month, day);
      return { day, ...getDayInfo(dateStr) };
    });
  }, [year, month]);

  const holidayMap = useMemo(() => new Map(holidays.map((h) => [h.holiday_date, h.name])), [holidays]);
  const rosterLookup = useMemo(() => {
    const m = new Map();
    rosterEntries.forEach((r) => m.set(`${r.employee_id}_${r.roster_date}`, r));
    return m;
  }, [rosterEntries]);

  const handleGenerateRoster = async (preserveOverrides = true) => {
    setGenerating(true);
    try {
      const { entries } = generateMonthlyRoster({
        year,
        month,
        employees,
        brands,
        processes,
        rules,
        allocations,
        holidays,
        unavailability,
        existingEntries: preserveOverrides ? rosterEntries : [],
      });

      const payload = entries.map(({ id, ...rest }) => rest);
      const { error } = await supabase
        .from('roster_entries')
        .upsert(payload, { onConflict: 'roster_date,employee_id' });

      if (error) throw error;

      await loadAllData();
      notify(`Roster generated for ${year}-${String(month).padStart(2, '0')} (${entries.length} shift records).`);
    } catch (err) {
      alert(`Failed to generate roster: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCellToggle = async (empId, dateStr) => {
    const current = rosterLookup.get(`${empId}_${dateStr}`);
    const currentStatus = current?.status || 'WORKING';
    const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(currentStatus) + 1) % STATUS_CYCLE.length];

    const updatedRecord = {
      roster_date: dateStr,
      employee_id: empId,
      status: nextStatus,
      is_manual_override: true,
      override_note: 'Manual manager edit',
    };

    const { error } = await supabase
      .from('roster_entries')
      .upsert([updatedRecord], { onConflict: 'roster_date,employee_id' });

    if (error) {
      alert(`Error updating cell: ${error.message}`);
      return;
    }

    setRosterEntries((prev) => {
      const filtered = prev.filter((r) => !(r.employee_id === empId && r.roster_date === dateStr));
      return [...filtered, updatedRecord];
    });
    notify(`Updated ${dateStr} to ${STATUS_META[nextStatus].label} (Re-validated live)`);
  };

  const handleAssignBackup = async (conflict, backupEmp) => {
    try {
      const alreadyAssigned = allocations.some(
        (a) =>
          a.employee_id === backupEmp.id &&
          a.brand_id === conflict.brandId &&
          a.process_id === conflict.processId
      );

      if (!alreadyAssigned) {
        const { error: allocErr } = await supabase.from('allocations').insert([
          {
            employee_id: backupEmp.id,
            brand_id: conflict.brandId,
            process_id: conflict.processId,
            allocation_type: 'BACKUP',
          },
        ]);
        if (allocErr) throw allocErr;
      }

      const { error: rosterErr } = await supabase.from('roster_entries').upsert(
        [
          {
            roster_date: conflict.date,
            employee_id: backupEmp.id,
            status: 'WORKING',
            is_manual_override: true,
            override_note: `Backup coverage for ${conflict.brandName}`,
          },
        ],
        { onConflict: 'roster_date,employee_id' }
      );
      if (rosterErr) throw rosterErr;

      await loadAllData();
      notify(`Assigned ${backupEmp.name} as backup for ${conflict.brandName} on ${conflict.date}!`);
    } catch (err) {
      alert(`Backup assignment failed: ${err.message}`);
    }
  };

  const handleSimulateLeave = async (e) => {
    e.preventDefault();
    if (!leaveForm.employee_id || !leaveForm.unavail_date) return;

    try {
      const { error: unavailErr } = await supabase.from('employee_unavailability').upsert(
        [
          {
            employee_id: leaveForm.employee_id,
            unavail_date: leaveForm.unavail_date,
            type: leaveForm.type,
            status: 'APPROVED',
            notes: leaveForm.notes,
          },
        ],
        { onConflict: 'employee_id,unavail_date' }
      );
      if (unavailErr) throw unavailErr;

      const newStatus = leaveForm.type === 'COMP_OFF' ? 'COMP_OFF' : 'PLANNED_LEAVE';
      const { error: rosterErr } = await supabase.from('roster_entries').upsert(
        [
          {
            roster_date: leaveForm.unavail_date,
            employee_id: leaveForm.employee_id,
            status: newStatus,
            is_manual_override: true,
            override_note: leaveForm.notes,
          },
        ],
        { onConflict: 'roster_date,employee_id' }
      );
      if (rosterErr) throw rosterErr;

      await loadAllData();
      notify('Leave applied and roster re-validated! Check Conflicts tab for coverage impact.');
      setActiveTab('conflicts');
    } catch (err) {
      alert(`Failed to apply leave: ${err.message}`);
    }
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('employees').insert([
      {
        ...newEmpForm,
        pod_id: newEmpForm.pod_id || pods[0]?.id,
      },
    ]);
    if (error) return alert(error.message);
    setNewEmpForm({ emp_code: '', name: '', pod_id: '', role: 'Executive', preferred_off_day: 'Sunday' });
    await loadAllData();
    notify('Employee added successfully.');
  };

  const handleAddBrand = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('brands').insert([
      {
        ...newBrandForm,
        pod_id: newBrandForm.pod_id || pods[0]?.id,
      },
    ]);
    if (error) return alert(error.message);
    setNewBrandForm({ name: '', pod_id: '', tier: 'Standard' });
    await loadAllData();
    notify('Brand added successfully.');
  };

  const handleAddAllocation = async (e) => {
    e.preventDefault();
    if (!newAllocForm.employee_id || !newAllocForm.brand_id || !newAllocForm.process_id) return;
    const { error } = await supabase.from('allocations').insert([newAllocForm]);
    if (error) return alert(error.message);
    await loadAllData();
    notify('Resource allocation mapped.');
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    if (!newRuleForm.brand_id || !newRuleForm.process_id) return;
    const { error } = await supabase
      .from('brand_process_rules')
      .upsert([newRuleForm], { onConflict: 'brand_id,process_id' });
    if (error) return alert(error.message);
    await loadAllData();
    notify('Operating rule saved.');
  };

  const handleExportCSV = () => {
    if (!rosterEntries.length) return alert('Generate a roster first.');
    const headers = ['Emp Code', 'Name', 'Pod', 'Role', ...daysArray.map((d) => d.dateStr)];
    const rows = employees.map((emp) => {
      const podName = pods.find((p) => p.id === emp.pod_id)?.name || '';
      const statuses = daysArray.map((d) => {
        const entry = rosterLookup.get(`${emp.id}_${d.dateStr}`);
        return entry ? STATUS_META[entry.status]?.code : '-';
      });
      return [emp.emp_code, emp.name, podName, emp.role, ...statuses].join(',');
    });
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-roster-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
  };

  const visibleEmployees = useMemo(() => {
    if (rosterView === 'company') return employees;
    if (rosterView === 'pod') return employees.filter((e) => e.pod_id === selectedPodId);
    if (rosterView === 'brand') {
      const empIds = new Set(allocations.filter((a) => a.brand_id === selectedBrandId).map((a) => a.employee_id));
      return employees.filter((e) => empIds.has(e.id));
    }
    if (rosterView === 'process') {
      const empIds = new Set(allocations.filter((a) => a.process_id === selectedProcessId).map((a) => a.employee_id));
      return employees.filter((e) => empIds.has(e.id));
    }
    if (rosterView === 'employee') return employees.filter((e) => e.id === selectedEmployeeId);
    return employees;
  }, [rosterView, employees, allocations, selectedPodId, selectedBrandId, selectedProcessId, selectedEmployeeId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-700 font-medium">
        Loading Smart Roster Operations Platform...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-900 text-white px-6 py-4 shadow">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-7 h-7 text-emerald-400" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">SmartRoster Ops</h1>
              <p className="text-xs text-slate-400">Multi-Brand D2C Workforce & Coverage Engine</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2026, i, 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>

            <button
              onClick={() => handleGenerateRoster(true)}
              disabled={generating}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-1.5 rounded-lg text-sm cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {generating ? 'Generating...' : 'Generate Monthly Roster'}
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg text-sm cursor-pointer"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="max-w-7xl mx-auto mt-4 px-6">
          <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-lg text-sm">
            {errorMsg}
          </div>
        </div>
      )}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm border border-slate-700">
          {toastMsg}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium">Active Employees</div>
            <div className="text-2xl font-bold mt-1">{employees.length}</div>
            <div className="text-xs text-slate-400 mt-1">Across {pods.length} Operational Pods</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium">Managed Brands</div>
            <div className="text-2xl font-bold mt-1">{brands.length}</div>
            <div className="text-xs text-slate-400 mt-1">
              {brands.filter((b) => b.tier === 'Standard').length} Single /{' '}
              {brands.filter((b) => b.tier === 'Enterprise').length} Multi-Staff
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium">Critical Coverage Gaps</div>
            <div className={`text-2xl font-bold mt-1 ${hardConflicts.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {hardConflicts.length}
            </div>
            <div className="text-xs text-slate-400 mt-1">Hard constraint violations</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium">Soft Preference Alerts</div>
            <div className="text-2xl font-bold mt-1 text-amber-600">{softConflicts.length}</div>
            <div className="text-xs text-slate-400 mt-1">Off-day preferences overridden</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium">Approved Leaves / CO</div>
            <div className="text-2xl font-bold mt-1 text-indigo-600">
              {unavailability.filter((u) => u.status === 'APPROVED').length}
            </div>
            <div className="text-xs text-slate-400 mt-1">{holidays.length} Public Holidays configured</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          {[
            { id: 'roster', label: 'Monthly Roster Views', icon: Calendar },
            {
              id: 'conflicts',
              label: `Conflicts & Validation (${hardConflicts.length} Hard / ${softConflicts.length} Soft)`,
              icon: ShieldAlert,
            },
            { id: 'changes', label: 'Simulate Leave / Change', icon: RefreshCw },
            { id: 'manage', label: 'Team, Brands & Rules', icon: Wrench },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'roster' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-lg">
                {[
                  { id: 'company', label: 'Company-Wide' },
                  { id: 'pod', label: 'Pod-Wise' },
                  { id: 'brand', label: 'Brand-Wise' },
                  { id: 'process', label: 'Process-Wise' },
                  { id: 'employee', label: 'Employee-Wise' },
                ].map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setRosterView(v.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                      rosterView === v.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {rosterView === 'pod' && (
                  <select
                    value={selectedPodId}
                    onChange={(e) => setSelectedPodId(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  >
                    {pods.map((p) => {
                      const lead = employees.find((e) => e.id === p.lead_employee_id);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} (Lead: {lead ? lead.name : 'Unassigned'})
                        </option>
                      );
                    })}
                  </select>
                )}

                {rosterView === 'brand' && (
                  <select
                    value={selectedBrandId}
                    onChange={(e) => setSelectedBrandId(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.tier})
                      </option>
                    ))}
                  </select>
                )}

                {rosterView === 'process' && (
                  <select
                    value={selectedProcessId}
                    onChange={(e) => setSelectedProcessId(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  >
                    {processes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                )}

                {rosterView === 'employee' && (
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.emp_code} — {e.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {rosterView === 'brand' && selectedBrandId && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                <div className="font-semibold text-slate-700">
                  Configured Operating Rules for {brands.find((b) => b.id === selectedBrandId)?.name}:
                </div>
                <div className="flex flex-wrap gap-2">
                  {rules
                    .filter((r) => r.brand_id === selectedBrandId)
                    .map((r) => {
                      const proc = processes.find((p) => p.id === r.process_id);
                      return (
                        <span
                          key={r.id}
                          className="bg-white border border-slate-300 px-2.5 py-1 rounded-md font-medium"
                        >
                          {proc?.code}: <strong>{r.operating_mode}</strong> (Min {r.min_staff_weekday} Wkday /{' '}
                          {r.min_staff_weekend} Wkend)
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <div className="flex flex-wrap gap-2">
                {Object.entries(STATUS_META).map(([key, meta]) => (
                  <span key={key} className={`px-2 py-0.5 rounded border font-medium ${meta.bg}`}>
                    {meta.code} = {meta.label}
                  </span>
                ))}
              </div>
              <span>Tip: Click any shift cell to manually edit & revalidate live.</span>
            </div>

            {rosterEntries.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <p className="text-slate-600 font-medium">No roster generated for this month yet.</p>
                <button
                  onClick={() => handleGenerateRoster(false)}
                  className="mt-3 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                >
                  Generate Roster Now
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="min-w-full text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="sticky left-0 z-10 bg-slate-100 text-left px-3 py-2 border-b border-r border-slate-200 min-w-[210px]">
                        Employee / Assignment
                      </th>
                      {daysArray.map((d) => {
                        const hol = holidayMap.get(d.dateStr);
                        return (
                          <th
                            key={d.day}
                            title={hol || d.dayName}
                            className={`px-1.5 py-2 border-b border-r border-slate-200 text-center min-w-[36px] ${
                              hol ? 'bg-sky-100 text-sky-800' : d.isSunday ? 'bg-amber-50 text-amber-800' : ''
                            }`}
                          >
                            <div>{d.day}</div>
                            <div className="text-[10px] font-normal">{d.dayName.slice(0, 2)}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEmployees.map((emp) => {
                      const pod = pods.find((p) => p.id === emp.pod_id);
                      const empBrands = [
                        ...new Set(
                          allocations
                            .filter((a) => a.employee_id === emp.id)
                            .map((a) => brands.find((b) => b.id === a.brand_id)?.name)
                            .filter(Boolean)
                        ),
                      ];

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50">
                          <td className="sticky left-0 z-10 bg-white px-3 py-2 border-b border-r border-slate-200">
                            <div className="font-semibold text-slate-800">
                              {emp.emp_code} · {emp.name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {pod?.name} · {empBrands.join(', ') || 'Unassigned'}
                            </div>
                          </td>
                          {daysArray.map((d) => {
                            const entry = rosterLookup.get(`${emp.id}_${d.dateStr}`);
                            const meta = entry ? STATUS_META[entry.status] : null;
                            return (
                              <td
                                key={d.day}
                                onClick={() => handleCellToggle(emp.id, d.dateStr)}
                                title={`Click to toggle status (${d.dateStr})`}
                                className="p-1 border-b border-r border-slate-200 text-center cursor-pointer"
                              >
                                {meta ? (
                                  <span
                                    className={`inline-block w-7 py-0.5 rounded border text-[11px] font-bold ${
                                      meta.bg
                                    } ${entry.is_manual_override ? 'ring-2 ring-indigo-500' : ''}`}
                                  >
                                    {meta.code}
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {rosterView === 'brand' && selectedBrandId && (
                      <tr className="bg-slate-100 font-semibold">
                        <td className="sticky left-0 z-10 bg-slate-100 px-3 py-2 border-r border-slate-200 text-slate-800">
                          Daily Coverage Status
                        </td>
                        {daysArray.map((d) => {
                          const hasGap = hardConflicts.some(
                            (c) => c.brandId === selectedBrandId && c.date === d.dateStr
                          );
                          const brandRules = rules.filter((r) => r.brand_id === selectedBrandId);
                          const anyOperating = brandRules.some((r) =>
                            isProcessOperating(r, d.dateStr, new Set(holidays.map((h) => h.holiday_date)))
                          );

                          return (
                            <td key={d.day} className="p-1 border-r border-slate-200 text-center">
                              {!anyOperating ? (
                                <span className="text-[10px] text-slate-400">OFF</span>
                              ) : hasGap ? (
                                <span className="inline-block px-1 py-0.5 rounded bg-red-600 text-white text-[10px]">
                                  GAP
                                </span>
                              ) : (
                                <span className="inline-block px-1 py-0.5 rounded bg-emerald-600 text-white text-[10px]">
                                  OK
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'conflicts' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center gap-2 text-red-700 font-bold">
                <AlertTriangle className="w-5 h-5" />
                Mandatory Coverage & Availability Conflicts ({hardConflicts.length})
              </div>
              {hardConflicts.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 p-4 rounded-lg text-sm">
                  <CheckCircle2 className="w-5 h-5" /> Zero hard coverage gaps or availability conflicts!
                </div>
              ) : (
                <div className="space-y-3">
                  {hardConflicts.map((c) => (
                    <div key={c.id} className="border border-red-200 bg-red-50/60 rounded-lg p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-red-600 text-white">
                          {c.type.replace('_', ' ')} · {c.date}
                        </span>
                        <span className="text-xs font-semibold text-slate-600">
                          {c.brandName} — {c.processName}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800 font-medium">{c.message}</p>
                      <p className="text-xs text-slate-600">{c.suggestion}</p>

                      {c.backupCandidates?.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="text-xs font-semibold text-slate-700">1-Click Resolve:</span>
                          {c.backupCandidates.map((cand) => (
                            <button
                              key={cand.id}
                              onClick={() => handleAssignBackup(c, cand)}
                              className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-2.5 py-1 rounded cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" /> Assign {cand.emp_code} {cand.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-700 font-bold">
                <Layers className="w-5 h-5" />
                Soft Constraint Notices — Client Coverage Prioritized Over Preferences ({softConflicts.length})
              </div>
              {softConflicts.length === 0 ? (
                <p className="text-sm text-slate-500">All employee weekly-off preferences satisfied.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {softConflicts.map((c) => (
                    <div key={c.id} className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 text-xs">
                      <span className="font-bold text-amber-900">{c.date}: </span>
                      <span className="text-slate-800">{c.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'changes' && (
          <div className="grid md:grid-cols-2 gap-6">
            <form onSubmit={handleSimulateLeave} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h2 className="font-bold text-base">Simulate Mid-Month Leave or Comp-Off</h2>
              <p className="text-xs text-slate-500">
                Test Requirement 3F: Mark an employee unavailable after generating a roster to see real-time single-brand
                or multi-brand coverage impact.
              </p>

              <div>
                <label className="block text-xs font-semibold mb-1">Select Employee</label>
                <select
                  value={leaveForm.employee_id}
                  onChange={(e) => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  {employees.map((emp) => {
                    const empBrands = [
                      ...new Set(
                        allocations
                          .filter((a) => a.employee_id === emp.id)
                          .map((a) => brands.find((b) => b.id === a.brand_id)?.name)
                          .filter(Boolean)
                      ),
                    ];
                    return (
                      <option key={emp.id} value={emp.id}>
                        {emp.emp_code} — {emp.name} ({empBrands.join(', ')})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Date</label>
                  <input
                    type="date"
                    value={leaveForm.unavail_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, unavail_date: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Type</label>
                  <select
                    value={leaveForm.type}
                    onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="PLANNED_LEAVE">Planned Leave</option>
                    <option value="COMP_OFF">Approved Comp-Off</option>
                    <option value="SICK_LEAVE">Sick Leave</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Reason / Notes</label>
                <input
                  type="text"
                  value={leaveForm.notes}
                  onChange={(e) => setLeaveForm({ ...leaveForm, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg text-sm cursor-pointer"
              >
                Apply Leave & Re-Validate Roster
              </button>
            </form>

            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <h2 className="font-bold text-base">Configured Leaves & Comp-Offs</h2>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {unavailability.map((u) => {
                  const emp = employees.find((e) => e.id === u.employee_id);
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between border border-slate-200 rounded-lg p-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold">
                          {emp?.emp_code} · {emp?.name} — <span className="text-indigo-700">{u.unavail_date}</span>
                        </div>
                        <div className="text-slate-500">
                          {u.type.replace('_', ' ')} {u.notes ? `(${u.notes})` : ''}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          await supabase.from('employee_unavailability').delete().eq('id', u.id);
                          await loadAllData();
                          notify('Leave record removed.');
                        }}
                        className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                        title="Remove leave"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'manage' && (
          <div className="grid md:grid-cols-2 gap-6">
            <form onSubmit={handleAddEmployee} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Users className="w-4 h-4 text-indigo-600" /> Add New Employee
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Code (e.g. E133)"
                  value={newEmpForm.emp_code}
                  onChange={(e) => setNewEmpForm({ ...newEmpForm, emp_code: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  required
                />
                <input
                  placeholder="Full Name"
                  value={newEmpForm.name}
                  onChange={(e) => setNewEmpForm({ ...newEmpForm, name: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newEmpForm.pod_id}
                  onChange={(e) => setNewEmpForm({ ...newEmpForm, pod_id: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                >
                  {pods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newEmpForm.preferred_off_day}
                  onChange={(e) => setNewEmpForm({ ...newEmpForm, preferred_off_day: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                >
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => (
                    <option key={d} value={d}>
                      Pref Off: {d}
                    </option>
                  ))}
                </select>
              </div>
              <button className="flex items-center justify-center gap-1 w-full bg-slate-900 text-white py-1.5 rounded-lg text-sm cursor-pointer">
                <Plus className="w-4 h-4" /> Save Employee
              </button>
            </form>

            <form onSubmit={handleAddBrand} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Building2 className="w-4 h-4 text-emerald-600" /> Add New Client Brand
              </div>
              <input
                placeholder="Brand Name"
                value={newBrandForm.name}
                onChange={(e) => setNewBrandForm({ ...newBrandForm, name: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newBrandForm.pod_id}
                  onChange={(e) => setNewBrandForm({ ...newBrandForm, pod_id: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                >
                  {pods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newBrandForm.tier}
                  onChange={(e) => setNewBrandForm({ ...newBrandForm, tier: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                >
                  <option value="Standard">Standard (Single-Resource)</option>
                  <option value="Enterprise">Enterprise (Multi-Resource)</option>
                </select>
              </div>
              <button className="flex items-center justify-center gap-1 w-full bg-slate-900 text-white py-1.5 rounded-lg text-sm cursor-pointer">
                <Plus className="w-4 h-4" /> Save Brand
              </button>
            </form>

            <form onSubmit={handleSaveRule} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="font-bold text-sm">Configure Brand-Process Operating Rule</div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newRuleForm.brand_id}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, brand_id: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  required
                >
                  <option value="">Select Brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newRuleForm.process_id}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, process_id: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  required
                >
                  <option value="">Select Process</option>
                  {processes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <select
                value={newRuleForm.operating_mode}
                onChange={(e) => setNewRuleForm({ ...newRuleForm, operating_mode: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="365_DAYS">365-Day Operations (Includes Sundays & Holidays)</option>
                <option value="NO_HOLIDAYS">Daily Except Public Holidays</option>
                <option value="NO_SUNDAYS_OR_HOLIDAYS">Sundays & Public Holidays Off</option>
              </select>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block mb-1 font-medium">Min Staff (Weekday)</label>
                  <input
                    type="number"
                    min="1"
                    value={newRuleForm.min_staff_weekday}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, min_staff_weekday: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Min Staff (Weekend)</label>
                  <input
                    type="number"
                    min="1"
                    value={newRuleForm.min_staff_weekend}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, min_staff_weekend: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
              <button className="w-full bg-emerald-600 text-white py-1.5 rounded-lg text-sm font-medium cursor-pointer">
                Save Operating Rule
              </button>
            </form>

            <form onSubmit={handleAddAllocation} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="font-bold text-sm">Assign Employee to Brand & Process</div>
              <select
                value={newAllocForm.employee_id}
                onChange={(e) => setNewAllocForm({ ...newAllocForm, employee_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                required
              >
                <option value="">Select Employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.emp_code} — {e.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newAllocForm.brand_id}
                  onChange={(e) => setNewAllocForm({ ...newAllocForm, brand_id: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  required
                >
                  <option value="">Select Brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newAllocForm.process_id}
                  onChange={(e) => setNewAllocForm({ ...newAllocForm, process_id: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  required
                >
                  <option value="">Select Process</option>
                  {processes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="w-full bg-indigo-600 text-white py-1.5 rounded-lg text-sm font-medium cursor-pointer">
                Assign Resource
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}