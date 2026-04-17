import { createContext, useContext, useState } from 'react';

const ActiveTimerContext = createContext(null);

export const ActiveTimerProvider = ({ children }) => {
  const [liveTimer, setLiveTimer] = useState(null);
  return (
    <ActiveTimerContext.Provider value={{ liveTimer, setLiveTimer }}>
      {children}
    </ActiveTimerContext.Provider>
  );
};

export const useActiveTimer = () => useContext(ActiveTimerContext);
