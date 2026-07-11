import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { appEventBus } from '../utils/eventBus';
import { fileSystemManager } from '../utils/fileUtils';

export const AVATAR_TEXTURE_PATH = 'assistant/avatar-face.png';

/** Draws the avatar face texture. With guides=true it doubles as the
 * downloadable template users paint their own face onto: 1024x512
 * equirectangular, wrapped around the head sphere — features must sit inside
 * the marked front-face zone, eyes on the horizontal centerline. */
export const drawFaceTemplate = (guides: boolean): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1a2430';
    ctx.fillRect(0, 0, 1024, 512);
    // eyes
    ctx.fillStyle = '#e8f4ff';
    ctx.beginPath(); ctx.ellipse(440, 240, 34, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(584, 240, 34, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0e14';
    ctx.beginPath(); ctx.arc(440, 242, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(584, 242, 11, 0, Math.PI * 2); ctx.fill();
    // mouth
    ctx.strokeStyle = '#e8f4ff';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(512, 330, 40, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    if (guides) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= 1024; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
        for (let y = 0; y <= 512; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
        ctx.strokeStyle = '#7fd0ff';
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(340, 120, 344, 300);
        ctx.setLineDash([]);
        ctx.fillStyle = '#7fd0ff';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('FRONT FACE ZONE — keep features inside', 512, 60);
        ctx.fillText('EYES', 512, 205);
        ctx.fillText('MOUTH', 512, 400);
        ctx.fillText('1024 x 512 — wraps around the head (equirectangular)', 512, 480);
    }
    return c;
};

/** Floating talking head. Jaw flaps while the assistant speaks (live voice)
 * or streams a chat reply; idles with a gentle float and sway otherwise.
 * Loads the user face texture from the vault if present, else uses the
 * procedural default face. */
const AssistantAvatar: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);
    const voiceSpeakingRef = useRef(false);
    const chatSpeakingRef = useRef(false);

    useEffect(() => appEventBus.on('liveAssistantState', (s: { status: string; speaking: boolean }) => {
        voiceSpeakingRef.current = !!s.speaking;
    }), []);
    useEffect(() => appEventBus.on('chatSpeaking', (s: { speaking: boolean }) => {
        chatSpeakingRef.current = !!s.speaking;
    }), []);

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;
        const SIZE = 220;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(SIZE, SIZE);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
        camera.position.z = 3.2;
        scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(1, 1, 2);
        scene.add(key);

        const material = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(drawFaceTemplate(false)) });
        material.map!.colorSpace = THREE.SRGBColorSpace;
        const head = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), material);
        head.scale.set(0.85, 1, 0.9);
        scene.add(head);

        // jaw: dark ellipse parented to the head over the mouth zone, y-scaled by speech
        const jaw = new THREE.Mesh(
            new THREE.SphereGeometry(0.16, 24, 24),
            new THREE.MeshBasicMaterial({ color: 0x0a0508 })
        );
        jaw.position.set(0, -0.45, 0.92);
        jaw.scale.set(1.4, 0.12, 0.4);
        head.add(jaw);

        // swap in the user texture from the vault, if present
        let disposed = false;
        (async () => {
            try {
                if (!fileSystemManager.isDirectorySelected()) return;
                const blob = await fileSystemManager.getFileAsBlob(AVATAR_TEXTURE_PATH);
                if (!blob || disposed) return;
                const bmp = await createImageBitmap(blob);
                const tex = new THREE.CanvasTexture(bmp as unknown as HTMLCanvasElement);
                tex.colorSpace = THREE.SRGBColorSpace;
                material.map?.dispose();
                material.map = tex;
                material.needsUpdate = true;
            } catch { /* keep the default face */ }
        })();

        let raf = 0;
        const clock = new THREE.Clock();
        const animate = () => {
            raf = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();
            head.position.y = Math.sin(t * 1.2) * 0.05;
            head.rotation.y = Math.sin(t * 0.6) * 0.25;
            head.rotation.x = Math.sin(t * 0.9) * 0.06;
            const talking = voiceSpeakingRef.current || chatSpeakingRef.current;
            const target = talking ? 0.06 + Math.abs(Math.sin(t * 14)) * 0.3 : 0.12;
            jaw.scale.y += (target - jaw.scale.y) * 0.3;
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            head.geometry.dispose();
            jaw.geometry.dispose();
            material.map?.dispose();
            material.dispose();
            renderer.dispose();
            mount.removeChild(renderer.domElement);
        };
    }, []);

    return <div ref={mountRef} className="pointer-events-none" style={{ width: 220, height: 220 }} />;
};

export default AssistantAvatar;
