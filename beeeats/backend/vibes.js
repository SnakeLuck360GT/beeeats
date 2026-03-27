(function () {
  'use strict';

  renderChrome(2);


  const SLIDERS = [
    { key: 'energy',      leftLabel: 'Mellow',   rightLabel: 'Intense' },
    { key: 'instrument',  leftLabel: 'Acoustic', rightLabel: 'Electronic' },
    { key: 'mood',        leftLabel: 'Dark',     rightLabel: 'Bright' },
    { key: 'formation',   leftLabel: 'Solo',     rightLabel: 'Band' },
  ];

  const saved = getState().sliders || {};

  SLIDERS.forEach(({ key }) => {
    const input   = document.getElementById(`slider-${key}`);
    const fill    = document.getElementById(`fill-${key}`);
    const tooltip = document.getElementById(`tip-${key}`);
    const row     = input.closest('.vibe-row');

    if (!input) return;

    const savedVal = saved[key];
    if (savedVal !== undefined) input.value = savedVal;

    updateSlider(input, fill, tooltip, row);

    input.addEventListener('input', () => {
      updateSlider(input, fill, tooltip, row);
      saveSliders();
    });

    input.addEventListener('mousedown', () => {
      input.style.transition = 'none';
    });
    input.addEventListener('mouseup', () => {
      input.style.transition = '';
    });
  });

  function updateSlider(input, fill, tooltip, row) {
    const val = parseInt(input.value, 10);
    const pct = val;

    fill.style.width = `calc(${pct}% - ${(pct / 100) * 0}px)`;
    fill.style.width = pct + '%';

    tooltip.style.left = `calc(${pct}% + ${(0.5 - pct / 100) * 22}px)`;
    tooltip.textContent = val;

    row.classList.remove('leaning-left', 'leaning-right');
    if (val > 55)      row.classList.add('leaning-right');
    else if (val < 45) row.classList.add('leaning-left');
  }

  // ── Era dual-range slider ────────────────────────────────────────────────────
  const ERA_YEAR_MIN = 1950, ERA_YEAR_MAX = 2025;
  const eraMinEl    = document.getElementById('slider-era-min');
  const eraMaxEl    = document.getElementById('slider-era-max');
  const eraFill     = document.getElementById('fill-era');
  const eraLabelMin = document.getElementById('era-label-min');
  const eraLabelMax = document.getElementById('era-label-max');

  // Restore from saved state
  eraMinEl.value = saved.eraMin ?? 1960;
  eraMaxEl.value = saved.eraMax ?? 2025;

  function updateEra() {
    let minVal = parseInt(eraMinEl.value, 10);
    let maxVal = parseInt(eraMaxEl.value, 10);
    // Prevent crossing
    if (minVal > maxVal) { eraMinEl.value = minVal = maxVal; }
    if (maxVal < minVal) { eraMaxEl.value = maxVal = minVal; }

    const span     = ERA_YEAR_MAX - ERA_YEAR_MIN;
    const leftPct  = ((minVal - ERA_YEAR_MIN) / span) * 100;
    const rightPct = ((maxVal - ERA_YEAR_MIN) / span) * 100;

    eraFill.style.left  = leftPct + '%';
    eraFill.style.width = (rightPct - leftPct) + '%';

    eraLabelMin.textContent = minVal;
    eraLabelMax.textContent = maxVal;

    saveSliders();
  }

  updateEra();
  eraMinEl.addEventListener('input', updateEra);
  eraMaxEl.addEventListener('input', updateEra);

  function saveSliders() {
    const sliders = {};
    SLIDERS.forEach(({ key }) => {
      const el = document.getElementById(`slider-${key}`);
      if (el) sliders[key] = parseInt(el.value, 10);
    });
    sliders.eraMin = parseInt(eraMinEl.value, 10);
    sliders.eraMax = parseInt(eraMaxEl.value, 10);
    setState({ sliders });
  }

  document.getElementById('btnBack').addEventListener('click', () => navigateTo(1));

  document.getElementById('btnGenerate').addEventListener('click', () => {
    saveSliders();
    navigateTo(3);
  });

})();
