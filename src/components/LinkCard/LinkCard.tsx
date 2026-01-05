import { LinkRecord } from '../../api/client';
import styles from './LinkCard.module.css';

interface LinkCardProps {
  link: LinkRecord;
  onClick: (link: LinkRecord) => void;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function LinkCard({ link, onClick }: LinkCardProps) {
  const handleClick = () => {
    onClick(link);
  };

  return (
    <button className={styles.card} onClick={handleClick}>
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
        </span>
      </div>
    </button>
  );
}

interface LinkListProps {
  links: LinkRecord[];
  onLinkClick: (link: LinkRecord) => void;
}

export function LinkList({ links, onLinkClick }: LinkListProps) {
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
        <LinkCard key={link.id} link={link} onClick={onLinkClick} />
      ))}
    </div>
  );
}
