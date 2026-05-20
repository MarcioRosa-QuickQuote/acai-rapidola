import { useNavigate } from 'react-router-dom';

export default function CustomerHeader({ title, onBack }) {
  const navigate = useNavigate();
  return (
    <div className="header">
      <div className="header-left">
        <button className="btn btn-sm"
          style={{ background: 'var(--border)', color: 'var(--primary-dark)', fontSize: 20, padding: '4px 10px', fontWeight: 700, lineHeight: 1 }}
          onClick={() => onBack ? onBack() : navigate(-1)}>
          ‹
        </button>
      </div>
      {title && <div className="header-title">{title}</div>}
      <div className="header-right" />
    </div>
  );
}
