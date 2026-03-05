const paths = {
  1:    '1 0 2 0',
  10:   '1 0 0 0',
  100:  '1 3 2 3',
  1000: '1 3 0 3',

  2:    '1 1 2 1',
  20:   '1 1 0 1',
  200:  '1 2 2 2',
  2000: '1 2 0 2',

  3:    '1 0 2 1',
  30:   '1 0 0 1',
  300:  '1 3 2 2',
  3000: '1 3 0 2',

  4:    '1 1 2 0',
  40:   '1 1 0 0',
  400:  '1 2 2 3',
  4000: '1 2 0 3',

  5:    '1 0 2 0 1 1',
  50:   '1 0 0 0 1 1',
  500:  '1 2 2 3 1 3',
  5000: '1 2 0 3 1 3',

  6:    '2 0 2 1',
  60:   '0 0 0 1',
  600:  '2 2 2 3',
  6000: '0 2 0 3',

  7:    '1 0 2 0 2 1',
  70:   '1 0 0 0 0 1',
  700:  '1 3 2 3 2 2',
  7000: '1 3 0 3 0 2',

  8:    '1 1 2 1 2 0',
  80:   '1 1 0 1 0 0',
  800:  '1 2 2 2 2 3',
  8000: '1 2 0 2 0 3',

  9:    '1 0 2 0 2 1 1 1',
  90:   '1 0 0 0 0 1 1 1',
  900:  '1 2 2 2 2 3 1 3',
  9000: '1 2 0 2 0 3 1 3',
};

const PIECES = 10000;
const DAY_S = 86400;
const PIECE_S = DAY_S / PIECES;

const ghost = Object.values(paths).map(p => `M ${p}`).join(' ');

function render(number) {
  let path = number === 0 ? '' : String(number)
    .split('')
    .reverse()
    .map((n, i) => {
      let p = paths[n + '0'.repeat(i)];
      return p ? `M ${p}` : '';
    }).join('');
  return `
    <svg viewBox="-0.62 0.38 3.24 2.24" role="img">
      <title>${number}</title>
      <g transform="rotate(-90, 1, 1.5)">
        <path
          class="ghost"
          d="M 1 0 1 3 ${ghost}"
          stroke-width="0.05"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
        <path
          d="M 1 0 1 3 ${path}"
          stroke="currentColor"
          stroke-width="0.05"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
      </g>
    </svg>
  `;
}

const clockEl = document.getElementById('clock');
const pieceEl = document.getElementById('piece');
const segs = document.querySelectorAll('#progress-track .seg');
const timeEl = document.getElementById('time');

let lastPiece = -1;

function update() {
  const now = new Date();
  const s = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;

  const exact = s / PIECE_S;
  const piece = Math.min(PIECES - 1, Math.floor(exact));
  const frac = exact - Math.floor(exact);

  if (piece !== lastPiece) {
    clockEl.innerHTML = render(piece);
    pieceEl.textContent = String(piece).padStart(4, '\u2007');
    lastPiece = piece;
  }

  const elapsed = frac * PIECE_S;
  const filled = elapsed < 0.64 ? 1 : 1 + Math.min(8, Math.floor(elapsed - 0.64) + 1);
  segs.forEach((s, i) => s.classList.toggle('on', i < filled));
  timeEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });

  requestAnimationFrame(update);
}

update();

const themes = ['./clock-1.css', './clock-2.css'];
const link = document.getElementById('theme');

if (link) {
  document.body.addEventListener('click', () => {
    const current = themes.findIndex(t => link.href.includes(t.replace('./', '')));
    link.href = themes[(current + 1) % themes.length];
  });
}
