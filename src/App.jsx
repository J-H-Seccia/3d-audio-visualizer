import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from "@react-three/drei";
import * as THREE from 'three';

const vertexShader = `
uniform float u_intensity;
uniform float u_time;
uniform float u_bassFrequency;
uniform float u_midFrequency;
uniform float u_highFrequency;

varying vec2 vUv;
varying float vDisplacement;
varying vec3 vNormal;

vec4 permute(vec4 x) {
    return mod(((x*34.0)+1.0)*x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

vec3 fade(vec3 t) {
    return t*t*t*(t*(t*6.0-15.0)+10.0);
}

float cnoise(vec3 P) {
    vec3 Pi0 = floor(P); // Integer part for indexing
    vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
    Pi0 = mod(Pi0, 289.0);
    Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P); // Fractional part for interpolation
    vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;

    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);

    vec4 gx0 = ixy0 / 7.0;
    vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);

    vec4 gx1 = ixy1 / 7.0;
    vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);

    vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
    vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
    vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
    vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
    vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
    vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
    vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;

    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);

    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
    return 2.2 * n_xyz;
}


void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);

  // Determine which region of the sphere we're in
  float bassRegion = smoothstep(-1.0, -0.33, vNormal.y);
  float midRegion = smoothstep(-0.33, 0.33, vNormal.y);
  float highRegion = smoothstep(0.33, 1.0, vNormal.y);

  // Calculate displacement based on region and corresponding frequency
  float bassDisplacement = cnoise(position + vec3(2.0 * u_time)) * u_bassFrequency * bassRegion;
  float midDisplacement = cnoise(position + vec3(2.0 * u_time)) * u_midFrequency * midRegion;
  float highDisplacement = cnoise(position + vec3(2.0 * u_time)) * u_highFrequency * highRegion;

  vDisplacement = bassDisplacement + midDisplacement + highDisplacement;

  // Apply displacement to position
  vec3 newPosition = position + normal * (u_intensity * vDisplacement);

  vec4 modelPosition = modelMatrix * vec4(newPosition, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  vec4 projectedPosition = projectionMatrix * viewPosition;

  gl_Position = projectedPosition;
}
`;

const fragmentShader = `
uniform float u_intensity;
uniform float u_time;
uniform float u_bassFrequency;
uniform float u_midFrequency;
uniform float u_highFrequency;

varying vec2 vUv;
varying float vDisplacement;
varying vec3 vNormal;

void main() {
  float distort = 2.0 * vDisplacement * u_intensity;

  vec3 bassColor = vec3(1.0, 0.1, 0.1);
  vec3 midColor = vec3(0.1, 1.0, 0.1);
  vec3 highColor = vec3(0.1, 0.1, 1.0);

  // Determine which region of the sphere we're in
  float bassRegion = smoothstep(-1.0, -0.33, vNormal.y);
  float midRegion = smoothstep(-0.33, 0.33, vNormal.y);
  float highRegion = smoothstep(0.33, 1.0, vNormal.y);

  // Mix colors based on regions and frequency intensities
  vec3 color = 
    bassColor * u_bassFrequency * bassRegion +
    midColor * u_midFrequency * midRegion +
    highColor * u_highFrequency * highRegion;
  
  // Add some variation based on UV coordinates and distortion
  color += 0.2 * vec3(vUv.x, vUv.y, 1.0 - vUv.x - vUv.y) * (1.0 - distort);

  // Ensure color values are in valid range
  color = clamp(color, 0.0, 1.0);
  
  gl_FragColor = vec4(color, 1.0);
}
`;

const getAverageFrequency = (dataArray, startIndex, endIndex, compressionFactor) => {
  const slice = dataArray.slice(startIndex, endIndex + 1);
  const average = slice.reduce((sum, value) => sum + value, 0) / slice.length;
  const max = 255; // Maximum value in the frequency data
  let scaledValue = average / max; // Normalize to 0-1

  // Adjust for logarithmic compression
  scaledValue = Math.pow(scaledValue, compressionFactor);

  return scaledValue;
};

const AudioReactiveBlob = ({ audioData, isPlaying }) => {
  const mesh = useRef();
  const uniforms = useMemo(
    () => ({
      u_intensity: { value: 0.3 },
      u_time: { value: 0.0 },
      u_bassFrequency: { value: 0 },
      u_midFrequency: { value: 0 },
      u_highFrequency: { value: 0 },
    }),
    []
  );
  
  useFrame((state) => {
    const { clock } = state;
    if (mesh.current) {
      mesh.current.material.uniforms.u_time.value = 0.4 * clock.getElapsedTime();

      if (isPlaying) {
        mesh.current.material.uniforms.u_intensity.value = THREE.MathUtils.lerp(
          mesh.current.material.uniforms.u_intensity.value,
          0.3 + (audioData.bassFrequency + audioData.midFrequency + audioData.highFrequency) / 3,
          0.3
        );
        mesh.current.material.uniforms.u_bassFrequency.value = THREE.MathUtils.lerp(
          mesh.current.material.uniforms.u_bassFrequency.value,
          audioData.bassFrequency,
          0.2
        );
        mesh.current.material.uniforms.u_midFrequency.value = THREE.MathUtils.lerp(
          mesh.current.material.uniforms.u_midFrequency.value,
          audioData.midFrequency,
          0.2
        );
        mesh.current.material.uniforms.u_highFrequency.value = THREE.MathUtils.lerp(
          mesh.current.material.uniforms.u_highFrequency.value,
          audioData.highFrequency,
          0.2
        );
  
        // Scale based on overall intensity
        const targetScale = 1.5 + (audioData.bassFrequency + audioData.midFrequency + audioData.highFrequency) / 6;
        mesh.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.2);
      } else {
        // Reset values when not playing
        mesh.current.material.uniforms.u_intensity.value = THREE.MathUtils.lerp(
          mesh.current.material.uniforms.u_intensity.value,
          0.3,
          0.1
        );
        mesh.current.material.uniforms.u_bassFrequency.value = THREE.MathUtils.lerp(
          mesh.current.material.uniforms.u_bassFrequency.value,
          0,
          0.1
        );
        mesh.current.material.uniforms.u_midFrequency.value = THREE.MathUtils.lerp(
          mesh.current.material.uniforms.u_midFrequency.value,
          0,
          0.1
        );
        mesh.current.material.uniforms.u_highFrequency.value = THREE.MathUtils.lerp(
          mesh.current.material.uniforms.u_highFrequency.value,
          0,
          0.1
        );
        mesh.current.scale.lerp(new THREE.Vector3(1.5, 1.5, 1.5), 0.5);
      }
    }
  });

  return (
    <mesh ref={mesh} position={[0, 0, 0]} scale={1.5}>
      <icosahedronGeometry args={[2, 20]} />
      <shaderMaterial
        fragmentShader={fragmentShader}
        vertexShader={vertexShader}
        uniforms={uniforms}
        wireframe={false}
      />
    </mesh>
  );
};


const AudioPlayer = ({ onAudioData, onPlayingChange }) => {
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekValue, setSeekValue] = useState(0);

  const initializeAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      sourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    audio.src = '/deemed.mp3';

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration > 0) {
        setSeekValue((audio.currentTime / audio.duration) * 100);
      }
    });

    return () => {
      audio.removeEventListener('loadedmetadata', () => {});
      audio.removeEventListener('timeupdate', () => {});
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    let animationFrameId;

    const updateFrequencyData = () => {
      if (analyserRef.current && isPlaying) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        const bassFrequency = getAverageFrequency(dataArray, 0, 3, 25);
        const midFrequency = getAverageFrequency(dataArray, 4, 20, 5);
        const highFrequency = getAverageFrequency(dataArray, 21, 50, 4);

        onAudioData({ bassFrequency, midFrequency, highFrequency });
      }
      animationFrameId = requestAnimationFrame(updateFrequencyData);
    };

    if (isPlaying) {
      updateFrequencyData();
    } else {
      cancelAnimationFrame(animationFrameId);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, onAudioData]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (isPlaying) {
      audio.pause();
    } else {
      initializeAudio();
      audio.play();
    }
    setIsPlaying(!isPlaying);
    onPlayingChange(!isPlaying);
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    const seekTime = (e.target.value / 100) * audio.duration;
    audio.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      <audio ref={audioRef} />
      <button onClick={handlePlayPause}>{isPlaying ? 'Pause' : 'Play'}</button>
      <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
      <input 
        type="range" 
        min="0" 
        max="100" 
        value={isNaN(seekValue) ? 0 : seekValue} 
        onChange={handleSeek}
        style={{
          width: '100%',
          height: '5px',
          WebkitAppearance: 'none',
          background: `linear-gradient(to right, #4CAF50 0%, #4CAF50 ${isNaN(seekValue) ? 0 : seekValue}%, #ddd ${isNaN(seekValue) ? 0 : seekValue}%, #ddd 100%)`,
          outline: 'none',
          opacity: '0.7',
          transition: 'opacity .2s',
        }}
      />
    </div>
  );
};



const Scene = () => {
  const [audioData, setAudioData] = useState({ bassFrequency: 0, midFrequency: 0, highFrequency: 0 });
  const [isPlaying, setIsPlaying] = useState(false);

  const handleAudioData = useCallback((data) => {
    setAudioData(data);
  }, []);

  const handlePlayingChange = useCallback((playing) => {
    setIsPlaying(playing);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' , backgroundColor: 'black'}}>
      <Canvas camera={{ position: [0.0, 0.0, 8.0] }}>
        <AudioReactiveBlob audioData={audioData} isPlaying={isPlaying} />
        <OrbitControls />
      </Canvas>
      <div style={{ position: 'absolute', bottom: 20, left: 20, right: 20, zIndex: 2, background: 'rgba(255, 255, 255, 0.7)', padding: '10px', borderRadius: '5px' }}>
        <AudioPlayer onAudioData={handleAudioData} onPlayingChange={handlePlayingChange} />
      </div>
    </div>
  );
};

export default Scene;