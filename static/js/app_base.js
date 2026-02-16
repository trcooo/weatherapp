(() => {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  // auto-hide toasts
  const toasts = document.querySelectorAll(".toast");
  if (toasts && toasts.length) {
    setTimeout(() => {
      toasts.forEach(t => t.classList.add("toast--hide"));
    }, 3500);
  }
})();
