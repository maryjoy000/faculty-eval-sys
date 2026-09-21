// ============================================
// FACULTY: MY EVALUATION PAGE
// ============================================

async function renderContent() {
  const container = document.getElementById("my-evaluation-content");

  try {
    const currentUser = await apiGet("/auth/me");

    if (!currentUser.linked_faculty_id) {
      container.innerHTML = `
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
          <p class="text-gray-500">
            Your faculty account is not linked to a faculty record yet.
          </p>
        </div>
      `;
      return;
    }

    const facultyId = currentUser.linked_faculty_id;

    try {
      // Backend release check happens here.
      const evaluationData = await apiGet(`/evaluations/${facultyId}`);

      let classroomData = null;

      try {
        classroomData = await apiGet(
          `/evaluations/${facultyId}/classroom-breakdown`,
        );
      } catch (error) {
        if (error?.status !== 404) {
          throw error;
        }
      }

      container.innerHTML = `
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">

          <h2 class="text-xl font-bold text-gray-800 mb-4">
            ${currentUser.name}
          </h2>

          <!-- Evaluation Tabs -->
          <div class="flex flex-wrap gap-2 border-b border-gray-200 pb-3 mb-6">
            <button
              type="button"
              class="evaluation-tab btn-primary text-sm"
              data-tab="overall"
            >
              Overall
            </button>

            <button
              type="button"
              class="evaluation-tab btn-secondary text-sm"
              data-tab="student"
            >
              Student Evaluation
            </button>

            <button
              type="button"
              class="evaluation-tab btn-secondary text-sm"
              data-tab="peer"
            >
              Peer-to-Peer
            </button>

            <button
              type="button"
              class="evaluation-tab btn-secondary text-sm"
              data-tab="classroom"
            >
              Classroom Observation
            </button>

            <button
              type="button"
              class="evaluation-tab btn-secondary text-sm"
              data-tab="hr"
            >
              HR Evaluation
            </button>
          </div>

          <!-- Tab Content -->
          <div id="evaluation-tab-content"></div>

        </div>
      `;

      const tabContent = document.getElementById("evaluation-tab-content");
      const tabButtons = document.querySelectorAll(".evaluation-tab");

      function setActiveTab(tabName) {
        tabButtons.forEach((button) => {
          const isActive = button.dataset.tab === tabName;

          button.classList.toggle("btn-primary", isActive);
          button.classList.toggle("btn-secondary", !isActive);
        });

        if (tabName === "overall") {
          renderOverallTab();
        } else if (tabName === "classroom") {
          renderClassroomTab();
        } else if (tabName === "student") {
          renderStudentTab();
        } else if (tabName === "peer") {
          renderPeerTab();
        } else if (tabName === "hr") {
          renderHrTab();
        }
      }

      function renderOverallTab() {
        tabContent.innerHTML = `
          <div class="space-y-6">

            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p class="text-sm text-gray-500">
                Overall Evaluation
              </p>

              <p class="text-3xl font-bold text-brand mt-1">
                ${
                  evaluationData.weighted_overall_pct !== null
                    ? `${evaluationData.weighted_overall_pct}%`
                    : "N/A"
                }
              </p>
            </div>

            <div>
              <h3 class="font-semibold text-gray-800 mb-2">
                Evaluation Results
              </h3>

              <div class="border border-gray-200 rounded-lg overflow-hidden">
                ${Object.entries(evaluationData.per_type)
                  .map(
                    ([type, data]) => `
                      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">

                        <div>
                          <p class="font-medium text-gray-800">
                            ${
                              type === "student"
                                ? "Student Evaluation"
                                : type === "peerToPeer"
                                  ? "Peer-to-Peer Evaluation"
                                  : type === "classroomObservation"
                                    ? "Classroom Observation"
                                    : "HR Evaluation"
                            }
                          </p>

                          <p class="text-xs text-gray-500">
                            ${data.count}
                            evaluation${data.count === 1 ? "" : "s"}
                          </p>
                        </div>

                        <span class="font-semibold text-gray-800">
                          ${
                            data.average_rating_pct !== null
                              ? `${data.average_rating_pct}%`
                              : "N/A"
                          }
                        </span>

                      </div>
                    `,
                  )
                  .join("")}
              </div>
            </div>

          </div>
        `;
      }

      async function renderStudentTab() {
        tabContent.innerHTML = `
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <p class="text-gray-500">Loading student evaluation results...</p>
          </div>
        `;

        try {
          const studentData = await apiGet(
            `/evaluations/${facultyId}/student-breakdown`
          );

          const evaluationCount = Number(studentData.submission_count ?? 0);

          tabContent.innerHTML = `
            <div>
              <h3 class="font-semibold text-gray-800 mb-2">
                Student Evaluation Breakdown
              </h3>

              <p class="text-sm text-gray-500 mb-4">
                Based on ${evaluationCount} student evaluation${evaluationCount === 1 ? "" : "s"}.
              </p>

              <div class="space-y-3">
                ${(studentData.domains || []).map((domain) => `
                  <div class="border border-gray-200 rounded-lg overflow-hidden">

                    <div class="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <span class="font-medium text-gray-800">
                        ${domain.part_number}. ${domain.title}
                      </span>

                      <span class="font-semibold text-gray-800">
                        ${
                          domain.average !== null &&
                          domain.average !== undefined
                            ? Number(domain.average).toFixed(2)
                            : "N/A"
                        }
                      </span>
                    </div>

                    <div class="overflow-x-auto">
                      <table class="w-full text-sm">

                        <thead>
                          <tr class="border-t border-gray-200 text-gray-500">
                            <th class="text-left px-4 py-2 font-medium">
                                
                            </th>

                            <th class="text-center px-4 py-2 font-medium">
                              Average
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          ${(domain.indicators || []).map((indicator) => `
                            <tr class="border-t border-gray-100">

                              <td class="px-4 py-2">
                                ${String(indicator.text || "").replace(/<br\s*\/?>/gi, "<br>")}
                              </td>

                              <td class="text-center px-4 py-2 font-semibold">
                                ${
                                  indicator.average !== null &&
                                  indicator.average !== undefined
                                    ? Number(indicator.average).toFixed(2)
                                    : "N/A"
                                }
                              </td>

                            </tr>
                          `).join("")}
                        </tbody>

                      </table>
                    </div>

                  </div>
                `).join("")}
              </div>
            </div>
          `;
        } catch (error) {
          console.error("Failed to load student evaluation:", error);

          tabContent.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <p class="text-gray-500">
                No student evaluation results are available.
              </p>
            </div>
          `;
        }
      }


      async function renderPeerTab() {
        tabContent.innerHTML = `
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <p class="text-gray-500">
              Loading peer-to-peer evaluation results...
            </p>
          </div>
        `;

        try {
          const peerData = await apiGet(
            `/evaluations/${facultyId}/peer-breakdown`
          );

          const evaluationCount = Number(peerData.submission_count ?? 0);

          tabContent.innerHTML = `
            <div>

              <h3 class="font-semibold text-gray-800 mb-2">
                Peer-to-Peer Evaluation Breakdown
              </h3>

              <p class="text-sm text-gray-500 mb-4">
                Based on ${evaluationCount} peer evaluation${evaluationCount === 1 ? "" : "s"}.
              </p>

              <div class="space-y-3">

                ${(peerData.domains || []).map((domain) => `
                  <div class="border border-gray-200 rounded-lg overflow-hidden">

                    <div class="px-4 py-3 bg-gray-50 flex items-center justify-between">

                      <span class="font-medium text-gray-800">
                        ${domain.part_number}. ${domain.title}
                      </span>

                      
                      <span class="font-semibold text-gray-800">
                        ${
                          domain.average !== null &&
                          domain.average !== undefined
                            ? Number(domain.average).toFixed(2)
                            : "N/A"
                        }
                      </span>

                    </div>

                    <div class="overflow-x-auto">

                      <table class="w-full text-sm">

                        <thead>
                          <tr class="border-t border-gray-200 text-gray-500">
                            <th class="text-left px-4 py-2 font-medium">
                                
                            </th>

                            <th class="text-right px-4 py-2 font-medium">
                              Average
                            </th>

                          </tr>
                        </thead>

                        <tbody>

                          ${(domain.indicators || []).map((indicator) => `
                            <tr class="border-t border-gray-100">

                              <td class="px-4 py-2">
                                ${String(indicator.text || "")
                                  .replace(/<br\s*\/?>/gi, "<br>")
                                  .split(/\r?\n/)
                                  .filter(line => line.trim())
                                  .map(line => `<div>${line.trim()}</div>`)
                                  .join("")}
                              </td>
                              <td class="text-center px-4 py-2 font-semibold">
                                ${
                                  indicator.average !== null &&
                                  indicator.average !== undefined
                                    ? Number(indicator.average).toFixed(2)
                                    : "N/A"
                                }
                              </td>

                            </tr>
                          `).join("")}

                        </tbody>

                      </table>

                    </div>

                  </div>
                `).join("")}

              </div>

            </div>
          `;
        } catch (error) {
          console.error("Failed to load peer evaluation:", error);

          tabContent.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <p class="text-gray-500">
                No peer-to-peer evaluation results are available.
              </p>
            </div>
          `;
        }
      }

      async function renderHrTab() {
        tabContent.innerHTML = `
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <p class="text-gray-500">Loading HR evaluation results...</p>
          </div>
        `;

        try {
          const hrData = await apiGet(
            `/evaluations/${facultyId}/hr-breakdown`
          );

          tabContent.innerHTML = `
            <div>
              <h3 class="font-semibold text-gray-800 mb-2">
                HR Evaluation Breakdown
              </h3>

              <p class="text-sm text-gray-500 mb-4">
                Based on ${hrData.evaluation_count} HR evaluation${hrData.evaluation_count === 1 ? "" : "s"}.
              </p>

              <div class="space-y-3">
                ${hrData.domains.map((domain) => `
                  <div class="border border-gray-200 rounded-lg overflow-hidden">
                    <div class="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <span class="font-medium text-gray-800">
                        ${domain.part_number}. ${domain.title}
                      </span>

                      <span class="font-semibold text-gray-800">
                        ${domain.average !== null ? domain.average.toFixed(2) : "N/A"}
                      </span>
                    </div>

                    <div class="overflow-x-auto">
                      <table class="w-full text-sm">
                        <thead>
                          <tr class="border-t border-gray-200 text-gray-500">
                            <th class="text-left px-4 py-2 font-medium">  </th>
                            <th class="text-center px-4 py-2 font-medium">Average</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${domain.indicators.map((indicator) => `
                            <tr class="border-t border-gray-100">
                              <td class="px-4 py-2">
                                ${indicator.indicator_number}. ${indicator.text}
                              </td>

                              <td class="text-center px-4 py-2 font-semibold">
                                ${indicator.average.toFixed(2)}
                              </td>
                            </tr>
                          `).join("")}
                        </tbody>
                      </table>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          `;
        } catch (error) {
          console.error("Failed to load HR evaluation:", error);

          tabContent.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <p class="text-gray-500">
                No HR evaluation results are available.
              </p>
            </div>
          `;
        }
      }
      
      function renderClassroomTab() {
        if (!classroomData) {
          tabContent.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <p class="text-gray-500">
                No classroom observation report is available.
              </p>
            </div>
          `;
          return;
        }

        tabContent.innerHTML = `
          <div>
            <h3 class="font-semibold text-gray-800 mb-2">
              Classroom Observation Breakdown
            </h3>

            <div class="space-y-3">

              ${classroomData.domains
                .map(
                  (domain) => `
                    <div class="border border-gray-200 rounded-lg overflow-hidden">

                      <div class="px-4 py-3 bg-gray-50 flex items-center justify-between">
                        <span class="font-medium text-gray-800">
                          ${domain.part_number}. ${domain.title}
                        </span>

                        <span class="font-semibold text-gray-800">
                          ${
                            domain.average !== null
                              ? domain.average.toFixed(2)
                              : "N/A"
                          }
                        </span>
                      </div>

                      <div class="overflow-x-auto">
                        <table class="w-full text-sm">

                          <thead>
                            <tr class="border-t border-gray-200 text-gray-500">

                              <th class="text-left px-4 py-2 font-medium">
                                Indicator
                              </th>

                              <th class="px-4 py-2 font-medium">
                                HCEC
                              </th>

                              <th class="px-4 py-2 font-medium">
                                COT
                              </th>

                              <th class="px-4 py-2 font-medium">
                                Level
                              </th>

                            </tr>
                          </thead>

                          <tbody>
                            ${domain.indicators
                              .map(
                                (indicator) => `
                                  <tr class="border-t border-gray-100">

                                    <td class="px-4 py-2">
                                      ${indicator.indicator_number}.
                                      ${indicator.text}
                                    </td>

                                    <td class="text-center px-4 py-2">
                                      ${indicator.hcec}
                                    </td>

                                    <td class="text-center px-4 py-2">
                                      ${indicator.cot}
                                    </td>

                                    <td class="text-center px-4 py-2">
                                      ${indicator.level}
                                    </td>

                                  </tr>
                                `,
                              )
                              .join("")}
                          </tbody>

                        </table>
                      </div>

                    </div>
                  `,
                )
                .join("")}

            </div>
          </div>
        `;
      }

      function renderPlaceholderTab(title) {
        tabContent.innerHTML = `
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <h3 class="font-semibold text-gray-800 mb-1">
              ${title}
            </h3>

            <p class="text-sm text-gray-500">
              Detailed ${title} results will appear here.
            </p>
          </div>
        `;
      }

      tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setActiveTab(button.dataset.tab);
        });
      });

      // Default tab
      setActiveTab("overall");
    } catch (error) {
      if (error?.status === 403 || error?.message?.includes("released")) {
        container.innerHTML = `
          <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">

            <p class="text-gray-500">
              Your evaluation report hasn't been released by HR yet.
            </p>

            <p class="text-xs text-gray-400 mt-1">
              Check back later, or contact HR if you believe this is a mistake.
            </p>

          </div>
        `;

        return;
      }

      throw error;
    }
  } catch (error) {
    console.error("Failed to load my evaluation:", error);

    container.innerHTML = `
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">

        <p class="text-red-500">
          Failed to load your evaluation.
        </p>

      </div>
    `;
  }
}

renderContent();
