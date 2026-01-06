import { useState, useEffect, useCallback } from 'react';
import { apiClient, FileRecord } from '../../api/client';
import { TrashTimeline } from './TrashTimeline';
import { TrashFileViewer } from './TrashFileViewer';
import styles from './TrashView.module.css';

interface TrashViewProps {
  onRestore: () => void;
  hapticFeedback: {
    light: () => void;
    medium: () => void;
    success: () => void;
    error: () => void;
    selection: () => void;
  };
}

export function TrashView({ onRestore, hapticFeedback }: TrashViewProps) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // FileViewer state
  const [viewingFile, setViewingFile] = useState<FileRecord | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load trash files
  const loadTrash = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiClient.getTrashFiles();
      setFiles(result.items);
    } catch (error) {
      console.error('Error loading trash:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  // Exit selection mode
  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedFiles(new Set());
  }, []);

  // Handle file click
  const handleFileClick = useCallback((file: FileRecord) => {
    hapticFeedback.light();

    if (isSelectionMode) {
      // Toggle selection
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(file.id)) {
          next.delete(file.id);
        } else {
          next.add(file.id);
        }
        return next;
      });
    } else {
      // Open file viewer
      setViewingFile(file);
    }
  }, [hapticFeedback, isSelectionMode]);

  // Handle file long press - enter selection mode
  const handleFileLongPress = useCallback((file: FileRecord) => {
    hapticFeedback.medium();
    setIsSelectionMode(true);
    setSelectedFiles(new Set([file.id]));
  }, [hapticFeedback]);

  // Handle select day (batch selection)
  const handleSelectDay = useCallback((filesToSelect: FileRecord[], action: 'add' | 'remove') => {
    hapticFeedback.selection();
    setSelectedFiles(prev => {
      const next = new Set(prev);
      for (const file of filesToSelect) {
        if (action === 'add') {
          next.add(file.id);
        } else {
          next.delete(file.id);
        }
      }
      return next;
    });
  }, [hapticFeedback]);

  // Handle toggle file (for drag selection)
  const handleToggleFile = useCallback((file: FileRecord) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file.id)) {
        next.delete(file.id);
      } else {
        next.add(file.id);
      }
      return next;
    });
  }, []);

  // Restore single file (from viewer)
  const handleRestoreFromViewer = useCallback(async (file: FileRecord) => {
    setIsRestoring(true);
    hapticFeedback.light();

    try {
      await apiClient.restoreFile(file.id);
      setFiles(prev => prev.filter(f => f.id !== file.id));
      setViewingFile(null);
      hapticFeedback.success();
      onRestore();
    } catch (error) {
      console.error('Error restoring file:', error);
      hapticFeedback.error();
    } finally {
      setIsRestoring(false);
    }
  }, [hapticFeedback, onRestore]);

  // Delete single file permanently (from viewer)
  const handleDeleteFromViewer = useCallback(async (file: FileRecord) => {
    setIsDeleting(true);
    hapticFeedback.medium();

    try {
      await apiClient.permanentDeleteFile(file.id);
      setFiles(prev => prev.filter(f => f.id !== file.id));
      setViewingFile(null);
      hapticFeedback.success();
    } catch (error) {
      console.error('Error deleting file:', error);
      hapticFeedback.error();
    } finally {
      setIsDeleting(false);
    }
  }, [hapticFeedback]);

  // Restore selected files (batch)
  const handleRestoreSelected = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    hapticFeedback.light();
    const fileIds = Array.from(selectedFiles);

    try {
      // Restore all selected files
      await Promise.all(fileIds.map(id => apiClient.restoreFile(id)));

      setFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
      exitSelectionMode();
      hapticFeedback.success();
      onRestore();
    } catch (error) {
      console.error('Error restoring files:', error);
      hapticFeedback.error();
    }
  }, [selectedFiles, hapticFeedback, exitSelectionMode, onRestore]);

  // Delete selected files permanently (batch)
  const handleDeleteSelected = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    hapticFeedback.medium();
    const fileIds = Array.from(selectedFiles);

    try {
      // Delete all selected files
      await Promise.all(fileIds.map(id => apiClient.permanentDeleteFile(id)));

      setFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
      exitSelectionMode();
      hapticFeedback.success();
    } catch (error) {
      console.error('Error deleting files:', error);
      hapticFeedback.error();
    }
  }, [selectedFiles, hapticFeedback, exitSelectionMode]);

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Selection header */}
      {isSelectionMode && (
        <div className={styles.selectionHeader}>
          <button onClick={exitSelectionMode} className={styles.cancelBtn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <span className={styles.selectionCount}>Выбрано: {selectedFiles.size}</span>
          <div className={styles.selectionActions}>
            <button
              onClick={handleRestoreSelected}
              className={styles.restoreBtn}
              disabled={selectedFiles.size === 0}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <button
              onClick={handleDeleteSelected}
              className={styles.deleteBtn}
              disabled={selectedFiles.size === 0}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Timeline or empty state */}
      <TrashTimeline
        files={files}
        onFileClick={handleFileClick}
        onFileLongPress={handleFileLongPress}
        selectedFiles={selectedFiles}
        isSelectionMode={isSelectionMode}
        onSelectDay={handleSelectDay}
        onToggleFile={handleToggleFile}
        hapticFeedback={hapticFeedback}
      />

      {/* File Viewer modal */}
      {viewingFile && (
        <TrashFileViewer
          file={viewingFile}
          onClose={() => setViewingFile(null)}
          onRestore={handleRestoreFromViewer}
          onDelete={handleDeleteFromViewer}
          isRestoring={isRestoring}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
