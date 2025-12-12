function fib(n) {
    const F = [0,1];
    for (let i = 2; i <= n; i++) F[i] = F[i-1] + F[i-2];
    return F[n];
}

const maxIndex = 42;
const fibs = [];
for (let i = 2; i <= maxIndex; i++) fibs.push({ idx: i, val: fib(i) });

// ------------------------------------------------------------
// Render Fibonacci values as clickable buttons (unchanged UI)
// ------------------------------------------------------------
const listDiv = document.getElementById("fib-list");

fibs.forEach(f => {
    const btn = document.createElement("button");
    btn.id = "fib-" + f.idx;
    btn.dataset.idx = f.idx;
    btn.dataset.selected = "false";
    btn.className = "btn fib-btn";

    btn.innerHTML = `F<sub>${f.idx}</sub> = ${f.val}`;
    listDiv.appendChild(btn);
});

// ------------------------------------------------------------
// Forbidden-neighbor enforcement (UI only, unchanged)
// ------------------------------------------------------------
function updateForbiddenButtons() {
    const selected = new Set(
        fibs
        .map(f => {
            const b = document.getElementById("fib-" + f.idx);
            return b.dataset.selected === "true" ? f.idx : null;
        })
        .filter(x => x !== null)
    );

    fibs.forEach(f => {
        const b = document.getElementById("fib-" + f.idx);
        b.classList.remove("fib-selected", "fib-forbidden");
        b.dataset.forbidden = "false";
    });

    selected.forEach(idx => {
        const b = document.getElementById("fib-" + idx);
        b.classList.add("fib-selected");
    });

    selected.forEach(idx => {
        [idx - 1, idx + 1].forEach(nei => {
            const b = document.getElementById("fib-" + nei);
            if (b && !selected.has(nei)) {
                b.classList.add("fib-forbidden");
                b.dataset.forbidden = "true";
            }
        });
    });
}

// ------------------------------------------------------------
// Click logic (unchanged UI behavior)
// ------------------------------------------------------------
listDiv.addEventListener("click", e => {
    if (e.target.tagName !== "BUTTON") return;
    const btn = e.target;

    if (btn.dataset.forbidden === "true") return;

    btn.dataset.selected =
        btn.dataset.selected === "true" ? "false" : "true";

    updateForbiddenButtons();
});

// =====================================================================
// TRUE ZECKENDORF ENCODER: GREEDY DECOMPOSITION
// =====================================================================
function zeckendorfDecompose(n) {
    const support = [];
    let remainder = n;

    while (remainder > 0) {
        let k = 2;
        while (k + 1 <= maxIndex && fib(k + 1) <= remainder) k++;
        support.push(k);
        remainder -= fib(k);
    }

    return support; // strictly decreasing and non-consecutive
}

// Storage for the last encoded integer
let lastEncodedValue = 0;
let lastEncodedSupport = [];

// =====================================================================
// ENCODE BUTTON
// =====================================================================
document.getElementById("encode-btn").onclick = function () {
    let raw = 0;

    // Sum the currently selected Fibonacci values
    fibs.forEach(f => {
        const b = document.getElementById("fib-" + f.idx);
        if (b.dataset.selected === "true") raw += f.val;
    });

    if (raw === 0) {
        document.getElementById("encode-output").textContent =
            "No digits selected.";
        lastEncodedValue = 0;
        lastEncodedSupport = [];
        return;
    }

    // Compute TRUE Zeckendorf representation via greedy algorithm
    const Z = zeckendorfDecompose(raw);

    lastEncodedValue = raw;
    lastEncodedSupport = Z;

    document.getElementById("encode-output").textContent =
        `Zeckendorf Support = {${Z.join(", ")}}   Sum = ${raw}`;
};

// =====================================================================
// GREEDY DECODE (inverse Zeckendorf)
// =====================================================================
function greedyDecode(n) {
    const steps = [];
    let remainder = n;

    while (remainder > 0) {
        let k = 2;
        while (k + 1 <= maxIndex && fib(k + 1) <= remainder) k++;

        steps.push(
            `Pick F_${k} = ${fib(k)}; remainder = ${remainder} - ${fib(k)} = ${remainder - fib(k)}`
        );

        remainder -= fib(k);
    }

    return steps;
}

// =====================================================================
// FORGET + DECODE (MUST decode lastEncodedValue, not UI selections)
// =====================================================================
document.getElementById("decode-btn").onclick = function () {

    // Clear UI selections (unchanged)
    fibs.forEach(f => {
        const b = document.getElementById("fib-" + f.idx);
        b.dataset.selected = "false";
        b.dataset.forbidden = "false";
        b.classList.remove("fib-selected", "fib-forbidden");
    });

    if (lastEncodedValue === 0) {
        document.getElementById("steps").textContent =
            "No encoded value available. Encode first.";
        return;
    }

    const n = lastEncodedValue;
    const steps = greedyDecode(n);

    const support = steps
        .map(s => {
            const m = s.match(/F_(\d+)/);
            return m ? parseInt(m[1]) : null;
        })
        .filter(x => x !== null);

    const out =
        `Decoding n = ${n}\n\n` +
        steps.join("\n") +
        `\n\nRecovered Zeckendorf support: {${support.join(", ")}}`;

document.getElementById("steps").textContent = out.replace(/\s+$/g, "");
};
