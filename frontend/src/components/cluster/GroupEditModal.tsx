import { useEffect, useRef, useState } from 'react';
import type { Group } from '../../types';
import IconPicker from './IconPicker';

const PRESET_COLORS = [
  '#f59e0b', '#22d3ee', '#a78bfa', '#34d399',
  '#f87171', '#fb923c', '#60a5fa', '#e879f9',
];

interface Props {
  /** When editing existing group, pass it here. When creating new, pass null. */
  group: Group | null;
  /** Used as parent_id when creating a new group (ignored when editing). */
  parentId: string | null;
  open: boolean;
  saving?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    color: string | null;
    icon: string | null;
    description: string | null;
    /** Only meaningful when creating. */
    parent_id?: string | null;
  }) => void;
}

export default function GroupEditModal({
  group,
  parentId,
  open,
  saving,
  errorMessage,
  onClose,
  onSave,
}: Props) {
  const isEdit = group !== null;
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setName(group?.name ?? '');
      setColor(group?.color ?? null);
      setIcon(group?.icon ?? null);
      setDescription(group?.description ?? '');
    }
    prevOpenRef.current = open;
  }, [open, group]);

  if (!open) return null;

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      color,
      icon,
      description: description.trim() || null,
      ...(isEdit ? {} : { parent_id: parentId }),
    });
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      tabIndex={-1}
    >
      <div
        className="glass-panel rounded-2xl p-6 w-full max-w-md mx-4 glow-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="group-modal-title" className="font-display text-xl font-bold text-slate-100 mb-4">
          {isEdit ? 'Edit Group' : 'New Group'}
        </h2>

        <form id="group-edit-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-mono-data">
              Name
            </label>
            <input
              autoFocus
              className="terminal-input rounded-xl px-4 py-2 text-sm w-full"
              maxLength={64}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-mono-data">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`w-9 h-9 rounded-lg border text-xs flex items-center justify-center ${
                  color === null
                    ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400'
                    : 'border-white/10 text-slate-500 hover:border-white/20'
                }`}
                title="No color"
                aria-label="No color"
              >
                ∅
              </button>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-9 h-9 rounded-lg border-2 ${
                    color === c ? 'border-white' : 'border-white/10'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-mono-data">
              Icon
            </label>
            <IconPicker value={icon} onChange={setIcon} />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-mono-data">
              Description
            </label>
            <textarea
              className="terminal-input rounded-xl px-4 py-2 text-sm w-full resize-none"
              rows={2}
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {errorMessage && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {errorMessage}
            </div>
          )}
        </form>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="group-edit-form"
            disabled={saving || !name.trim()}
            className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
