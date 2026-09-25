import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, body, action, className = 'py-16' }) => (
  <div className={`flex flex-col items-center gap-3 text-center ${className}`}>
    {icon && <div aria-hidden="true" className="text-base-content/50 text-4xl leading-none">{icon}</div>}
    <h3 className="text-lg font-black uppercase tracking-widest text-base-content/80">{title}</h3>
    {body && <p className="text-sm text-base-content/60 max-w-sm">{body}</p>}
    {action && (
      <button type="button" onClick={action.onClick} className="btn btn-sm btn-primary rounded-none tracking-widest uppercase mt-1">
        {action.label}
      </button>
    )}
  </div>
);

export default EmptyState;
