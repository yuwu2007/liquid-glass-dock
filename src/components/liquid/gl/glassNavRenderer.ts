/**
 * WebGL2 液态玻璃渲染器（玻璃实验室 /glass-lab 原型用）
 *
 * 算法对照 com.kyant.backdrop（Kyant0/AndroidLiquidGlass 的底层库）：
 * - 折射：sd<0 的栏内区域，离边框 refractionHeight 以内才参与折射。
 *   d = circleMap(1 + sd/refractionHeight) * refractionAmount，circleMap(x)=1-sqrt(1-x^2)。
 *   边框处位移最大，向内一个带宽平滑衰减到 0，方向沿 SDF 梯度朝外。
 * - 色散：RGB 三通道按位移缩放分别采样。
 * - 高光：intensity = pow(abs(dot(grad, lightDir)), falloff) 的定向权重。
 * - 模糊：真高斯。Kyant 直接调平台 RenderEffect；浏览器没有这个能力，
 *   所以这里在 GPU 上自己做：降到 1x css 分辨率后跑多环圆盘高斯，
 *   结果烘进一张贴图，主着色器只取一次样。绝不能拿 mipmap 层当模糊 ——
 *   低分辨率层被放大就是"一粒一粒"的马赛克。
 *
 * 所有长度单位都是 css px。
 */

// 画布比栏体四条边各外扩的透明边（给外阴影/高光溢出用）。取样范围必须减掉它。
const PAD = 24

export interface GlassNavParams {
  radius: number
  refractionHeight: number // 折射带宽度 px
  refractionAmount: number // 边缘最大采样位移 px
  dispersion: number       // 色散强度（0 关）
  blur: number             // 高斯模糊半径（css px，真高斯，非 mipmap 近似）
  fresnel: number          // 白镜面基色强度
  edgeTint: number         // 边框取色强度（实时吸背景色镶边）
  centerMix: number        // 取色来源：0=边框位置深入栏内的背景，1=栏内中点那一横排的背景
  pickDepth: number        // 辅助取样点深入栏内的距离（css px）
  pickMargin: number       // 取色网格向外扩多少 px（0=只取栏体内部，正值=含栏体周边一圈）
  pickVivid: number        // 取色后的加饱和量
  pickGain: number         // 取色后的提亮倍率
  glare: number            // 扫光强度
  tint: number             // 白霜混合比
  vibrancy: number         // 饱和度提升
  pillLift: number         // 选中区提亮
  pillShade: number        // 选中区压暗比例（白底上靠它把胶囊显出来）
  glow: number             // 选中项背后的沉浸光晕强度（华为那团蓝色光）
  glowR: number            // 光晕半径（css px）
  accent: [number, number, number] // 主题强调色（rgb 0..1）—— 边框与光晕的染色来源
  accentMix: number        // 染色里主题色占的比重：1=纯主题色，0=纯背景取色
  ambient: number          // 环境光溢出：附近彩色内容的光洒到玻璃表面上（苹果 WWDC25 的说法）
  sheen: number            // 厚度渐变幅度（上亮下暗）
}

export const DEFAULT_GLASS_PARAMS: GlassNavParams = {
  radius: 32,
  refractionHeight: 18,
  refractionAmount: 15,
  dispersion: 0.012,
  blur: 14,
  fresnel: 0.30,
  edgeTint: 0.9,
  centerMix: 0.0,
  pickDepth: 12,
  pickMargin: 16,
  pickVivid: 2.2,
  pickGain: 1.25,
  glare: 0.06,
  tint: 0.05,
  vibrancy: 1.18,
  pillLift: 0.35,
  pillShade: 0.075,
  glow: 0.35,
  glowR: 120,
  accent: [0.0, 0.533, 1.0],
  accentMix: 0.0,
  ambient: 0.12,
  sheen: 0.04,
}

export interface PillUniform {
  cx: number; cy: number
  hw: number; hh: number
  sx: number; sy: number
}

export interface RenderOpts {
  originX: number; originY: number
  scrollY: number
  squashX: number; squashY: number
  pill: PillUniform | null
  time: number
}

const VERT = `#version 300 es
void main(){
  vec2 v = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`

// 模糊 pass：把源贴图降采样，再做多环圆盘高斯。结果烘一次，主着色器只取一次样。
const BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_radius;
uniform float u_pass;
out vec4 outColor;

void main(){
  vec2 uv = gl_FragCoord.xy * u_texel;
  if (u_pass < 0.5) { outColor = vec4(texture(u_tex, uv).rgb, 1.0); return; }

  vec3 sum = texture(u_tex, uv).rgb * 1.0;
  float wsum = 1.0;
  for (int ring = 1; ring <= 4; ring++) {
    float rf = float(ring) * 0.25;
    float w = exp(-2.6 * rf * rf);
    float a0 = float(ring) * 0.7853981634;
    for (int i = 0; i < 8; i++) {
      float a = a0 + float(i) * 0.7853981634;
      vec2 o = vec2(cos(a), sin(a)) * (u_radius * rf) * u_texel;
      sum += texture(u_tex, uv + o).rgb * w;
      wsum += w;
    }
  }
  outColor = vec4(sum / wsum, 1.0);
}`

// 中心取色 pass：只跑 1 个像素。在导航栏覆盖区域的正中扫 5x3 个样本，
// 取"最有颜色"的那一块（饱和度高、不算太暗的胜出），全灰时退回平均色。
// 放在单独 pass 里是因为主着色器每像素只能承受一次取样。
const PICK_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_bg;
uniform vec2 u_mid;
uniform vec2 u_step;
uniform vec2 u_mid2;
uniform float u_spanY;
out vec4 outColor;
void main(){
  vec3 sum = vec3(0.0);
  vec3 best = vec3(0.0);
  float bestScore = -1.0;
  for (int gy = -3; gy <= 3; gy++) {
    for (int gx = -6; gx <= 6; gx++) {
      vec3 c = texture(u_bg, u_mid + vec2(float(gx) * u_step.x, float(gy) * u_step.y * u_spanY)).rgb;
      sum += c;
      float mx = max(max(c.r, c.g), c.b);
      float mn = min(min(c.r, c.g), c.b);
      float sat = mx - mn;
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float score = sat * (0.35 + lum);
      if (score > bestScore) { bestScore = score; best = c; }
    }
  }
  vec3 avg = sum / 91.0;
  outColor = vec4(mix(avg, best, clamp(bestScore / 0.16, 0.0, 1.0)), 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_bg;
uniform sampler2D u_pick;
uniform vec2 u_res;
uniform float u_dpr;
uniform vec2 u_origin;
uniform vec2 u_bgSize;
uniform float u_scroll;
uniform float u_time;
uniform float u_pad;

uniform float u_radius;
uniform float u_refrH;
uniform float u_refrAmt;
uniform float u_disp;
uniform float u_fresnel;
uniform float u_glare;
uniform float u_tint;
uniform float u_vibrancy;
uniform float u_pillLift;
uniform float u_pillShade;
uniform float u_sheen;
uniform float u_edgeTint;
uniform float u_centerMix;
uniform float u_pickDepth;
uniform float u_pickVivid;
uniform float u_pickGain;
uniform vec3 u_accent;
uniform float u_accentMix;
uniform float u_ambient;
uniform float u_glow;
uniform float u_glowR;

uniform vec2 u_squash;
uniform vec4 u_pill;
uniform vec2 u_pillSq;
uniform float u_pillOn;

out vec4 outColor;

float sdRB(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

float dBar(vec2 p){
  vec2 c = u_res * 0.5;
  vec2 b = u_res * 0.5 - vec2(u_pad);
  vec2 q = (p - c) / u_squash;
  return sdRB(q, b, min(u_radius, b.y)) * min(u_squash.x, u_squash.y);
}
float dPill(vec2 p){
  vec2 q = (p - u_pill.xy) / u_pillSq;
  return sdRB(q, u_pill.zw, u_pill.w) * min(u_pillSq.x, u_pillSq.y);
}

vec2 bgUV(vec2 cssViewport){
  vec2 doc = vec2(cssViewport.x, cssViewport.y + u_scroll);
  return doc / u_bgSize;
}

void main(){
  vec2 p = vec2(gl_FragCoord.x / u_dpr, u_res.y - gl_FragCoord.y / u_dpr);

  // 轮廓只认栏体。选中胶囊绝不并入轮廓 —— 并进去会在栏内留下一圈内环。
  float d = dBar(p);
  float e = 0.75;
  vec2 g = vec2(dBar(p + vec2(e, 0.0)) - dBar(p - vec2(e, 0.0)),
                dBar(p + vec2(0.0, e)) - dBar(p - vec2(0.0, e)));
  vec2 n = g / max(length(g), 1e-5);

  float alpha = smoothstep(0.8, -0.8, d);

  // Kyant 的折射剖面：带外原样输出，带内位移从边框最大值平滑衰减到 0
  vec2 off = vec2(0.0);
  if (-d < u_refrH && d < 0.0) {
    float x = 1.0 + d / u_refrH;          // 边框处 1，带内边缘处 0
    float prof = 1.0 - sqrt(max(0.0, 1.0 - x * x));
    off = n * (prof * u_refrAmt);
  }

  vec2 uv0 = bgUV(u_origin + p);
  vec2 dUV = off / u_bgSize;

  vec3 col;
  col.r = texture(u_bg, uv0 + dUV * (1.0 + u_disp)).r;
  col.g = texture(u_bg, uv0 + dUV).g;
  col.b = texture(u_bg, uv0 + dUV * (1.0 - u_disp)).b;

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, u_vibrancy);
  col = mix(col, vec3(1.0), u_tint);

  // 玻璃本体压暗。白底上不压暗，高光加多少都会被 clamp 回纯白 —— 那就"看不到高光描边"。
  col *= 0.955;

  // 厚度感：上沿偏亮、下沿偏暗
  float vy = clamp((p.y - u_pad) / max(u_res.y - 2.0*u_pad, 1.0), 0.0, 1.0);
  col *= mix(1.0 + u_sheen, 1.0 - u_sheen, vy);

  // ===== 边框取色 =====
  // 取样网格已经在 picker pass 里跑完（1x1 贴图），这里只读结果，每像素开销一次取样。
  // 两路来源：
  //   1) centerCol —— 栏体覆盖区域内那口"最有颜色"的背景色（碰不碰边框都算）
  //   2) innerCol  —— 该段边框正后方、沿法线往栏内三个深度里最有颜色的那个
  float rim = smoothstep(-9.0, 0.0, d);

  vec3 innerCol = vec3(0.0);
  float innerBest = -1.0;
  for (int di = 0; di < 3; di++) {
    float depth = u_pickDepth * (di == 0 ? 0.4 : (di == 1 ? 1.2 : 2.8));
    vec3 cc = texture(u_bg, uv0 - n * (depth / u_bgSize)).rgb;
    float mx = max(max(cc.r, cc.g), cc.b);
    float mn = min(min(cc.r, cc.g), cc.b);
    float sc = (mx - mn) * (0.35 + dot(cc, vec3(0.2126, 0.7152, 0.0722)));
    if (sc > innerBest) { innerBest = sc; innerCol = cc; }
  }

  vec3 centerCol = texture(u_pick, vec2(0.5)).rgb;
  vec3 picked = mix(innerCol, centerCol, u_centerMix);
  float el = dot(picked, vec3(0.2126, 0.7152, 0.0722));
  // 先按彩度外插提饱和，夹回 0..1；再乘提亮倍率并再次夹住，否则会外插出 >1 的值直接把边缘烧成白。
  vec3 pickedTint = clamp(clamp(mix(vec3(el), picked, u_pickVivid), 0.0, 1.0) * u_pickGain, 0.0, 1.0);
  // 主题强调色。Apple 的 Glass.tint(Color) 和 Kyant 的 accentColor 都是开发者写死的颜色，
  // accentMix=1 走主题色，=0 走上面那口背景取色。
  pickedTint = mix(pickedTint, u_accent, u_accentMix);

  // 边缘只保留"一条带"：同一条高斯带既做染色也做亮线，靠幂次收紧外沿。
  // 千万不能像之前那样把窄亮线、内侧暗线、宽带染色三条同心特征叠在一起 ——
  // 那在视觉上就是"大环套小环"，还会在边缘形成重影。
  vec2 L = normalize(vec2(-0.35, -0.94));
  float lit = clamp(dot(n, L), 0.0, 1.0);

  float edge = exp(-pow((d + 4.0) / 5.0, 2.0));    // 唯一的一条边缘带（约 10px 宽，别再加宽）
  float line = pow(edge, 3.0);                     // 同一条带收窄出来的外沿亮线

  // 染色：整条带柔和地带上背景色
  col += pickedTint * (u_edgeTint * edge * 0.55 * (0.55 + 0.45 * lit));
  // 镜面：同一条带的外沿亮线，颜色是光源色（白），不额外增带宽
  col += vec3(u_fresnel * line * (0.30 + 0.70 * pow(lit, 1.2)));

  // 沉浸光晕：颜色同样来自 pickedTint，没有写死的蓝
  if (u_pillOn > 0.5 && u_glow > 0.0) {
    vec2 gq = (p - u_pill.xy) / vec2(u_glowR, max(u_glowR * 0.62, 1.0));
    float gf = exp(-dot(gq, gq) * 2.3);
    col += pickedTint * (u_glow * gf * (0.78 + 0.22 * rim));
  }

  col = clamp(col, 0.0, 1.0);

  // 外阴影（画在 pad 透明区）
  float sh = (1.0 - alpha) * exp(-max(d, 0.0) / 9.0) * 0.35;
  float a = alpha + sh*(1.0 - alpha);
  outColor = vec4(col * alpha, a);
}`

export class GlassNavRenderer {
  private gl: WebGL2RenderingContext | null = null
  private prog: WebGLProgram | null = null
  private blurProg: WebGLProgram | null = null
  private pickProg: WebGLProgram | null = null
  private tex: WebGLTexture | null = null
  private texA: WebGLTexture | null = null
  private texB: WebGLTexture | null = null
  private fboA: WebGLFramebuffer | null = null
  private fboB: WebGLFramebuffer | null = null
  private texPick: WebGLTexture | null = null
  private fboPick: WebGLFramebuffer | null = null
  private blurW = 0
  private blurH = 0
  private vao: WebGLVertexArrayObject | null = null
  private uni = new Map<string, WebGLUniformLocation | null>()
  private uniBlur = new Map<string, WebGLUniformLocation | null>()
  private uniPick = new Map<string, WebGLUniformLocation | null>()
  private canvas: HTMLCanvasElement
  private bgCssW = 1
  private bgCssH = 1
  private src: TexImageSource | null = null
  private needUpload = false
  private uploadedBlur = -1
  private pickBuf = new Uint8Array(4)
  private pickFrame = 0
  pickedRGB: [number, number, number] = [128, 128, 128]
  params: GlassNavParams = { ...DEFAULT_GLASS_PARAMS }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) return
    this.gl = gl
    const prog = this.compile(VERT, FRAG)
    const blurProg = this.compile(VERT, BLUR_FRAG)
    const pickProg = this.compile(VERT, PICK_FRAG)
    if (!prog || !blurProg || !pickProg) { this.gl = null; return }
    this.prog = prog
    this.blurProg = blurProg
    this.pickProg = pickProg
    this.vao = gl.createVertexArray()
    gl.bindVertexArray(this.vao)

    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([238, 241, 245, 255]))
    this.setTexParams()
    this.tex = tex

    // 1x1 的中心取色目标
    const tp = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tp)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]))
    this.setTexParams()
    this.texPick = tp
    this.fboPick = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPick)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tp, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private setTexParams() {
    const gl = this.gl!
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  }

  get ok() { return this.gl !== null && this.prog !== null && this.blurProg !== null && this.pickProg !== null }

  private compile(vsSrc: string, fsSrc: string) {
    const gl = this.gl!
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[glass] shader error:', gl.getShaderInfoLog(s))
        return null
      }
      return s
    }
    const vs = mk(gl.VERTEX_SHADER, vsSrc)
    const fs = mk(gl.FRAGMENT_SHADER, fsSrc)
    if (!vs || !fs) return null
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[glass] link error:', gl.getProgramInfoLog(prog))
      return null
    }
    return prog
  }

  private u(name: string) {
    if (!this.uni.has(name)) this.uni.set(name, this.gl!.getUniformLocation(this.prog!, name))
    return this.uni.get(name)!
  }
  private up(name: string) {
    if (!this.uniPick.has(name)) this.uniPick.set(name, this.gl!.getUniformLocation(this.pickProg!, name))
    return this.uniPick.get(name)!
  }

  private ub(name: string) {
    if (!this.uniBlur.has(name)) this.uniBlur.set(name, this.gl!.getUniformLocation(this.blurProg!, name))
    return this.uniBlur.get(name)!
  }

  /** 登记背景来源；cssW/cssH = 一块背景在文档里的 css 尺寸 */
  setBackground(source: TexImageSource, cssW: number, cssH: number) {
    this.src = source
    this.bgCssW = cssW
    this.bgCssH = cssH
    this.needUpload = true
  }

  private srcSize() {
    const s = this.src as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | null
    return {
      w: (s && (s.width || s.naturalWidth)) || 1,
      h: (s && (s.height || s.naturalHeight)) || 1,
    }
  }

  /** 在 GPU 上把背景烘成一张高斯模糊贴图（只在本帧需要时跑一次） */
  private buildBlur() {
    const gl = this.gl
    if (!gl || !this.tex || !this.blurProg || !this.src) return
    const { w: sw, h: sh } = this.srcSize()

    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.src as TexImageSource)

    // 模糊目标分辨率：源的一半（源是 2x 设备像素，所以这等于 1x css 像素），长边封顶 2048 收敛一次性开销
    const scale = Math.min(0.5, 2048 / Math.max(sw, sh))
    const bw = Math.max(2, Math.round(sw * scale))
    const bh = Math.max(2, Math.round(sh * scale))
    if (bw !== this.blurW || bh !== this.blurH) {
      this.blurW = bw
      this.blurH = bh
      const make = (fill: Uint8Array) => {
        const t = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_2D, t)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, fill)
        this.setTexParams()
        const f = gl.createFramebuffer()!
        gl.bindFramebuffer(gl.FRAMEBUFFER, f)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
        return { t, f }
      }
      if (this.texA) gl.deleteTexture(this.texA)
      if (this.texB) gl.deleteTexture(this.texB)
      if (this.fboA) gl.deleteFramebuffer(this.fboA)
      if (this.fboB) gl.deleteFramebuffer(this.fboB)
      const a = make(new Uint8Array(bw * bh * 4))
      const b = make(new Uint8Array(bw * bh * 4))
      this.texA = a.t; this.fboA = a.f
      this.texB = b.t; this.fboB = b.f
    }

    const texelX = 1 / bw
    const texelY = 1 / bh
    // 半径换算成模糊图上的纹素：1 纹素 = bgCssW/bw 个 css px
    const texelsPerCss = bw / Math.max(this.bgCssW, 1)
    const radius = Math.max(0, this.params.blur * texelsPerCss)

    gl.useProgram(this.blurProg)
    gl.bindVertexArray(this.vao)
    gl.uniform1i(this.ub('u_tex'), 0)
    gl.uniform2f(this.ub('u_texel'), texelX, texelY)

    // pass 1：源 → A（降采样）
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA)
    gl.viewport(0, 0, bw, bh)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.uniform1f(this.ub('u_pass'), 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // pass 2：A → B（圆盘高斯）
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB)
    gl.bindTexture(gl.TEXTURE_2D, this.texA)
    gl.uniform1f(this.ub('u_pass'), 1)
    gl.uniform1f(this.ub('u_radius'), radius)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // pass 3：B → A（再跑一次，把稀疏抽样抹平）
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA)
    gl.bindTexture(gl.TEXTURE_2D, this.texB)
    gl.uniform1f(this.ub('u_radius'), radius * 0.6)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.needUpload = false
  }

  resize() {
    const gl = this.gl
    if (!gl) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(this.canvas.clientWidth * dpr)
    const h = Math.round(this.canvas.clientHeight * dpr)
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  render(o: RenderOpts) {
    const gl = this.gl
    if (!gl || !this.prog) return
    if ((this.needUpload || this.uploadedBlur !== this.params.blur) && this.src) {
      this.buildBlur()
      this.uploadedBlur = this.params.blur
    }
    const p = this.params
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const cssW = this.canvas.clientWidth
    const cssH = this.canvas.clientHeight
    const w = this.canvas.width
    const h = this.canvas.height

    // 中心取色 pass：在栏体正中的 5x3 网格里挑出最有颜色的一口，写进 1x1 贴图
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboPick)
    gl.viewport(0, 0, 1, 1)
    gl.useProgram(this.pickProg)
    gl.bindVertexArray(this.vao)
    gl.uniform1i(this.up('u_bg'), 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texA)
    const midUV = [
      (o.originX + cssW * 0.5) / this.bgCssW,
      (o.originY + cssH * 0.5 + o.scrollY) / this.bgCssH,
    ]
    gl.uniform2f(this.up('u_mid'), midUV[0], midUV[1])
    // 取样网格：以栏体本体为中心，13 列 x 7 行，向外扩 pickMargin 像素。
    // pickMargin=0 时网格正好铺满栏体内部；给正值就把栏体周边一圈也算进来。
    // 尺寸必须按栏体本体算，不能按画布算 —— 画布上下各留了 PAD 的透明边给外阴影。
    const dockW = cssW - PAD * 2
    const dockH = cssH - PAD * 2
    gl.uniform2f(
      this.up('u_step'),
      (dockW * 0.5 + p.pickMargin) / 6 / this.bgCssW,
      (dockH * 0.5 + p.pickMargin) / 3 / this.bgCssH,
    )
    gl.uniform2f(this.up('u_mid2'), midUV[0], midUV[1])
    gl.uniform1f(this.up('u_spanY'), 1.0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // 每 10 帧读回 1 个像素，给调试面板显示取色结果（1 像素开销可忽略）
    if (this.pickFrame++ % 10 === 0) {
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pickBuf)
      this.pickedRGB = [this.pickBuf[0], this.pickBuf[1], this.pickBuf[2]]
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    gl.uniform1i(this.u('u_bg'), 0)
    gl.uniform1i(this.u('u_pick'), 1)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.texPick)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texA)
    gl.uniform2f(this.u('u_res'), cssW, cssH)
    gl.uniform1f(this.u('u_dpr'), dpr)
    gl.uniform2f(this.u('u_origin'), o.originX, o.originY)
    gl.uniform2f(this.u('u_bgSize'), this.bgCssW, this.bgCssH)
    gl.uniform1f(this.u('u_scroll'), o.scrollY)
    gl.uniform1f(this.u('u_time'), o.time)
    gl.uniform1f(this.u('u_pad'), PAD)
    gl.uniform1f(this.u('u_radius'), p.radius)
    gl.uniform1f(this.u('u_refrH'), p.refractionHeight)
    gl.uniform1f(this.u('u_refrAmt'), p.refractionAmount)
    gl.uniform1f(this.u('u_disp'), p.dispersion)
    gl.uniform1f(this.u('u_fresnel'), p.fresnel)
    gl.uniform1f(this.u('u_glare'), p.glare)
    gl.uniform1f(this.u('u_tint'), p.tint)
    gl.uniform1f(this.u('u_vibrancy'), p.vibrancy)
    gl.uniform1f(this.u('u_pillLift'), p.pillLift)
    gl.uniform1f(this.u('u_pillShade'), p.pillShade)
    gl.uniform1f(this.u('u_sheen'), p.sheen)
    gl.uniform1f(this.u('u_edgeTint'), p.edgeTint)
    gl.uniform1f(this.u('u_centerMix'), p.centerMix)
    gl.uniform1f(this.u('u_pickDepth'), p.pickDepth)
    gl.uniform1f(this.u('u_pickVivid'), p.pickVivid)
    gl.uniform1f(this.u('u_pickGain'), p.pickGain)
    gl.uniform3f(this.u('u_accent'), p.accent[0], p.accent[1], p.accent[2])
    gl.uniform1f(this.u('u_accentMix'), p.accentMix)
    gl.uniform1f(this.u('u_ambient'), p.ambient)
    gl.uniform1f(this.u('u_glow'), p.glow)
    gl.uniform1f(this.u('u_glowR'), p.glowR)
    gl.uniform2f(this.u('u_squash'), o.squashX, o.squashY)
    if (o.pill) {
      gl.uniform4f(this.u('u_pill'), o.pill.cx, o.pill.cy, o.pill.hw, o.pill.hh)
      gl.uniform2f(this.u('u_pillSq'), o.pill.sx, o.pill.sy)
      gl.uniform1f(this.u('u_pillOn'), 1)
    } else {
      gl.uniform1f(this.u('u_pillOn'), 0)
    }
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose() {
    const gl = this.gl
    if (!gl) return
    ;[this.tex, this.texA, this.texB, this.texPick].forEach((t) => t && gl.deleteTexture(t))
    ;[this.fboA, this.fboB, this.fboPick].forEach((f) => f && gl.deleteFramebuffer(f))
    if (this.prog) gl.deleteProgram(this.prog)
    if (this.blurProg) gl.deleteProgram(this.blurProg)
    if (this.pickProg) gl.deleteProgram(this.pickProg)
    this.gl = null
    this.prog = null
    this.blurProg = null
  }
}