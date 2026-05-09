// MathJax configuration - keep this as a separate static file to avoid Thymeleaf parsing issues
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']]
  },
  options: {
    // avoid typesetting inside code/pre elements
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
  }
};

