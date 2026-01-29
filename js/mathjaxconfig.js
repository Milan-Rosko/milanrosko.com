/* mathjaxconfig.js
 *
 * - Uses left alignment for display math.
 */

window.MathJax = {
  tex: {
    inlineMath: [['$', '$']],
    displayMath: [['$$', '$$']],
    processEscapes: true
  },

  chtml: {
    // Important: disabling linebreaks prevents many mobile-height pathologies.
    linebreaks: {
      automatic: false
    }
  },

  options: {
    skipHtmlTags: [
      'script', 'noscript', 'style', 'textarea', 'pre', 'code'
    ]
  },

  startup: {
    ready() {
      MathJax.startup.defaultReady();
    }
  }
};
