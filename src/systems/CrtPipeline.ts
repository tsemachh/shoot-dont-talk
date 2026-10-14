import Phaser from 'phaser';

/**
 * WebGL half of the CRT look: chromatic aberration, slightly stronger toward
 * the edges. Scanlines and vignette live in a device-resolution DOM overlay
 * (see fx.ts) because the postFX render target is the internal 384x216 buffer,
 * where shader scanlines would alias into moire bands.
 */
const frag = `
precision mediump float;

uniform sampler2D uMainSampler;

varying vec2 outTexCoord;

void main() {
  vec2 cc = outTexCoord - 0.5;
  float ca = 0.0012 * dot(cc, cc);
  vec3 col;
  col.r = texture2D(uMainSampler, outTexCoord + vec2(ca, 0.0)).r;
  col.g = texture2D(uMainSampler, outTexCoord).g;
  col.b = texture2D(uMainSampler, outTexCoord - vec2(ca, 0.0)).b;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class CrtPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  static readonly KEY = 'CrtPipeline';

  constructor(game: Phaser.Game) {
    super({ game, fragShader: frag });
  }
}
