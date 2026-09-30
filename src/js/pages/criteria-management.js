// ============================================
// EVALUATION CRITERIA MANAGEMENT PAGE
// ============================================

function mountPageContent() {
  const template = document.getElementById("page-content-template");
  const slot =
    document.getElementById("admin-page-content") ||
    document.getElementById("hr-page-content");

  if (template && slot) {
    slot.appendChild(template.content.cloneNode(true));
  }
}

let currentType = "student";

const TYPE_LABELS = {
  student: "Student Evaluation",
  classroomObservation: "Classroom Observation",
  peerToPeer: "Peer-to-Peer",
  hrEvaluation: "HR Evaluation",
};

let criteriaCache = {
  student: [],
  classroomObservation: [],
  peerToPeer: [],
  hrEvaluation: [],
};

let scaleCache = {
  student: null,
  classroomObservation: null,
  peerToPeer: null,
  hrEvaluation: null,
};

// --- Line-break helpers for the editor ---
// criteria-data.js defines brToNl/nlToBr on some pages (HR) but not all
// (Admin). Reuse them when present so behavior is identical everywhere;
// otherwise fall back to the same conversion locally.
const brToLines = (typeof brToNl === "function")
  ? brToNl
  : function (text) {
      return (text || "").replace(/<br\s*\/?>/gi, "\n");
    };

const linesToBr = (typeof nlToBr === "function")
  ? nlToBr
  : function (text) {
      return (text || "").replace(/<br\s*\/?>/gi, "\n").replace(/\n/g, "<br>");
    };

// --- Split a stored "Title<br>Subtitle" into two user-friendly fields ---
function splitTitleSubtitle(title) {
  const segments = String(title || "").split(/<br\s*\/?>/i);
  const main = (segments.shift() || "").trim();
  const sub = segments.join("\n").replace(/<br\s*\/?>/gi, "\n").trim();
  return { main, sub };
}

// --- Join the two fields back into the single stored title format ---
function joinTitleSubtitle(main, sub) {
  // Title stays single-line plain text: any tags or newlines become spaces.
  const title = stripAllTags(main || "").replace(/\s+/g, " ").trim();
  const subtitle = brToLines(sub || "").trim();

  if (title && subtitle) {
    return `${title} <br> ${linesToBr(subtitle)}`;
  }

  return title || linesToBr(subtitle);
}

// --- Plain-text version of any string (strips every tag safely) ---
function stripAllTags(text) {
  const template = document.createElement("template");
  template.innerHTML = String(text || "");
  return template.content.textContent || "";
}

// --- Rich-text sanitizer for Subtitle / Question editors ---
// Allows ONLY bold, italic, underline, and line breaks. Everything else
// (scripts, images, links, tables, styles, and ALL attributes such as
// onclick) is removed, so saved content is safe to render via innerHTML
// on the evaluation forms and reports.
function sanitizeRichText(html) {
  const normalized = String(html || "")
    .replace(/<(p|div|h[1-6]|li|ul|ol|tr)[^>]*>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr)>/gi, "<br>");

  const template = document.createElement("template");
  template.innerHTML = normalized;

  const allowedTags = { B: true, STRONG: true, I: true, EM: true, U: true, BR: true };
  const dropEntirely = {
    SCRIPT: true, STYLE: true, IFRAME: true, OBJECT: true, EMBED: true,
    FORM: true, INPUT: true, BUTTON: true, TEXTAREA: true, SELECT: true,
    OPTION: true, LINK: true, META: true, IMG: true, VIDEO: true,
    AUDIO: true, SOURCE: true, TRACK: true, CANVAS: true, SVG: true,
    MATH: true,
  };

  template.content.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName;

    if (dropEntirely[tag]) {
      el.remove();
      return;
    }

    if (!allowedTags[tag]) {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      return;
    }

    while (el.attributes.length > 0) {
      el.removeAttribute(el.attributes[0].name);
    }
  });

  // Remove HTML comments.
  const commentWalker = document.createNodeIterator(
    template.content,
    NodeFilter.SHOW_COMMENT
  );
  const comments = [];
  let commentNode;
  while ((commentNode = commentWalker.nextNode())) comments.push(commentNode);
  comments.forEach((node) => node.remove());

  const clean = template.innerHTML
    .replace(/(^(<br\s*\/?>\s*)+|(<br\s*\/?>\s*)+$)/gi, "");

  // Only breaks/whitespace left means the field is effectively empty.
  const probe = document.createElement("template");
  probe.innerHTML = clean;
  if (!((probe.content.textContent || "").trim())) return "";

  return clean;
}

// --- Small Bold / Italic / Underline toolbar for the rich editors ---
function richToolbarHtml() {
  return `
    <div class="flex items-center gap-1 mb-1">
      <button
        type="button"
        class="rich-format-btn w-7 h-7 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
        data-command="bold"
        title="Bold"
      >B</button>
      <button
        type="button"
        class="rich-format-btn w-7 h-7 text-sm italic text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
        data-command="italic"
        title="Italic"
      >I</button>
      <button
        type="button"
        class="rich-format-btn w-7 h-7 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
        style="text-decoration:underline"
        data-command="underline"
        title="Underline"
      >U</button>
      <span class="text-xs text-gray-400">Enter = new line</span>
    </div>`;
}

// ============================================
// Load / save criteria (parts & questions)
// ============================================

async function loadCriteria(type) {
  try {
    const parts = await apiGet(`/evaluation-criteria/${type}`);

    criteriaCache[type] = Array.isArray(parts)
      ? parts.map((part, index) => ({
          partNumber: part.part_number ?? index + 1,
          title: part.title || "",
          questions: (part.questions || []).map((question) => ({
            id: question.id,
            text: question.text || "",
          })),
        }))
      : [];

    return criteriaCache[type];
  } catch (error) {
    console.error(`Failed to load ${TYPE_LABELS[type]} criteria:`, error);

    criteriaCache[type] = [];
    return [];
  }
}

async function persistCriteria(type) {
  const parts = criteriaCache[type] || [];

  const payload = parts.map((part, index) => ({
    part_number: index + 1,
    title: part.title || "",
    questions: (part.questions || []).map((question) => ({
      id: question.id,
      text: question.text || "",
    })),
  }));

  const saved = await apiPut(`/evaluation-criteria/${type}`, payload);

  criteriaCache[type] = Array.isArray(saved)
    ? saved.map((part, index) => ({
        partNumber: part.part_number ?? index + 1,
        title: part.title || "",
        questions: (part.questions || []).map((question) => ({
          id: question.id,
          text: question.text || "",
        })),
      }))
    : payload;

  return criteriaCache[type];
}

function attachSaveCriteriaListener() {
  const saveButton = document.getElementById("save-criteria-btn");

  if (!saveButton) return;

  saveButton.addEventListener("click", async () => {
    try {
      await persistCriteria(currentType);

      const msg = document.getElementById("criteria-saved-msg");

      if (msg) {
        msg.classList.remove("hidden");

        setTimeout(() => {
          msg.classList.add("hidden");
        }, 2500);
      }

    } catch (error) {
      console.error(
        "Failed to save evaluation criteria:",
        error
      );

      alert(
        error.message ||
        "Failed to save the evaluation criteria."
      );
    }
  });
}

// ============================================
// Load / save rating scale (points & bands)
// ============================================

async function loadScale(type) {
  try {
    const scale = await apiGet(`/rating-scales/${type}`);

    scaleCache[type] = {
      scaleLabels: Array.isArray(scale.scale_labels)
        ? scale.scale_labels.map((s) => ({ value: s.value, label: s.label || "" }))
        : [],
      equivalents: Array.isArray(scale.equivalents)
        ? scale.equivalents.map((b) => ({ min: b.min, max: b.max, label: b.label || "" }))
        : [],
    };

    return scaleCache[type];
  } catch (error) {
    console.error(`Failed to load ${TYPE_LABELS[type]} rating scale:`, error);

    scaleCache[type] = { scaleLabels: [], equivalents: [] };
    return scaleCache[type];
  }
}

async function persistScale(type) {
  const scale = scaleCache[type] || { scaleLabels: [], equivalents: [] };

  const payload = {
    scale_labels: scale.scaleLabels,
    equivalents: scale.equivalents,
  };

  const saved = await apiPut(`/rating-scales/${type}`, payload);

  scaleCache[type] = {
    scaleLabels: Array.isArray(saved.scale_labels) ? saved.scale_labels : scale.scaleLabels,
    equivalents: Array.isArray(saved.equivalents) ? saved.equivalents : scale.equivalents,
  };

  return scaleCache[type];
}

function attachSaveScaleListener() {
  const button = document.getElementById("save-scale-btn");

  if (!button) return;

  button.addEventListener("click", async () => {
    const scaleLabels = Array.from(document.querySelectorAll(".scale-value-input"))
      .map((valueInput, index) => {
        const labelInput = document.querySelectorAll(".scale-label-input")[index];

        return {
          value: parseFloat(valueInput.value) || 0,
          label: labelInput.value.trim(),
        };
      })
      .sort((a, b) => b.value - a.value);

    const mins = document.querySelectorAll(".equivalent-min-input");
    const maxs = document.querySelectorAll(".equivalent-max-input");
    const labels = document.querySelectorAll(".equivalent-label-input");

    const equivalents = Array.from(mins)
      .map((minInput, index) => ({
        min: parseFloat(minInput.value) || 0,
        max: parseFloat(maxs[index].value) || 0,
        label: labels[index].value.trim(),
      }))
      .sort((a, b) => b.min - a.min);

    scaleCache[currentType] = { scaleLabels, equivalents };

    try {
      await persistScale(currentType);
      renderScaleEditor();

      const msg = document.getElementById("scale-saved-msg");

      if (msg) {
        msg.classList.remove("hidden");

        setTimeout(() => {
          msg.classList.add("hidden");
        }, 2500);
      }
    } catch (error) {
      console.error("Failed to save rating scale:", error);

      alert(error.message || "Failed to save the rating scale.");
    }
  });
}

// ============================================
// Type tabs
// ============================================

function attachTypeTabListeners() {
  const tabButtons = document.querySelectorAll(".criteria-type-tab-btn");

  async function activateType(type) {
    currentType = type;

    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.type === type;

      btn.classList.toggle("bg-brand", isActive);
      btn.classList.toggle("text-white", isActive);
      btn.classList.toggle("bg-gray-100", !isActive);
      btn.classList.toggle("text-gray-600", !isActive);
    });

    await Promise.all([loadCriteria(type), loadScale(type)]);

    renderPartsEditor();
    renderScaleEditor();
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activateType(btn.dataset.type);
    });
  });
}

// ============================================
// Parts & Questions editor
// ============================================

function renderPartsEditor() {
  const container = document.getElementById("parts-editor-container");

  if (!container) return;

  const parts = criteriaCache[currentType] || [];

  if (!parts.length) {
    container.innerHTML = `
      <p class="text-sm text-gray-400">
        No criteria parts have been added yet.
      </p>
    `;

    return;
  }

  container.innerHTML = parts
    .map((part, partIndex) => {
      const titleParts = splitTitleSubtitle(part.title || "");

      return `
        <div class="part-card border border-gray-200 rounded-lg p-4">

          <div class="flex items-start justify-between gap-2 mb-3">

            <div class="flex-1 space-y-2">
              <input
                type="text"
                class="part-title-input w-full font-medium text-gray-800 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                data-part-index="${partIndex}"
                placeholder="Title (e.g. Part 1: Punctuality and Timeliness)"
                value="${escapeAttribute(titleParts.main)}"
              >

              <div class="rich-editor-wrap">
                ${richToolbarHtml()}
                <div
                  contenteditable="true"
                  class="rich-editor part-subtitle-input w-full text-sm text-gray-600 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  style="min-height:3.5rem"
                  data-part-index="${partIndex}"
                  title="Subtitle — use the toolbar for bold, italic, underline; Enter for a new line"
                >${sanitizeRichText(linesToBr(titleParts.sub))}</div>
              </div>
            </div>

            <div class="flex flex-col gap-0.5">

              <button
                type="button"
                class="move-part-up-btn text-gray-400 hover:text-gray-700 text-xs leading-none"
                data-part-index="${partIndex}"
                ${partIndex === 0 ? "disabled style='opacity:0.3'" : ""}
              >
                ▲
              </button>

              <button
                type="button"
                class="move-part-down-btn text-gray-400 hover:text-gray-700 text-xs leading-none"
                data-part-index="${partIndex}"
                ${
                  partIndex === parts.length - 1
                    ? "disabled style='opacity:0.3'"
                    : ""
                }
              >
                ▼
              </button>

            </div>

            <button
              type="button"
              class="delete-part-btn text-red-500 hover:text-red-700 text-sm whitespace-nowrap"
              data-part-index="${partIndex}"
            >
              Delete Part
            </button>

          </div>

          <div class="space-y-2 mb-3">

            ${(part.questions || [])
              .map(
                (question, questionIndex) => `
                  <div class="flex items-start gap-2">

                    <div class="flex-1 min-w-0 rich-editor-wrap">
                      ${richToolbarHtml()}
                      <div
                        contenteditable="true"
                        class="rich-editor question-text-input w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                        style="min-height:3.5rem"
                        data-part-index="${partIndex}"
                        data-question-index="${questionIndex}"
                        title="Question text — use the toolbar for bold, italic, underline; Enter for a new line"
                      >${sanitizeRichText(question.text || "")}</div>
                    </div>

                    <div class="flex flex-col gap-0.5 pt-1">

                      <button
                        type="button"
                        class="move-question-up-btn text-gray-400 hover:text-gray-700 text-xs leading-none"
                        data-part-index="${partIndex}"
                        data-question-index="${questionIndex}"
                        ${
                          questionIndex === 0
                            ? "disabled style='opacity:0.3'"
                            : ""
                        }
                      >
                        ▲
                      </button>

                      <button
                        type="button"
                        class="move-question-down-btn text-gray-400 hover:text-gray-700 text-xs leading-none"
                        data-part-index="${partIndex}"
                        data-question-index="${questionIndex}"
                        ${
                          questionIndex === part.questions.length - 1
                            ? "disabled style='opacity:0.3'"
                            : ""
                        }
                      >
                        ▼
                      </button>

                    </div>

                    <button
                      type="button"
                      class="remove-question-btn text-gray-400 hover:text-red-500 px-1 pt-1.5"
                      data-part-index="${partIndex}"
                      data-question-index="${questionIndex}"
                    >
                      ✕
                    </button>

                  </div>
                `,
              )
              .join("")}

          </div>

          <button
            type="button"
            class="add-question-btn text-xs text-brand font-medium hover:underline"
            data-part-index="${partIndex}"
          >
            + Add Question
          </button>

        </div>
      `;
    })
    .join("");

  attachPartsEditorListeners();
}

function attachPartsEditorListeners() {
  function savePartTitle(partIndex) {
    const parts = criteriaCache[currentType];

    if (!parts || !parts[partIndex]) return;

    const mainInput = document.querySelector(
      `.part-title-input[data-part-index="${partIndex}"]`
    );
    const subEditor = document.querySelector(
      `.part-subtitle-input[data-part-index="${partIndex}"]`
    );

    parts[partIndex].title = joinTitleSubtitle(
      mainInput ? mainInput.value : "",
      subEditor ? sanitizeRichText(subEditor.innerHTML) : ""
    );
    criteriaCache[currentType] = parts;
  }

  document.querySelectorAll(".part-title-input").forEach((input) => {
    input.addEventListener("blur", () => {
      savePartTitle(Number(input.dataset.partIndex));
    });
  });

  document.querySelectorAll(".part-subtitle-input").forEach((input) => {
    input.addEventListener("blur", () => {
      savePartTitle(Number(input.dataset.partIndex));
    });
  });

  document.querySelectorAll(".question-text-input").forEach((editor) => {
    editor.addEventListener("blur", () => {
      const parts = criteriaCache[currentType];
      const partIndex = Number(editor.dataset.partIndex);
      const questionIndex = Number(editor.dataset.questionIndex);

      parts[partIndex].questions[questionIndex].text = sanitizeRichText(
        editor.innerHTML
      );

      criteriaCache[currentType] = parts;
    });
  });

  document.querySelectorAll(".rich-format-btn").forEach((btn) => {
    // Keep the editor selection alive while the toolbar is pressed.
    btn.addEventListener("mousedown", (event) => event.preventDefault());

    btn.addEventListener("click", () => {
      const wrapper = btn.closest(".rich-editor-wrap");
      const editor = wrapper ? wrapper.querySelector(".rich-editor") : null;

      if (!editor) return;

      editor.focus();
      document.execCommand(btn.dataset.command, false, null);
    });
  });

  document.querySelectorAll(".rich-editor").forEach((editor) => {
    // Paste as plain text so external markup (Word, web pages)
    // can never smuggle styles, scripts, or tags into saved content.
    editor.addEventListener("paste", (event) => {
      event.preventDefault();

      const clipboard = event.clipboardData || window.clipboardData;
      const text = clipboard && clipboard.getData
        ? clipboard.getData("text/plain")
        : "";

      document.execCommand("insertText", false, text);
    });
  });

  document.querySelectorAll(".remove-question-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parts = criteriaCache[currentType];

      const partIndex = Number(btn.dataset.partIndex);
      const questionIndex = Number(btn.dataset.questionIndex);

      showConfirmModal({
        title: "Remove Question?",
        message:
          "This question will be permanently removed from the evaluation form.",
        confirmLabel: "Remove",
        isDestructive: true,

        onConfirm: () => {
          parts[partIndex].questions.splice(questionIndex, 1);

          criteriaCache[currentType] = parts;
          renderPartsEditor();
        },
      });
    });
  });

  document.querySelectorAll(".add-question-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parts = criteriaCache[currentType];
      const partIndex = Number(btn.dataset.partIndex);

      const newId = `custom_${Date.now()}`;

      parts[partIndex].questions.push({
        id: newId,
        text: "New question — click to edit.",
      });

      criteriaCache[currentType] = parts;
      renderPartsEditor();
    });
  });

  document.querySelectorAll(".delete-part-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parts = criteriaCache[currentType];

      const partIndex = Number(btn.dataset.partIndex);
      const partTitle = stripAllTags(parts[partIndex].title || "")
        .replace(/\s+/g, " ")
        .trim() || "this part";

      showConfirmModal({
        title: "Delete Part?",
        message: `This will permanently delete "${partTitle}" and all ${parts[partIndex].questions.length} of its questions.`,
        confirmLabel: "Delete",
        isDestructive: true,

        onConfirm: () => {
          parts.splice(partIndex, 1);

          parts.forEach((part, index) => {
            part.partNumber = index + 1;
          });

          criteriaCache[currentType] = parts;
          renderPartsEditor();
        },
      });
    });
  });

  document
    .querySelectorAll(".move-question-up-btn:not([disabled])")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const parts = criteriaCache[currentType];

        const partIndex = Number(btn.dataset.partIndex);
        const questionIndex = Number(btn.dataset.questionIndex);

        [
          parts[partIndex].questions[questionIndex - 1],
          parts[partIndex].questions[questionIndex],
        ] = [
          parts[partIndex].questions[questionIndex],
          parts[partIndex].questions[questionIndex - 1],
        ];

        criteriaCache[currentType] = parts;
        renderPartsEditor();
      });
    });

  document
    .querySelectorAll(".move-question-down-btn:not([disabled])")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const parts = criteriaCache[currentType];

        const partIndex = Number(btn.dataset.partIndex);
        const questionIndex = Number(btn.dataset.questionIndex);

        [
          parts[partIndex].questions[questionIndex + 1],
          parts[partIndex].questions[questionIndex],
        ] = [
          parts[partIndex].questions[questionIndex],
          parts[partIndex].questions[questionIndex + 1],
        ];

        criteriaCache[currentType] = parts;
        renderPartsEditor();
      });
    });

  document
    .querySelectorAll(".move-part-up-btn:not([disabled])")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const parts = criteriaCache[currentType];

        const partIndex = Number(btn.dataset.partIndex);

        [parts[partIndex - 1], parts[partIndex]] = [
          parts[partIndex],
          parts[partIndex - 1],
        ];

        parts.forEach((part, index) => {
          part.partNumber = index + 1;
        });

        criteriaCache[currentType] = parts;
        renderPartsEditor();
      });
    });

  document
    .querySelectorAll(".move-part-down-btn:not([disabled])")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const parts = criteriaCache[currentType];

        const partIndex = Number(btn.dataset.partIndex);

        [parts[partIndex + 1], parts[partIndex]] = [
          parts[partIndex],
          parts[partIndex + 1],
        ];

        parts.forEach((part, index) => {
          part.partNumber = index + 1;
        });

        criteriaCache[currentType] = parts;
        renderPartsEditor();
      });
    });
}

// ============================================
// Add Part
// ============================================

function attachAddPartListener() {
  const button = document.getElementById("add-part-btn");

  if (!button) return;

  button.addEventListener("click", () => {
    const parts = criteriaCache[currentType];

    const newPartNumber = parts.length + 1;

    parts.push({
      partNumber: newPartNumber,
      title: "New Part",
      questions: [
        {
          id: `custom_${Date.now()}`,
          text: "",
        },
      ],
    });

    renderPartsEditor();

    // The new Part is always appended last. Scroll it into view and
    // focus its Title input (text selected) so the user immediately
    // sees it and can type a replacement title right away.
    const titleInputs = document.querySelectorAll(
      "#parts-editor-container .part-title-input"
    );
    const newTitleInput = titleInputs[titleInputs.length - 1];

    if (newTitleInput) {
      const card = newTitleInput.closest(".part-card");

      if (card && typeof card.scrollIntoView === "function") {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      newTitleInput.focus({ preventScroll: true });

      if (typeof newTitleInput.select === "function") {
        newTitleInput.select();
      }
    }
  });
}

// ============================================
// Rating Scale editor (points & equivalence bands)
// Edits are held in scaleCache[currentType] and only sent
// to the backend when "Save Scale" is clicked — same pattern
// as the Parts & Questions editor above.
// ============================================

function renderScaleEditor() {
  const scale = scaleCache[currentType] || { scaleLabels: [], equivalents: [] };

  const labelsContainer = document.getElementById("scale-labels-editor");

  if (!labelsContainer) return;

  labelsContainer.innerHTML = scale.scaleLabels
    .map(
      (s, index) => `
          <div class="grid grid-cols-[48px_1fr_24px] gap-2 items-center">

            <input
              type="number"
              step="1"
              value="${s.value}"
              class="scale-value-input border border-gray-300 rounded-lg px-1.5 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              data-label-index="${index}"
            >

            <input
              type="text"
              value="${escapeAttribute(s.label)}"
              class="scale-label-input border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              data-label-index="${index}"
            >

            <button
              type="button"
              class="remove-scale-label-btn text-gray-400 hover:text-red-500 text-sm justify-self-center"
              data-label-index="${index}"
            >
              ✕
            </button>

          </div>
        `,
    )
    .join("");

  const equivalentsContainer = document.getElementById("equivalents-editor");

  if (!equivalentsContainer) return;

  equivalentsContainer.innerHTML = scale.equivalents
    .map(
      (band, index) => `
          <div class="grid grid-cols-[48px_48px_1fr_24px] gap-2 items-center">

            <input
              type="number"
              step="0.01"
              value="${band.min}"
              placeholder="Min"
              class="equivalent-min-input border border-gray-300 rounded-lg px-1.5 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              data-equivalent-index="${index}"
            >

            <input
              type="number"
              step="0.01"
              value="${band.max}"
              placeholder="Max"
              class="equivalent-max-input border border-gray-300 rounded-lg px-1.5 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              data-equivalent-index="${index}"
            >

            <input
              type="text"
              value="${escapeAttribute(band.label)}"
              class="equivalent-label-input border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              data-equivalent-index="${index}"
            >

            <button
              type="button"
              class="remove-equivalent-btn text-gray-400 hover:text-red-500 text-sm justify-self-center"
              data-equivalent-index="${index}"
            >
              ✕
            </button>

          </div>
        `,
    )
    .join("");

  attachScaleRemoveListeners();
  attachScaleEditorListeners();
}

function attachScaleRemoveListeners() {
  document.querySelectorAll(".remove-scale-label-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scale = scaleCache[currentType];

      scale.scaleLabels.splice(Number(btn.dataset.labelIndex), 1);

      scaleCache[currentType] = scale;
      renderScaleEditor();
    });
  });

  document.querySelectorAll(".remove-equivalent-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scale = scaleCache[currentType];

      scale.equivalents.splice(Number(btn.dataset.equivalentIndex), 1);

      scaleCache[currentType] = scale;
      renderScaleEditor();
    });
  });
}

function attachAddScaleLabelListener() {
  const button = document.getElementById("add-scale-label-btn");

  if (!button) return;

  button.addEventListener("click", () => {
    const scale = scaleCache[currentType];

    scale.scaleLabels.push({
      value: scale.scaleLabels.length + 1,
      label: "New Point",
    });

    scaleCache[currentType] = scale;
    renderScaleEditor();
  });
}

function attachAddEquivalentListener() {
  const button = document.getElementById("add-equivalent-btn");

  if (!button) return;

  button.addEventListener("click", () => {
    const scale = scaleCache[currentType];

    scale.equivalents.push({
      min: 0,
      max: 0,
      label: "New Band",
    });

    scaleCache[currentType] = scale;
    renderScaleEditor();
  });
}

function attachScaleEditorListeners() {
  document.querySelectorAll(".scale-value-input").forEach((input) => {
    input.addEventListener("blur", () => {
      const scale = scaleCache[currentType];
      scale.scaleLabels[Number(input.dataset.labelIndex)].value =
        parseFloat(input.value) || 0;
      scaleCache[currentType] = scale;
    });
  });

  document.querySelectorAll(".scale-label-input").forEach((input) => {
    input.addEventListener("blur", () => {
      const scale = scaleCache[currentType];
      scale.scaleLabels[Number(input.dataset.labelIndex)].label =
        input.value.trim();
      scaleCache[currentType] = scale;
    });
  });

  function saveEquivalentField(index, field, value) {
    const scale = scaleCache[currentType];

    scale.equivalents[index][field] =
      field === "label" ? value.trim() : parseFloat(value) || 0;

    scaleCache[currentType] = scale;
  }

  document.querySelectorAll(".equivalent-min-input").forEach((input) => {
    input.addEventListener("blur", () =>
      saveEquivalentField(
        Number(input.dataset.equivalentIndex),
        "min",
        input.value,
      ),
    );
  });

  document.querySelectorAll(".equivalent-max-input").forEach((input) => {
    input.addEventListener("blur", () =>
      saveEquivalentField(
        Number(input.dataset.equivalentIndex),
        "max",
        input.value,
      ),
    );
  });

  document.querySelectorAll(".equivalent-label-input").forEach((input) => {
    input.addEventListener("blur", () =>
      saveEquivalentField(
        Number(input.dataset.equivalentIndex),
        "label",
        input.value,
      ),
    );
  });
}

// ============================================
// Small HTML helpers
// ============================================

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================
// Initialize
// ============================================

async function initializeCriteriaPage() {
  mountPageContent();

  attachTypeTabListeners();
  attachAddPartListener();
  attachSaveCriteriaListener();
  attachAddScaleLabelListener();
  attachAddEquivalentListener();
  attachSaveScaleListener();

  await Promise.all([loadCriteria(currentType), loadScale(currentType)]);

  renderPartsEditor();
  renderScaleEditor();
}

initializeCriteriaPage();