import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { BOARD, SPACE_COUNT } from '../../game/board';
import type { PlayerState, Space, SpaceId } from '../../game/types';
import { BOARD_W, CELL_XZ, OWNER_COLOR, TILE, TILE_TOP, ringPoint, tileYaw } from './layout';
import { ARRIVE_BEAT_MS, DICE_ROLL_MS, WALK_STEP_MS } from './capabilities';
import { checker, diceFace, signFace, stripes, tileFace, toTexture } from './textures';

type V3 = [number, number, number];

function useTex(make: () => HTMLCanvasElement, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(() => toTexture(make()), deps);
  useEffect(() => () => t.dispose(), [t]);
  return t;
}

const damp = THREE.MathUtils.damp;

/** На столько плитка приподнимается под текущим ходом — фишка должна ехать вместе с ней. */
const TILE_LIFT = 0.12;
/** Насколько фишка сдвинута к внешнему краю плитки: название улицы остаётся на виду. */
const OUT_SET = 0.38;

/* ---------------------------------- поле --------------------------------- */

function BoardBase() {
  return (
    <group>
      <RoundedBox
        args={[BOARD_W, 0.5, BOARD_W]}
        radius={0.2}
        smoothness={3}
        position={[0, -0.25, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color="#f6e6c6" roughness={0.8} />
      </RoundedBox>
      <RoundedBox
        args={[BOARD_W + 0.55, 0.42, BOARD_W + 0.55]}
        radius={0.18}
        smoothness={3}
        position={[0, -0.53, 0]}
        castShadow
      >
        <meshStandardMaterial color="#3d1c46" roughness={0.55} metalness={0.2} />
      </RoundedBox>
    </group>
  );
}

function House({ color }: { color: string }) {
  return (
    <group position={[-0.4, 0.16, -0.4]}>
      <mesh castShadow position={[0, 0.1, 0]}>
        <boxGeometry args={[0.24, 0.2, 0.24]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh castShadow position={[0, 0.26, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.21, 0.15, 4]} />
        <meshStandardMaterial color="#e2604a" roughness={0.7} />
      </mesh>
    </group>
  );
}

function Tile({
  index,
  space,
  owner,
  state,
  interactive,
  onSelect,
}: {
  index: number;
  space: Space;
  owner: 0 | 1 | null;
  state: 'idle' | 'current' | 'selected';
  interactive?: boolean;
  onSelect?: (id: SpaceId) => void;
}) {
  const [x, z] = CELL_XZ[index];
  const face = useTex(() => tileFace(space, owner, state), [space, owner, state]);
  const group = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.position.y = damp(g.position.y, state === 'idle' ? (hover ? 0.05 : 0) : TILE_LIFT, 9, dt);
  });

  useEffect(() => {
    if (!interactive) return;
    document.body.style.cursor = hover ? 'pointer' : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hover, interactive]);

  return (
    <group ref={group} position={[x, 0, z]} rotation={[0, tileYaw(x, z), 0]}>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.08, 0]}
        onPointerOver={
          interactive
            ? (e) => {
                e.stopPropagation();
                setHover(true);
              }
            : undefined
        }
        onPointerOut={interactive ? () => setHover(false) : undefined}
        onClick={
          interactive
            ? (e) => {
                if (e.delta > 6) return;
                e.stopPropagation();
                onSelect?.(space.id);
              }
            : undefined
        }
      >
        <boxGeometry args={[TILE, 0.16, TILE]} />
        <meshStandardMaterial color={state === 'idle' ? '#f2e0bd' : '#fff3d8'} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.162, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TILE * 0.97, TILE * 0.97]} />
        <meshStandardMaterial map={face} roughness={0.92} />
      </mesh>
      {owner !== null && <House color={OWNER_COLOR[owner]} />}
    </group>
  );
}

/* --------------------------------- декор --------------------------------- */

function Palm({ position, tilt = 0.12, scale = 1 }: { position: V3; tilt?: number; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <group rotation={[0, 0, tilt]}>
        <mesh castShadow position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.05, 0.1, 0.9, 7]} />
          <meshStandardMaterial color="#8a5a34" roughness={0.85} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <group key={i} position={[0, 0.92, 0]} rotation={[0, (i * Math.PI) / 3, 0]}>
            <mesh castShadow position={[0.26, 0.02, 0]} rotation={[0, 0, -1.05]}>
              <coneGeometry args={[0.12, 0.6, 4]} />
              <meshStandardMaterial color="#3fae72" roughness={0.75} />
            </mesh>
          </group>
        ))}
        <mesh castShadow position={[0.1, 0.88, 0.06]}>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial color="#5b3a1c" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

function Pool({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.1, 0]}>
        <cylinderGeometry args={[1.0, 1.0, 0.2, 26]} />
        <meshStandardMaterial color="#efe0c0" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.205, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.84, 26]} />
        <meshStandardMaterial color="#4fc3dd" roughness={0.12} metalness={0.35} />
      </mesh>
      <mesh position={[0.3, 0.212, 0.24]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.14, 12]} />
        <meshStandardMaterial color="#d8f6ff" roughness={0.08} transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

function Cabana({ position }: { position: V3 }) {
  const roof = useTex(() => stripes('#ff4d8d', '#ffb93b', 8), []);
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[1.0, 0.6, 0.8]} />
        <meshStandardMaterial color="#fff6e4" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.8, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.86, 0.5, 4]} />
        <meshStandardMaterial map={roof} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.26, 0.405]}>
        <planeGeometry args={[0.4, 0.44]} />
        <meshStandardMaterial color="#a5683c" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Umbrella({ position }: { position: V3 }) {
  const canopy = useTex(() => stripes('#ff4d8d', '#fff6e4', 10), []);
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 1.1, 8]} />
        <meshStandardMaterial color="#8a5a34" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 1.16, 0]}>
        <coneGeometry args={[0.62, 0.34, 12, 1, true]} />
        <meshStandardMaterial map={canopy} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.38, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#ffb93b" roughness={0.4} />
      </mesh>
    </group>
  );
}

function Torch({ position }: { position: V3 }) {
  const flame = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!flame.current) return;
    const k = 1 + Math.sin(s.clock.elapsedTime * 6 + position[0]) * 0.14;
    flame.current.scale.setScalar(k);
  });
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.03, 0.05, 0.84, 7]} />
        <meshStandardMaterial color="#4a2f22" roughness={0.9} />
      </mesh>
      <mesh ref={flame} position={[0, 0.92, 0]}>
        <sphereGeometry args={[0.1, 10, 10]} />
        <meshStandardMaterial
          color="#ff8f3b"
          emissive="#ffb93b"
          emissiveIntensity={2.4}
          roughness={0.4}
        />
      </mesh>
    </group>
  );
}

function Sign({ text }: { text: string }) {
  const face = useTex(() => signFace(text), [text]);
  const materials = useMemo(() => {
    const edge = new THREE.MeshStandardMaterial({ color: '#ff4d8d', roughness: 0.5 });
    const front = new THREE.MeshStandardMaterial({ map: face, roughness: 0.45 });
    /** Табличка двусторонняя: камера облетает поле, и сзади неё должен быть логотип, а не глухая стена. */
    return [edge, edge, edge, edge, front, front];
  }, [face]);
  useEffect(
    () => () => {
      new Set(materials).forEach((m) => m.dispose());
    },
    [materials],
  );
  return (
    <group position={[0, 0, -2.05]}>
      <mesh castShadow position={[0, 1.12, 0]} material={materials}>
        <boxGeometry args={[2.5, 0.95, 0.14]} />
      </mesh>
      {[-0.92, 0.92].map((x) => (
        <mesh key={x} castShadow position={[x, 0.32, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.66, 8]} />
          <meshStandardMaterial color="#8a5a34" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function CheckerPath({ position }: { position: V3 }) {
  const t = useTex(checker, []);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0.35]} receiveShadow>
      <planeGeometry args={[1.5, 0.75]} />
      <meshStandardMaterial map={t} roughness={0.9} />
    </mesh>
  );
}

function Hub({ brand }: { brand: string }) {
  return (
    <group>
      <Sign text={brand} />
      <Pool position={[-1.75, 0, 1.35]} />
      <Cabana position={[1.8, 0, 0.75]} />
      <Umbrella position={[2.35, 0, 2.25]} />
      <Palm position={[-2.55, 0, -0.85]} />
      <Palm position={[2.55, 0, -1.35]} tilt={-0.14} scale={0.85} />
      <Palm position={[-2.35, 0, 2.55]} tilt={0.08} scale={0.7} />
      <Torch position={[-2.8, 0, 0.35]} />
      <Torch position={[0.55, 0, -2.7]} />
      <CheckerPath position={[1.5, 0.02, -2.45]} />
    </group>
  );
}

/* --------------------------------- фишки --------------------------------- */

/**
 * Живая позиция бегущей фишки на кольце: пишет её сама фишка, читает камера,
 * чтобы обходить поле следом за ней, а не прыгать к клетке прибытия.
 */
const pawnRing = { current: 0 };

function Pawn({
  pos,
  color,
  offset,
  lift = 0,
  track = false,
  onSettled,
}: {
  pos: number;
  color: string;
  offset: number;
  lift?: number;
  track?: boolean;
  onSettled?: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const current = useRef(pos);
  const remain = useRef(0);
  const walking = useRef(false);
  const height = useRef(TILE_TOP);

  useEffect(() => {
    const shown = ((current.current % SPACE_COUNT) + SPACE_COUNT) % SPACE_COUNT;
    const left = (pos - Math.round(shown) + SPACE_COUNT) % SPACE_COUNT;
    remain.current = left;
    if (left > 0.001) walking.current = true;
  }, [pos]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (remain.current > 0.001) {
      const stepAmt = Math.min((dt * 1000) / WALK_STEP_MS, remain.current);
      current.current += stepAmt;
      remain.current -= stepAmt;
      if (remain.current <= 0.001 && walking.current) {
        walking.current = false;
        onSettled?.();
      }
    }
    const idx = ((current.current % SPACE_COUNT) + SPACE_COUNT) % SPACE_COUNT;
    if (track) pawnRing.current = idx;
    const [x, z] = ringPoint(idx);
    /** Смещение по плитке: вдоль улицы — чтобы две фишки не сливались, наружу — чтобы фишка не легла на название улицы. */
    const yaw = tileYaw(...CELL_XZ[Math.round(idx) % SPACE_COUNT]);
    const ox = Math.sin(yaw);
    const oz = Math.cos(yaw);
    const hop = remain.current > 0.001 ? Math.abs(Math.sin(idx * Math.PI)) * 0.16 : 0;
    height.current = damp(height.current, TILE_TOP + lift + hop, 10, dt);
    g.position.set(
      x + ox * OUT_SET + Math.cos(yaw) * offset,
      height.current,
      z + oz * OUT_SET - Math.sin(yaw) * offset,
    );
  });

  return (
    <group ref={group}>
      <mesh castShadow position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.24, 0.27, 0.06, 16]} />
        <meshStandardMaterial color="#4b2454" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.1, 0.2, 0.44, 14]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh castShadow position={[0, 0.58, 0]}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.15} />
      </mesh>
    </group>
  );
}

function Tokens({
  players,
  liftedIndex,
  activeId,
  onArrive,
}: {
  players: [PlayerState, PlayerState];
  liftedIndex?: number;
  activeId?: 0 | 1;
  onArrive?: () => void;
}) {
  return (
    <>
      {players.map((p) => (
        <Pawn
          key={p.id}
          pos={p.pos}
          color={OWNER_COLOR[p.id]}
          offset={p.id === 0 ? -0.3 : 0.3}
          lift={liftedIndex === p.pos ? TILE_LIFT : 0}
          track={p.id === activeId}
          onSettled={onArrive}
        />
      ))}
    </>
  );
}

/* -------------------------------- кубики -------------------------------- */

const DIE_ORDER = [3, 4, 1, 6, 2, 5];
let dieMaterials: THREE.MeshStandardMaterial[] | null = null;

function getDieMaterials() {
  if (!dieMaterials) {
    dieMaterials = DIE_ORDER.map(
      (v) =>
        new THREE.MeshStandardMaterial({ map: toTexture(diceFace(v)), roughness: 0.32, metalness: 0.05 }),
    );
  }
  return dieMaterials;
}

const FACE_ROT: Record<number, THREE.Euler> = {
  1: new THREE.Euler(0, 0, 0),
  2: new THREE.Euler(-Math.PI / 2, 0, 0),
  3: new THREE.Euler(0, 0, Math.PI / 2),
  4: new THREE.Euler(0, 0, -Math.PI / 2),
  5: new THREE.Euler(Math.PI / 2, 0, 0),
  6: new THREE.Euler(Math.PI, 0, 0),
};

function Die({
  value,
  rolling,
  position,
  seed,
  dir,
}: {
  value: number;
  rolling: boolean;
  position: V3;
  seed: number;
  dir: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const materials = getDieMaterials();
  const spin = useMemo(() => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, 1.1, 0.4));
    return q;
  }, []);
  const target = useMemo(() => new THREE.Quaternion(), []);
  const thrownAt = useRef(0);
  const inFlight = useRef(false);

  useFrame((s, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (rolling) {
      if (!inFlight.current) {
        inFlight.current = true;
        thrownAt.current = s.clock.elapsedTime;
      }
      const t = s.clock.elapsedTime - thrownAt.current;
      const rest = Math.max(0, 1 - (t * 1000) / DICE_ROLL_MS);
      m.quaternion.multiply(spin);
      m.position.x = position[0] + dir * (0.24 + rest * 0.55) * Math.sin(t * 5.2 + seed);
      m.position.z = position[2] + dir * rest * 0.5 * Math.cos(t * 4.1 + seed);
      m.position.y = position[1] + 0.22 + Math.abs(Math.sin(t * 9 + seed)) * (0.12 + rest * 0.5);
    } else {
      inFlight.current = false;
      target.setFromEuler(FACE_ROT[value || 1]);
      m.quaternion.slerp(target, 1 - Math.pow(0.0015, dt));
      m.position.x = damp(m.position.x, position[0], 8, dt);
      m.position.z = damp(m.position.z, position[2], 8, dt);
      m.position.y = damp(m.position.y, position[1], 8, dt);
    }
  });

  return (
    <mesh ref={mesh} castShadow position={position} material={materials}>
      <boxGeometry args={[0.46, 0.46, 0.46]} />
    </mesh>
  );
}

function Dice({ dice, rolling }: { dice: [number, number] | null; rolling: boolean }) {
  return (
    <group>
      <Die value={dice?.[0] ?? 1} rolling={rolling} position={[-0.42, 0.42, 2.5]} seed={0} dir={-1} />
      <Die value={dice?.[1] ?? 1} rolling={rolling} position={[0.42, 0.42, 2.6]} seed={2.1} dir={1} />
    </group>
  );
}

/* -------------------------------- камера -------------------------------- */

const HOME_TARGET: V3 = [0, -0.4, 0];
/** Стартовая дистанция обзора: [0, 9.4, 14.6] относительно HOME_TARGET. */
const HOME_DIST = 17.6;
/** Крупный план клетки: фишка у ближнего к камере края, весь центр поля за ней. */
const CELL_DIST = 11;
/** Кубики прыгают в центре поля — на время броска камера работает на них. */
const DICE_TARGET: V3 = [0, 0.45, 2.55];
const DICE_DIST = 7.4;
const HOME_AZ = 0;
const TAU = Math.PI * 2;

/** Кратчайшая дуга между азимутами: иначе на уровне ±π камера прыгает через всё поле. */
function angleTo(from: number, to: number) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Камера идёт за фазой хода: прыгают кубики — крупно кубики; фишка бежит —
 * облетаем поле следом за ней, чтобы она всегда была со стороны камеры
 * и ни одна декорация её не закрыла. В остальное время поле целиком ваше.
 */
function CameraRig({ track, rolling }: { track: boolean; rolling: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const offset = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    if (!controls) return;
    const t = controls.target;

    let wantTarget = HOME_TARGET;
    let wantDist = HOME_DIST;
    let wantAz: number | null = null;
    if (rolling) {
      wantTarget = DICE_TARGET;
      wantDist = DICE_DIST;
      wantAz = HOME_AZ;
    } else if (track) {
      const [x, z] = ringPoint(pawnRing.current);
      wantTarget = [x, TILE_TOP + 0.1, z];
      wantDist = CELL_DIST;
      wantAz = Math.atan2(x, z);
    }

    const k = 3.4;
    t.x = damp(t.x, wantTarget[0], k, dt);
    t.y = damp(t.y, wantTarget[1], k, dt);
    t.z = damp(t.z, wantTarget[2], k, dt);

    offset.copy(camera.position).sub(t);
    const len = damp(offset.length(), wantDist, k, dt);
    /** Насколько высоко смотреть — остаётся за зрителем: полярный угол не трогаем. */
    const polar = Math.acos(THREE.MathUtils.clamp(offset.y / Math.max(offset.length(), 1e-4), -1, 1));
    let az = Math.atan2(offset.x, offset.z);
    if (wantAz !== null) az += angleTo(az, wantAz) * (1 - Math.exp(-4.2 * dt));
    const sp = Math.sin(polar);
    camera.position.set(
      t.x + len * sp * Math.sin(az),
      t.y + len * Math.cos(polar),
      t.z + len * sp * Math.cos(az),
    );
    controls.update();
  });

  return null;
}

/* -------------------------------- сцена --------------------------------- */

export interface SceneProps {
  owners?: Partial<Record<SpaceId, 0 | 1>>;
  players?: [PlayerState, PlayerState];
  currentIndex?: number;
  selectedId?: SpaceId;
  dice?: [number, number] | null;
  rolling?: boolean;
  /** Фишка дошла до клетки и кубики успокоились — можно открывать карточку. */
  onArrive?: () => void;
  /** Камера в игре: undefined — лендинг (не трогаем), false — поле целиком, true — вести фишку. */
  track?: boolean;
  /** Чья фишка сейчас ходит: камера облетает поле следом за ней. */
  activeId?: 0 | 1;
  interactive?: boolean;
  onSelect?: (id: SpaceId) => void;
  brand: string;
}

export function BoardScene({
  owners = {},
  players,
  currentIndex,
  selectedId,
  dice,
  rolling = false,
  onArrive,
  track,
  activeId,
  interactive,
  onSelect,
  brand,
}: SceneProps) {
  const arriveCb = useRef(onArrive);
  arriveCb.current = onArrive;
  const beat = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (beat.current !== null) clearTimeout(beat.current);
    },
    [],
  );

  const handleArrive = useCallback(() => {
    if (beat.current !== null) clearTimeout(beat.current);
    beat.current = window.setTimeout(() => {
      beat.current = null;
      arriveCb.current?.();
    }, ARRIVE_BEAT_MS);
  }, []);

  return (
    <>
      <hemisphereLight args={['#ffe6c2', '#2a1230', 0.8]} />
      <ambientLight intensity={0.32} />
      <directionalLight
        castShadow
        position={[6.5, 9.5, 5.5]}
        intensity={1.6}
        color="#fff2dd"
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-far={30}
        shadow-bias={-0.0014}
      />
      <directionalLight position={[-7, 4.5, -5]} intensity={0.6} color="#ff8fb0" />
      <directionalLight position={[0, 3, 8]} intensity={0.35} color="#9a6bff" />

      <BoardBase />
      {BOARD.map((space, i) => (
        <Tile
          key={space.id}
          index={i}
          space={space}
          owner={owners[space.id] ?? null}
          state={
            currentIndex === i ? 'current' : selectedId === space.id ? 'selected' : 'idle'
          }
          interactive={interactive}
          onSelect={onSelect}
        />
      ))}
      <Hub brand={brand} />
      {players && (
        <Tokens
          players={players}
          liftedIndex={currentIndex}
          activeId={activeId}
          onArrive={onArrive && handleArrive}
        />
      )}
      {dice && <Dice dice={dice} rolling={rolling} />}
      {track === undefined ? null : <CameraRig track={track} rolling={rolling} />}
    </>
  );
}
