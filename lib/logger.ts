const getTimestamp = (): string => {
  return new Date().toISOString();
};

export const logger = {
  log: (...args: any[]) => {
    console.log(`[${getTimestamp()}]`, ...args);
  },
  error: (...args: any[]) => {
    console.error(`[${getTimestamp()}]`, ...args);
  },
  warn: (...args: any[]) => {
    console.warn(`[${getTimestamp()}]`, ...args);
  },
  info: (...args: any[]) => {
    console.info(`[${getTimestamp()}]`, ...args);
  },
  debug: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      console.log(`[${getTimestamp()}] [DEBUG]`, ...args);
    }
  },
};
