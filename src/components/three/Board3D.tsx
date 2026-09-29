import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BoardScene, type SceneProps } from './Scene';
import { hasWebGL, prefersReducedMotion } from './capabilities';
import { Board } from '../Board';

/** Текстуры плиток печатаются на canvas, поэтому ждём шрифты — иначе первый кадр останется на системном fallback. */
function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const done = () => alive && setReady(true);
    if (!document.fonts) {
      done();
      return () => {
        alive = false;
      };
    }
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(done);
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

interface Props extends SceneProps {
  overlay?: ReactNode;
  autoRotate?: boolean;
  zoom?: boolean;
  hint?: string;
  /** CSS-поле того же размера, если WebGL недоступен */
  fallbackHub?: ReactNode;
}

/** Стабильная ссылка: иначе drei будет сбрасывать цель орбиты на каждый рендер и мешать камере-ригу. */
const ORBIT_TARGET: [number, number, number] = [0, -0.4, 0];

export function Board3D({ overlay, autoRotate = false, zoom = false, hint, fallbackHub, ...scene }: Props) {
  const fontsReady = useFontsReady();
  const [ok] = useState(hasWebGL);
  const [reduced] = useState(prefersReducedMotion);

  if (!ok) {
    return (
      <div className="board3d board3d--css">
        <Board
          flat
          hub={fallbackHub}
          players={scene.players}
          owners={scene.owners}
          currentIndex={scene.currentIndex}
          interactive={scene.interactive}
          onSelect={scene.onSelect}
        />
        {overlay}
      </div>
    );
  }

  return (
    <div className={`board3d${scene.interactive ? ' board3d--live' : ''}`}>
      {fontsReady && (
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          camera={{ position: [0, 9.4, 14.6], fov: 34 }}
        >
          <Suspense fallback={null}>
            <BoardScene {...scene} />
            <OrbitControls
              makeDefault
              enablePan={false}
              enableZoom={zoom}
              enableDamping
              dampingFactor={0.08}
              rotateSpeed={0.45}
              minDistance={6}
              maxDistance={24}
              minPolarAngle={0.5}
              maxPolarAngle={1.32}
              autoRotate={autoRotate && !reduced}
              autoRotateSpeed={0.45}
              target={ORBIT_TARGET}
            />
          </Suspense>
        </Canvas>
      )}
      {overlay}
      {hint && <span className="board3d__hint">{hint}</span>}
    </div>
  );
}

export default Board3D;
