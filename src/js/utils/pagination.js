// ============================================
// REUSABLE TABLE PAGINATION UTILITY
// Client-side pagination: fixed records per page (10/25/50)
// with Previous/Next, page numbers, page-size selector,
// and "Showing X-Y of Z" label.
// No dependencies. Works with the existing vanilla-JS MPA.
// ============================================

var TablePagination = (function () {
  var DEFAULT_PAGE_SIZES = [10, 25, 50];
  var DEFAULT_PER_PAGE = 10;
  var MAX_PAGE_BUTTONS = 5;

  function toPositiveInt(value, fallback) {
    var n = parseInt(value, 10);
    if (isNaN(n) || n < 1) return fallback;
    return n;
  }

  function getTotalPages(totalItems, perPage) {
    var total = Math.max(0, Number(totalItems) || 0);
    var size = toPositiveInt(perPage, DEFAULT_PER_PAGE);
    if (total === 0) return 1;
    return Math.max(1, Math.ceil(total / size));
  }

  function clampPage(page, totalPages) {
    var p = toPositiveInt(page, 1);
    var total = Math.max(1, toPositiveInt(totalPages, 1));
    if (p > total) return total;
    return p;
  }

  // Slice a full array down to the current page. Pure — no DOM.
  function paginateArray(items, page, perPage) {
    if (!Array.isArray(items) || items.length === 0) return [];
    var size = toPositiveInt(perPage, DEFAULT_PER_PAGE);
    var totalPages = getTotalPages(items.length, size);
    var current = clampPage(page, totalPages);
    var start = (current - 1) * size;
    return items.slice(start, start + size);
  }

  // Compute the page numbers to display (windowed with ellipsis).
  // Returns array like [1, "...", 4, 5, 6, "...", 12]
  function getPageWindow(current, total, maxButtons) {
    var max = Math.max(3, toPositiveInt(maxButtons, MAX_PAGE_BUTTONS));
    if (total <= max + 2) {
      var all = [];
      for (var i = 1; i <= total; i++) all.push(i);
      return all;
    }
    var windowSize = max;
    var start = current - Math.floor(windowSize / 2);
    var end = start + windowSize - 1;
    if (start < 2) {
      start = 2;
      end = start + windowSize - 1;
    }
    if (end > total - 1) {
      end = total - 1;
      start = end - windowSize + 1;
    }
    var pages = [1];
    if (start > 2) pages.push("...");
    for (var p = start; p <= end; p++) pages.push(p);
    if (end < total - 1) pages.push("...");
    pages.push(total);
    return pages;
  }

  function escapeAttr(value) {
    return String(value).replace(/"/g, "&quot;");
  }

  // Render controls into a container element.
  // options: { page, totalItems, perPage, pageSizeOptions,
  //            onPageChange(newPage), onPerPageChange(newSize), maxButtons }
  function renderPagination(container, options) {
    var opts = options || {};
    if (!container) return;

    var totalItems = Math.max(0, Number(opts.totalItems) || 0);
    var perPage = toPositiveInt(opts.perPage, DEFAULT_PER_PAGE);
    var pageSizeOptions = Array.isArray(opts.pageSizeOptions) && opts.pageSizeOptions.length
      ? opts.pageSizeOptions
      : DEFAULT_PAGE_SIZES.slice();
    var totalPages = getTotalPages(totalItems, perPage);
    var current = clampPage(opts.page, totalPages);
    var maxButtons = toPositiveInt(opts.maxButtons, MAX_PAGE_BUTTONS);

    // Nothing to paginate — clear controls but keep the count label
    // so empty states still read correctly.
    if (totalItems === 0) {
      container.innerHTML =
        '<div class="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">' +
        '<p class="text-sm text-gray-500">Showing 0 of 0 records</p>' +
        "</div>";
      return;
    }

    var startItem = (current - 1) * perPage + 1;
    var endItem = Math.min(current * perPage, totalItems);

    var sizeOptionsHtml = pageSizeOptions
      .map(function (size) {
        var selected = Number(size) === perPage ? " selected" : "";
        return (
          '<option value="' + escapeAttr(size) + '"' + selected + ">" + escapeAttr(size) + "</option>"
        );
      })
      .join("");

    var pageButtonsHtml = getPageWindow(current, totalPages, maxButtons)
      .map(function (item) {
        if (item === "...") {
          return '<span class="px-2 text-sm text-gray-400">…</span>';
        }
        var isActive = Number(item) === current;
        return (
          '<button type="button" data-page="' + escapeAttr(item) + '" ' +
          'style="min-width:2rem;" ' +
          'class="pagination-page-btn px-2 py-1.5 rounded-lg text-sm font-medium ' +
          (isActive
            ? "bg-brand text-white"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200") + '"' +
          (isActive ? ' aria-current="page"' : "") + ">" + escapeAttr(item) + "</button>"
        );
      })
      .join("");

    container.innerHTML =
      '<div class="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">' +
      '<p class="text-sm text-gray-500">Showing ' + startItem + "&ndash;" + endItem + " of " + totalItems + " records</p>" +
      '<div class="flex items-center gap-1.5">' +
      '<button type="button" data-action="prev" class="pagination-prev-btn px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"' +
      (current <= 1 ? " disabled" : "") + ">Previous</button>" +
      pageButtonsHtml +
      '<button type="button" data-action="next" class="pagination-next-btn px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"' +
      (current >= totalPages ? " disabled" : "") + ">Next</button>" +
      "</div>" +
      '<label class="flex items-center gap-2 text-sm text-gray-500">' +
      '<select class="pagination-per-page-select border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent">' +
      sizeOptionsHtml +
      "</select>" +
      "<span>per page</span>" +
      "</label>" +
      "</div>";

    var onPageChange = typeof opts.onPageChange === "function" ? opts.onPageChange : null;
    var onPerPageChange = typeof opts.onPerPageChange === "function" ? opts.onPerPageChange : null;

    if (onPageChange) {
      var prevBtn = container.querySelector(".pagination-prev-btn");
      var nextBtn = container.querySelector(".pagination-next-btn");
      if (prevBtn) {
        prevBtn.addEventListener("click", function () {
          if (current > 1) onPageChange(current - 1);
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", function () {
          if (current < totalPages) onPageChange(current + 1);
        });
      }
      container.querySelectorAll(".pagination-page-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var target = toPositiveInt(btn.getAttribute("data-page"), current);
          if (target !== current) onPageChange(target);
        });
      });
    }

    if (onPerPageChange) {
      var select = container.querySelector(".pagination-per-page-select");
      if (select) {
        select.addEventListener("change", function () {
          onPerPageChange(toPositiveInt(select.value, DEFAULT_PER_PAGE));
        });
      }
    }
  }

  // Stateful helper per table so each page keeps { page, perPage }
  // and gets slicing + rendering in one call.
  // Usage:
  //   var pager = TablePagination.create({ defaultPerPage: 10 });
  //   var pageItems = pager.paginate(filtered);
  //   pager.render(containerId, filtered.length, function(){ renderMyTable(); });
  function create(stateOptions) {
    var so = stateOptions || {};
    var state = {
      page: toPositiveInt(so.initialPage, 1),
      perPage: toPositiveInt(so.defaultPerPage, DEFAULT_PER_PAGE),
      pageSizeOptions: Array.isArray(so.pageSizeOptions) && so.pageSizeOptions.length
        ? so.pageSizeOptions.slice()
        : DEFAULT_PAGE_SIZES.slice(),
      maxButtons: toPositiveInt(so.maxButtons, MAX_PAGE_BUTTONS),
    };

    function paginate(items) {
      if (!Array.isArray(items)) return [];
      var totalPages = getTotalPages(items.length, state.perPage);
      state.page = clampPage(state.page, totalPages);
      return paginateArray(items, state.page, state.perPage);
    }

    function render(containerOrId, totalItems, onRerender) {
      var container =
        typeof containerOrId === "string"
          ? document.getElementById(containerOrId)
          : containerOrId;
      if (!container) return;
      renderPagination(container, {
        page: state.page,
        totalItems: totalItems,
        perPage: state.perPage,
        pageSizeOptions: state.pageSizeOptions,
        maxButtons: state.maxButtons,
        onPageChange: function (newPage) {
          state.page = clampPage(newPage, getTotalPages(totalItems, state.perPage));
          if (typeof onRerender === "function") onRerender();
        },
        onPerPageChange: function (newSize) {
          state.perPage = toPositiveInt(newSize, DEFAULT_PER_PAGE);
          state.page = clampPage(state.page, getTotalPages(totalItems, state.perPage));
          if (typeof onRerender === "function") onRerender();
        },
      });
    }

    function reset() {
      state.page = 1;
    }

    function setPage(p) {
      state.page = toPositiveInt(p, 1);
    }

    return {
      state: state,
      paginate: paginate,
      render: render,
      reset: reset,
      setPage: setPage,
      getTotalPages: function (total) {
        return getTotalPages(total, state.perPage);
      },
    };
  }

  return {
    DEFAULT_PAGE_SIZES: DEFAULT_PAGE_SIZES.slice(),
    DEFAULT_PER_PAGE: DEFAULT_PER_PAGE,
    paginateArray: paginateArray,
    getTotalPages: getTotalPages,
    clampPage: clampPage,
    renderPagination: renderPagination,
    create: create,
  };
})();
