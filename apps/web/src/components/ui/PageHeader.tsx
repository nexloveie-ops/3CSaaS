import { ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: Props) {
  return (
    <header className={className ? `page-header ${className}` : 'page-header'}>
      <div className="page-header-row">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="form-inline">{actions}</div> : null}
      </div>
    </header>
  );
}
