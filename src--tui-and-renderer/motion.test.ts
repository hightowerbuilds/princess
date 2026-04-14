/**
 * motion.test.ts — Tests for reactive animation primitives.
 *
 * Reactive tests use createRoot with setTimeout callbacks
 * (not async/await) to preserve SolidJS's tracking context.
 */
import { createSignal, createRoot } from "solid-js";
import {
  createSpring,
  createTween,
  createStaggeredReveal,
  createCursorTrail,
  createBreathingPulse,
  createDecay,
  createTypewriterReveal,
  createCrossfade,
  createFold,
  createBounce,
  createGlowPulse,
  createMarquee,
  createDebounce,
  clamp,
  lerp,
  mapRange,
  SPRING_PRESETS,
  EASING,
} from "./motion.ts";

let passed = 0;
let failed = 0;
let pending = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else { failed++; console.error(`  FAIL: ${message}`); }
}

function assertEq<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else { failed++; console.error(`  FAIL: ${message}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string) {
  if (Math.abs(actual - expected) <= tolerance) passed++;
  else { failed++; console.error(`  FAIL: ${message}\n    expected: ~${expected} (±${tolerance})\n    actual:   ${actual}`); }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

// ── Utility functions (synchronous) ──────────────────────────────────────

section("clamp / lerp / mapRange");

assertEq(clamp(5, 0, 10), 5, "clamp: within range");
assertEq(clamp(-5, 0, 10), 0, "clamp: below min");
assertEq(clamp(15, 0, 10), 10, "clamp: above max");

assertEq(lerp(0, 10, 0), 0, "lerp: t=0");
assertEq(lerp(0, 10, 1), 10, "lerp: t=1");
assertEq(lerp(0, 10, 0.5), 5, "lerp: t=0.5");

assertEq(mapRange(50, 0, 100, 0, 1), 0.5, "mapRange: middle");
assertEq(mapRange(0, 0, 100, 0, 1), 0, "mapRange: min");
assertEq(mapRange(100, 0, 100, 0, 1), 1, "mapRange: max");
assertEq(mapRange(-50, 0, 100, 0, 1), 0, "mapRange: clamped below");
assertEq(mapRange(200, 0, 100, 0, 1), 1, "mapRange: clamped above");

// ── Easing functions ─────────────────────────────────────────────────────

section("easing functions");

for (const [name, fn] of Object.entries(EASING)) {
  assertApprox(fn(0), 0, 0.001, `${name}(0) ≈ 0`);
  assertApprox(fn(1), 1, 0.001, `${name}(1) ≈ 1`);
  const mid = fn(0.5);
  assert(mid >= -0.5 && mid <= 1.5, `${name}(0.5) in reasonable range (got ${mid.toFixed(3)})`);
}

// ── Spring presets ───────────────────────────────────────────────────────

section("spring presets");

assert(SPRING_PRESETS.default.stiffness! > 0, "default preset has stiffness");
assert(SPRING_PRESETS.gentle.damping! > 0, "gentle preset has damping");
assert(SPRING_PRESETS.wobbly.stiffness! > 0, "wobbly preset exists");
assert(SPRING_PRESETS.stiff.stiffness! > 0, "stiff preset exists");
assert(SPRING_PRESETS.snappy.stiffness! > 0, "snappy preset exists");
assert(SPRING_PRESETS.molasses.mass! > 0, "molasses preset has mass");

// ── Async reactive tests ─────────────────────────────────────────────────

// Each test registers with `pending` and resolves by decrementing.
// Summary prints when all pending tests complete.

function scheduleTest(name: string, fn: (done: () => void) => void) {
  pending++;
  section(name);
  fn(() => {
    pending--;
    if (pending === 0) printSummary();
  });
}

function printSummary() {
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  else console.log("All tests passed!");
}

// ── createSpring ─────────────────────────────────────────────────────────

scheduleTest("createSpring", (done) => {
  createRoot((dispose) => {
    const [target, setTarget] = createSignal(0);
    const smooth = createSpring(target, SPRING_PRESETS.snappy);

    assertEq(smooth(), 0, "spring starts at source value");

    setTarget(100);

    setTimeout(() => {
      const mid = smooth();
      assert(mid > 0 && mid < 100, `spring mid-animation: ${mid.toFixed(1)} is between 0 and 100`);

      setTimeout(() => {
        const final = smooth();
        assert(Math.abs(final - 100) < 1, `spring converges to target: ${final.toFixed(1)} ≈ 100`);
        dispose();
        done();
      }, 500);
    }, 100);
  });
});

// ── createTween ──────────────────────────────────────────────────────────

scheduleTest("createTween", (done) => {
  createRoot((dispose) => {
    const [target, setTarget] = createSignal(0);
    const smooth = createTween(target, { duration: 200, easing: EASING.linear });

    assertEq(smooth(), 0, "tween starts at source");

    setTarget(100);

    setTimeout(() => {
      const mid = smooth();
      assert(mid > 10 && mid < 90, `tween mid-animation: ${mid.toFixed(1)} is between 10 and 90`);

      setTimeout(() => {
        const final = smooth();
        assert(Math.abs(final - 100) < 1, `tween reaches target: ${final.toFixed(1)} ≈ 100`);
        dispose();
        done();
      }, 300);
    }, 100);
  });
});

// ── createStaggeredReveal ────────────────────────────────────────────────

scheduleTest("createStaggeredReveal", (done) => {
  createRoot((dispose) => {
    const [count, setCount] = createSignal(0);
    const getOpacity = createStaggeredReveal(count, { delay: 50, fadeDuration: 100 });

    // Before setting count, all items return 1 (no animation active)
    assertEq(getOpacity(0), 1, "before animation, opacity = 1 (passthrough)");

    setCount(5);

    // After animation starts, need to wait for timer tick
    setTimeout(() => {
      // At 30ms: first item (delay=0) should be fading in
      const first = getOpacity(0);
      assert(first > 0, `first item opacity > 0 at 30ms: ${first.toFixed(2)}`);

      // Last item (delay=200ms) should not have started
      const last = getOpacity(4);
      assertEq(last, 0, "last item not yet visible at 30ms");

      setTimeout(() => {
        // At 430ms: all items should be fully visible (4*50 + 100 = 300ms total)
        assert(getOpacity(0) >= 0.99, "first item fully visible after 430ms");
        assert(getOpacity(4) >= 0.99, "last item fully visible after 430ms");
        dispose();
        done();
      }, 400);
    }, 30);
  });
});

// ── createCursorTrail ────────────────────────────────────────────────────

scheduleTest("createCursorTrail", (done) => {
  createRoot((dispose) => {
    const [cursor, setCursor] = createSignal(0);
    const getTrail = createCursorTrail(cursor, { fadeFrames: 4, maxTrail: 3 });

    assertEq(getTrail(0), 0, "no trail at start");

    setCursor(1);

    setTimeout(() => {
      const trail0 = getTrail(0);
      assert(trail0 > 0, `previous position has trail: ${trail0.toFixed(2)}`);
      assertEq(getTrail(1), 0, "current position has no trail");

      setCursor(2);

      setTimeout(() => {
        assert(getTrail(1) > 0, "position 1 now has trail");

        // Wait for trail to fully fade
        setTimeout(() => {
          assertEq(getTrail(0), 0, "old trail faded out");
          dispose();
          done();
        }, 500);
      }, 20);
    }, 20);
  });
});

// ── createBreathingPulse ─────────────────────────────────────────────────

scheduleTest("createBreathingPulse", (done) => {
  createRoot((dispose) => {
    const pulse = createBreathingPulse({ period: 200, min: 0.2, max: 1.0 });

    assertEq(pulse.isActive(), false, "not active before start");
    assertEq(pulse.value(), 1.0, "starts at max");

    pulse.start();
    assertEq(pulse.isActive(), true, "active after start");

    // After ~half period (100ms), should be near the minimum
    setTimeout(() => {
      const val = pulse.value();
      assert(val >= 0.2 && val <= 1.0, `pulse in range: ${val.toFixed(2)}`);

      pulse.stop();
      assertEq(pulse.isActive(), false, "not active after stop");
      assertEq(pulse.value(), 1.0, "resets to max on stop");

      dispose();
      done();
    }, 80);
  });
});

// ── createDecay ──────────────────────────────────────────────────────────

scheduleTest("createDecay", (done) => {
  createRoot((dispose) => {
    const scroll = createDecay({ deceleration: 0.9, minVelocity: 0.5 });

    assertEq(scroll.value(), 0, "starts at 0");
    assertEq(scroll.isAnimating(), false, "not animating initially");

    scroll.push(10);
    assertEq(scroll.isAnimating(), true, "animating after push");

    setTimeout(() => {
      const mid = scroll.value();
      assert(mid > 0, `value increased after push: ${mid.toFixed(1)}`);

      setTimeout(() => {
        assertEq(scroll.isAnimating(), false, "stopped after deceleration");
        const final = scroll.value();
        assert(final > mid, `continued past mid-point: ${final.toFixed(1)} > ${mid.toFixed(1)}`);

        scroll.set(0);
        assertEq(scroll.value(), 0, "set resets position");
        assertEq(scroll.isAnimating(), false, "set stops animation");

        dispose();
        done();
      }, 500);
    }, 80);
  });
});

// ── createTypewriterReveal ─────────────────────────────────────────────────

scheduleTest("createTypewriterReveal", (done) => {
  createRoot((dispose) => {
    const [count, setCount] = createSignal(0);
    const tw = createTypewriterReveal(count, { segmentDelay: 50 });

    // Before animation, everything is visible (passthrough)
    assertEq(tw.opacity(0), 1, "before animation, opacity = 1 (passthrough)");
    assert(!tw.isAnimating(), "not animating before count set");

    setCount(5);

    setTimeout(() => {
      // At ~30ms, first item should be fading, later items hidden
      const first = tw.opacity(0);
      assert(first > 0, `first segment visible at 30ms: ${first.toFixed(2)}`);

      const third = tw.opacity(2);
      assertEq(third, 0, "third segment not yet visible at 30ms");

      assert(tw.isAnimating(), "animating after count set");
      assert(tw.revealedCount() >= 0 && tw.revealedCount() <= 5, "revealedCount in range");

      setTimeout(() => {
        // At 330ms, all 5 items should be visible (5 * 50 = 250ms)
        assertEq(tw.opacity(4), 1, "last segment fully visible after 330ms");
        assert(!tw.isAnimating(), "not animating after all revealed");

        // Test revealAll
        tw.reset();
        setCount(3);
        setTimeout(() => {
          tw.revealAll();
          assertEq(tw.opacity(2), 1, "revealAll makes all visible");
          assert(!tw.isAnimating(), "not animating after revealAll");
          dispose();
          done();
        }, 20);
      }, 300);
    }, 30);
  });
});

// ── createCrossfade ───────────────────────────────────────────────────────

scheduleTest("createCrossfade", (done) => {
  createRoot((dispose) => {
    const [scene, setScene] = createSignal("home");
    const cf = createCrossfade(scene, { duration: 200 });

    assertEq(cf.isTransitioning(), false, "not transitioning initially");
    assertEq(cf.progress(), 1, "progress starts at 1 (settled)");
    assertEq(cf.previousScene(), null, "no previous scene initially");

    setScene("review");

    setTimeout(() => {
      assertEq(cf.isTransitioning(), true, "transitioning after scene change");
      assert(cf.progress() > 0, "progress advancing");
      assert(cf.progress() < 1, "progress not yet complete");
      assertEq(cf.previousScene(), "home", "previous scene is 'home'");

      setTimeout(() => {
        assertEq(cf.isTransitioning(), false, "transition complete");
        assertEq(cf.progress(), 1, "progress at 1 after completion");
        assertEq(cf.previousScene(), null, "previous scene cleared");
        dispose();
        done();
      }, 300);
    }, 50);
  });
});

// ── createFold ────────────────────────────────────────────────────────────

scheduleTest("createFold", (done) => {
  createRoot((dispose) => {
    const [open, setOpen] = createSignal(false);
    const fold = createFold(open, { duration: 200 });

    assertEq(fold.progress(), 0, "starts collapsed");
    assertEq(fold.visibleLines(10), 0, "0 visible lines when collapsed");
    assertEq(fold.isAnimating(), false, "not animating initially");

    setOpen(true);

    setTimeout(() => {
      assert(fold.isAnimating(), "animating after open");
      const mid = fold.progress();
      assert(mid > 0 && mid < 1, `mid-fold progress: ${mid.toFixed(2)}`);
      const midLines = fold.visibleLines(10);
      assert(midLines > 0 && midLines < 10, `mid-fold visible lines: ${midLines}`);

      setTimeout(() => {
        assertEq(fold.progress(), 1, "fully expanded");
        assertEq(fold.visibleLines(10), 10, "all lines visible");
        assertEq(fold.isAnimating(), false, "not animating after expand");

        // Test collapse
        setOpen(false);
        setTimeout(() => {
          assert(fold.progress() < 1, "collapsing");
          setTimeout(() => {
            assertEq(fold.progress(), 0, "fully collapsed");
            dispose();
            done();
          }, 300);
        }, 50);
      }, 300);
    }, 50);
  });
});

// ── createBounce ──────────────────────────────────────────────────────────

scheduleTest("createBounce", (done) => {
  createRoot((dispose) => {
    const bounce = createBounce({ duration: 200 });

    assertEq(bounce.value(), 0, "starts at 0");
    assertEq(bounce.isActive(), false, "not active initially");

    bounce.trigger(3);
    assertEq(bounce.value(), 3, "value set to magnitude on trigger");
    assertEq(bounce.isActive(), true, "active after trigger");

    setTimeout(() => {
      const mid = bounce.value();
      assert(mid > 0 && mid < 3, `mid-bounce value: ${mid.toFixed(2)}`);

      setTimeout(() => {
        assertEq(bounce.value(), 0, "returns to 0 after bounce");
        assertEq(bounce.isActive(), false, "not active after bounce");

        // Test re-trigger
        bounce.trigger(1);
        assertEq(bounce.value(), 1, "re-trigger works");

        setTimeout(() => {
          assertEq(bounce.value(), 0, "second bounce completes");
          dispose();
          done();
        }, 300);
      }, 300);
    }, 50);
  });
});

// ── createGlowPulse ───────────────────────────────────────────────────────

scheduleTest("createGlowPulse", (done) => {
  createRoot((dispose) => {
    const glow = createGlowPulse({
      period: 200,
      baseColor: [255, 0, 0],
      glowColor: [0, 255, 0],
    });

    assertEq(glow.isActive(), false, "not active before start");
    const initial = glow.rgb();
    assertEq(initial[0], 255, "starts at base R");
    assertEq(initial[1], 0, "starts at base G");

    glow.start();
    assertEq(glow.isActive(), true, "active after start");

    setTimeout(() => {
      const mid = glow.rgb();
      // After ~50ms in a 200ms period, color should be shifting
      assert(
        mid[0] !== 255 || mid[1] !== 0,
        `color is changing: [${mid.join(",")}]`,
      );

      glow.stop();
      assertEq(glow.isActive(), false, "not active after stop");
      const stopped = glow.rgb();
      assertEq(stopped[0], 255, "resets to base R on stop");
      assertEq(stopped[1], 0, "resets to base G on stop");

      dispose();
      done();
    }, 50);
  });
});

// ── createMarquee ─────────────────────────────────────────────────────────

scheduleTest("createMarquee", (done) => {
  createRoot((dispose) => {
    const [tw, setTw] = createSignal(10);
    const [vw, setVw] = createSignal(20);
    const marquee = createMarquee(tw, vw, { speed: 1, pauseMs: 50 });

    // Text fits view — no scrolling
    assertEq(marquee.offset(), 0, "no offset when text fits");
    assertEq(marquee.isActive(), false, "not active when text fits");

    // Make text overflow
    setTw(30);

    setTimeout(() => {
      assertEq(marquee.isActive(), true, "active when overflowing");

      // After pause (50ms) + some scroll time, offset should be > 0
      setTimeout(() => {
        const off = marquee.offset();
        assert(off > 0, `offset advancing: ${off.toFixed(1)}`);

        // Shrink text to fit — should deactivate
        setTw(15);
        setTimeout(() => {
          assertEq(marquee.isActive(), false, "deactivates when text fits");
          assertEq(marquee.offset(), 0, "offset resets to 0");
          dispose();
          done();
        }, 50);
      }, 150);
    }, 20);
  });
});

// ── createDebounce ─────────────────────────────────────────────────────────

scheduleTest("createDebounce", (done) => {
  createRoot((dispose) => {
    const [value, setValue] = createSignal(0);
    const debounced = createDebounce(value, 100);

    assertEq(debounced(), 0, "starts with source value");

    setValue(1);
    setValue(2);
    setValue(3);

    // Immediately after rapid changes, debounced should still be 0
    setTimeout(() => {
      assertEq(debounced(), 0, "not yet propagated during rapid changes");

      // After delay, should have final value
      setTimeout(() => {
        assertEq(debounced(), 3, "propagates final value after delay");
        dispose();
        done();
      }, 150);
    }, 20);
  });
});

// If no async tests were scheduled, print summary now
if (pending === 0) printSummary();
