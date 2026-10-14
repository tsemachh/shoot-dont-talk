import Phaser from 'phaser';

/**
 * Single-pass "arcade monitor" post effect, matching the preview video's post():
 *  - bright-pass bloom: only pixels above ~0.45 glow, blurred at two radii
 *    (tight halo + wide soft glow) and added on top, so neon pops on pure black
 *  - mild saturation lift
 *  - chromatic aberration, stronger toward the edges
 * Scanlines and vignette live in a device-resolution DOM overlay (see fx.ts)
 * because this pass runs on the internal low-res buffer, where shader
 * scanlines would alias into moire bands.
 */
const frag = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uTexel;
uniform float uBloom;
uniform float uCa;

varying vec2 outTexCoord;

vec3 bright(vec2 uv) {
  vec3 c = texture2D(uMainSampler, uv).rgb;
  return max(c - 0.45, 0.0) * 1.9;
}

void main() {
  vec2 uv = outTexCoord;
  vec2 cc = uv - 0.5;
  float ca = uCa * (0.0008 * dot(cc, cc) + uTexel.x * 0.12);
  vec3 col;
  col.r = texture2D(uMainSampler, uv + vec2(ca, 0.0)).r;
  col.g = texture2D(uMainSampler, uv).g;
  col.b = texture2D(uMainSampler, uv - vec2(ca, 0.0)).b;

  if (uBloom > 0.0) {
    // tight halo: centre + 8 taps at r = 1.5 and 3 texels
    vec3 b1 = bright(uv) * 2.0;
    vec3 b2 = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982;
      vec2 d = vec2(cos(a), sin(a)) * uTexel;
      b1 += bright(uv + d * 1.5) + bright(uv + d * 3.0) * 0.6;
      b2 += bright(uv + d * 5.5 + vec2(d.y, -d.x) * 1.5) + bright(uv + d * 10.0) * 0.7;
    }
    b1 /= 14.8;
    b2 /= 13.6;
    col += (b1 * 0.6 + b2 * 0.75) * uBloom;
  }

  // gentle saturation lift so the palette reads as vividly as the video
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.15);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class CrtPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  static readonly KEY = 'CrtPipeline';

  bloom = 1;
  ca = 1;

  constructor(game: Phaser.Game) {
    super({ game, fragShader: frag });
  }

  onPreRender(): void {
    this.set2f('uTexel', 1 / this.renderer.width, 1 / this.renderer.height);
    this.set1f('uBloom', this.bloom);
    this.set1f('uCa', this.ca);
  }
}
