import { useEffect, useRef, useState, useCallback } from 'react';
import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph';
import * as THREE from 'three';
import rawData from './data/result.json';

interface PackageNode {
  id: string;
  package_id: string;
  version: string;
  is_vulnerable: boolean;
  vulnerabilities: string[];
  // added by force graph
  x?: number;
  y?: number;
  z?: number;
}

interface HoveredInfo {
  node: PackageNode;
  x: number;
  y: number;
}

function makeGlowSprite(color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, color.replace(')', ', 0.6)').replace('rgb', 'rgba'));
  grad.addColorStop(1, color.replace(')', ', 0)').replace('rgb', 'rgba'));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(30, 30, 1);
  return sprite;
}

// Build graph data from result.json
const nodes: PackageNode[] = rawData.nodes.map((n) => ({
  id: n.package_id,
  package_id: n.package_id,
  version: n.version,
  is_vulnerable: n.is_vulnerable,
  vulnerabilities: n.vulnerabilities,
}));

const links = rawData.edges.map((e) => ({
  source: e.from,
  target: e.to,
}));

const VULN_COLOR = '#ff2222';
const SAFE_COLOR = '#38bdf8';
const VULN_GLOW = 'rgb(255, 34, 34)';
const BG_COLOR = '#080b12';

export default function Graph3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraph3DInstance | null>(null);
  const [hovered, setHovered] = useState<HoveredInfo | null>(null);
  const [selected, setSelected] = useState<PackageNode | null>(null);

  const handleNodeHover = useCallback((node: object | null, _prev: object | null, event?: MouseEvent) => {
    if (!node) {
      setHovered(null);
      return;
    }
    const n = node as PackageNode;
    const x = event?.clientX ?? 0;
    const y = event?.clientY ?? 0;
    setHovered({ node: n, x, y });
  }, []);

  const handleNodeClick = useCallback((node: object) => {
    const n = node as PackageNode;
    setSelected((prev) => (prev?.id === n.id ? null : n));

    // Fly camera to node
    if (graphRef.current && n.x !== undefined) {
      const dist = 80;
      const distRatio = 1 + dist / Math.hypot(n.x ?? 1, n.y ?? 1, n.z ?? 1);
      graphRef.current.cameraPosition(
        { x: (n.x ?? 0) * distRatio, y: (n.y ?? 0) * distRatio, z: (n.z ?? 0) * distRatio },
        { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 },
        800
      );
    }
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const el = mountRef.current;

    const graph = new ForceGraph3D(el, { rendererConfig: { antialias: true } })
      .graphData({ nodes, links })
      .backgroundColor(BG_COLOR)
      .linkColor(() => 'rgba(100,160,255,0.18)')
      .linkWidth(0.5)
      .linkOpacity(1)
      .linkDirectionalParticles(1)
      .linkDirectionalParticleSpeed(0.003)
      .linkDirectionalParticleColor(() => 'rgba(100,160,255,0.5)')
      .linkDirectionalParticleWidth(1.2)
      .nodeLabel(() => '')
      .nodeThreeObject((node: object) => {
        const n = node as PackageNode;
        const group = new THREE.Group();

        const vuln = n.is_vulnerable;
        const vulnCount = n.vulnerabilities.length;
        const radius = vuln ? Math.max(7, 5 + vulnCount * 0.4) : 4;

        // Core sphere
        const geo = new THREE.SphereGeometry(radius, 24, 24);
        const mat = new THREE.MeshPhongMaterial({
          color: vuln ? VULN_COLOR : SAFE_COLOR,
          emissive: vuln ? new THREE.Color(VULN_COLOR) : new THREE.Color(SAFE_COLOR),
          emissiveIntensity: vuln ? 0.8 : 0.25,
          shininess: 120,
          transparent: false,
        });
        const sphere = new THREE.Mesh(geo, mat);
        group.add(sphere);

        // Outer halo for vulnerable nodes
        if (vuln) {
          const haloGeo = new THREE.SphereGeometry(radius * 1.9, 16, 16);
          const haloMat = new THREE.MeshPhongMaterial({
            color: VULN_COLOR,
            emissive: new THREE.Color(VULN_COLOR),
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.08,
            side: THREE.BackSide,
            depthWrite: false,
          });
          group.add(new THREE.Mesh(haloGeo, haloMat));

          // Glow sprite
          const glow = makeGlowSprite(VULN_GLOW);
          glow.scale.set(radius * 6, radius * 6, 1);
          group.add(glow);
        }

        // Label sprite
        const canvas = document.createElement('canvas');
        const label = n.package_id;
        const fontSize = 18;
        canvas.width = 512;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 512, 64);
        ctx.font = `${fontSize}px system-ui, sans-serif`;
        ctx.fillStyle = vuln ? '#ffaaaa' : '#aaddff';
        ctx.textAlign = 'center';
        ctx.fillText(label, 256, 36);
        const tex = new THREE.CanvasTexture(canvas);
        const labelMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
        const labelSprite = new THREE.Sprite(labelMat);
        const scale = 28;
        labelSprite.scale.set(scale, scale * 0.125, 1);
        labelSprite.position.set(0, radius + 7, 0);
        group.add(labelSprite);

        return group;
      })
      .onNodeHover(handleNodeHover as (node: object | null, prev: object | null) => void)
      .onNodeClick(handleNodeClick as (node: object) => void);

    // Add ambient + directional lights
    const scene = graph.scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(200, 200, 200);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0x6688ff, 0.4);
    dir2.position.set(-200, -100, -200);
    scene.add(dir2);

    graphRef.current = graph;

    const handleMouseMove = (e: MouseEvent) => {
      setHovered((prev) => {
        if (!prev) return null;
        return { ...prev, x: e.clientX, y: e.clientY };
      });
    };
    el.addEventListener('mousemove', handleMouseMove);

    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      graph._destructor?.();
    };
  }, [handleNodeHover, handleNodeClick]);

  const summary = rawData.summary;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: BG_COLOR, overflow: 'hidden' }}>
      {/* Mount point */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* Header stats */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 28px',
        background: 'linear-gradient(to bottom, rgba(8,11,18,0.92) 0%, transparent 100%)',
        pointerEvents: 'none',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.5px', fontFamily: 'system-ui, sans-serif' }}>
            Dependency Vulnerability Graph
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b', fontFamily: 'system-ui, sans-serif' }}>
            Python package dependency scan
          </p>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <StatBadge label="Packages" value={summary.total_packages} color="#38bdf8" />
          <StatBadge label="Dependencies" value={summary.total_edges} color="#94a3b8" />
          <StatBadge label="Vulnerable" value={summary.vulnerable_packages} color="#ff2222" danger />
        </div>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 24, left: 28,
        display: 'flex', flexDirection: 'column', gap: '8px',
        pointerEvents: 'none',
      }}>
        <LegendItem color={VULN_COLOR} label="Vulnerable package" />
        <LegendItem color={SAFE_COLOR} label="Safe package" />
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#475569', fontFamily: 'system-ui, sans-serif' }}>
          Click a node to focus · Drag to rotate
        </div>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <Tooltip info={hovered} />
      )}

      {/* Selected panel */}
      {selected && (
        <SelectedPanel node={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function StatBadge({ label, value, color, danger }: { label: string; value: number; color: string; danger?: boolean }) {
  return (
    <div style={{
      textAlign: 'center',
      background: danger ? 'rgba(255,34,34,0.1)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${danger ? 'rgba(255,34,34,0.3)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '10px',
      padding: '8px 16px',
      minWidth: '80px',
    }}>
      <div style={{ fontSize: '22px', fontWeight: 700, color, fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'system-ui, sans-serif', marginTop: '3px' }}>{label}</div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{label}</span>
    </div>
  );
}

function Tooltip({ info }: { info: HoveredInfo }) {
  const { node, x, y } = info;
  const offsetX = 16;
  const offsetY = -10;

  return (
    <div style={{
      position: 'fixed',
      left: x + offsetX,
      top: y + offsetY,
      pointerEvents: 'none',
      zIndex: 100,
      background: 'rgba(10,14,26,0.92)',
      border: `1px solid ${node.is_vulnerable ? 'rgba(255,34,34,0.5)' : 'rgba(56,189,248,0.3)'}`,
      borderRadius: '10px',
      padding: '10px 14px',
      maxWidth: '280px',
      backdropFilter: 'blur(8px)',
      boxShadow: node.is_vulnerable
        ? '0 0 20px rgba(255,34,34,0.2), 0 4px 20px rgba(0,0,0,0.5)'
        : '0 4px 20px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: node.is_vulnerable ? VULN_COLOR : SAFE_COLOR,
          boxShadow: `0 0 5px ${node.is_vulnerable ? VULN_COLOR : SAFE_COLOR}`,
          flexShrink: 0,
        }} />
        <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '13px', fontFamily: 'monospace' }}>
          {node.package_id}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', marginBottom: node.is_vulnerable ? '8px' : 0 }}>
        v{node.version}
      </div>
      {node.is_vulnerable && (
        <div>
          <div style={{ fontSize: '11px', color: '#ff6b6b', fontWeight: 600, marginBottom: '4px', fontFamily: 'system-ui, sans-serif' }}>
            {node.vulnerabilities.length} vulnerabilit{node.vulnerabilities.length > 1 ? 'ies' : 'y'} — click for details
          </div>
        </div>
      )}
    </div>
  );
}

function SelectedPanel({ node, onClose }: { node: PackageNode; onClose: () => void }) {
  return (
    <div style={{
      position: 'absolute', top: 80, right: 24,
      width: '300px',
      background: 'rgba(10,14,26,0.95)',
      border: `1px solid ${node.is_vulnerable ? 'rgba(255,34,34,0.4)' : 'rgba(56,189,248,0.25)'}`,
      borderRadius: '14px',
      padding: '18px 20px',
      backdropFilter: 'blur(12px)',
      boxShadow: node.is_vulnerable
        ? '0 0 30px rgba(255,34,34,0.15), 0 8px 32px rgba(0,0,0,0.6)'
        : '0 8px 32px rgba(0,0,0,0.6)',
      zIndex: 50,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: node.is_vulnerable ? VULN_COLOR : SAFE_COLOR,
              boxShadow: `0 0 8px ${node.is_vulnerable ? VULN_COLOR : SAFE_COLOR}`,
            }} />
            <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '15px', fontFamily: 'monospace' }}>
              {node.package_id}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#475569', fontFamily: 'monospace', marginTop: '2px', marginLeft: '18px' }}>
            v{node.version}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#475569', fontSize: '18px', lineHeight: 1, padding: '0 2px',
          }}
        >
          x
        </button>
      </div>

      {node.is_vulnerable ? (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(255,34,34,0.08)', border: '1px solid rgba(255,34,34,0.2)',
            borderRadius: '8px', padding: '8px 10px', marginBottom: '12px',
          }}>
            <span style={{ fontSize: '16px' }}>⚠</span>
            <span style={{ fontSize: '12px', color: '#fca5a5', fontWeight: 600 }}>
              {node.vulnerabilities.length} known vulnerabilit{node.vulnerabilities.length > 1 ? 'ies' : 'y'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '380px', overflowY: 'auto' }}>
            {node.vulnerabilities.map((v) => (
              <div key={v} style={{
                background: 'rgba(255,34,34,0.06)',
                border: '1px solid rgba(255,34,34,0.15)',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '12px',
                color: '#fca5a5',
                fontFamily: 'monospace',
              }}>
                {v}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.2)',
          borderRadius: '8px', padding: '8px 10px',
        }}>
          <span style={{ fontSize: '14px' }}>✓</span>
          <span style={{ fontSize: '12px', color: '#7dd3fc' }}>No known vulnerabilities</span>
        </div>
      )}
    </div>
  );
}
