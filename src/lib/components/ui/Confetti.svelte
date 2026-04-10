<script lang="ts">
	import { onMount } from 'svelte';

	let canvas = $state<HTMLCanvasElement | null>(null);

	const PARTICLE_COUNT = 80;
	const COLORS = [
		'#FF6B6B',
		'#4ECDC4',
		'#FFE66D',
		'#A78BFA',
		'#F472B6',
		'#34D399',
		'#60A5FA',
		'#FB923C'
	];

	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		color: string;
		size: number;
		rotation: number;
		rotationSpeed: number;
		opacity: number;
		shape: 'rect' | 'circle';
	}

	onMount(() => {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const w = window.innerWidth;
		const h = window.innerHeight;
		canvas.width = w;
		canvas.height = h;

		const particles: Particle[] = [];
		for (let i = 0; i < PARTICLE_COUNT; i++) {
			particles.push({
				x: w / 2 + (Math.random() - 0.5) * w * 0.3,
				y: h * 0.4,
				vx: (Math.random() - 0.5) * 12,
				vy: -Math.random() * 14 - 4,
				color: COLORS[Math.floor(Math.random() * COLORS.length)],
				size: Math.random() * 6 + 3,
				rotation: Math.random() * Math.PI * 2,
				rotationSpeed: (Math.random() - 0.5) * 0.3,
				opacity: 1,
				shape: Math.random() > 0.5 ? 'rect' : 'circle'
			});
		}

		let frame: number;
		const gravity = 0.25;
		const fadeStart = 60;
		let tick = 0;

		function animate() {
			if (!ctx || !canvas) return;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			tick++;

			let alive = false;
			for (const p of particles) {
				p.vy += gravity;
				p.x += p.vx;
				p.y += p.vy;
				p.vx *= 0.99;
				p.rotation += p.rotationSpeed;

				if (tick > fadeStart) {
					p.opacity = Math.max(0, p.opacity - 0.02);
				}

				if (p.opacity <= 0) continue;
				alive = true;

				ctx.save();
				ctx.globalAlpha = p.opacity;
				ctx.translate(p.x, p.y);
				ctx.rotate(p.rotation);
				ctx.fillStyle = p.color;

				if (p.shape === 'rect') {
					ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
				} else {
					ctx.beginPath();
					ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
					ctx.fill();
				}

				ctx.restore();
			}

			if (alive) {
				frame = requestAnimationFrame(animate);
			}
		}

		frame = requestAnimationFrame(animate);

		return () => {
			cancelAnimationFrame(frame);
		};
	});
</script>

<canvas bind:this={canvas} class="pointer-events-none fixed inset-0 z-[80]" aria-hidden="true"
></canvas>
