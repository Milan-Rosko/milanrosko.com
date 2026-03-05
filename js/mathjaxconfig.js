window.MathJax = {
  tex: {
    inlineMath: [['$', '$']],
    displayMath: [['$$', '$$']],
    processEscapes: true
  },

  chtml: {
    linebreaks: { automatic: false }
  },

  options: {
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],

    // Turn off MathJax v4 a11y tools (explorer/speech/braille/collapsible/enrichment)
    menuOptions: {
      settings: {
        enrich: false,
        speech: false,
        braille: false,
        collapsible: false,
        assistiveMml: false
      }
    },

    // If the a11y components are still present via the combined build, disable their actions directly
    enableEnrichment: false,
    enableSpeech: false,
    enableBraille: false,
    enableExplorer: false,
    enableComplexity: false,
    enableAssistiveMml: false
  }
};