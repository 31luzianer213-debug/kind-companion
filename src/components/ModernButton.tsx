import { ReactNode, ButtonHTMLAttributes } from 'react';
import styles from './ModernButton.module.css';

interface ModernButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

export function ModernButton({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  ...props
}: ModernButtonProps) {
  return (
    <button 
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`}
      {...props}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.text}>{children}</span>
    </button>
  );
}

export default ModernButton;
