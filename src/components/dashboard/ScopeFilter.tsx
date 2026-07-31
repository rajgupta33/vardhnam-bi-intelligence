"use client";

/**
 * Company, financial year, and category selectors.
 *
 * All default to "All" so headline figures stay reconcilable against Tally;
 * narrowing is an explicit choice rather than a hidden default.
 */
export interface ScopeFilterProps {
  companies: string[];
  financialYears: string[];
  categories: string[];
  company: string | null;
  financialYear: string | null;
  category: string | null;
  onCompanyChange: (value: string | null) => void;
  onFinancialYearChange: (value: string | null) => void;
  onCategoryChange: (value: string | null) => void;
}

function Select({
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  allLabel: string;
  onChange: (value: string | null) => void;
}) {
  if (options.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <select
        className="border border-slate-300 rounded-md px-2 py-1.5 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ScopeFilter({
  companies,
  financialYears,
  categories,
  company,
  financialYear,
  category,
  onCompanyChange,
  onFinancialYearChange,
  onCategoryChange,
}: ScopeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Select
        label="Company"
        value={company}
        options={companies}
        allLabel={companies.length > 1 ? 'All companies' : 'All'}
        onChange={onCompanyChange}
      />
      <Select
        label="Year"
        value={financialYear}
        options={financialYears}
        allLabel={financialYears.length > 1 ? 'All years' : 'All'}
        onChange={onFinancialYearChange}
      />
      <Select
        label="Category"
        value={category}
        options={categories}
        allLabel="All categories"
        onChange={onCategoryChange}
      />
    </div>
  );
}
