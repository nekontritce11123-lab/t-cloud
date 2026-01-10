import { FileRecord } from '../../api/client';
import styles from '../../styles/DateHeader.module.css';

interface DayCheckboxProps {
  dateFiles: FileRecord[];
  selectedFiles?: Set<number>;
  isSelectionMode?: boolean;
  onSelectDay?: (files: FileRecord[], action: 'add' | 'remove') => void;
}

export function DayCheckbox({
  dateFiles,
  selectedFiles,
  isSelectionMode,
  onSelectDay,
}: DayCheckboxProps) {
  if (!isSelectionMode || !onSelectDay) return null;

  // All files are selectable - cooldown only affects sending
  const selectableFiles = dateFiles;

  if (selectableFiles.length === 0) return null;

  // Count how many are selected for this day
  const selectedCount = selectableFiles.filter(f => selectedFiles?.has(f.id)).length;
  const isAllSelected = selectedCount === selectableFiles.length;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAllSelected) {
      // Deselect all for this day
      onSelectDay(selectableFiles, 'remove');
    } else {
      // Select all for this day
      onSelectDay(selectableFiles, 'add');
    }
  };

  return (
    <button
      className={`${styles.dateCheckbox} ${isAllSelected ? styles.dateCheckboxSelected : ''}`}
      onClick={handleClick}
    >
      {isAllSelected ? '✓' : ''}
    </button>
  );
}
