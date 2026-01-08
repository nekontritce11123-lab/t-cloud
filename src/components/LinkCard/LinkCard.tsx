import { LinkRecord } from '../../api/client';
import { useLongPress } from '../../hooks/useLongPress';
import { extractDomain } from '../../shared/utils';
import { formatRelativeDate } from '../../shared/formatters';
import styles from './LinkCard.module.css';

interface LinkCardProps {
  link: LinkRecord;
  onClick: (link: LinkRecord) => void;
  onLongPress?: (link: LinkRecord) => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
}

export function LinkCard({ link, onClick, onLongPress, isSelected, isSelectionMode }: LinkCardProps) {
  const longPress = useLongPress(link, onLongPress, onClick);

  return (
    <button
      className={`${styles.card} ${isSelected ? styles.selected : ''}`}
      onClick={longPress.onClick}
      onTouchStart={longPress.onTouchStart}
      onTouchEnd={longPress.onTouchEnd}
      onTouchCancel={longPress.onTouchCancel}
      onMouseDown={longPress.onMouseDown}
      onMouseUp={longPress.onMouseUp}
      onMouseLeave={longPress.onMouseLeave}
    >
      {/* Selection checkbox */}
      {isSelectionMode && (
        <div className={styles.checkbox}>
          {isSelected ? '✓' : ''}
        </div>
      )}

      {/* Preview image */}
      <div className={styles.preview}>
        {link.imageUrl ? (
          <img
            src={link.imageUrl}
            alt=""
            className={styles.image}
            loading="lazy"
          />
        ) : (
          <span className={styles.icon}>🔗</span>
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        <span className={styles.title}>
          {link.title || extractDomain(link.url)}
        </span>
        {link.description && (
          <span className={styles.description}>{link.description}</span>
        )}
        <span className={styles.domain}>
          {link.siteName || extractDomain(link.url)}
          {link.createdAt && (
            <span className={styles.date}> • {formatRelativeDate(link.createdAt)}</span>
          )}
        </span>
      </div>
    </button>
  );
}

interface LinkListProps {
  links: LinkRecord[];
  onLinkClick: (link: LinkRecord) => void;
  onLinkLongPress?: (link: LinkRecord) => void;
  selectedLinks?: Set<number>;
  isSelectionMode?: boolean;
}

export function LinkList({ links, onLinkClick, onLinkLongPress, selectedLinks, isSelectionMode }: LinkListProps) {
  if (links.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>🔗</span>
        <p>Ссылки не найдены</p>
        <p className={styles.emptyHint}>Отправляйте ссылки боту, чтобы сохранить их с превью</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {links.map(link => (
        <LinkCard
          key={link.id}
          link={link}
          onClick={onLinkClick}
          onLongPress={onLinkLongPress}
          isSelected={selectedLinks?.has(link.id)}
          isSelectionMode={isSelectionMode}
        />
      ))}
    </div>
  );
}
