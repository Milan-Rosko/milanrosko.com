// Letter engine: reads the `letterContent` global, populates the DOM,
// waits for fonts + MathJax, then triggers pagination.
//
// Inline markdown syntax in paragraphs and list items:
//   *italic*   **bold**   ***both***
// Math via MathJax is untouched: $…$ and $$…$$ still work.

(function () {
  const escapeHtml = (s) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const renderInline = (text) => escapeHtml(text)
    .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && value !== undefined && value !== null) {
      el.textContent = value;
    }
  }

  function populateInfoBlock(content) {
    const infoBlock = document.getElementById("info-block");
    if (!infoBlock || !Array.isArray(content.info)) return;
    content.info.forEach((item) => {
      if (!item || !item.term) return;
      const dt = document.createElement("dt");
      dt.textContent = item.term;
      const dd = document.createElement("dd");
      dd.textContent = item.value ?? "";
      infoBlock.appendChild(dt);
      infoBlock.appendChild(dd);
    });
  }

  function appendParagraphs(main, texts) {
    if (!main || !Array.isArray(texts)) return;
    texts.forEach((text) => {
      if (text === null || text === undefined) return;
      const p = document.createElement("p");
      p.innerHTML = renderInline(text);
      main.appendChild(p);
    });
  }

  function appendList(main, items) {
    if (!main || !Array.isArray(items) || items.length === 0) return;
    const ul = document.createElement("ul");
    items.forEach((text) => {
      if (text === null || text === undefined) return;
      const li = document.createElement("li");
      li.innerHTML = renderInline(text);
      ul.appendChild(li);
    });
    if (ul.children.length) main.appendChild(ul);
  }

  function appendSignature(main, content) {
    if (!main) return;
    const sig = document.createElement("div");
    sig.className = "signature";
    sig.setAttribute("aria-hidden", "true");
    main.appendChild(sig);

    const sigName = document.createElement("p");
    sigName.className = "signature-name";
    sigName.textContent = content.signatureName ?? "";
    main.appendChild(sigName);
  }

  async function waitForFonts() {
    if (!document.fonts?.ready) return;
    try { await document.fonts.ready; } catch (_) { /* fall through */ }
  }

  async function typesetMath() {
    if (!window.MathJax?.typesetPromise) return;
    await window.MathJax.typesetPromise([document.getElementById("print-root")]);
  }

  async function render(content) {
    if (!content) return;

    setText(".return", content.window?.returnLine);
    setText(".note", content.window?.note);
    setText(".recipient", content.window?.recipient);
    setText(".subject", content.subject);
    setText(".date", content.date);

    populateInfoBlock(content);

    const main = document.getElementById("body-main");
    appendParagraphs(main, content.bodyParagraphs);
    appendList(main, content.bodyBullets);
    appendParagraphs(main, content.postListParagraphs);
    appendParagraphs(main, content.closingParagraphs);
    appendSignature(main, content);

    await waitForFonts();
    await typesetMath();
    // MathJax or late font swaps can still finish after initial render.
    await waitForFonts();

    if (typeof window.paginateWhenReady === "function") {
      await window.paginateWhenReady();
    } else if (typeof window.paginate === "function") {
      window.paginate();
    }
  }

  window.renderLetter = render;

  // Script is loaded at the end of <body>, so DOMContentLoaded may have
  // already fired. Render immediately if the DOM is ready; otherwise wait.
  // `letterContent` is declared with `const` at script scope, which does
  // not attach to `window`. Read it from the scope chain instead.
  const getContent = () =>
    (typeof letterContent !== "undefined" ? letterContent : window.letterContent);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void render(getContent());
    });
  } else {
    void render(getContent());
  }
})();
