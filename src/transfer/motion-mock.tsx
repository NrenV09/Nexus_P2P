import React from 'react';

export const motion = new Proxy({}, {
  get: (_, tag) => {
    if (typeof tag !== 'string') return undefined;
    return React.forwardRef((props: any, ref) => {
      const { initial, animate, exit, transition, variants, whileHover, whileTap, ...rest } = props;
      return React.createElement(tag, { ref, ...rest });
    });
  }
});

export const AnimatePresence = ({ children }: any) => <>{children}</>;
