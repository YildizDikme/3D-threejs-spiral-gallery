// GLSL pair for the spiral's curved image tiles.
// Vertex shader hands the fragment shader the tile UV and a world-space
// position; the fragment paints the texture with a quiet edge falloff
// and a soft depth wash so tiles far from the camera sink into the bg.

export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform vec3 uCameraPosition;

  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vec4 tex = texture2D(uMap, vUv);

    // Soft vignette around each tile.
    vec2 centered = vUv - 0.5;
    float r = length(centered);
    float edge = 1.0 - smoothstep(0.34, 0.86, r);
    edge = mix(0.78, 1.0, edge);

    // Distance from camera → depth fade.
    float dist = distance(vWorldPosition, uCameraPosition);
    float depth = 1.0 - smoothstep(8.0, 22.0, dist);
    depth = mix(0.48, 1.0, depth);

    // Slight warm tint on near tiles, neutral on far ones — gives a
    // cinematic depth without recolouring the photo.
    vec3 color = tex.rgb;
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 cool = vec3(luma) * 0.9;
    color = mix(cool, color, depth);

    color *= edge * depth;

    gl_FragColor = vec4(color, tex.a);
  }
`;
