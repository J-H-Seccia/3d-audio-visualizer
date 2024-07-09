import React, { useCallback, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

const WavesurferPlayer = ({ onAudioData, onPlayingChange }) => {
  const wavesurferRef = useRef(null);
  const containerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const createWaveSurfer = useCallback(() => {
    if (wavesurferRef.current) return;

    const ctx = document.createElement('canvas').getContext('2d');
    const linGrad = ctx.createLinearGradient(0, 64, 0, 200);
    linGrad.addColorStop(0.5, 'rgba(255, 255, 255, 1.000)');
    linGrad.addColorStop(0.5, 'rgba(183, 183, 183, 1.000)');

    wavesurferRef.current = WaveSurfer.create({
      container: containerRef.current,
      waveColor: linGrad,
      progressColor: 'rgb(100, 0, 100)',
      height: 100,
      barWidth: 2,
      barGap: 1,
      backend: 'MediaElement',
      mediaControls: true,
    });

    wavesurferRef.current.load('/deemed.mp3');

    wavesurferRef.current.on('ready', () => {
      setDuration(wavesurferRef.current.getDuration());
    });

    wavesurferRef.current.on('play', () => {
      setIsPlaying(true);
      onPlayingChange(true);
    });

    wavesurferRef.current.on('pause', () => {
      setIsPlaying(false);
      onPlayingChange(false);
    });

    wavesurferRef.current.on('audioprocess', () => {
      setCurrentTime(wavesurferRef.current.getCurrentTime());
      
      // Get frequency data
      const analyser = wavesurferRef.current.backend.analyser;
      if (analyser) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        // Calculate frequency averages
        const bassFrequency = getAverageFrequency(dataArray, 0, 3, 25);
        const midFrequency = getAverageFrequency(dataArray, 4, 20, 5);
        const highFrequency = getAverageFrequency(dataArray, 21, 50, 4);

        onAudioData({ bassFrequency, midFrequency, highFrequency });
      }
    });
  }, [onAudioData, onPlayingChange]);

  useEffect(() => {
    createWaveSurfer();

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.unAll();
        wavesurferRef.current.destroy();
      }
    };
  }, [createWaveSurfer]);

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      <div ref={containerRef} />
      <div>
        <button onClick={handlePlayPause}>{isPlaying ? 'Pause' : 'Play'}</button>
        <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>
    </div>
  );
};

// Helper function to calculate average frequency
const getAverageFrequency = (dataArray, startIndex, endIndex, compressionFactor) => {
  const slice = dataArray.slice(startIndex, endIndex + 1);
  const average = slice.reduce((sum, value) => sum + value, 0) / slice.length;
  const max = 255; // Maximum value in the frequency data
  let scaledValue = average / max; // Normalize to 0-1

  // Adjust for logarithmic compression
  scaledValue = Math.pow(scaledValue, compressionFactor);

  return scaledValue;
};

export default WavesurferPlayer;