// ============================================
// SHARED DATA: Evaluation Period
// ============================================

window.FES_API_BASE = window.FES_API_BASE || (
  (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    ? "http://127.0.0.1:5000/api"
    : "/api"
);

const DEFAULT_EVALUATION_PERIOD = {
  evaluationType: "student",
  startDate: "",
  endDate: ""
};

let evaluationPeriodCache = {
  ...DEFAULT_EVALUATION_PERIOD
};


// ============================================
// LOAD
// ============================================

async function loadEvaluationPeriod() {
  try {
    const response = await fetch(
      `${window.FES_API_BASE}/evaluation-periods/current`,
      {
        credentials: "include"
      }
    );

    if (!response.ok) {
      throw new Error("Failed to load evaluation period");
    }

    const data = await response.json();

    evaluationPeriodCache = data
      ? {
          evaluationType: data.applies_to_type || "student",
          startDate: data.start_date || "",
          endDate: data.end_date || ""
        }
      : {
          ...DEFAULT_EVALUATION_PERIOD
        };

    return evaluationPeriodCache;

  } catch (error) {
    console.error("Failed to load evaluation period:", error);
    return evaluationPeriodCache;
  }
}


// ============================================
// GET
// ============================================

function getEvaluationPeriod() {
  return evaluationPeriodCache;
}


// ============================================
// SAVE
// ============================================

async function saveEvaluationPeriod(period) {
  if (!period.startDate || !period.endDate) {
    throw new Error(
      "Both the opening and closing dates are required."
    );
  }

  if (!period.evaluationType) {
    throw new Error(
      "An evaluation type is required."
    );
  }

  const response = await fetch(
    `${window.FES_API_BASE}/evaluation-periods/current`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        start_date: period.startDate,
        end_date: period.endDate,
        applies_to_type: period.evaluationType
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Failed to save evaluation period"
    );
  }

  evaluationPeriodCache = {
    evaluationType: data.applies_to_type || period.evaluationType,
    startDate: data.start_date || "",
    endDate: data.end_date || ""
  };

  return evaluationPeriodCache;
}


// ============================================
// STATUS
// ============================================

function checkEvaluationPeriodStatus() {
  const period = getEvaluationPeriod();

  if (!period.startDate || !period.endDate) {
    return {
      isOpen: false,
      reason: "No evaluation period has been configured."
    };
  }

  const today = new Date()
    .toISOString()
    .split("T")[0];

  if (today < period.startDate) {
    return {
      isOpen: false,
      reason: `Evaluations open on ${period.startDate}.`
    };
  }

  if (today > period.endDate) {
    return {
      isOpen: false,
      reason: `Evaluations closed on ${period.endDate}.`
    };
  }

  return {
    isOpen: true,
    reason: ""
  };
}