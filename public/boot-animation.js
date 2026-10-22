import * as THREE from './vendor/three.module.js';

const host = document.querySelector('#boot');
const canvas = document.querySelector('#pure-intro');
if (host && canvas) {
  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 8.4);
    const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    const root = new THREE.Group();
    root.scale.setScalar(0.72);
    scene.add(root);
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.02, 0.28, 112, 16, 2, 3), new THREE.MeshStandardMaterial({color: 0xd9dde3, metalness: 0.86, roughness: 0.24}));
    root.add(knot);
    const ringMaterial = new THREE.MeshBasicMaterial({color: 0x838b98, transparent: true, opacity: 0.3});
    for (let i = 0; i < 3; i++) {
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.95 + i * 0.12, 0.004, 4, 160), ringMaterial.clone());
      orbit.rotation.set(0.45 + i * 0.67, 0.42 + i * 0.31, i * 0.52);
      root.add(orbit);
    }
    const points = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      const radius = 2.6 + Math.random() * 2.8, angle = Math.random() * Math.PI * 2;
      points[i * 3] = Math.cos(angle) * radius;
      points[i * 3 + 1] = (Math.random() - 0.5) * 5;
      points[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({color: 0xe0e4ea, size: 0.018, transparent: true, opacity: 0.54}));
    scene.add(stars);
    scene.add(new THREE.AmbientLight(0x738096, 2.3));
    const key = new THREE.DirectionalLight(0xffffff, 4.2); key.position.set(-3, 4, 5); scene.add(key);
    const rim = new THREE.PointLight(0x9aa8c1, 28, 14); rim.position.set(3, -2, -2); scene.add(rim);
    const resize = () => {
      const rect = host.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.position.z = rect.width < 650 ? 9.8 : 8.4;
      camera.updateProjectionMatrix();
    };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0, visible = true;
    const render = time => {
      if (!visible) return;
      root.rotation.y = reduced ? 0.22 : time * 0.000065;
      root.rotation.x = Math.sin(time * 0.00010) * 0.09;
      knot.rotation.z = reduced ? 0 : time * 0.000045;
      stars.rotation.y = reduced ? 0 : time * 0.000008;
      renderer.render(scene, camera);
      if (!reduced) frame = requestAnimationFrame(render);
    };
    resize();
    render(0);
    const observer = new ResizeObserver(resize); observer.observe(host);
    const visibility = new MutationObserver(() => {
      visible = !host.hidden;
      if (visible && !reduced) frame = requestAnimationFrame(render);
      else cancelAnimationFrame(frame);
    });
    visibility.observe(host, {attributes: true, attributeFilter: ['hidden']});
    window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); observer.disconnect(); visibility.disconnect(); renderer.dispose(); }, {once: true});
  } catch {
    host.classList.add('no-webgl');
  }
}
