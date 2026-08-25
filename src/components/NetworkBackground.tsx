import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  isPeer: boolean;
}

export function NetworkBackground({ connectedCount }: { connectedCount: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    const maxParticles = 60;
    const connectionRadius = 150;
    const mouse = { x: -1000, y: -1000 };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // Initialize regular particles
    for (let i = 0; i < maxParticles; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1,
        isPeer: false
      });
    }

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener('mousemove', onMouseMove);

    let currentPeerCount = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const isDark = document.documentElement.classList.contains('dark');
      
      // Update peer nodes based on connectedCount
      if (currentPeerCount < connectedCount) {
        // Add a peer node near center
        particles.push({
          x: canvas.width / 2 + (Math.random() - 0.5) * 200,
          y: canvas.height / 2 + (Math.random() - 0.5) * 200,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          size: 6, // larger for peers
          isPeer: true
        });
        currentPeerCount++;
      } else if (currentPeerCount > connectedCount) {
        // Remove a peer node
        const idx = particles.findIndex(p => p.isPeer);
        if (idx > -1) particles.splice(idx, 1);
        currentPeerCount--;
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        // Bounce off edges
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        // Interaction with mouse
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const distToMouse = Math.sqrt(dx * dx + dy * dy);
        
        if (distToMouse < 200) {
           const force = (200 - distToMouse) / 200;
           p.x -= dx * force * 0.02;
           p.y -= dy * force * 0.02;
        }

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + (distToMouse < 100 ? 1 : 0), 0, Math.PI * 2);
        
        ctx.fillStyle = p.isPeer 
          ? (isDark ? 'rgba(0, 229, 255, 0.9)' : 'rgba(0, 100, 255, 0.9)')
          : (distToMouse < 100 
              ? (isDark ? 'rgba(0, 229, 255, 0.6)' : 'rgba(0, 100, 255, 0.6)') 
              : (isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'));

        if (p.isPeer) {
          ctx.shadowBlur = 15;
          ctx.shadowColor = isDark ? '#00e5ff' : '#0064ff';
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fill();

        // Connect particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx2 = p.x - p2.x;
          const dy2 = p.y - p2.y;
          const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);

          if (dist < connectionRadius) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            const opacity = (1 - dist / connectionRadius) * (isDark ? 0.2 : 0.3);
            
            ctx.strokeStyle = (p.isPeer || p2.isPeer) 
              ? (isDark ? `rgba(0, 229, 255, ${opacity * 2})` : `rgba(0, 100, 255, ${opacity * 2})`) 
              : (isDark ? `rgba(255, 255, 255, ${opacity})` : `rgba(0, 0, 0, ${opacity})`);
              
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [connectedCount]);

  return <canvas ref={canvasRef} className="fixed inset-0 z-[-1] pointer-events-none opacity-40 dark:mix-blend-screen mix-blend-normal" />;
}
