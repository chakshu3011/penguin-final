import "./App.css";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { XR, ARButton, Interactive, useHitTest, useXR } from "@react-three/xr";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense } from "react";
import * as THREE from "three";

function XRTracker({ onXRStart }) {
  const { isPresenting } = useXR();
  useEffect(() => {
    onXRStart(isPresenting);
  }, [isPresenting, onXRStart]);
  return null;
}

const getRandomSpawnPosition = () => {
  const angle = Math.random() * Math.PI * 2;
  const radius = 0.5 + Math.random() * 0.6; // Stays safely within the expanded ice floe radius
  return [Math.cos(angle) * radius, 0.05, Math.sin(angle) * radius];
};

const getRandomItemType = () => {
  const random = Math.random();
  if (random < 0.60) return "fish";    // 60% Occurrence
  if (random < 0.95) return "krill";   // 35% Occurrence
  return "plastic";                    // Exactly 5% Occurrence
};

// ==========================================
// 1. SNOW PARTICLE SYSTEM
// ==========================================
function IceParticles({ trigger }) {
  const pointsRef = useRef();
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (!trigger.id) return;
    
    const count = 15;
    const temp = [];
    for (let i = 0; i < count; i++) {
      temp.push({
        pos: [...trigger.pos],
        vel: [
          (Math.random() - 0.5) * 0.5,
          Math.random() * 0.6 + 0.2, 
          (Math.random() - 0.5) * 0.5
        ],
        life: 1.0 
      });
    }
    setParticles(temp);
  }, [trigger]);

  useFrame((state, delta) => {
    if (!pointsRef.current || particles.length === 0) return;

    const positions = [];
    const updated = particles
      .map((p) => {
        p.pos[0] += p.vel[0] * delta;
        p.pos[1] += p.vel[1] * delta;
        p.pos[2] += p.vel[2] * delta;
        p.vel[1] -= 0.98 * delta; 
        p.life -= delta * 2.0;
        return p;
      })
      .filter((p) => p.life > 0);

    if (updated.length !== particles.length) {
      setParticles(updated);
    }

    updated.forEach((p) => positions.push(...p.pos));
    pointsRef.current.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
  });

  if (particles.length === 0) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry />
      <pointsMaterial color="#e0f2fe" size={0.04} transparent opacity={0.8} />
    </points>
  );
}

// ==========================================
// 2. TARGET RETICLE
// ==========================================
function Reticle({ onPlace }) {
  const reticleRef = useRef();
  const { camera } = useThree();

  useHitTest((hitMatrix, hit) => {
    if (hit) {
      hitMatrix.decompose(
        reticleRef.current.position,
        reticleRef.current.quaternion,
        reticleRef.current.scale
      );
    }
  });

  return (
    <Interactive onSelect={() => {
      const spawnPos = reticleRef.current.position.clone();
      const dirX = spawnPos.x - camera.position.x;
      const dirZ = spawnPos.z - camera.position.z;
      const distance = Math.sqrt(dirX * dirX + dirZ * dirZ);

      if (distance < 1.4) {
        const push = 1.4 - distance;
        spawnPos.x += (dirX / distance) * push;
        spawnPos.z += (dirZ / distance) * push;
      }

      onPlace(spawnPos);
    }}>
      <mesh ref={reticleRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.2, 32]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </Interactive>
  );
}

// ==========================================
// 3. ENVIRONMENT & MODELS
// ==========================================
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb");
useGLTF.preload("/models/krill_antartic.glb");
useGLTF.preload("/models/plastic_water_bottle.glb");
useGLTF.preload("/models/ice_floe.glb");

function IceFloe() {
  const ice = useGLTF("/models/ice_floe.glb");
  return (
    <primitive 
      object={ice.scene} 
      scale={0.035} 
      position={[0, -0.01, 0]} 
    />
  );
}

function Penguin() {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");
  const { actions, names } = useAnimations(penguin.animations, group);

  useEffect(() => {
    if (names && names.length > 0) {
      const activeAction = actions[names[0]];
      activeAction.reset().fadeIn(0.25).play();
    }
  }, [actions, names]);

  return <primitive ref={group} object={penguin.scene} scale={0.4} position={[0, 0, 0]} />;
}

// Fixed: Controlled purely via visibility parameters to stop cache crashes
function FishModel({ visible }) {
  const group = useRef();
  const { scene, animations } = useGLTF("/models/fish.glb");
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    if (names && names.length > 0 && actions[names[0]]) {
      actions[names[0]].reset().play();
    }
  }, [actions, names]);

  return (
    <group ref={group} visible={visible}>
      <primitive object={scene} scale={0.004} position={[0, 0.1, 0]} dispose={null} />
    </group>
  );
}

function KrillModel({ visible }) {
  const group = useRef();
  const { scene, animations } = useGLTF("/models/krill_antartic.glb");
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    if (names && names.length > 0 && actions[names[0]]) {
      actions[names[0]].reset().play();
    }
  }, [actions, names]);

  return (
    <group ref={group} visible={visible}>
      <primitive object={scene} scale={0.0075} position={[0, 0.05, 0]} dispose={null} />
    </group>
  );
}

function PlasticModel({ visible }) {
  const { scene } = useGLTF("/models/plastic_water_bottle.glb");
  return (
    <group visible={visible}>
      <primitive object={scene} scale={0.15} position={[0, 0.05, 0]} dispose={null} />
    </group>
  );
}

function GameItem({ item, onCollect }) {
  const ref = useRef();

  useFrame(() => {
    if (ref.current) ref.current.rotation.y += 0.02;
  });

  return (
    <Interactive onSelect={onCollect}>
      <group ref={ref} position={item.position}>
        {/* All items remain mounted, avoiding unmount disposal errors entirely */}
        <FishModel visible={item.type === "fish"} />
        <KrillModel visible={item.type === "krill"} />
        <PlasticModel visible={item.type === "plastic"} />
      </group>
    </Interactive>
  );
}

// ==========================================
// 4. MAIN GAME ENGINE
// ==========================================
export default function App() {
  const [isARActive, setIsARActive] = useState(false);
  const [overlayElement, setOverlayElement] = useState(null);
  const [gamePosition, setGamePosition] = useState(null);
  
  const [currentItem, setCurrentItem] = useState({ 
    type: "fish", 
    position: [0.4, 0.05, 0.4],
    id: Date.now()
  });
  const [particleTrigger, setParticleTrigger] = useState({ id: null, pos: [0, 0, 0] });

  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60); 
  const [isGameOver, setIsGameOver] = useState(false);

  const ambience = useRef(null);
  const collect = useRef(null);
  const footsteps = useRef(null);
  const penguinChirp = useRef(null);

  useEffect(() => {
    ambience.current = new Audio("/audios/antarctic_ambience.mp3");
    ambience.current.loop = true;
    ambience.current.volume = 0.3;

    collect.current = new Audio("/audios/fish_collect.mp3");
    footsteps.current = new Audio("/audios/snow_footsteps.mp3");
    footsteps.current.volume = 0.5;

    penguinChirp.current = new Audio("/audios/baby_penguin.mp3");
    penguinChirp.current.volume = 1.0;

    return () => {
      if (ambience.current) ambience.current.pause();
      if (footsteps.current) footsteps.current.pause();
      if (penguinChirp.current) penguinChirp.current.pause();
    };
  }, []);

  useEffect(() => {
    let timer;
    if (gamePosition && timeLeft > 0 && !isGameOver) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && !isGameOver) {
      setIsGameOver(true);
      if (penguinChirp.current) {
        penguinChirp.current.currentTime = 0;
        penguinChirp.current.play().catch((e) => console.log(e));
      }
    }
    return () => clearInterval(timer);
  }, [gamePosition, timeLeft, isGameOver]);

  const collectItem = () => {
    if (isGameOver) return;

    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }

    setParticleTrigger({ id: Date.now(), pos: [...currentItem.position] });

    if (currentItem.type === "plastic") {
      setScore((s) => Math.max(0, s - 2)); 
    } else {
      setScore((s) => s + 1);
    }

    if (collect.current) {
      collect.current.currentTime = 0;
      collect.current.play().catch((e) => console.log(e));
    }
    if (footsteps.current) {
      footsteps.current.currentTime = 0;
      footsteps.current.play().catch((e) => console.log(e));
    }

    setCurrentItem({
      type: getRandomItemType(),
      position: getRandomSpawnPosition(),
      id: Date.now()
    });
  };

  const stopGame = () => {
    if (ambience.current) ambience.current.pause();
    window.location.reload();
  };

  const getEndMessage = () => {
    if (score === 0) return "ICY is sad and starving! 😭";
    if (score <= 3) return "ICY survived, but is still hungry! 🐟";
    if (score <= 7) return "ICY is well-fed and happy! 🐧";
    return "ICY is stuffed and ready to dance! 🎉";
  };

  return (
    <div style={{ width: "100vw", height: "100dvh", overflow: "hidden", position: "relative", backgroundColor: "#0b0f19" }}>

      {/* INTRO PAGE */}
      {!isARActive && (
        <div style={{ position: "absolute", zIndex: 5, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "20vh", color: "white" }}>
          <h1 style={{ fontSize: "40px", marginBottom: "10px" }}>ICY AR</h1>
          <p style={{ fontSize: "18px", opacity: 0.8 }}>An Augmented Reality Experience</p>
        </div>
      )}

      {/* AR HUD VIEW */}
      <div ref={setOverlayElement} style={{ position: "absolute", zIndex: 10, width: "100%", height: "100%", pointerEvents: "none", display: isARActive ? "flex" : "none", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "20px", width: "100%", boxSizing: "border-box" }}>
          <div style={{ color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
            Score: {score}
          </div>
          {gamePosition && !isGameOver && (
            <div style={{ color: timeLeft <= 5 ? "#e11d48" : "white", fontSize: "28px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
              00:{timeLeft.toString().padStart(2, '0')}
            </div>
          )}
          <button onClick={stopGame} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: "bold", borderRadius: "20px", border: "2px solid white", background: "#e11d48", color: "white", pointerEvents: "auto", cursor: "pointer", maxHeight: "40px" }}>
            Exit AR
          </button>
        </div>

        {!gamePosition && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", background: "rgba(0,0,0,0.5)", padding: "10px 20px", borderRadius: "10px" }}>
            Scan the floor and tap the ring to place ICY!
          </div>
        )}

        {isGameOver && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", zIndex: 50, color: "white", textAlign: "center", padding: "20px", pointerEvents: "auto" }}>
            <h1 style={{ fontSize: "45px", marginBottom: "10px", textShadow: "2px 2px 10px rgba(0,0,0,1)", color: "#10b981" }}>TIME'S UP!</h1>
            <p style={{ fontSize: "22px", marginBottom: "10px" }}>Your final score is <b>{score}</b>!</p>
            <p style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "40px", color: "#60a5fa" }}>{getEndMessage()}</p>
            <button onClick={stopGame} style={{ padding: "15px 35px", fontSize: "18px", fontWeight: "bold", borderRadius: "30px", border: "none", background: "#2B4BAA", color: "white", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.5)" }}>
              Play Again
            </button>
          </div>
        )}
      </div>

      {overlayElement && (
        <ARButton
          sessionInit={{ requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay"], domOverlay: { root: overlayElement } }}
          onClick={() => { if (ambience.current) ambience.current.play().catch(e => console.log(e)); }}
          style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', padding: '14px 28px', fontSize: '16px', fontWeight: 'bold', borderRadius: '30px', border: 'none', background: 'white', color: 'black', cursor: 'pointer', zIndex: 20 }}
        />
      )}

      <Canvas style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <XR>
          <XRTracker onXRStart={setIsARActive} />
          {isARActive && (
            <>
              <ambientLight intensity={2.5} />
              {!gamePosition ? (
                <Reticle onPlace={setGamePosition} />
              ) : (
                <Suspense fallback={null}>
                  <group position={gamePosition}>
                    <IceFloe />
                    <Penguin />
                    
                    {!isGameOver && (
                      <GameItem 
                        item={currentItem} 
                        onCollect={collectItem} 
                      />
                    )}
                    
                    <IceParticles trigger={particleTrigger} />
                  </group>
                </Suspense>
              )}
            </>
          )}
        </XR>
      </Canvas>
    </div>
  );
}