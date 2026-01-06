import { LinkRecord } from '../../api/client';
import { useLongPress } from '../../hooks/useLongPress';
import styles from './LinkCard.module.css';

interface LinkCardProps {
  link: LinkRecord;
  onClick: (link: LinkRecord) => void;
  onLongPress?: (link: LinkRecord) => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

// Форматирование относительной даты
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  // Сброс времени для сравнения дней
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.floor((today.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;

  // Форматируем как "5 янв" или "5 янв 2024"
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const day = date.getDate();
  const month = months[date.getMonth()];

  if (date.getFullYear() === now.getFullYear()) {
    return `${day} ${month}`;
  }
  return `${day} ${month} ${date.getFullYear()}`;
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
