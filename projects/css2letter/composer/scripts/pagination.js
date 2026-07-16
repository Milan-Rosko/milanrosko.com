(function () {
  function afterNextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function debounce(fn, ms = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function hasOverflow(el) {
    return el.scrollHeight > el.clientHeight + 1;
  }

  function removeAll(root, selector) {
    root.querySelectorAll(selector).forEach((n) => n.remove());
  }

  function deriveNextTemplateFromFirst(firstPage) {
    const next = firstPage.cloneNode(true);

    // Switch marker class so existing CSS can target following pages if desired
    next.classList.remove("page--first");
    next.classList.add("page--second");

    // Remove first-page-only blocks (address window, info block, subject/date, fold marks)
    removeAll(next, ".window");
    removeAll(next, ".info");
    removeAll(next, ".subject");
    removeAll(next, ".date");
    removeAll(next, ".mark");

    // If you want the large letterhead only on page 1, uncomment:
    // removeAll(next, ".logo-header");

    // Following-page layout (top/height) is driven by .page--second CSS.
    return next;
  }

  function splitParagraphByWords(p, main) {
    const text = (p.textContent || "").trim();
    if (!text) return [p, null];

    const words = text.split(/\s+/);
    const fit = document.createElement("p");
    const rest = document.createElement("p");

    fit.className = p.className || "";
    rest.className = p.className || "";
    if (p.getAttribute("style")) {
      fit.setAttribute("style", p.getAttribute("style"));
      rest.setAttribute("style", p.getAttribute("style"));
    }

    let lo = 1, hi = words.length, best = 0;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      fit.textContent = words.slice(0, mid).join(" ");
      main.appendChild(fit);
      const ok = !hasOverflow(main);
      main.removeChild(fit);

      if (ok) { best = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }

    if (best === 0 || best >= words.length) return [p, null];

    fit.textContent = words.slice(0, best).join(" ");
    rest.textContent = words.slice(best).join(" ");
    return [fit, rest];
  }

  function splitListByItems(listEl, main) {
    const tag = listEl.tagName.toLowerCase();
    const items = Array.from(listEl.children).filter((n) => n.tagName === "LI");
    if (!items.length) return [listEl, null];

    const fit = document.createElement(tag);
    const rest = document.createElement(tag);

    fit.className = listEl.className || "";
    rest.className = listEl.className || "";
    if (listEl.getAttribute("style")) {
      fit.setAttribute("style", listEl.getAttribute("style"));
      rest.setAttribute("style", listEl.getAttribute("style"));
    }

    let lo = 1, hi = items.length, best = 0;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      fit.innerHTML = "";
      items.slice(0, mid).forEach((li) => fit.appendChild(li.cloneNode(true)));

      main.appendChild(fit);
      const ok = !hasOverflow(main);
      main.removeChild(fit);

      if (ok) { best = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }

    if (best === 0 || best >= items.length) return [listEl, null];

    fit.innerHTML = "";
    rest.innerHTML = "";
    items.slice(0, best).forEach((li) => fit.appendChild(li.cloneNode(true)));
    items.slice(best).forEach((li) => rest.appendChild(li.cloneNode(true)));

    return [fit, rest];
  }

  function clearMain(pageEl) {
    const main = pageEl.querySelector("main");
    if (!main) return null;
    while (main.firstChild) main.removeChild(main.firstChild);
    return main;
  }

  function collectFlowNodes(pages) {
    const nodes = [];
    pages.forEach((page) => {
      const main = page.querySelector("main");
      if (!main) return;
      while (main.firstChild) nodes.push(main.removeChild(main.firstChild));
    });
    return nodes.filter((n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim()));
  }

  function paginateDropIn() {
    const root = document.getElementById("print-root");
    if (!root) return;

    const existingPages = Array.from(root.querySelectorAll(".page"));
    if (!existingPages.length) return;

    const queue = collectFlowNodes(existingPages);

    const firstSrc = existingPages.find((p) => p.classList.contains("page--first")) || existingPages[0];
    const secondSrc = existingPages.find((p) => p.classList.contains("page--second")) || null;

    const tplFirst = firstSrc.cloneNode(true);
    const tplNext  = (secondSrc ? secondSrc.cloneNode(true) : deriveNextTemplateFromFirst(firstSrc));

    clearMain(tplFirst);
    clearMain(tplNext);

    root.innerHTML = "";

    let pageIndex = 0;
    let safety = 0;

    while (queue.length && safety++ < 1200) {
      const page = (pageIndex === 0 ? tplFirst.cloneNode(true) : tplNext.cloneNode(true));
      const main = clearMain(page) || page.querySelector("main");
      root.appendChild(page);

      while (queue.length) {
        const node = queue[0];
        main.appendChild(node);

        if (!hasOverflow(main)) {
          queue.shift();
          continue;
        }

        main.removeChild(node);

        if (main.childNodes.length === 0 && node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName;

          if (tag === "P") {
            const [fit, rest] = splitParagraphByWords(node, main);
            main.appendChild(fit);
            queue.shift();
            if (rest) queue.unshift(rest);
          } else if (tag === "UL" || tag === "OL") {
            const [fit, rest] = splitListByItems(node, main);
            main.appendChild(fit);
            queue.shift();
            if (rest) queue.unshift(rest);
          } else {
            main.appendChild(node);
            queue.shift();
          }
        }

        break;
      }

      pageIndex++;
    }

    updateTotalPages(root);
  }

  function updateTotalPages(rootEl) {
    const root = rootEl || document.getElementById("print-root");
    if (!root) return;
    const total = root.querySelectorAll(".page").length || 1;
    root.querySelectorAll(".pageno").forEach((el) => {
      el.dataset.total = String(total);
    });
  }

  async function paginateWhenReady() {
    await afterNextPaint();

    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {
        // Ignore font readiness errors and paginate with current metrics.
      }
      await afterNextPaint();
    }

    paginateDropIn();
  }

  const repaginate = debounce(() => {
    void paginateWhenReady();
  }, 150);
  window.paginate = paginateDropIn;
  window.paginateWhenReady = paginateWhenReady;
  window.updateTotalPages = updateTotalPages;

  // The letter-engine owns the initial trigger (after it has injected
  // content and MathJax has typeset). We only handle re-layout events here.
  window.addEventListener("resize", repaginate);
  window.addEventListener("beforeprint", paginateDropIn);
})();
