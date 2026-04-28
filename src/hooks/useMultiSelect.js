import { useState, useCallback } from 'react';

// Shared multi-select state for list pages (AllUsers, Sessions,
// Notifications, Leads, TrainingPlans). Pair with <MultiSelectBar />
// for the floating action bar and <SelectCheckbox /> for the
// per-row tick.
//
//   const sel = useMultiSelect();
//   sel.startSelecting();          // opens selection mode
//   sel.toggleSelect(rowId);       // adds/removes a row
//   sel.isSelected(rowId);         // boolean for checkbox state
//   sel.selectedCount              // number for the bar's "N נבחרו"
//   sel.clearSelection();          // resets + closes selection mode
const useMultiSelect = () => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelecting(false);
  }, []);

  const startSelecting = useCallback(() => {
    setIsSelecting(true);
  }, []);

  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);

  return {
    isSelecting,
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelect,
    selectAll,
    clearSelection,
    startSelecting,
    isSelected,
  };
};

export default useMultiSelect;
