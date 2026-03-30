import React from 'react';
import { Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function SectionTemplates() {
  return <Navigate to={createPageUrl('TrainingPlans')} replace />;
}