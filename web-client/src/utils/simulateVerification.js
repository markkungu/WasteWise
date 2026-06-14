/**
 * simulateVerification.js
 * -----------------------
 * 7-step simulated AI verification pipeline with client-side image heuristics.
 * No ML models or backend calls — pure browser logic + setTimeout delays.
 */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fakeTxHash() {
  const h = '0123456789abcdef';
  let s = '0x';
  for (let i = 0; i < 64; i++) s += h[Math.floor(Math.random() * 16)];
  return s;
}

function fakeSubmissionId() {
  return 'WW-2026-' + String(Math.floor(10000 + Math.random() * 90000));
}

/**
 * analyzeImage — client-side heuristics on a 64×64 downscale via Canvas.
 * Returns:
 *   sharpness    — mean absolute Sobel-x gradient (higher = sharper)
 *   brightness   — mean luminance 0–255
 *   plasticScore — 0–1 likelihood this is plastic (cool hues, low warm-food)
 */
async function analyzeImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const SIZE = 64;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
        URL.revokeObjectURL(url);

        let gradSum = 0;
        let lumSum = 0;
        let coolCount = 0;
        let warmFoodCount = 0;
        let pixelCount = 0;

        for (let y = 1; y < SIZE - 1; y++) {
          for (let x = 1; x < SIZE - 1; x++) {
            const i = (y * SIZE + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            lumSum += lum;

            // Sobel-x sharpness proxy
            const il = (y * SIZE + (x - 1)) * 4;
            const ir = (y * SIZE + (x + 1)) * 4;
            const lumL = 0.299 * data[il] + 0.587 * data[il + 1] + 0.114 * data[il + 2];
            const lumR = 0.299 * data[ir] + 0.587 * data[ir + 1] + 0.114 * data[ir + 2];
            gradSum += Math.abs(lumR - lumL);
            pixelCount++;

            // Hue classification
            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            const delta = maxC - minC;
            if (delta < 20) continue; // achromatic — skip

            let hue;
            if (maxC === r)      hue = ((g - b) / delta + 6) % 6;
            else if (maxC === g) hue = (b - r) / delta + 2;
            else                 hue = (r - g) / delta + 4;
            hue *= 60; // 0–360

            // Cool blues/cyans (plastic bottles) 150–270°
            if (hue >= 150 && hue <= 270) coolCount++;
            // Warm food reds/oranges/browns 0–60° and 300–360°
            else if (hue <= 60 || hue >= 300) warmFoodCount++;
          }
        }

        const n = Math.max(pixelCount, 1);
        const sharpness   = gradSum / n;
        const brightness  = lumSum  / n;
        const total       = coolCount + warmFoodCount + 1;
        const coolRatio   = coolCount     / total;
        const warmRatio   = warmFoodCount / total;

        // Plastic score: reward cool hues, penalise warm-food hues, reward sharpness
        const plasticScore = Math.min(1, Math.max(0,
          0.40 * coolRatio +
          0.35 * (1 - warmRatio) +
          0.25 * Math.min(1, sharpness / 10)
        ));

        resolve({ sharpness, brightness, plasticScore, coolRatio, warmRatio });
      } catch {
        URL.revokeObjectURL(url);
        resolve({ sharpness: 5, brightness: 128, plasticScore: 0.5 });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ sharpness: 5, brightness: 128, plasticScore: 0.5 });
    };

    img.src = url;
  });
}

/**
 * simulateVerification
 * --------------------
 * Runs the 7-step pipeline and calls onStep() at each transition.
 *
 * onStep payload shapes:
 *   { step: 1, progress: 0–100 }
 *   { step: 2 }
 *   { step: 3 }
 *   { step: 4, confidence, itemsDetected, verifiedWeight, bboxes }
 *   { step: 5, verified, tokens }
 *   { step: 6 }
 *   { step: 7, submissionId, txHash }
 *
 * Returns the final result object.
 */
/**
 * Returns 'plastic' if the filename (without extension) is a number 1–5,
 * 'rejected' if it is a number 6 or above, or null if not a plain number.
 */
function classifyByFilename(file) {
  if (!file) return null;
  const base = file.name.replace(/\.[^.]+$/, '').trim(); // strip extension
  const n = Number(base);
  if (!Number.isInteger(n) || isNaN(n)) return null;
  return n >= 1 && n <= 5 ? 'plastic' : 'rejected';
}

export async function simulateVerification({
  file,
  weightKg,
  plasticType,
  locationLabel,
  collectorName,
  walletAddress,
  onStep,
}) {
  const wkg = weightKg > 0 ? weightKg : 0.5;

  // Filename-based override: 1–5 → plastic, 6+ → rejected
  const fileClass = classifyByFilename(file);

  // Client-side image heuristics (non-blocking, fast)
  const img = file ? await analyzeImage(file) : { sharpness: 5, brightness: 128, plasticScore: 0.5 };

  // ── Step 1: Upload (0.8 s with progress increments) ──────────────────────
  for (const [prog, wait] of [[0, 60], [20, 180], [55, 260], [80, 200], [100, 100]]) {
    onStep({ step: 1, progress: prog });
    await delay(wait);
  }

  // ── Step 2: Pre-process (0.6 s) ───────────────────────────────────────────
  onStep({ step: 2 });
  await delay(600);

  // ── Step 3: AI classification (1.5 s) ────────────────────────────────────
  onStep({ step: 3 });
  await delay(1500);

  // ── Step 4: Detection result ──────────────────────────────────────────────
  let baseConf;
  if (fileClass === 'plastic') {
    // Files named 1–5: always verified, high confidence
    baseConf = rand(85, 96);
  } else if (fileClass === 'rejected') {
    // Files named 6+: always pending review, low confidence
    baseConf = rand(48, 66);
  } else {
    // Unknown name: fall back to image heuristics
    baseConf = rand(78, 96);
    if (img.plasticScore > 0.6) baseConf = Math.min(96, baseConf + rand(2, 6));
    else if (img.plasticScore < 0.3) baseConf = Math.max(52, baseConf - rand(12, 22));
    if (img.sharpness < 3)      baseConf = Math.max(55, baseConf - rand(5, 12));
    // Occasional random mistake
    if (Math.random() < 0.10)   baseConf = Math.max(50, Math.min(98, baseConf + rand(-18, 10)));
  }

  const confidence     = Math.round(baseConf * 10) / 10;
  const itemsDetected  = randInt(1, 5);
  const verifiedWeight = Math.round(wkg * (1 + rand(-0.10, 0.10)) * 100) / 100;

  // Bounding boxes (1–3 normalised rects)
  const numBoxes = randInt(1, Math.min(3, itemsDetected));
  const bboxes = Array.from({ length: numBoxes }, () => ({
    x:     rand(0.04, 0.52),
    y:     rand(0.04, 0.52),
    w:     rand(0.20, 0.38),
    h:     rand(0.20, 0.38),
    label: plasticType,
    conf:  Math.round(Math.min(98, confidence * (0.94 + rand(0, 0.10))) * 10) / 10,
  }));

  onStep({ step: 4, confidence, itemsDetected, verifiedWeight, bboxes });
  await delay(400);

  // ── Step 5: Decision (0.4 s) ──────────────────────────────────────────────
  const verified = confidence >= 70;
  const tokens   = verified ? Math.round(verifiedWeight * 10) : 0;
  onStep({ step: 5, verified, tokens });
  await delay(400);

  const submissionId = fakeSubmissionId();
  const timestamp    = new Date().toISOString();

  // Pending path (no blockchain step)
  if (!verified) {
    onStep({ step: 7, submissionId, txHash: null });
    return {
      verified: false, confidence, itemsDetected, verifiedWeight,
      bboxes, tokens: 0, submissionId, timestamp,
      status: 'Pending Review', collectorName, walletAddress,
      plasticType, locationLabel, weightKg: verifiedWeight,
    };
  }

  // ── Step 6: Blockchain (1.2 s) ────────────────────────────────────────────
  onStep({ step: 6 });
  await delay(1200);
  const txHash = fakeTxHash();

  // ── Step 7: Complete ──────────────────────────────────────────────────────
  onStep({ step: 7, submissionId, txHash });

  return {
    verified: true, confidence, itemsDetected, verifiedWeight,
    bboxes, tokens, submissionId, txHash, timestamp,
    status: 'Verified & Submitted', collectorName, walletAddress,
    plasticType, locationLabel, weightKg: verifiedWeight,
  };
}
