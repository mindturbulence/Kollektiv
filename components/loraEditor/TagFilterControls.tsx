import React from 'react';
import type { FilterMethod } from './types';

export interface TagFilterValues {
    count: number;
    filter: string;
    filterMethod: FilterMethod;
    excludeFilter: string;
    excludeFilterMethod: FilterMethod;
    byFolder: boolean;
}

interface TagFilterControlsProps {
    values: TagFilterValues;
    onChange: (values: TagFilterValues) => void;
}

const METHODS: { value: FilterMethod; label: string }[] = [
    { value: 'none', label: 'None/Disable' },
    { value: 'partial', label: 'Partial Match (comma delimited)' },
    { value: 'exact', label: 'Exact Match (comma delimited)' },
    { value: 'regex', label: 'Regular Expression' },
];

const TagFilterControls: React.FC<TagFilterControlsProps> = ({ values, onChange }) => {
    const set = <K extends keyof TagFilterValues>(key: K, value: TagFilterValues[K]) => onChange({ ...values, [key]: value });

    return (
        <div className="flex flex-wrap gap-3 items-end p-3 bg-base-200/20 text-[10px]">
            <label className="flex flex-col gap-1">
                <span className="uppercase opacity-40">Top N</span>
                <input type="number" value={values.count} onChange={(e) => set('count', Number(e.target.value))} className="form-input w-20 h-7" />
            </label>
            <label className="flex flex-col gap-1">
                <span className="uppercase opacity-40">Include Filter</span>
                <div className="flex gap-1">
                    <input value={values.filter} onChange={(e) => set('filter', e.target.value)} className="form-input h-7 w-40" />
                    <select value={values.filterMethod} onChange={(e) => set('filterMethod', e.target.value as FilterMethod)} className="form-select h-7">
                        {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>
            </label>
            <label className="flex flex-col gap-1">
                <span className="uppercase opacity-40">Exclude Filter</span>
                <div className="flex gap-1">
                    <input value={values.excludeFilter} onChange={(e) => set('excludeFilter', e.target.value)} className="form-input h-7 w-40" />
                    <select value={values.excludeFilterMethod} onChange={(e) => set('excludeFilterMethod', e.target.value as FilterMethod)} className="form-select h-7">
                        {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>
            </label>
            <label className="flex items-center gap-2 pb-1">
                <input type="checkbox" checked={values.byFolder} onChange={(e) => set('byFolder', e.target.checked)} className="checkbox checkbox-xs checkbox-primary" />
                <span className="uppercase opacity-40">By Folder</span>
            </label>
        </div>
    );
};

export default TagFilterControls;
