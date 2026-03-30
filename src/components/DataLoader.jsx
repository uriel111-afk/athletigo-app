import React from 'react';
import { useAppPrefetch } from './hooks/useAppPrefetch';

const DataLoader = ({ user }) => {
  useAppPrefetch(user);
  return null;
};

export default React.memo(DataLoader);