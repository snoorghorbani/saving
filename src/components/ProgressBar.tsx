interface ProgressBarProps {
    value: number;
    color: 'emerald' | 'amber' | 'red';
}

const colorMap = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
};

export function ProgressBar({ value, color }: ProgressBarProps) {
    const clamped = Math.min(Math.max(value, 0), 100);
    return (
        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
                className={`h-full rounded-full transition-all duration-500 ${colorMap[color]}`}
                style={{ width: `${clamped}%` }}
            />
        </div>
    );
}
