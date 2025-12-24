
import React from 'react';

interface FooterProps {
  onAboutClick: () => void;
}

const Footer: React.FC<FooterProps> = ({ onAboutClick }) => {
  return (
    <footer className="flex-shrink-0 p-4 bg-base-100 text-end text-xs text-base-content/60 border-t border-base-300 z-10">
      <p>Kollektiv Toolbox &copy; 2025. A creative tool by <a onClick={onAboutClick} className="link link-hover">mndtrblnc</a>.</p>
    </footer>
  );
};

export default Footer;