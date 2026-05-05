import type { ReactNode } from 'react';
import { HelpButton } from './HelpButton';

interface Props {
  title: string;
  subtitle?: string;
  helpTitle: string;
  helpBody: ReactNode;
  /** Extra content rendered to the right of the help button (e.g. action buttons) */
  trailing?: ReactNode;
}

/**
 * Standard page header with an inline help button.
 * Use at the top of every menu page for a consistent look.
 */
export function PageHeader({ title, subtitle, helpTitle, helpBody, trailing }: Props) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{title}</h1>
        {subtitle && (
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {trailing}
        <HelpButton
          variant="inline"
          label="คำอธิบายหน้านี้"
          title={helpTitle}
          body={helpBody}
        />
      </div>
    </div>
  );
}
