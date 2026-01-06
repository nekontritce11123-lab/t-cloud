import { FileRecord } from '../../api/client';
import styles from '../../styles/DateHeader.module.css';

interface DayCheckboxProps {
  dateFiles: FileRecord[];
  selectedFiles?: Set<number>;
  isSelectionMode?: boolean;
  /** Optional filter for files on cooldown (Timeline uses this) */
  isOnCooldown?: (fileId: number) => boolean;
  onSelectDay?: (files: FileRecord[], action: 'add' | 'remove') => void;
}

export function DayCheckbox({
  dateFiles,
  selectedFiles,
  isSelectionMode,
  isOnCooldown,
  onSelectDay,
}: DayCheckboxProps) {
  if (!isSelectionMode || !onSelectDay) return null;

  // Filter files that can be selected (not on cooldown)
  const selectableFiles = isOnCooldown
    ? dateFiles.filter(f => !isOnCooldown(f.id))
    : dateFiles;

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
