// ─── Kollektiv Image Editor — FloatingPanelHost ──────────────────────────────
// Portal root for all floating panels. Renders children into document.body.

import React from 'react';
import { createPortal } from 'react-dom';

const FloatingPanelHost: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  createPortal(<>{children}</>, window.document.body);

export default FloatingPanelHost;
