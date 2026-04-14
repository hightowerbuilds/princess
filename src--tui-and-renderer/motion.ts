/**
 * motion.ts — Reactive animation primitives for terminal UI
 *
 * All animations are driven by SolidJS signals and designed for
 * the ~60fps terminal render loop. Each primitive produces an
 * Accessor<number> that downstream effects can subscribe to.
 *
 * Primitives:
 *   createSpring()          — damped harmonic oscillator
 *   createTween()           — eased interpolation over fixed duration
 *   createStaggeredReveal() — reveal list items with per-item delay
 *   createCursorTrail()     — fading highlight on previous positions
 *   createBreathingPulse()  — sinusoidal idle animation
 *   createDecay()           — momentum-based deceleration (for flick scrolling)
 */

import {
  createSignal,
  createEffect,
  onCleanup,
  batch,
  type Accessor,
} from "solid-js";

// ── Spring ───────────────────────────────────────────────────────────────

export interface SpringConfig {
  /** Spring stiffness. Higher = snappier. Default: 170. */
  stiffness?: number;
  /** Damping coefficient. Higher = less oscillation. Default: 26. */
  damping?: number;
  /** Mass. Higher = more inertia. Default: 1. */
  mass?: number;
  /** Snap-to-target threshold. Default: 0.01. */
  precision?: number;
}

/** Common spring presets. */
export const SPRING_PRESETS = {
  /** Default — balanced feel. */
  default: { stiffness: 170, damping: 26 } as SpringConfig,
  /** Gentle — slow and smooth. */
  gentle: { stiffness: 120, damping: 14 } as SpringConfig,
  /** Wobbly — bouncy with overshoot. */
  wobbly: { stiffness: 180, damping: 12 } as SpringConfig,
  /** Stiff — snappy with minimal oscillation. */
  stiff: { stiffness: 210, damping: 20 } as SpringConfig,
  /** Snappy — fast and decisive. */
  snappy: { stiffness: 300, damping: 30 } as SpringConfig,
  /** Molasses — very slow, heavy feel. */
  molasses: { stiffness: 60, damping: 18, mass: 2 } as SpringConfig,
} as const;

/**
 * Create a spring-animated signal that smoothly follows a source signal.
 *
 * Uses a damped harmonic oscillator simulated at ~60fps. The spring
 * automatically starts animating when the source changes and stops
 * when it converges (velocity and displacement below precision).
 *
 * ```ts
 * const [target, setTarget] = createSignal(0);
 * const smooth = createSpring(target, SPRING_PRESETS.gentle);
 *
 * // In a render effect:
 * createEffect(() => {
 *   const scrollY = Math.round(smooth());
 *   // render at scrollY
 * });
 *
 * // Later:
 * setTarget(50); // smooth() will animate from 0 to 50
 * ```
 */
export function createSpring(
  source: Accessor<number>,
  config?: SpringConfig,
): Accessor<number> {
  const stiffness = config?.stiffness ?? 170;
  const damping = config?.damping ?? 26;
  const mass = config?.mass ?? 1;
  const precision = config?.precision ?? 0.01;
  const dt = 1 / 60;

  const [value, setValue] = createSignal(source());
  let velocity = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick() {
    const target = source();
    const current = value();
    const displacement = current - target;

    // Damped harmonic oscillator: F = -kx - dv
    const springForce = -stiffness * displacement;
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;

    velocity += acceleration * dt;
    const next = current + velocity * dt;

    // Check convergence
    if (Math.abs(next - target) < precision && Math.abs(velocity) < precision) {
      setValue(target);
      velocity = 0;
      stopAnimation();
      return;
    }

    setValue(next);
  }

  function startAnimation() {
    if (timer !== null) return;
    timer = setInterval(tick, 16);
  }

  function stopAnimation() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  createEffect(() => {
    const target = source();
    const current = value();
    if (Math.abs(current - target) > precision || Math.abs(velocity) > precision) {
      startAnimation();
    }
  });

  onCleanup(stopAnimation);

  return value;
}

/**
 * Immediately snap a spring to the source value (skip animation).
 * Useful for initial positioning or teleporting.
 *
 * Note: this returns a new accessor wrapping the source with
 * a snap capability. For most cases, just set the source signal
 * directly and create a new spring.
 */

// ── Tween ────────────────────────────────────────────────────────────────

export interface TweenConfig {
  /** Animation duration in ms. Default: 200. */
  duration?: number;
  /** Easing function. Default: easeOutCubic. */
  easing?: (t: number) => number;
}

/** Common easing functions. */
export const EASING = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeOutBack: (t: number) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  easeOutElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
} as const;

/**
 * Create a tween-animated signal that interpolates from the current
 * value to the source value over a fixed duration.
 *
 * Unlike springs, tweens have a predictable end time. Good for
 * transitions where timing matters more than physics feel.
 *
 * ```ts
 * const [opacity, setOpacity] = createSignal(0);
 * const smoothOpacity = createTween(opacity, {
 *   duration: 300,
 *   easing: EASING.easeOutCubic,
 * });
 * setOpacity(1); // smoothOpacity animates 0 → 1 over 300ms
 * ```
 */
export function createTween(
  source: Accessor<number>,
  config?: TweenConfig,
): Accessor<number> {
  const duration = config?.duration ?? 200;
  const easing = config?.easing ?? EASING.easeOutCubic;

  const [value, setValue] = createSignal(source());
  let fromValue = source();
  let toValue = source();
  let startTime = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick() {
    const elapsed = Date.now() - startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = easing(t);
    const current = fromValue + (toValue - fromValue) * eased;

    setValue(current);

    if (t >= 1) {
      setValue(toValue);
      stopAnimation();
    }
  }

  function startAnimation() {
    if (timer !== null) clearInterval(timer);
    timer = setInterval(tick, 16);
  }

  function stopAnimation() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  createEffect(() => {
    const target = source();
    if (target !== toValue) {
      fromValue = value();
      toValue = target;
      startTime = Date.now();
      startAnimation();
    }
  });

  onCleanup(stopAnimation);

  return value;
}

// ── Staggered Reveal ─────────────────────────────────────────────────────

export interface StaggerConfig {
  /** Delay between each item reveal in ms. Default: 30. */
  delay?: number;
  /** Easing for each item's opacity. Default: easeOutCubic. */
  easing?: (t: number) => number;
  /** Duration of each item's fade-in in ms. Default: 150. */
  fadeDuration?: number;
}

/**
 * Reveal list items with a staggered delay.
 *
 * Returns a function that gives the opacity (0.0–1.0) for a given
 * item index. Items appear one by one with `delay` ms between them.
 *
 * ```ts
 * const getOpacity = createStaggeredReveal(
 *   () => items().length,
 *   { delay: 30 },
 * );
 *
 * // In rendering:
 * for (let i = 0; i < items().length; i++) {
 *   const opacity = getOpacity(i); // 0.0 to 1.0
 *   const style = opacity < 1 ? dim : identity;
 *   lines.push(style(renderItem(items()[i])));
 * }
 * ```
 */
export function createStaggeredReveal(
  itemCount: Accessor<number>,
  config?: StaggerConfig,
): (index: number) => number {
  const delay = config?.delay ?? 30;
  const fadeDuration = config?.fadeDuration ?? 150;
  const easing = config?.easing ?? EASING.easeOutCubic;

  const [startTime, setStartTime] = createSignal(0);
  const [now, setNow] = createSignal(0);
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastCount = 0;

  function startAnimation() {
    if (timer !== null) clearInterval(timer);
    timer = setInterval(() => setNow(Date.now()), 16);
  }

  function stopAnimation() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  createEffect(() => {
    const count = itemCount();
    if (count !== lastCount && count > 0) {
      lastCount = count;
      setStartTime(Date.now());
      setNow(Date.now());
      startAnimation();
    }
  });

  onCleanup(stopAnimation);

  return (index: number): number => {
    const start = startTime();
    const current = now();
    if (start === 0) return 1; // No animation active

    const itemStart = start + index * delay;
    const elapsed = current - itemStart;

    if (elapsed <= 0) return 0;
    if (elapsed >= fadeDuration) {
      // Check if all items are done
      const totalDuration = (itemCount() - 1) * delay + fadeDuration;
      if (current - start >= totalDuration) {
        stopAnimation();
      }
      return 1;
    }

    return easing(elapsed / fadeDuration);
  };
}

// ── Cursor Trail ─────────────────────────────────────────────────────────

export interface CursorTrailConfig {
  /** Number of frames for the trail to fade out. Default: 4. */
  fadeFrames?: number;
  /** Max number of trail positions to track. Default: 3. */
  maxTrail?: number;
}

/**
 * Track cursor movement and provide fading trail opacities.
 *
 * Returns a function that gives the trail opacity (0.0–1.0) for
 * any given index. The current cursor position returns 0 (not a
 * trail). Previous positions return decreasing values.
 *
 * ```ts
 * const getTrailOpacity = createCursorTrail(
 *   () => state.reviewCursor(),
 *   { fadeFrames: 4 },
 * );
 *
 * // In rendering:
 * const trailOpacity = getTrailOpacity(itemIndex);
 * if (trailOpacity > 0) {
 *   // Apply dim highlight proportional to trailOpacity
 * }
 * ```
 */
export function createCursorTrail(
  cursor: Accessor<number>,
  config?: CursorTrailConfig,
): (index: number) => number {
  const fadeFrames = config?.fadeFrames ?? 4;
  const maxTrail = config?.maxTrail ?? 3;

  // Each entry: { position, remainingFrames }
  const [trails, setTrails] = createSignal<Array<{ pos: number; frames: number }>>([]);
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastCursor = cursor();

  function tick() {
    setTrails((prev) => {
      const next = prev
        .map((t) => ({ pos: t.pos, frames: t.frames - 1 }))
        .filter((t) => t.frames > 0);
      if (next.length === 0) stopAnimation();
      return next;
    });
  }

  function startAnimation() {
    if (timer !== null) return;
    timer = setInterval(tick, 16 * 3); // Fade one step every ~3 frames
  }

  function stopAnimation() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  createEffect(() => {
    const current = cursor();
    if (current !== lastCursor) {
      setTrails((prev) => {
        const next = [{ pos: lastCursor, frames: fadeFrames }, ...prev];
        return next.slice(0, maxTrail);
      });
      lastCursor = current;
      startAnimation();
    }
  });

  onCleanup(stopAnimation);

  return (index: number): number => {
    const trailList = trails();
    for (const trail of trailList) {
      if (trail.pos === index) {
        return trail.frames / fadeFrames;
      }
    }
    return 0;
  };
}

// ── Breathing Pulse ──────────────────────────────────────────────────────

export interface BreathingConfig {
  /** Full cycle period in ms. Default: 4000 (4 seconds). */
  period?: number;
  /** Minimum value of the pulse. Default: 0.3. */
  min?: number;
  /** Maximum value of the pulse. Default: 1.0. */
  max?: number;
}

/**
 * Create a sinusoidal pulse signal for idle animations.
 *
 * Returns a value that oscillates smoothly between `min` and `max`
 * over the given period. Use to modulate color intensity, border
 * brightness, or other visual properties.
 *
 * Call `start()` to begin pulsing and `stop()` to freeze.
 *
 * ```ts
 * const pulse = createBreathingPulse({ period: 3000 });
 * pulse.start();
 *
 * // In rendering:
 * createEffect(() => {
 *   const brightness = pulse.value();
 *   // Apply to header: rgb(brightness * 100, brightness * 200, brightness * 255)
 * });
 * ```
 */
export function createBreathingPulse(config?: BreathingConfig): {
  value: Accessor<number>;
  start: () => void;
  stop: () => void;
  isActive: Accessor<boolean>;
} {
  const period = config?.period ?? 4000;
  const min = config?.min ?? 0.3;
  const max = config?.max ?? 1.0;
  const amplitude = (max - min) / 2;
  const center = min + amplitude;

  const [value, setValue] = createSignal(max);
  const [active, setActive] = createSignal(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let startTime = 0;

  function tick() {
    const elapsed = Date.now() - startTime;
    const phase = (elapsed / period) * Math.PI * 2;
    // Cosine starts at 1 (max), dips to -1 (min), smooth cycle
    setValue(center + amplitude * Math.cos(phase));
  }

  function start() {
    if (timer !== null) return;
    startTime = Date.now();
    setActive(true);
    timer = setInterval(tick, 16);
  }

  function stop() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    setActive(false);
    setValue(max); // Reset to full brightness
  }

  onCleanup(stop);

  return { value, start, stop, isActive: active };
}

// ── Decay (Momentum Scrolling) ───────────────────────────────────────────

export interface DecayConfig {
  /** Deceleration rate. Higher = stops faster. Default: 0.95. */
  deceleration?: number;
  /** Minimum velocity to keep animating. Default: 0.5. */
  minVelocity?: number;
}

/**
 * Momentum-based deceleration for flick/scroll gestures.
 *
 * Call `push(velocity)` to start a decay animation from the current
 * value. The value decelerates smoothly until it stops.
 *
 * ```ts
 * const scroll = createDecay({ deceleration: 0.95 });
 *
 * // On rapid key presses (flick gesture):
 * scroll.push(5); // Start scrolling at velocity 5
 *
 * // In rendering:
 * const offset = Math.round(scroll.value());
 * ```
 */
export function createDecay(config?: DecayConfig): {
  value: Accessor<number>;
  push: (velocity: number) => void;
  set: (position: number) => void;
  isAnimating: Accessor<boolean>;
} {
  const deceleration = config?.deceleration ?? 0.95;
  const minVelocity = config?.minVelocity ?? 0.5;

  const [value, setValue] = createSignal(0);
  const [animating, setAnimating] = createSignal(false);
  let velocity = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick() {
    velocity *= deceleration;
    setValue((prev) => prev + velocity);

    if (Math.abs(velocity) < minVelocity) {
      velocity = 0;
      stopAnimation();
    }
  }

  function startAnimation() {
    if (timer !== null) return;
    setAnimating(true);
    timer = setInterval(tick, 16);
  }

  function stopAnimation() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    setAnimating(false);
  }

  function push(v: number) {
    velocity += v;
    startAnimation();
  }

  function set(position: number) {
    stopAnimation();
    velocity = 0;
    setValue(position);
  }

  onCleanup(stopAnimation);

  return { value, push, set, isAnimating: animating };
}

// ── Typewriter Reveal ─────────────────────────────────────────────────────

export interface TypewriterConfig {
  /** Delay between revealing each segment in ms. Default: 40. */
  segmentDelay?: number;
}

/**
 * Reveal items sequentially with a typewriter effect.
 *
 * Each segment appears one at a time with `segmentDelay` ms between
 * them. Returns an opacity function (0.0–1.0) per index — segments
 * before the cursor are 1, the active segment fades in, segments
 * after are 0. Unlike staggered reveal, only one segment is
 * "typing" at a time.
 *
 * ```ts
 * const typewriter = createTypewriterReveal(() => lines.length, { segmentDelay: 60 });
 *
 * for (let i = 0; i < lines.length; i++) {
 *   const opacity = typewriter.opacity(i);
 *   if (opacity === 0) continue; // not yet visible
 *   if (opacity < 1) renderDim(lines[i]);
 *   else render(lines[i]);
 * }
 * ```
 */
export function createTypewriterReveal(
  segmentCount: Accessor<number>,
  config?: TypewriterConfig,
): {
  opacity: (index: number) => number;
  revealedCount: () => number;
  isAnimating: () => boolean;
  revealAll: () => void;
  reset: () => void;
} {
  const segmentDelay = config?.segmentDelay ?? 40;

  const [startTime, setStartTime] = createSignal(0);
  const [now, setNow] = createSignal(0);
  const [allRevealed, setAllRevealed] = createSignal(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastCount = 0;

  function startTimer() {
    if (timer !== null) clearInterval(timer);
    timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      // Auto-stop when all segments revealed
      const start = startTime();
      if (start > 0 && current - start >= segmentCount() * segmentDelay) {
        stopTimer();
      }
    }, 16);
  }

  function stopTimer() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  createEffect(() => {
    const count = segmentCount();
    if (count !== lastCount && count > 0 && !allRevealed()) {
      lastCount = count;
      setStartTime(Date.now());
      setNow(Date.now());
      startTimer();
    }
  });

  onCleanup(stopTimer);

  function getRevealed(): number {
    if (allRevealed()) return segmentCount();
    const start = startTime();
    if (start === 0) return segmentCount();
    const elapsed = now() - start;
    return Math.min(Math.floor(elapsed / segmentDelay), segmentCount());
  }

  return {
    opacity: (index: number): number => {
      if (allRevealed()) return 1;
      const start = startTime();
      if (start === 0) return 1;
      const itemStart = start + index * segmentDelay;
      const elapsed = now() - itemStart;
      if (elapsed <= 0) return 0;
      if (elapsed >= segmentDelay) return 1;
      return elapsed / segmentDelay;
    },
    revealedCount: getRevealed,
    isAnimating: (): boolean => {
      if (allRevealed()) return false;
      return getRevealed() < segmentCount();
    },
    revealAll: () => {
      setAllRevealed(true);
      stopTimer();
    },
    reset: () => {
      setAllRevealed(false);
      lastCount = 0;
      setStartTime(0);
      stopTimer();
    },
  };
}

// ── Crossfade ─────────────────────────────────────────────────────────────

export interface CrossfadeConfig {
  /** Duration of crossfade in ms. Default: 200. */
  duration?: number;
  /** Easing function. Default: easeOutCubic. */
  easing?: (t: number) => number;
}

/**
 * Track scene transitions and provide crossfade progress.
 *
 * When the scene signal changes, the progress animates from 0 → 1
 * over the configured duration. The previous scene value is available
 * during the transition for compositing.
 *
 * ```ts
 * const crossfade = createCrossfade(() => currentScreen);
 *
 * createEffect(() => {
 *   if (crossfade.isTransitioning()) {
 *     const p = crossfade.progress();
 *     // p < 0.5: show outgoing (dimming)
 *     // p >= 0.5: show incoming (brightening)
 *   }
 * });
 * ```
 */
export function createCrossfade<T>(
  scene: Accessor<T>,
  config?: CrossfadeConfig,
): {
  progress: Accessor<number>;
  isTransitioning: Accessor<boolean>;
  previousScene: Accessor<T | null>;
} {
  const duration = config?.duration ?? 200;
  const easing = config?.easing ?? EASING.easeOutCubic;

  const [progress, setProgress] = createSignal(1);
  const [transitioning, setTransitioning] = createSignal(false);
  const [prevScene, setPrevScene] = createSignal<T | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  let startTime = 0;
  let lastScene: T = scene();

  function startAnimation() {
    if (timer !== null) clearInterval(timer);
    startTime = Date.now();
    setTransitioning(true);
    timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      setProgress(easing(t));
      if (t >= 1) {
        setProgress(1);
        setTransitioning(false);
        setPrevScene(null);
        stopAnimation();
      }
    }, 16);
  }

  function stopAnimation() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  createEffect(() => {
    const current = scene();
    if (current !== lastScene) {
      setPrevScene(() => lastScene as T);
      lastScene = current;
      setProgress(0);
      startAnimation();
    }
  });

  onCleanup(stopAnimation);

  return {
    progress,
    isTransitioning: transitioning,
    previousScene: prevScene,
  };
}

// ── Fold ──────────────────────────────────────────────────────────────────

export interface FoldConfig {
  /** Animation duration in ms. Default: 200. */
  duration?: number;
  /** Easing function. Default: easeOutCubic. */
  easing?: (t: number) => number;
}

/**
 * Animate folding/unfolding of content sections.
 *
 * Returns a progress signal (0 = collapsed, 1 = expanded) that
 * tweens when the open state changes. Use `visibleLines(total)` to
 * get the number of lines to render.
 *
 * ```ts
 * const [open, setOpen] = createSignal(false);
 * const fold = createFold(open, { duration: 250 });
 *
 * // Render only the visible portion:
 * const visible = fold.visibleLines(detailLines.length);
 * for (let i = 0; i < visible; i++) render(detailLines[i]);
 * ```
 */
export function createFold(
  open: Accessor<boolean>,
  config?: FoldConfig,
): {
  progress: Accessor<number>;
  visibleLines: (totalLines: number) => number;
  isAnimating: Accessor<boolean>;
} {
  const duration = config?.duration ?? 200;
  const easing = config?.easing ?? EASING.easeOutCubic;

  const [progress, setProgress] = createSignal(open() ? 1 : 0);
  const [animating, setAnimating] = createSignal(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let startTime = 0;
  let fromValue = open() ? 1 : 0;
  let toValue = open() ? 1 : 0;

  function startAnimation() {
    if (timer !== null) clearInterval(timer);
    startTime = Date.now();
    setAnimating(true);
    timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const easedT = easing(t);
      setProgress(fromValue + (toValue - fromValue) * easedT);
      if (t >= 1) {
        setProgress(toValue);
        setAnimating(false);
        stopAnimation();
      }
    }, 16);
  }

  function stopAnimation() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  createEffect(() => {
    const target = open() ? 1 : 0;
    if (target !== toValue) {
      fromValue = progress();
      toValue = target;
      startAnimation();
    }
  });

  onCleanup(stopAnimation);

  return {
    progress,
    visibleLines: (totalLines: number): number => {
      return Math.round(progress() * totalLines);
    },
    isAnimating: animating,
  };
}

// ── Bounce ────────────────────────────────────────────────────────────────

export interface BounceConfig {
  /** Duration of the bounce-back in ms. Default: 300. */
  duration?: number;
  /** Easing function for the bounce-back. Default: easeOutCubic. */
  easing?: (t: number) => number;
}

/**
 * Triggered bounce effect for elastic overscroll.
 *
 * Call `trigger(magnitude)` to start a bounce. The value signal
 * goes from `magnitude` → 0 over the configured duration.
 * Use the value to offset content position for overscroll feel.
 *
 * ```ts
 * const bounce = createBounce({ duration: 300 });
 *
 * // When user scrolls past the end:
 * bounce.trigger(2); // bounce 2 lines
 *
 * // In rendering:
 * const shift = Math.round(bounce.value());
 * // offset visible content by `shift` lines
 * ```
 */
export function createBounce(config?: BounceConfig): {
  value: Accessor<number>;
  trigger: (magnitude?: number) => void;
  isActive: Accessor<boolean>;
} {
  const duration = config?.duration ?? 300;
  const easing = config?.easing ?? EASING.easeOutCubic;

  const [value, setValue] = createSignal(0);
  const [active, setActive] = createSignal(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let startTime = 0;
  let magnitude = 0;

  function startAnimation() {
    if (timer !== null) clearInterval(timer);
    startTime = Date.now();
    setActive(true);
    timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      setValue(magnitude * (1 - easing(t)));
      if (t >= 1) {
        setValue(0);
        setActive(false);
        stopAnimation();
      }
    }, 16);
  }

  function stopAnimation() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  function trigger(mag?: number) {
    magnitude = mag ?? 1;
    setValue(magnitude);
    startAnimation();
  }

  onCleanup(stopAnimation);

  return { value, trigger, isActive: active };
}

// ── Glow Pulse ────────────────────────────────────────────────────────────

export interface GlowConfig {
  /** Full cycle period in ms. Default: 2000. */
  period?: number;
  /** Base (dim) color. Default: [255, 100, 50]. */
  baseColor?: [number, number, number];
  /** Glow (bright) color. Default: [255, 200, 100]. */
  glowColor?: [number, number, number];
}

/**
 * Sinusoidal color pulse between two RGB values.
 *
 * Like `createBreathingPulse` but produces an RGB triple instead
 * of a scalar. Use for warning indicators, status highlights, or
 * any element that needs an attention-drawing color cycle.
 *
 * ```ts
 * const glow = createGlowPulse({
 *   baseColor: [255, 80, 60],
 *   glowColor: [255, 200, 100],
 * });
 * glow.start();
 *
 * // In rendering:
 * const [r, g, b] = glow.rgb();
 * ```
 */
export function createGlowPulse(config?: GlowConfig): {
  rgb: Accessor<[number, number, number]>;
  start: () => void;
  stop: () => void;
  isActive: Accessor<boolean>;
} {
  const period = config?.period ?? 2000;
  const baseColor = config?.baseColor ?? [255, 100, 50];
  const glowColor = config?.glowColor ?? [255, 200, 100];

  const [value, setValue] = createSignal<[number, number, number]>([...baseColor] as [number, number, number]);
  const [active, setActive] = createSignal(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let startTime = 0;

  function tick() {
    const elapsed = Date.now() - startTime;
    const phase = (elapsed / period) * Math.PI * 2;
    const t = (Math.cos(phase) + 1) / 2; // smooth 0→1→0

    setValue(() => [
      Math.round(baseColor[0] + (glowColor[0] - baseColor[0]) * t),
      Math.round(baseColor[1] + (glowColor[1] - baseColor[1]) * t),
      Math.round(baseColor[2] + (glowColor[2] - baseColor[2]) * t),
    ] as [number, number, number]);
  }

  function start() {
    if (timer !== null) return;
    startTime = Date.now();
    setActive(true);
    timer = setInterval(tick, 16);
  }

  function stop() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    setActive(false);
    setValue(() => [...baseColor] as [number, number, number]);
  }

  onCleanup(stop);

  return { rgb: value, start, stop, isActive: active };
}

// ── Marquee ───────────────────────────────────────────────────────────────

export interface MarqueeConfig {
  /** Scroll speed in characters per frame. Default: 0.5. */
  speed?: number;
  /** Pause duration at each end in ms. Default: 1500. */
  pauseMs?: number;
}

/**
 * Oscillating text scroll for names that overflow their container.
 *
 * When `textWidth > viewWidth`, the offset oscillates back and
 * forth between 0 and the overflow amount, pausing briefly at
 * each end. When text fits, offset stays at 0.
 *
 * ```ts
 * const marquee = createMarquee(
 *   () => stringWidth(longName),
 *   () => 20,
 * );
 *
 * // In rendering:
 * const offset = Math.round(marquee.offset());
 * const visible = longName.slice(offset, offset + 20);
 * ```
 */
export function createMarquee(
  textWidth: Accessor<number>,
  viewWidth: Accessor<number>,
  config?: MarqueeConfig,
): {
  offset: Accessor<number>;
  isActive: Accessor<boolean>;
} {
  const speed = config?.speed ?? 0.5;
  const pauseMs = config?.pauseMs ?? 1500;

  const [offset, setOffset] = createSignal(0);
  const [active, setActive] = createSignal(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let direction = 1;
  let pauseUntil = 0;

  function tick() {
    const overflow = textWidth() - viewWidth();
    if (overflow <= 0) {
      setOffset(0);
      return;
    }

    const now = Date.now();
    if (now < pauseUntil) return;

    setOffset((prev) => {
      let next = prev + direction * speed;
      if (next >= overflow) {
        next = overflow;
        direction = -1;
        pauseUntil = Date.now() + pauseMs;
      } else if (next <= 0) {
        next = 0;
        direction = 1;
        pauseUntil = Date.now() + pauseMs;
      }
      return next;
    });
  }

  function startAnimation() {
    if (timer !== null) return;
    direction = 1;
    pauseUntil = Date.now() + pauseMs;
    setActive(true);
    timer = setInterval(tick, 16);
  }

  function stopAnimation() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    setActive(false);
    setOffset(0);
  }

  createEffect(() => {
    const overflow = textWidth() - viewWidth();
    if (overflow > 0 && !active()) {
      startAnimation();
    } else if (overflow <= 0 && active()) {
      stopAnimation();
    }
  });

  onCleanup(stopAnimation);

  return { offset, isActive: active };
}

// ── Debounce ──────────────────────────────────────────────────────────────

/**
 * Debounce a signal — delays propagation until the source has been
 * stable for `delayMs` milliseconds.
 *
 * Useful for hover preview: start a delayed expansion when the cursor
 * settles on an item, cancel if the cursor moves before the delay.
 *
 * ```ts
 * const [cursor, setCursor] = createSignal(0);
 * const settled = createDebounce(cursor, 200);
 *
 * // settled() only updates 200ms after cursor stops changing
 * ```
 */
export function createDebounce<T>(
  source: Accessor<T>,
  delayMs: number,
): Accessor<T> {
  const [value, setValue] = createSignal<T>(source());
  let timer: ReturnType<typeof setTimeout> | null = null;

  createEffect(() => {
    const current = source();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      setValue(() => current as any);
      timer = null;
    }, delayMs);
  });

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  return value as Accessor<T>;
}

// ── Utilities ────────────────────────────────────────────────────────────

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Map a value from one range to another.
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  const t = (value - inMin) / (inMax - inMin);
  return lerp(outMin, outMax, clamp(t, 0, 1));
}
