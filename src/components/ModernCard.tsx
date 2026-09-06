import { ReactNode } from 'react';
import styles from './ModernCard.module.css';

interface ModernCardProps {
  children: ReactNode;
  variant?: 'default' | 'gradient' | 'glass';
  className?: string;
  onClick?: () => void;
}

export function ModernCard({ 
  children, 
  variant = 'gradient',
  className = '',
  onClick
}: ModernCardProps) {
  return (
    <div 
      className={`${styles.card} ${styles[variant]} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={styles.shimmer} />
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}

export function ModernCardHeader({ 
  children, 
  className = '' 
}: { 
  children: ReactNode; 
  className?: string 
}) {
  return (
    <div className={`${styles.header} ${className}`}>
      {children}
    </div>
  );
}

export function ModernCardTitle({ 
  children, 
  className = '' 
}: { 
  children: ReactNode; 
  className?: string 
}) {
  return (
    <h3 className={`${styles.title} ${className}`}>
      {children}
    </h3>
  );
}

export function ModernCardDescription({ 
  children, 
  className = '' 
}: { 
  children: ReactNode; 
  className?: string 
}) {
  return (
    <p className={`${styles.description} ${className}`}>
      {children}
    </p>
  );
}

export function ModernCardContent({ 
  children, 
  className = '' 
}: { 
  children: ReactNode; 
  className?: string 
}) {
  return (
    <div className={`${styles.cardContent} ${className}`}>
      {children}
    </div>
  );
}

export function ModernCardFooter({ 
  children, 
  className = '' 
}: { 
  children: ReactNode; 
  className?: string 
}) {
  return (
    <div className={`${styles.footer} ${className}`}>
      {children}
    </div>
  );
}

export function StatBadge({ 
  value, 
  label, 
  trend,
}: { 
  value: string; 
  label: string; 
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className={styles.statBadge}>
      <span className={`${styles.statValue} ${styles[trend || 'neutral']}`}>
        {value}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

export default ModernCard;
