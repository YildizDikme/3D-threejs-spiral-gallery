# 3D Spiral Image Gallery

A cinematic 3D spiral image gallery hero built with **Three.js**, **GLSL shaders**, **Lenis** smooth scroll and **GSAP** ScrollTrigger reveals. A premium dark-editorial landing page for creative studios, agencies and portfolios — vanilla JavaScript, no React.

<img width="1512" height="862" alt="preview" src="https://github.com/user-attachments/assets/f6ce474f-499b-4e4a-ba31-1de6adc556d2" />


## Features

- Vertical 3D spiral made of curved image tiles, built from raw `BufferGeometry`
- Custom GLSL vertex + fragment shaders with depth fade and edge vignette
- Lenis smooth scroll — scroll velocity drives extra spin on the spiral
- Soft mouse parallax on desktop (X / Z tilt)
- GSAP ScrollTrigger fade-up reveals on every text block below the hero
- Sticky hero with WebGL canvas behind editorial typography
- Premium dark palette, film grain overlay, fully responsive
- All visual parameters exposed in a single `CONFIG` object

## Tech stack

| Layer | Tool |
| --- | --- |
| Build | Vite 5 |
| 3D | Three.js |
| Smooth scroll | Lenis |
| Animation | GSAP + ScrollTrigger |
| Shaders | Custom GLSL |
| Language | Vanilla JavaScript (no framework) |

## Getting started

```bash

cd 3D-threejs-spiral-gallery
npm install
npm run dev

