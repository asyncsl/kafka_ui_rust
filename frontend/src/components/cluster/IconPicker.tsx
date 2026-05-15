const PRESET_ICONS = [
  '🛒', '📦', '🔧', '🎯', '🚀', '⚙️', '🧪', '📊',
  '🔐', '💾', '📡', '🌐', '🎨', '🏷️', '🔔', '⭐',
];

interface Props {
  value: string | null;
  onChange: (icon: string | null) => void;
}

export default function IconPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`w-9 h-9 rounded-lg border text-xs flex items-center justify-center transition-colors ${
          value === null
            ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400'
            : 'border-white/10 text-slate-500 hover:border-white/20'
        }`}
        title="No icon"
      >
        ∅
      </button>
      {PRESET_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
          className={`w-9 h-9 rounded-lg border text-lg flex items-center justify-center transition-colors ${
            value === icon
              ? 'border-amber-500/60 bg-amber-500/10'
              : 'border-white/10 hover:border-white/30'
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
