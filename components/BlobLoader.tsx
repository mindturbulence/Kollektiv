import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const BlobLoader: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Clear existing canvas in case of React StrictMode double-mount
    while (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }

    // Scene setup
    const scene = new THREE.Scene();

    // Camera setup
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 5;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0); // Transparent background
    renderer.setSize(150, 150);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // Read actual primary color by creating a temporary element
    const tempDiv = document.createElement('div');
    tempDiv.className = 'text-primary';
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);
    const computedColor = getComputedStyle(tempDiv).color; // Typically "rgb(r, g, b)"
    document.body.removeChild(tempDiv);

    const match = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    let r = 0.5, g = 0.0, b = 1.0; 
    if (match) {
      r = parseInt(match[1]) / 255;
      g = parseInt(match[2]) / 255;
      b = parseInt(match[3]) / 255;
    }

    // We will use a custom ShaderMaterial for the blob
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      uniform float uTime;
      
      // Simplex noise function
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      float snoise(vec3 v) {
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 = v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute( permute( permute(
                   i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                 + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                 + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
      }

      void main() {
        vUv = uv;
        vNormal = normal;
        
        // Displace vertices
        float noise = snoise(position * 2.0 + uTime * 0.5);
        vec3 newPosition = position + normal * noise * 0.3;
        
        // Breathing effect
        float breath = sin(uTime * 1.5) * 0.1 + 0.9;
        newPosition *= breath;

        vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
        vViewPosition = -mvPosition.xyz;
        
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      uniform float uTime;
      uniform vec3 uColor;
      
      void main() {
        // Normal base for iridescence
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);

        // Fresnel effect for outline
        float fresnel = dot(viewDir, normal);
        fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
        fresnel = pow(fresnel, 2.0); // Sharper outline
        
        // Iridescent colors mixed with base color
        float iridescence = sin(vUv.y * 10.0 + uTime * 2.0) * 0.5 + 0.5;
        vec3 iridescentColor = mix(vec3(0.1, 0.8, 0.9), vec3(0.9, 0.2, 0.8), iridescence);
        vec3 finalColor = mix(uColor, iridescentColor, 0.5);
        
        // Add some brightness to the edge
        finalColor += fresnel * vec3(0.5, 0.6, 1.0);
        
        // Alpha is fully controlled by fresnel (transparent inside, opaque at edge)
        float alpha = fresnel * 1.5;

        gl_FragColor = vec4(finalColor, alpha);
      }
    `;

    const geometry = new THREE.IcosahedronGeometry(1.2, 32);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(r, g, b) }
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const blob = new THREE.Mesh(geometry, material);
    scene.add(blob);

    // Glowing halo behind it using Sprite
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.4)`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      blending: THREE.AdditiveBlending
    });
    const halo = new THREE.Sprite(spriteMaterial);
    halo.scale.set(4, 4, 1);
    scene.add(halo);

    const clock = new THREE.Clock();

    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      
      material.uniforms.uTime.value = elapsedTime;
      blob.rotation.y = elapsedTime * 0.3;
      blob.rotation.x = elapsedTime * 0.15;
      
      // Pulse halo
      const scale = 3.5 + Math.sin(elapsedTime * 1.5) * 0.5;
      halo.scale.set(scale, scale, 1);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      material.dispose();
      geometry.dispose();
      spriteMaterial.dispose();
      spriteMaterial.map?.dispose();
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div 
        ref={mountRef} 
        style={{ width: '150px', height: '150px' }} 
        className="flex items-center justify-center rounded-full"
      />
      <div className="font-rajdhani text-base-content/40 text-[10px] uppercase tracking-[0.3em] font-medium animate-pulse">
        Refining ...
      </div>
    </div>
  );
};

export default BlobLoader;
