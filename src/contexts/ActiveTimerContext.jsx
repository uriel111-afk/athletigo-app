import { createContext, useContext, useState } from 'react';

const ActiveTimerContext = createContext(null);

export const ActiveTimerProvider = ({ children }) => {
  const [liveTimer, setLiveTimer] = useState(null);
  const [showTabata, setShowTabata] = useState(false);
  return (
    <ActiveTimerContext.Provider value={{ liveTimer, setLiveTimer, showTabata, setShowTabata }}>
      {children}
    </ActiveTimerContext.Provider>
  );
};

export const useActiveTimer = () => useContext(ActiveTimerContext);
