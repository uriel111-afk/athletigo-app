import React from 'react';
import { Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function MyAttendance() {
  return <Navigate to={createPageUrl('TraineeHome')} replace />;
}