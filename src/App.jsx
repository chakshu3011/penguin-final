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
  const radius = 0.5 + Math.random() * 0.6; // 0.5m to 1.1m
  return [Math.cos(angle) * radius, 0.05, Math.sin(angle) * radius];
};

// FIX: Updated Weighted probability spawn (65 / 30 / 10)
const getRandomItemType = () => {
  const rand = Math.random() * 105; // Total weight of 105
  if (rand < 65) return "fish";     // 65% chance
  if (rand < 95) return "squid";    // 30% chance
  return "plastic";                 // 10% chance
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
// 2. RETICLE TARGET
// ==========================================
function Reticle({ onPlace }) {
  const reticleRef = useRef();
  const { camera } = useThree();

  useHitTest((hitMatrix, hit) => {
    if (hit && reticleRef.current) {
      hitMatrix.decompose(
        reticleRef.current.position,
        reticleRef.current.quaternion,
        reticleRef.current.scale
      );
    }
  });

  return (
    <Interactive onSelect={() => {
      if (!reticleRef.current) return;
      
      const spawnPos = reticleRef.current.position.clone();
      const dirX = spawnPos.x - camera.position.x;
      const dirZ = spawnPos.z - camera.position.z;
      const distance = Math.sqrt(dirX * dirX + dirZ * dirZ);

      if (distance < 1.4) {
        const push = 1.4 - distance;
        spawnPos.x += (dirX / distance) * push;
        spawnPos.z += (dirZ / distance) * push;
      }

      spawnPos.y = camera.position.y - 0.3; // Locked to chest level
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
useGLTF.preload("/models/squid.glb");
useGLTF.preload("/models/plastic.glb");
useGLTF.preload("/models/ice_floe.glb");

function IceFloe() {
  const ice = useGLTF("/models/ice_floe.glb");
  return <primitive object={ice.scene} scale={0.1} position={[0, -0.01, 0]} />;
}

function Penguin({ walkTarget }) {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");
  const { actions, names } = useAnimations(penguin.animations, group);

  useEffect(() => {
    if (names && names.length > 0) {
      const activeAction = actions[names[0]];
      activeAction.reset().fadeIn(0.25).play();
    }
  }, [actions, names]);

  useFrame((state, delta) => {
    if (!group.current || !walkTarget) return;
    
    const target = new THREE.Vector3(walkTarget[0], 0, walkTarget[2]);
    const currentPos = group.current.position;
    const distance = currentPos.distanceTo(target);

    if (distance > 0.05) {
      const dir = new THREE.Vector3().subVectors(target, currentPos).normalize();
      
      const invertedTarget = new THREE.Vector3().copy(currentPos).sub(dir);
      const targetRotation = new THREE.Matrix4().lookAt(currentPos, invertedTarget, new THREE.Vector3(0, 1, 0));
      const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(targetRotation);
      
      group.current.quaternion.slerp(targetQuaternion, delta * 8); 
      group.current.position.add(dir.multiplyScalar(0.4 * delta)); 
    }
  });

  return <primitive ref={group} object={penguin.scene} scale={0.4} position={[0, 0, 0]} />;
}

function Fish({ position, onCollect }) {
  const group = useRef();
  const fish = useGLTF("/models/fish.glb");
  const { actions, names } = useAnimations(fish.animations, group);

  useEffect(() => {
    if (names && names.length > 0) {
      const activeAction = actions[names[0]];
      activeAction.reset().fadeIn(0.25).play();
    }
  }, [actions, names]);

  useFrame(() => { if (group.current) group.current.rotation.y += 0.02; });
  
  return (
    <Interactive onSelect={onCollect}>
      <group ref={group} position={position}>
        <primitive object={fish.scene} scale={0.015} position={[0, 0.05, 0]} />
      </group>
    </Interactive>
  );
}

function Squid({ position, onCollect }) {
  const group = useRef();
  const squid = useGLTF("/models/squid.glb");
  const { actions, names } = useAnimations(squid.animations, group);

  useEffect(() => {
    if (names && names.length > 0) {
      const activeAction = actions[names[0]];
      activeAction.reset().fadeIn(0.25).play();
    }
  }, [actions, names]);

  useFrame(() => { if (group.current) group.current.rotation.y += 0.02; });
  
  return (
    <Interactive onSelect={onCollect}>
      <group ref={group} position={position}>
        <primitive object={squid.scene} scale={0.015} position={[0, 0.05, 0]} />
      </group>
    </Interactive>
  );
}

function Plastic({ position, onCollect }) {
  const ref = useRef();
  const plastic = useGLTF("/models/plastic.glb");
  useFrame(() => { if (ref.current) ref.current.rotation.y += 0.02; });
  return (
    <Interactive onSelect={onCollect}>
      <group ref={ref} position={position}>
        <primitive object={plastic.scene} scale={0.015} position={[0, 0.05, 0]} />
      </group>
    </Interactive>
  );
}

// ==========================================
// 4. MAIN GAME CONTROLLER
// ==========================================
export default function App() {
  const [isARActive, setIsARActive] = useState(false);
  const [overlayElement, setOverlayElement] = useState(null);
  const [gamePosition, setGamePosition] = useState(null);
  
  // FIX: Added showThanks state for the new Close button feature
  const [showThanks, setShowThanks] = useState(false);

  const [currentItem, setCurrentItem] = useState("fish");
  const [itemPosition, setItemPosition] = useState([0.6, 0.05, 0.6]); 
  const [penguinWalkTarget, setPenguinWalkTarget] = useState([0, 0, 0]); 
  
  const [particleTrigger, setParticleTrigger] = useState({ id: null, pos: [0, 0, 0] });

  const [score, setScore] = useState(0);
  const [fishCount, setFishCount] = useState(0);
  const [squidCount, setSquidCount] = useState(0);
  
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameStatus, setGameStatus] = useState("playing");

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

  // Main Timer Countdown
  useEffect(() => {
    let timer;
    if (gamePosition && timeLeft > 0 && gameStatus === "playing") {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && gameStatus === "playing") {
      setGameStatus("timeup");
      if (penguinChirp.current) {
        penguinChirp.current.currentTime = 0;
        penguinChirp.current.play().catch((e) => console.log(e));
      }
    }
    return () => clearInterval(timer);
  }, [gamePosition, timeLeft, gameStatus]);

  // Safely despawn plastic after 5 seconds if untouched
  useEffect(() => {
    let plasticTimeout;
    if (gameStatus === "playing" && currentItem === "plastic") {
      plasticTimeout = setTimeout(() => {
        setItemPosition(getRandomSpawnPosition());
        setCurrentItem(getRandomItemType());
      }, 5000);
    }
    
    // Cleanup ensures if the user taps it, the timeout doesn't fire later
    return () => clearTimeout(plasticTimeout);
  }, [currentItem, gameStatus]);

  const collectItem = () => {
    if (gameStatus !== "playing") return;

    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }

    setParticleTrigger({ id: Date.now(), pos: [...itemPosition] });

    if (collect.current) {
      collect.current.currentTime = 0;
      collect.current.play().catch((e) => console.log(e));
    }
    if (footsteps.current) {
      footsteps.current.currentTime = 0;
      footsteps.current.play().catch((e) => console.log(e));
    }

    setPenguinWalkTarget([...itemPosition]);

    if (currentItem === "plastic") {
      setGameStatus("lose");
      if (penguinChirp.current) {
        penguinChirp.current.currentTime = 0;
        penguinChirp.current.play().catch((e) => console.log(e));
      }
      return; 
    } else if (currentItem === "fish") {
      const newFishCount = fishCount + 1;
      setFishCount(newFishCount);
      setScore((s) => s + 1); 
      if (newFishCount >= 10) {
        setGameStatus("win");
        return;
      }
    } else if (currentItem === "squid") {
      const newSquidCount = squidCount + 1;
      setSquidCount(newSquidCount);
      setScore((s) => s + 2); 
      if (newSquidCount >= 5) {
        setGameStatus("win");
        return;
      }
    }

    setItemPosition(getRandomSpawnPosition());
    setCurrentItem(getRandomItemType());
  };

  const stopGame = () => {
    if (ambience.current) ambience.current.pause();
    window.location.reload();
  };

  const getEndScreenData = () => {
    if (gameStatus === "win") return { title: "YOU WIN!", color: "#10b981", msg: "ICY is stuffed and happy! 🎉" };
    if (gameStatus === "lose") return { title: "GAME OVER", color: "#e11d48", msg: "Oh no! ICY ate plastic! 😭" };
    if (gameStatus === "timeup") return { title: "TIME'S UP!", color: "#f59e0b", msg: "ICY survived, but is still hungry! 🐟" };
    return { title: "", color: "", msg: "" };
  };

  const endData = getEndScreenData();

  return (
    <div style={{ width: "100vw", height: "100dvh", overflow: "hidden", position: "relative", backgroundColor: "#0b0f19" }}>
      
      {!isARActive && !showThanks && (
        <div style={{ position: "absolute", zIndex: 5, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "20vh", color: "white", fontFamily: "sans-serif" }}>
          <h1 style={{ fontSize: "42px", letterSpacing: "2px", marginBottom: "10px" }}>ICY AR</h1>
          <p style={{ fontSize: "18px", opacity: 0.8 }}>An Augmented Reality Experience</p>
          
          <div style={{ marginTop: "40px", padding: "20px", background: "rgba(255,255,255,0.1)", borderRadius: "15px", border: "1px solid rgba(255,255,255,0.3)", textAlign: "center", width: "80%", maxWidth: "350px" }}>
            <h3 style={{ margin: "0 0 10px 0", color: "#60a5fa" }}>How to Play</h3>
            <p style={{ margin: "5px 0", fontSize: "15px" }}>🐟 Collect <b>10 Fish</b> OR</p>
            <p style={{ margin: "5px 0", fontSize: "15px" }}>🦑 Collect <b>5 Squid</b> to win!</p>
            <hr style={{ border: "0.5px solid rgba(255,255,255,0.2)", margin: "10px 0" }} />
            <p style={{ margin: "5px 0", fontSize: "15px", color: "#fb7185" }}>⚠️ <b>AVOID PLASTIC!</b></p>
            <p style={{ margin: "0", fontSize: "13px", opacity: 0.7 }}>(If plastic appears, wait 5s for it to vanish)</p>
          </div>
        </div>
      )}

      <div ref={setOverlayElement} style={{ position: "absolute", zIndex: 10, width: "100%", height: "100%", pointerEvents: "none", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        {isARActive && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "20px", width: "100%", boxSizing: "border-box" }}>
              <div style={{ color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
                Score: {score}
              </div>
              {gamePosition && gameStatus === "playing" && (
                <div style={{ color: timeLeft <= 5 ? "#e11d48" : "white", fontSize: "28px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
                  00:{timeLeft.toString().padStart(2, '0')}
                </div>
              )}
              <button onClick={stopGame} style={{ padding: "10px 20px", fontSize: "14px", fontWeight: "bold", borderRadius: "20px", border: "2px solid white", background: "#e11d48", color: "white", pointerEvents: "auto", cursor: "pointer", maxHeight: "40px" }}>
                Exit AR
              </button>
            </div>

            {!gamePosition && (
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.2)", padding: "14px 24px", borderRadius: "30px", width: "80%" }}>
                Aim at a surface and tap the ring to spawn ICY!
              </div>
            )}

            {gameStatus !== "playing" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", zIndex: 50, color: "white", textAlign: "center", padding: "20px", pointerEvents: "auto" }}>
                <h1 style={{ fontSize: "45px", marginBottom: "10px", textShadow: "2px 2px 10px rgba(0,0,0,1)", color: endData.color }}>{endData.title}</h1>
                <p style={{ fontSize: "22px", marginBottom: "10px" }}>Final Score: <b>{score}</b></p>
                <p style={{ fontSize: "16px", marginBottom: "10px", color: "#d1d5db" }}>Fish: {fishCount}/10 | Squid: {squidCount}/5</p>
                <p style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "40px", color: "#60a5fa" }}>{endData.msg}</p>
                
                {/* FIX: Replaced single button with Play Again / Close buttons */}
                <div style={{ display: "flex", gap: "20px" }}>
                  <button onClick={stopGame} style={{ padding: "15px 35px", fontSize: "18px", fontWeight: "bold", borderRadius: "30px", border: "none", background: "#2B4BAA", color: "white", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.5)" }}>
                    Play Again
                  </button>
                  <button onClick={() => setShowThanks(true)} style={{ padding: "15px 35px", fontSize: "18px", fontWeight: "bold", borderRadius: "30px", border: "none", background: "#4b5563", color: "white", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.5)" }}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ARButton
        sessionInit={{ requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay"], domOverlay: { root: overlayElement } }}
        onClick={() => { if (ambience.current) ambience.current.play().catch(e => console.log(e)); }}
        style={{ 
          position: 'absolute', 
          bottom: '40px', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          padding: '14px 28px', 
          fontSize: '16px', 
          fontWeight: 'bold', 
          borderRadius: '30px', 
          border: 'none', 
          background: 'white', 
          color: 'black', 
          cursor: 'pointer', 
          zIndex: 20,
          display: isARActive || showThanks ? 'none' : 'block' 
        }}
      />

      <Canvas style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <XR>
          <Suspense fallback={null}>
            <XRTracker onXRStart={setIsARActive} />
            {isARActive && !showThanks && (
              <>
                <ambientLight intensity={2.5} />
                {!gamePosition ? (
                  <Reticle onPlace={setGamePosition} />
                ) : (
                  <group position={gamePosition}>
                    <IceFloe />
                    <Penguin walkTarget={penguinWalkTarget} />
                    {gameStatus === "playing" && currentItem === "fish" && <Fish position={itemPosition} onCollect={collectItem} />}
                    {gameStatus === "playing" && currentItem === "squid" && <Squid position={itemPosition} onCollect={collectItem} />}
                    {gameStatus === "playing" && currentItem === "plastic" && <Plastic position={itemPosition} onCollect={collectItem} />}
                    <IceParticles trigger={particleTrigger} />
                  </group>
                )}
              </>
            )}
          </Suspense>
        </XR>
      </Canvas>

      {/* FIX: Added the new Thank You Overlay */}
      {showThanks && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f172a", zIndex: 100, color: "white", textAlign: "center", padding: "30px", pointerEvents: "auto" }}>
          <h1 style={{ fontSize: "36px", marginBottom: "20px", color: "#60a5fa", textShadow: "0 2px 10px rgba(96, 165, 250, 0.3)" }}>
            Thank you for Playing!
          </h1>
          <p style={{ fontSize: "20px", lineHeight: "1.6", maxWidth: "450px", marginBottom: "40px", color: "#e2e8f0" }}>
            Plastic pollution threatens the food chain Emperor Penguins rely on. Thanks for helping Icy find a safe, plastic-free meal. Let's protect our oceans!
          </p>
          <p style={{ fontSize: "14px", color: "#9ca3af", marginTop: "20px", fontStyle: "italic" }}>
            You can safely close this tab now.
          </p>
        </div>
      )}
    </div>
  );
}