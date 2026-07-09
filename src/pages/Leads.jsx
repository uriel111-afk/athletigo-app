import React from 'react';
import { Navigate } from 'react-router-dom';

// The classic leads screen has been unified into the guided Life OS
// leads page (src/pages/lifeos/Leads.jsx). This route now redirects
// there so every entry point (/leads links in Layout, Reports,
// Sessions) lands on the single leads experience.
export default function Leads() {
  return <Navigate to="/lifeos/leads" replace />;
}
