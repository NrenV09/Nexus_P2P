import React, { useState, useEffect } from 'react';

export function DataStream({ active }: { active: boolean }) {
  const [binaryChars, setBinaryChars] = useState('');
  
  useEffect(() => {
    if (!active) {
      setBinaryChars('');
      return;
    }
    
    let frameId: number;
    let lastTime = 0;
    
    const updateBinary = (time: number) => {
      if (time - lastTime > 40) { // ~25 fps update rate for chunkiness
        let str = '';
        for (let i = 0; i < 200; i++) str += Math.random() > 0.5 ? '1 ' : '0 ';
        setBinaryChars(str);
        lastTime = time;
      }
      frameId = requestAnimationFrame(updateBinary);
    };
    
    frameId = requestAnimationFrame(updateBinary);
    return () => cancelAnimationFrame(frameId);
  }, [active]);

  if (!active) return null;

  return (
    <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center overflow-hidden bg-black/40 backdrop-blur-sm rounded-[inherit]">
      <div className="text-accent text-[10px] sm:text-xs font-mono break-all opacity-50 leading-tight h-full w-full p-4 overflow-hidden mask-fade text-center flex flex-col justify-center" style={{ maskImage: 'radial-gradient(circle, black 30%, transparent 80%)', WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 80%)' }}>
        {binaryChars.repeat(10)}
      </div>
      <div className="absolute inset-x-0 h-1 bg-accent/30 shadow-[0_0_20px_#00e5ff] animate-[scan_1s_ease-in-out_infinite]" />
    </div>
  );
}
