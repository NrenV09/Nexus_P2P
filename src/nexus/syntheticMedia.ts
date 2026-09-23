/**
 * Generates synthetic MediaStream instances for simulated A/V calls.
 * Uses canvas.captureStream and Web Audio API to provide active video & audio tracks.
 */
export function createSyntheticVideoStream(
  peerName: string,
  callType: 'video' | 'audio'
): { stream: MediaStream; cleanup: () => void } {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  let animId: number;
  let t = 0;

  const render = () => {
    t += 0.05;
    if (ctx) {
      // Dark cyber gradient background
      const grad = ctx.createLinearGradient(0, 0, 640, 360);
      grad.addColorStop(0, '#0B0F19');
      grad.addColorStop(1, '#030712');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 360);

      // Radar Grid lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.07)';
      ctx.lineWidth = 1;
      for (let x = 0; x < 640; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 360);
        ctx.stroke();
      }
      for (let y = 0; y < 360; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(640, y);
        ctx.stroke();
      }

      // Dynamic Audio/Video wave
      ctx.beginPath();
      ctx.strokeStyle = callType === 'video' ? '#F43F5E' : '#A855F7';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = callType === 'video' ? '#F43F5E' : '#A855F7';
      ctx.shadowBlur = 10;
      for (let x = 0; x < 640; x += 8) {
        const wave = Math.sin(x * 0.025 + t * 2) * 22 * Math.sin(t * 1.5) + Math.cos(x * 0.015 - t) * 10;
        const y = 200 + wave;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Pulsing Center Avatar Circle
      const cx = 320;
      const cy = 110;
      const pulse = Math.sin(t * 3) * 5;
      ctx.beginPath();
      ctx.arc(cx, cy, 40 + pulse, 0, Math.PI * 2);
      ctx.fillStyle = callType === 'video' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(168, 85, 247, 0.2)';
      ctx.fill();
      ctx.strokeStyle = callType === 'video' ? '#F43F5E' : '#A855F7';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((peerName || 'P').charAt(0).toUpperCase(), cx, cy);

      // Text Overlays
      ctx.font = 'bold 15px "Space Grotesk", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(peerName, 320, 255);

      ctx.font = '10px monospace';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(`SIMULATED P2P ${callType.toUpperCase()} STREAM • 30 FPS`, 320, 278);

      ctx.fillStyle = '#34D399';
      ctx.fillText('● WEBRTC ENCRYPTED (SRTP)', 320, 296);
    }
    animId = requestAnimationFrame(render);
  };
  render();

  let audioCtx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let stream: MediaStream;

  try {
    const videoStream = canvas.captureStream(30);
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      const dest = audioCtx.createMediaStreamDestination();
      osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0001; // Silent carrier tone for valid track
      osc.connect(gain);
      gain.connect(dest);
      osc.start();

      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) {
        videoStream.addTrack(audioTrack);
      }
    }
    stream = videoStream;
  } catch (e) {
    stream = canvas.captureStream(30);
  }

  const cleanup = () => {
    cancelAnimationFrame(animId);
    if (osc) {
      try { osc.stop(); } catch (_) {}
    }
    if (audioCtx) {
      try { audioCtx.close(); } catch (_) {}
    }
    stream.getTracks().forEach(tr => tr.stop());
  };

  return { stream, cleanup };
}
